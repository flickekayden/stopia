/**
 * Signup-bonus abuse monitoring (server side, but free of server imports so it can be unit tested).
 * Records only the account id, the kind of signal and a short sanitized detail — never e-mails,
 * identity hashes, network addresses or tokens. Failures are swallowed: monitoring must never stop a
 * legitimate bonus, a wallet load or a game.
 */
import type { BonusStatus } from "./signup-bonus";

export type CreditAbuseKind = "identity_used" | "rate_limited" | "grant_error";

/** Attempts on one day from which a signal is shown to admins as "repetido". */
export const REPEATED_ATTEMPTS = 3;

/** Which bonus outcomes are abuse signals worth recording (normal grants and confirmations are not). */
export function abuseKindForBonus(status: BonusStatus, reason: "rate_limit" | "error" | null = null): CreditAbuseKind | null {
  if (status === "identity_used") return "identity_used";
  if (status === "deferred" && reason === "rate_limit") return "rate_limited";
  if (status === "deferred" && reason === "error") return "grant_error";
  return null;
}

/** Short detail safe to store: letters, digits and `:_-.` only, at most 40 characters (e.g. an error code). */
export function safeAbuseDetail(detail: unknown) {
  return typeof detail === "string" || typeof detail === "number" ? String(detail).replace(/[^A-Za-z0-9:_.-]/g, "").slice(0, 40) : "";
}

type RpcClient = { rpc: (fn: "credit_abuse_note", args: { p_kind: string; p_user: string; p_detail: string }) => PromiseLike<{ error: unknown }> };

/** Best-effort record of one abuse signal. Never throws and never rejects. */
export async function noteCreditAbuse(client: RpcClient, kind: CreditAbuseKind, userId: string, detail?: unknown): Promise<boolean> {
  try {
    const { error } = await client.rpc("credit_abuse_note", { p_kind: kind, p_user: userId, p_detail: safeAbuseDetail(detail) });
    if (error) {
      console.warn("credit_abuse_note failed");
      return false;
    }
    return true;
  } catch {
    console.warn("credit_abuse_note failed");
    return false;
  }
}
