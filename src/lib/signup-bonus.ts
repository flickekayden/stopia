/**
 * Browser-safe rules for the one-time signup bonus (20 free AI credits) and who may pay for AI.
 * The real enforcement lives in the database (`credit_grant_signup`, unique indexes) and the server;
 * these helpers keep the server decisions and the screens in agreement.
 */

/** Outcome of the server-side signup bonus check for a signed-in account. */
export type BonusStatus = "granted" | "already" | "identity_used" | "unconfirmed" | "deferred" | "no_identity";

/** Accounts created from one network address that may receive the bonus per day; extra ones get it later. */
export const BONUS_PER_NETWORK_PER_DAY = 5;

/** Only account wallets ever pay for AI; legacy guest wallets keep their balance but cannot spend it. */
export function walletMayPayAi(wallet: { user_id: string | null } | null | undefined) {
  return Boolean(wallet?.user_id);
}

/** Server-side rate limit: past the daily count the bonus is postponed (never refused). */
export function bonusAllowedNow(grantsFromNetworkToday: number) {
  return grantsFromNetworkToday < BONUS_PER_NETWORK_PER_DAY;
}

/** Player-facing explanation of the bonus state, or null when nothing needs saying. */
export function bonusMessage(status: BonusStatus | null | undefined, freeCredits = 20) {
  switch (status) {
    case "granted":
      return `Você ganhou ${freeCredits} créditos de IA grátis de boas-vindas!`;
    case "already":
      return `Os ${freeCredits} créditos grátis de boas-vindas já foram entregues nesta conta.`;
    case "identity_used":
      return "Este e-mail já recebeu os créditos grátis de boas-vindas em outra conta. O benefício é único.";
    case "unconfirmed":
      return `Confirme seu e-mail para receber os ${freeCredits} créditos de IA grátis.`;
    case "deferred":
      return `Muitas contas novas nesta rede hoje: seus ${freeCredits} créditos grátis chegam automaticamente mais tarde.`;
    default:
      return null;
  }
}

/** Same-origin path to return to after signing in; anything else falls back to the profile. */
export function safeReturnPath(value: unknown, fallback = "/perfil") {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.length > 200) return fallback;
  if (/[\s<>]/.test(value)) return fallback;
  return value;
}
