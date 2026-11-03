/**
 * Throwaway local PostgreSQL for integration tests: a fresh cluster in a temp folder, the hosted
 * platform stub, then the project's real credit migrations. Nothing touches the hosted database.
 */
import { SQL } from "bun";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, chownSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const MIGRATIONS = join(ROOT, "drizzle", "migrations");

/** Credit/antifraud migrations, in order. Later credit-monitoring migrations are picked up by name. */
const BASE_MIGRATIONS = [
  "0006_party_rate_limits.sql",
  "0007_commercial_accounts_credits.sql",
  "0008_credit_merge_and_store_consume.sql",
  "0009_revoke_client_access_commercial.sql",
  "0011_signup_bonus_accounts_only.sql",
];

export function migrationFiles() {
  const extra = existsSync(MIGRATIONS) ? readdirSync(MIGRATIONS).filter((f) => /^\d{4}_.*credit_abuse.*\.sql$/.test(f)).sort() : [];
  return [...BASE_MIGRATIONS, ...extra].map((f) => join(MIGRATIONS, f));
}

function which(bin: string) {
  return spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8" }).stdout.trim();
}

export function postgresAvailable() {
  return Boolean(which("initdb") && which("pg_ctl"));
}

// PostgreSQL refuses to run as root; inside the sandbox it runs as an unprivileged user.
const RUN_AS = process.getuid?.() === 0 ? Number(process.env["STOPIA_PG_UID"] ?? 1000) : null;

function run(bin: string, args: string[]) {
  const cmd = RUN_AS === null ? bin : "setpriv";
  const full = RUN_AS === null ? args : [`--reuid=${RUN_AS}`, `--regid=${RUN_AS}`, "--clear-groups", bin, ...args];
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("PG")));
  const res = spawnSync(cmd, full, { encoding: "utf8", env });
  if (res.status !== 0) throw new Error(`${bin} failed: ${res.stderr || res.stdout}`);
}

export type LocalPg = { url: string; connect: (max?: number) => SQL; stop: () => void };

export async function startLocalPostgres(extraSqlFiles: string[] = []): Promise<LocalPg> {
  const dir = mkdtempSync(join(tmpdir(), "stopia-pg-"));
  if (RUN_AS !== null) chownSync(dir, RUN_AS, RUN_AS);
  const data = join(dir, "data");
  const port = 40000 + Math.floor(Math.random() * 20000);
  run("initdb", ["-D", data, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--no-sync"]);
  run("pg_ctl", ["-D", data, "-l", join(dir, "log"), "-w", "-o", `-p ${port} -k ${dir} -c listen_addresses=127.0.0.1 -c fsync=off -c max_connections=60`, "start"]);
  const url = `postgres://postgres@127.0.0.1:${port}/postgres`;
  const connect = (max = 1) => new SQL({ url, max, tls: false, idleTimeout: 5 });
  const stop = () => {
    try { run("pg_ctl", ["-D", data, "-m", "immediate", "stop"]); } catch { /* already stopped */ }
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    const admin = connect();
    await admin.unsafe(readFileSync(join(import.meta.dir, "supabase-stub.sql"), "utf8"));
    for (const file of [...migrationFiles(), ...extraSqlFiles]) {
      try {
        await admin.unsafe(readFileSync(file, "utf8"));
      } catch (err) {
        throw new Error(`migration ${file} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await admin.close();
  } catch (err) {
    stop();
    throw err;
  }
  return { url, connect, stop };
}
