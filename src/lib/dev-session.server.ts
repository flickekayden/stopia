import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { useSession } from "@tanstack/react-start/server";

export type DeveloperSession = { unlocked?: boolean };

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

export async function developerIsUnlocked() {
  const session = await getDeveloperSession();
  return session.data.unlocked === true;
}

function sign(payload: string) {
  return createHmac("sha256", process.env["DEVELOPER_SESSION_SECRET"] ?? "").update(payload).digest("hex");
}

/** Token assinado que o aparelho do desenvolvedor guarda (funciona mesmo sem cookie). */
export function createDevToken() {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 30;
  return `${exp}.${sign(`dev:${exp}`)}`;
}

export function verifyDevToken(token?: string | null) {
  if (!token || !process.env["DEVELOPER_SESSION_SECRET"]) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(`dev:${exp}`));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isDeveloper(token?: string | null) {
  if (verifyDevToken(token)) return true;
  try {
    return await developerIsUnlocked();
  } catch {
    return false;
  }
}
