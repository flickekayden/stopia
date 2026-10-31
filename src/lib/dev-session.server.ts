import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { useSession } from "@tanstack/react-start/server";

/**
 * Developer/admin access. There is no shared password: a signed-in account with the "admin" role
 * receives a short-lived signed token bound to its user id, and every check re-reads the role, so
 * removing the role revokes access immediately.
 */
export type DeveloperSession = { unlocked?: boolean; uid?: string };

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;

export function sessionConfig() {
  const secret = process.env["DEVELOPER_SESSION_SECRET"];
  if (!secret) throw new Error("A sessão de desenvolvedor não está configurada");
  // useSession exige senha com 32+ caracteres; derivamos uma chave estável
  // do segredo configurado para aceitar valores de qualquer tamanho.
  const password = createHash("sha256").update(`dev-session:${secret}`, "utf8").digest("hex");
  return {
    password,
    name: "stop-developer",
    maxAge: 60 * 60 * 8,
    cookie: { httpOnly: true, secure: process.env["NODE_ENV"] === "production", sameSite: "lax" as const, path: "/" },
  };
}

export async function getDeveloperSession() {
  return useSession<DeveloperSession>(sessionConfig());
}

async function roleIsAdmin(uid: string | undefined) {
  if (!uid) return false;
  const { isAdmin } = await import("./credits.server");
  return isAdmin(uid);
}

export async function developerIsUnlocked() {
  const session = await getDeveloperSession();
  return session.data.unlocked === true && (await roleIsAdmin(session.data.uid));
}

function sign(payload: string) {
  return createHmac("sha256", process.env["DEVELOPER_SESSION_SECRET"] ?? "").update(payload).digest("hex");
}

/** Signed token the admin's device keeps (works without cookies, e.g. inside the Android app). */
export function createDevToken(uid: string) {
  const exp = Date.now() + TOKEN_TTL_MS;
  return `${exp}.${uid}.${sign(`dev:${exp}:${uid}`)}`;
}

/** The admin user id inside a valid, unexpired token (signature only; the role is checked separately). */
export function tokenUserId(token?: string | null) {
  if (!token || !process.env["DEVELOPER_SESSION_SECRET"]) return null;
  const [exp, uid, sig] = token.split(".");
  if (!exp || !uid || !sig || Number(exp) < Date.now() || !/^[0-9a-f-]{36}$/.test(uid)) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(`dev:${exp}:${uid}`));
  return a.length === b.length && timingSafeEqual(a, b) ? uid : null;
}

/** Admin user id for this request (token first, then the cookie session), or null. */
export async function adminUserId(token?: string | null) {
  const fromToken = tokenUserId(token);
  if (fromToken && (await roleIsAdmin(fromToken))) return fromToken;
  try {
    const session = await getDeveloperSession();
    if (session.data.unlocked === true && (await roleIsAdmin(session.data.uid))) return session.data.uid ?? null;
  } catch { /* no request context */ }
  return null;
}

export async function isDeveloper(token?: string | null) {
  return (await adminUserId(token)) !== null;
}
