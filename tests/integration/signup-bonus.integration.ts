/**
 * Live check of the signup-bonus and AI-billing rules against the project database.
 * Run manually: `bun tests/integration/signup-bonus.integration.ts`
 * Creates throwaway test accounts/wallets/rooms and removes them at the end (also on failure).
 * Not part of `bun test` because it needs the server credentials and writes test rows.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_URL"];
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const tag = Math.random().toString(36).slice(2, 8);
const users: string[] = [];
const wallets: string[] = [];
const rooms: string[] = [];
const results: { name: string; ok: boolean; detail?: string }[] = [];

function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, ...(detail ? { detail } : {}) });
}

async function makeUser(email: string, confirmed = true) {
  const { data, error } = await db.auth.admin.createUser({ email, password: `Test-${tag}-pass!`, email_confirm: confirmed });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  users.push(data.user.id);
  return data.user.id;
}

async function grant(userId: string, amount = 20) {
  const { data, error } = await db.rpc("credit_grant_signup", { p_user: userId, p_amount: amount });
  return error ? `error:${error.message}` : String(data);
}

async function walletOf(userId: string) {
  const { data } = await db.from("credit_wallets").select("id, balance, free_granted, purchased_total").eq("user_id", userId).maybeSingle();
  if (data && !wallets.includes(data.id)) wallets.push(data.id);
  return data;
}

async function ledgerSum(walletId: string) {
  const { data } = await db.from("credit_ledger").select("delta").eq("wallet_id", walletId);
  return (data ?? []).reduce((s, r) => s + r.delta, 0);
}

async function guestWallet(withFree: boolean) {
  const { data } = await db.from("credit_wallets").insert({ guest_token_hash: `test-${tag}-${Math.random()}` }).select("id").single();
  wallets.push(data!.id);
  if (withFree) await db.rpc("credit_apply", { p_wallet: data!.id, p_delta: 20, p_kind: "free_grant", p_reference: `free:wallet:${data!.id}`, p_note: "teste", p_actor: null as unknown as string });
  return data!.id as string;
}

async function run() {
  // 1-5. First grant, repetition, concurrency, client-chosen amount.
  const a = await makeUser(`stopiatest${tag}a@example.com`);
  const concurrent = await Promise.all(Array.from({ length: 6 }, () => grant(a)));
  check("6 simultaneous grants produce exactly one 'granted'", concurrent.filter((s) => s === "granted").length === 1, concurrent.join(","));
  let wa = await walletOf(a);
  check("authenticated account receives exactly 20", wa?.balance === 20 && wa?.free_granted === 20, JSON.stringify(wa));
  check("repeating the grant does not add credits", (await grant(a)) === "already" && (await walletOf(a))?.balance === 20);
  check("a different amount on a repeat call is ignored", (await grant(a, 1000)) === "already" && (await walletOf(a))?.balance === 20);
  check("invalid amounts are rejected", (await grant(a, 0)).startsWith("error:") && (await grant(a, 5000)).startsWith("error:"));

  // Unconfirmed e-mail.
  const u = await makeUser(`stopiatest${tag}u@example.com`, false);
  check("unconfirmed e-mail gets nothing yet", (await grant(u)) === "unconfirmed" && !((await walletOf(u))?.balance));

  // 14. Consumption never goes negative; ledger stays consistent.
  wa = await walletOf(a);
  const consumed = await db.rpc("credit_consume", { p_wallet: wa!.id, p_key: `test:${tag}:1`, p_room: null as unknown as string, p_label: "teste" });
  const dup = await db.rpc("credit_consume", { p_wallet: wa!.id, p_key: `test:${tag}:1`, p_room: null as unknown as string, p_label: "teste" });
  check("one AI use charges once per usage key", consumed.data === "charged" && dup.data === "duplicate" && (await walletOf(a))?.balance === 19);
  check("ledger sum equals the balance", (await ledgerSum(wa!.id)) === 19);

  // 12. Delete and recreate with the same e-mail.
  await db.from("credit_wallets").update({ user_id: null, guest_token_hash: null }).eq("user_id", a);
  await db.auth.admin.deleteUser(a);
  const a2 = await makeUser(`stopiatest${tag}a@example.com`);
  check("recreated account with the same e-mail does not get the bonus", (await grant(a2)) === "identity_used" && (await walletOf(a2))?.balance === 0);
  check("…and repeating still does not", (await grant(a2)) === "identity_used" && (await walletOf(a2))?.balance === 0);
  const wa2 = await walletOf(a2);
  const empty = await db.rpc("credit_consume", { p_wallet: wa2!.id, p_key: `test:${tag}:2`, p_room: null as unknown as string, p_label: "teste" });
  check("an empty wallet cannot consume (balance never negative)", empty.data === "insufficient" && (await walletOf(a2))?.balance === 0);

  // Gmail aliases count as the same e-mail.
  const g1 = await makeUser(`stopia.test.${tag}@gmail.com`);
  const g2 = await makeUser(`stopiatest${tag}+promo@googlemail.com`);
  check("Gmail dots/+tags/googlemail are one identity", (await grant(g1)) === "granted" && (await grant(g2)) === "identity_used");

  // 10. Guest linking.
  const plainGuest = await guestWallet(false);
  const m1 = await makeUser(`stopiatest${tag}m1@example.com`);
  await db.rpc("credit_merge", { p_guest: plainGuest, p_user: m1 });
  check("a guest wallet without free credits does not block the account bonus", (await grant(m1)) === "granted" && (await walletOf(m1))?.balance === 20);
  const legacyGuest = await guestWallet(true);
  const m2 = await makeUser(`stopiatest${tag}m2@example.com`);
  await db.rpc("credit_merge", { p_guest: legacyGuest, p_user: m2 });
  check("a legacy guest that already got 20 keeps them and the account gets no second 20", (await grant(m2)) === "already" && (await walletOf(m2))?.balance === 20);
  const legacyGuest2 = await guestWallet(true);
  await db.rpc("credit_merge", { p_guest: legacyGuest2, p_user: m1 });
  check("merging a legacy guest into an account that has a wallet moves no free credits", (await walletOf(m1))?.balance === 20);

  // 7/8/16. Room billing: only the bound account wallet pays; guest-bound rooms never consume.
  const credits = await import("../../src/lib/credits.server");
  const { data: roomA } = await db.from("party_rooms").insert({ code: `T${tag.slice(0, 3)}`.toUpperCase().slice(0, 4) }).select("id").single();
  rooms.push(roomA!.id);
  const guestOnly = await guestWallet(true);
  await credits.bindRoomWallet(roomA!.id, guestOnly);
  const guestCharge = await credits.chargeRoomAi(roomA!.id, `test:${tag}:room`, "teste");
  const { data: gw } = await db.from("credit_wallets").select("balance").eq("id", guestOnly).single();
  check("a room paid by a guest wallet never consumes AI credits", guestCharge.status === "unbilled" && gw?.balance === 20);
  await credits.linkRoomToAccount(roomA!.id, m1);
  const before = (await walletOf(m1))!.balance;
  const accountCharge = await credits.chargeRoomAi(roomA!.id, `test:${tag}:room2`, "teste");
  check("after the host signs in, the host's account pays the room's AI", accountCharge.status === "charged" && (await walletOf(m1))?.balance === before - 1);
  await credits.linkRoomToAccount(roomA!.id, m2);
  const other = await credits.chargeRoomAi(roomA!.id, `test:${tag}:room3`, "teste");
  check("another account cannot take over a room already paid by an account", other.walletId === (await walletOf(m1))!.id && (await walletOf(m2))?.balance === 20);
}

async function cleanup() {
  if (rooms.length) {
    await db.from("party_room_billing").delete().in("room_id", rooms);
    await db.from("party_rooms").delete().in("id", rooms);
  }
  for (const id of users) {
    const w = await walletOf(id);
    if (w && !wallets.includes(w.id)) wallets.push(w.id);
  }
  if (wallets.length) {
    await db.from("promo_grants").delete().in("wallet_id", wallets);
    await db.from("ai_usage").delete().in("wallet_id", wallets);
    await db.from("credit_ledger").delete().in("wallet_id", wallets);
    await db.from("credit_wallets").update({ merged_into: null }).in("id", wallets);
    await db.from("credit_wallets").delete().in("id", wallets);
  }
  await db.from("promo_grants").delete().in("first_user_id", users);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => undefined);
}

try {
  await run();
} catch (err) {
  check("script finished without crashing", false, err instanceof Error ? err.message : String(err));
} finally {
  await cleanup();
}
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail && !r.ok ? `  (${r.detail})` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
