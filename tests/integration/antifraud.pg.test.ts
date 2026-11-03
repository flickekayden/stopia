/**
 * Real PostgreSQL integration tests for the signup-bonus antifraud (20 free AI credits).
 * Runs the project's actual migrations on a throwaway local PostgreSQL cluster (see pg/local-postgres.ts),
 * calls the functions as the server role exactly like the app does, and checks concurrency with real
 * parallel connections and deterministic lock interleavings. The hosted database is never written to.
 *
 * Run: bun test tests/integration/antifraud.pg.test.ts
 * Optional read-only comparison with the deployed function bodies: STOPIA_COMPARE_LIVE=1 (uses psql + PG* env).
 * Skipped automatically when PostgreSQL binaries are not installed.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { SQL } from "bun";
import { spawnSync } from "node:child_process";

import { postgresAvailable, startLocalPostgres, type LocalPg } from "./pg/local-postgres";

const enabled = postgresAvailable() && process.env["STOPIA_SKIP_PG"] !== "1";
const BONUS = 20;

let pg: LocalPg;
let su: SQL; // superuser: test setup and inspection only
let pool: SQL; // up to 12 parallel backends for concurrency tests
let monitoring = false;

type Wallet = { id: string; user_id: string | null; balance: number; free_granted: number; purchased_total: number; merged_into: string | null };

let seq = 0;
const email = (label: string) => `t${Date.now().toString(36)}${(seq += 1)}${label}@example.com`;

async function createUser(address: string, confirmed = true) {
  const [row] = await su`INSERT INTO auth.users (email, email_confirmed_at) VALUES (${address}, ${confirmed ? new Date() : null}) RETURNING id`;
  return row.id as string;
}

/** Same as the app's server calls: one transaction, `service_role`. */
async function asService<T>(db: SQL, run: (tx: SQL) => Promise<T>): Promise<T> {
  return db.begin(async (tx) => {
    await tx.unsafe("SET LOCAL ROLE service_role");
    return run(tx);
  }) as Promise<T>;
}

async function grant(user: string, amount = BONUS, db: SQL = pool): Promise<string> {
  try {
    const [r] = await asService(db, (tx) => tx`SELECT public.credit_grant_signup(${user}::uuid, ${amount}::int) AS r`);
    return String(r.r);
  } catch (err) {
    return `error:${err instanceof Error ? err.message : String(err)}`;
  }
}

async function merge(guest: string, user: string): Promise<{ status: string; moved?: number } | string> {
  try {
    const [r] = await asService(pool, (tx) => tx`SELECT public.credit_merge(${guest}::uuid, ${user}::uuid) AS r`);
    return r.r as { status: string; moved?: number };
  } catch (err) {
    return `error:${err instanceof Error ? err.message : String(err)}`;
  }
}

async function walletOf(user: string): Promise<Wallet | null> {
  const [w] = await su`SELECT id, user_id, balance, free_granted, purchased_total, merged_into FROM public.credit_wallets WHERE user_id = ${user}`;
  return (w as Wallet | undefined) ?? null;
}

async function walletById(id: string): Promise<Wallet> {
  const [w] = await su`SELECT id, user_id, balance, free_granted, purchased_total, merged_into FROM public.credit_wallets WHERE id = ${id}`;
  return w as Wallet;
}

async function ledger(walletId: string) {
  return (await su`SELECT delta, kind, reference FROM public.credit_ledger WHERE wallet_id = ${walletId} ORDER BY created_at`) as { delta: number; kind: string; reference: string | null }[];
}

async function guestWallet(opts: { free?: number; purchased?: number } = {}) {
  const [w] = await su`INSERT INTO public.credit_wallets (guest_token_hash) VALUES (${`guest-${crypto.randomUUID()}`}) RETURNING id`;
  const id = w.id as string;
  if (opts.free) await asService(pool, (tx) => tx`SELECT public.credit_apply(${id}::uuid, ${opts.free}::int, 'free_grant', ${`free:wallet:${id}`}, 'legado', NULL)`);
  if (opts.purchased) await asService(pool, (tx) => tx`SELECT public.credit_apply(${id}::uuid, ${opts.purchased}::int, 'purchase', ${`play:test-${id}`}, 'compra', NULL)`);
  return id;
}

/** Mirrors `deleteMyAccount`: the wallet is anonymised (history kept), then the account is removed. */
async function deleteAccount(user: string) {
  await su`UPDATE public.credit_wallets SET user_id = NULL, guest_token_hash = NULL WHERE user_id = ${user}`;
  await su`DELETE FROM auth.users WHERE id = ${user}`;
}

async function waitUntil(check: () => Promise<boolean>, label: string, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await Bun.sleep(20);
  }
  throw new Error(`timeout waiting for ${label}`);
}

/** Number of backends currently blocked on a row/index lock while running `fragment`. */
async function lockWaiters(fragment: string) {
  const [r] = await su`SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query ILIKE ${`%${fragment}%`}`;
  return r.n as number;
}

/**
 * Deterministic interleaving: transaction A runs `first` and stays open; B runs `second` and must block
 * on A's lock; then A commits (or rolls back) and B finishes. Returns both results.
 */
async function interleave(first: (tx: SQL) => Promise<string>, second: (db: SQL) => Promise<string>, fragment: string, rollbackA = false) {
  const a = pg.connect(1);
  const b = pg.connect(1);
  let release!: () => void;
  const hold = new Promise<void>((r) => (release = r));
  let aResult: string | null = null;
  const txA = a
    .begin(async (tx) => {
      await tx.unsafe("SET LOCAL ROLE service_role");
      aResult = await first(tx);
      await hold;
      if (rollbackA) throw new Error("rollback-A");
    })
    .catch((err: unknown) => {
      if (!(err instanceof Error && err.message === "rollback-A")) throw err;
    });
  await waitUntil(async () => aResult !== null, "A to run");
  const pB = second(b);
  await waitUntil(async () => (await lockWaiters(fragment)) >= 1, "B to block on A's lock");
  const blocked = true;
  release();
  await txA;
  const bResult = await pB;
  await a.close();
  await b.close();
  return { aResult: aResult as unknown as string, bResult, blocked };
}

async function denied(role: "anon" | "authenticated", statement: string, sub?: string) {
  try {
    await su.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE ${role}`);
      if (sub) await tx`SELECT set_config('request.jwt.claim.sub', ${sub}, true)`;
      await tx.unsafe(statement);
    });
    return "allowed";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return /permission denied/i.test(msg) ? "denied" : `other:${msg}`;
  }
}

describe.skipIf(!enabled)("signup bonus antifraud on real PostgreSQL", () => {
  beforeAll(async () => {
    const extra = process.env["STOPIA_EXTRA_SQL"] ? [process.env["STOPIA_EXTRA_SQL"]] : [];
    pg = await startLocalPostgres(extra);
    su = pg.connect(4);
    pool = pg.connect(12);
    const [t] = await su`SELECT to_regclass('public.credit_abuse_events') IS NOT NULL AS ok`;
    monitoring = Boolean(t.ok);
  }, 60_000);

  afterAll(async () => {
    await pool?.close();
    await su?.close();
    pg?.stop();
  });

  // TESTE A
  test("A: first confirmed account gets exactly 20, one promo row and one ledger entry", async () => {
    const u = await createUser(email("a"));
    expect(await grant(u)).toBe("granted");
    const w = (await walletOf(u))!;
    expect(w.balance).toBe(BONUS);
    expect(w.free_granted).toBe(BONUS);
    const rows = await ledger(w.id);
    expect(rows).toEqual([{ delta: BONUS, kind: "free_grant", reference: `free:user:${u}` }]);
    const [p] = await su`SELECT count(*)::int AS n FROM public.promo_grants WHERE first_user_id = ${u} AND wallet_id = ${w.id}`;
    expect(p.n).toBe(1);
  });

  // TESTE B
  test("B: repeated requests (also with a different amount) add nothing", async () => {
    const u = await createUser(email("b"));
    expect(await grant(u)).toBe("granted");
    expect(await grant(u)).toBe("already");
    expect(await grant(u, 1000)).toBe("already");
    const w = (await walletOf(u))!;
    expect(w.balance).toBe(BONUS);
    expect((await ledger(w.id)).length).toBe(1);
    expect((await grant(u, 0)).startsWith("error:")).toBe(true);
    expect((await grant(u, 5000)).startsWith("error:")).toBe(true);
  });

  // TESTE C
  test("C: 10 truly parallel requests for one account grant exactly once (5 rounds)", async () => {
    for (let round = 0; round < 5; round += 1) {
      const u = await createUser(email(`c${round}`));
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          asService(pool, (tx) => tx`SELECT public.credit_grant_signup(${u}::uuid, ${BONUS}::int) AS r, pg_backend_pid() AS pid`).then(([r]) => r as { r: string; pid: number }),
        ),
      );
      expect(new Set(results.map((r) => r.pid)).size).toBeGreaterThan(1); // really different connections
      expect(results.filter((r) => r.r === "granted").length).toBe(1);
      expect(results.filter((r) => r.r === "already").length).toBe(9);
      const w = (await walletOf(u))!;
      expect(w.balance).toBe(BONUS);
      expect(w.free_granted).toBe(BONUS);
      const rows = await ledger(w.id);
      expect(rows.length).toBe(1);
      const [p] = await su`SELECT count(*)::int AS n FROM public.promo_grants WHERE first_user_id = ${u}`;
      expect(p.n).toBe(1);
      const [wallets] = await su`SELECT count(*)::int AS n FROM public.credit_wallets WHERE user_id = ${u}`;
      expect(wallets.n).toBe(1);
    }
  });

  test("C2: forced interleaving — the second call waits on the wallet lock and then sees 'already'", async () => {
    const u = await createUser(email("c2"));
    const r = await interleave(
      async (tx) => String((await tx`SELECT public.credit_grant_signup(${u}::uuid, 20) AS r`)[0].r),
      (db) => grant(u, BONUS, db),
      "credit_grant_signup",
    );
    expect(r.blocked).toBe(true);
    expect(r.aResult).toBe("granted");
    expect(r.bResult).toBe("already");
    expect((await walletOf(u))!.balance).toBe(BONUS);
  });

  test("C3: 10 parallel accounts sharing one normalized e-mail identity → one grant in total", async () => {
    const base = `par${Date.now().toString(36)}`;
    const variants = Array.from({ length: 10 }, (_, i) => {
      const dotted = base.split("").join(i % 2 ? "." : "");
      return `${i % 3 === 0 ? dotted.toUpperCase() : dotted}+v${i}@${i % 2 ? "googlemail.com" : "gmail.com"}`;
    });
    const users = await Promise.all(variants.map((v) => createUser(v)));
    const results = await Promise.all(users.map((u) => grant(u)));
    expect(results.filter((r) => r === "granted").length).toBe(1);
    expect(results.filter((r) => r === "identity_used").length).toBe(9);
    const [sum] = await su`SELECT coalesce(sum(free_granted), 0)::int AS n FROM public.credit_wallets WHERE user_id = ANY(${users}::uuid[])`;
    expect(sum.n).toBe(BONUS);
  });

  test("C4: forced interleaving across two accounts with the same identity (commit and rollback)", async () => {
    const tag = `il${Date.now().toString(36)}`;
    const u1 = await createUser(`${tag}@gmail.com`);
    const u2 = await createUser(`${tag.slice(0, 2)}.${tag.slice(2)}+x@googlemail.com`);
    const committed = await interleave(
      async (tx) => String((await tx`SELECT public.credit_grant_signup(${u1}::uuid, 20) AS r`)[0].r),
      (db) => grant(u2, BONUS, db),
      "credit_grant_signup",
    );
    expect(committed).toMatchObject({ blocked: true, aResult: "granted", bResult: "identity_used" });

    const tag2 = `rb${Date.now().toString(36)}`;
    const v1 = await createUser(`${tag2}@example.com`);
    const v2 = await createUser(`${tag2.toUpperCase()}+promo@EXAMPLE.com`);
    const rolledBack = await interleave(
      async (tx) => String((await tx`SELECT public.credit_grant_signup(${v1}::uuid, 20) AS r`)[0].r),
      (db) => grant(v2, BONUS, db),
      "credit_grant_signup",
      true,
    );
    // A's grant never committed, so the identity is still free and B legitimately receives it once.
    expect(rolledBack).toMatchObject({ blocked: true, aResult: "granted", bResult: "granted" });
    expect((await walletOf(v1))?.balance ?? 0).toBe(0);
    expect((await walletOf(v2))!.balance).toBe(BONUS);
  });

  // TESTE D
  test("D: unconfirmed e-mail is refused with zero balance; confirming makes it eligible once", async () => {
    const u = await createUser(email("d"), false);
    expect(await grant(u)).toBe("unconfirmed");
    expect((await walletOf(u))?.balance ?? 0).toBe(0);
    const [p] = await su`SELECT count(*)::int AS n FROM public.promo_grants WHERE first_user_id = ${u}`;
    expect(p.n).toBe(0);
    await su`UPDATE auth.users SET email_confirmed_at = now() WHERE id = ${u}`;
    expect(await grant(u)).toBe("granted");
    expect(await grant(u)).toBe("already");
  });

  // TESTE E
  test("E: another account with the same normalized identity gets nothing", async () => {
    const tag = `ana${Date.now().toString(36)}`;
    const first = await createUser(`${tag.slice(0, 3)}.${tag.slice(3)}+loja@Gmail.com`);
    const second = await createUser(`${tag}@googlemail.com`);
    const third = await createUser(`${tag.toUpperCase()}+x@GMAIL.COM`);
    expect(await grant(first)).toBe("granted");
    expect(await grant(second)).toBe("identity_used");
    expect(await grant(second)).toBe("identity_used");
    expect(await grant(third)).toBe("identity_used");
    expect((await walletOf(second))!.balance).toBe(0);
    expect((await walletOf(third))!.balance).toBe(0);
    // Outside Gmail, dots are significant (different mailbox) — documented limitation, not a bypass of the same address.
    const other = await createUser(`${tag.slice(0, 3)}.${tag.slice(3)}@example.com`);
    const otherNoDot = await createUser(`${tag}@example.com`);
    expect(await grant(other)).toBe("granted");
    expect(await grant(otherNoDot)).toBe("granted");
  });

  // TESTE F
  test("F: delete the account and recreate it with the same e-mail → no second bonus", async () => {
    const address = email("f");
    const u = await createUser(address);
    expect(await grant(u)).toBe("granted");
    const oldWallet = (await walletOf(u))!;
    await deleteAccount(u);
    const again = await createUser(address);
    expect(await grant(again)).toBe("identity_used");
    expect(await grant(again)).toBe("identity_used");
    expect((await walletOf(again))!.balance).toBe(0);
    const [p] = await su`SELECT count(*)::int AS n FROM public.promo_grants WHERE wallet_id = ${oldWallet.id}`;
    expect(p.n).toBe(1); // the permanent identity record survived the deletion
    // Twice more, with alias variations of the same address.
    await deleteAccount(again);
    const third = await createUser(address.replace("@", "+novo@").toUpperCase());
    expect(await grant(third)).toBe("identity_used");
  });

  // TESTE G
  test("G: anon and authenticated cannot execute any credit function", async () => {
    const victim = await createUser(email("g"));
    const fns = [
      `SELECT public.credit_grant_signup('${victim}'::uuid, 20)`,
      `SELECT public.credit_merge(gen_random_uuid(), '${victim}'::uuid)`,
      `SELECT public.credit_apply(gen_random_uuid(), 20, 'free_grant', 'x', 'x', NULL)`,
      `SELECT public.credit_consume(gen_random_uuid(), 'k', NULL, 'x')`,
      `SELECT public.credit_refund(gen_random_uuid(), 'k')`,
      `SELECT public.promo_identity_hash('someone@example.com')`,
      ...(monitoring ? [`SELECT public.credit_abuse_note('identity_used', '${victim}'::uuid, '')`] : []),
    ];
    for (const fn of fns) {
      expect(await denied("anon", fn)).toBe("denied");
      expect(await denied("authenticated", fn, victim)).toBe("denied"); // even for the caller's own account
    }
    expect((await walletOf(victim))?.balance ?? 0).toBe(0);
  });

  test("G2: anon and authenticated cannot read or write the credit tables", async () => {
    const tables = ["credit_wallets", "credit_ledger", "promo_grants", "ai_usage", "party_rate_events", "admin_audit", ...(monitoring ? ["credit_abuse_events"] : [])];
    const u = await createUser(email("g2"));
    for (const t of tables) {
      for (const role of ["anon", "authenticated"] as const) {
        expect(await denied(role, `SELECT 1 FROM public.${t} LIMIT 1`, u)).toBe("denied");
        expect(await denied(role, `DELETE FROM public.${t}`, u)).toBe("denied");
      }
    }
    expect(await denied("authenticated", `INSERT INTO public.credit_wallets (user_id, balance) VALUES ('${u}', 999)`, u)).toBe("denied");
    expect(await denied("authenticated", `INSERT INTO public.promo_grants (identity_hash, first_user_id) VALUES ('x', '${u}')`, u)).toBe("denied");
  });

  // TESTE H
  test("H: unique indexes reject duplicate grants even when written directly by the server role", async () => {
    const u = await createUser(email("h"));
    expect(await grant(u)).toBe("granted");
    const w = (await walletOf(u))!;
    const sameRef = await asService(pool, (tx) => tx`INSERT INTO public.credit_ledger (wallet_id, delta, kind, reference, balance_after) VALUES (${w.id}, 20, 'free_grant', ${`free:user:${u}`}, 40)`).then(() => "ok", (e: Error) => e.message);
    expect(sameRef).toContain("credit_ledger_once");
    const otherRef = await asService(pool, (tx) => tx`SELECT public.credit_apply(${w.id}::uuid, 20, 'free_grant', 'free:other', 'x', NULL)`).then(() => "ok", (e: Error) => e.message);
    expect(otherRef).toContain("credit_ledger_free_grant_once_per_wallet");
    const w2 = (await walletOf(u))!;
    expect(w2.balance).toBe(BONUS); // failed attempts rolled back entirely
    expect((await ledger(w.id)).length).toBe(1);
  });

  // TESTE I
  test("I1: a guest wallet without free credits merges and the account still gets exactly one bonus", async () => {
    const guest = await guestWallet();
    const u = await createUser(email("i1"));
    expect(await merge(guest, u)).toMatchObject({ status: "adopted" });
    expect(await grant(u)).toBe("granted");
    expect(await grant(u)).toBe("already");
    expect((await walletOf(u))!.balance).toBe(BONUS);
    expect(await merge(guest, u)).toMatchObject({ status: "skipped" }); // idempotent
  });

  test("I2: a legacy guest that already got 20 counts as the bonus for the account and its identity", async () => {
    const guest = await guestWallet({ free: BONUS });
    const address = email("i2");
    const u = await createUser(address);
    expect(await merge(guest, u)).toMatchObject({ status: "adopted" });
    expect(await grant(u)).toBe("already");
    expect((await walletOf(u))!.balance).toBe(BONUS);
    await deleteAccount(u);
    const again = await createUser(address);
    expect(await grant(again)).toBe("identity_used");
  });

  test("I3: merging into an account that already has the bonus moves only purchased credits", async () => {
    const u = await createUser(email("i3"));
    expect(await grant(u)).toBe("granted");
    const legacy = await guestWallet({ free: BONUS, purchased: 7 });
    expect(await merge(legacy, u)).toMatchObject({ status: "merged", moved: 7 });
    const w = (await walletOf(u))!;
    expect(w.balance).toBe(BONUS + 7);
    expect(w.free_granted).toBe(BONUS);
    expect(await grant(u)).toBe("already");
    const g = await walletById(legacy);
    expect(g.merged_into).toBe(w.id);
    expect(g.balance).toBe(BONUS); // legacy free credits stay behind on the retired guest wallet (cannot pay AI)
    expect(await merge(legacy, u)).toMatchObject({ status: "skipped" });
  });

  test("I4: merge racing the bonus grant never gives an account more than 20 free credits (20 races)", async () => {
    const outcomes: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const u = await createUser(email(`i4${i}`));
      const guest = await guestWallet({ free: BONUS });
      const [g, m] = await Promise.all([grant(u), merge(guest, u)]);
      outcomes.push(`${g}/${typeof m === "string" ? (m.includes("duplicate key") ? "merge_conflict" : m) : m.status}`);
      const [owned] = await su`SELECT coalesce(sum(free_granted), 0)::int AS free, count(*)::int AS n FROM public.credit_wallets WHERE user_id = ${u}`;
      expect(owned.n).toBe(1);
      expect(owned.free).toBe(BONUS);
      expect(await grant(u)).toBe("already");
    }
    // Every outcome is one of the safe orderings.
    for (const o of outcomes) expect(["granted/merged", "already/adopted", "granted/merge_conflict"]).toContain(o);
  });

  test("H2: ledger and wallets are consistent across everything the suite created", async () => {
    const [r] = await su`
      SELECT
        (SELECT count(*) FROM public.credit_wallets w WHERE w.balance <> coalesce((SELECT sum(delta) FROM public.credit_ledger l WHERE l.wallet_id = w.id), 0))::int AS balance_mismatch,
        (SELECT count(*) FROM public.credit_wallets w WHERE w.free_granted <> coalesce((SELECT sum(delta) FROM public.credit_ledger l WHERE l.wallet_id = w.id AND l.kind = 'free_grant'), 0))::int AS free_mismatch,
        (SELECT count(*) FROM (SELECT wallet_id FROM public.credit_ledger WHERE kind = 'free_grant' AND delta > 0 GROUP BY 1 HAVING count(*) > 1) x)::int AS double_grants,
        (SELECT count(*) FROM public.credit_wallets WHERE free_granted > ${BONUS})::int AS over_bonus,
        (SELECT count(*) FROM public.credit_wallets w WHERE w.user_id IS NOT NULL AND w.free_granted > 0
           AND NOT EXISTS (SELECT 1 FROM public.promo_grants g WHERE g.wallet_id = w.id OR g.first_user_id = w.user_id))::int AS grant_without_identity,
        (SELECT count(*) FROM public.promo_grants g WHERE NOT EXISTS (SELECT 1 FROM public.credit_ledger l WHERE l.wallet_id = g.wallet_id AND l.kind = 'free_grant'))::int AS identity_without_ledger,
        (SELECT count(*) FROM public.credit_ledger WHERE kind = 'free_grant' AND delta > 0 AND reference IS NULL)::int AS grant_without_reference,
        (SELECT count(*) FROM public.credit_wallets)::int AS wallets`;
    expect(r.wallets).toBeGreaterThan(30);
    expect({ ...r, wallets: 0 }).toEqual({ balance_mismatch: 0, free_mismatch: 0, double_grants: 0, over_bonus: 0, grant_without_identity: 0, identity_without_ledger: 0, grant_without_reference: 0, wallets: 0 });
  });

  // Monitoring (credit_abuse_events)
  test("M1: abuse notes collapse into one row per kind/account/day and count attempts, even in parallel", async () => {
    if (!monitoring) return;
    const u = await createUser(email("m1"));
    const counts = await Promise.all(Array.from({ length: 10 }, () => asService(pool, (tx) => tx`SELECT public.credit_abuse_note('identity_used', ${u}::uuid, '') AS n`).then(([r]) => r.n as number)));
    expect([...counts].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const rows = await su`SELECT kind, attempts FROM public.credit_abuse_events WHERE user_id = ${u}`;
    expect(rows).toEqual([{ kind: "identity_used", attempts: 10 }]);
    const bad = await asService(pool, (tx) => tx`SELECT public.credit_abuse_note('made_up', ${u}::uuid, '')`).then(() => "ok", () => "rejected");
    expect(bad).toBe("rejected");
  });

  test("M2: monitoring stores no e-mail/identity hash and prunes rows older than 90 days", async () => {
    if (!monitoring) return;
    const cols = (await su`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'credit_abuse_events' ORDER BY ordinal_position`).map((c: { column_name: string }) => c.column_name);
    expect(cols).toEqual(["kind", "user_id", "day", "attempts", "detail", "first_at", "last_at"]);
    const old = await createUser(email("m2old"));
    await su`INSERT INTO public.credit_abuse_events (kind, user_id, day) VALUES ('rate_limited', ${old}, (now() AT TIME ZONE 'utc')::date - 91)`;
    const fresh = await createUser(email("m2new"));
    await asService(pool, (tx) => tx`SELECT public.credit_abuse_note('rate_limited', ${fresh}::uuid, 'n:5')`);
    const [r] = await su`SELECT count(*)::int AS n FROM public.credit_abuse_events WHERE user_id = ${old}`;
    expect(r.n).toBe(0);
    const [d] = await su`SELECT detail FROM public.credit_abuse_events WHERE user_id = ${fresh}`;
    expect(d.detail).toBe("n:5");
  });

  test("LIVE (optional, read-only): deployed credit functions are byte-identical to the tested ones", async () => {
    if (process.env["STOPIA_COMPARE_LIVE"] !== "1") return;
    const names = ["credit_apply", "credit_consume", "credit_grant_signup", "credit_merge", "credit_refund", "promo_identity_hash", ...(monitoring ? ["credit_abuse_note"] : [])];
    const q = `SELECT p.proname || '=' || md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY['${names.join("','")}']) ORDER BY 1`;
    const live = spawnSync("psql", ["-XAtc", q], { encoding: "utf8" });
    expect(live.status).toBe(0);
    const local = (await su.unsafe(q)).map((r: Record<string, string>) => Object.values(r)[0]);
    expect(live.stdout.trim().split("\n")).toEqual(local);
  });
});
