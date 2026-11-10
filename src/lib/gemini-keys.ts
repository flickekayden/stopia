/** Browser-safe rules for the Gemini key pool: failure classification, cooldowns, ordering and masking. */

export type KeyTier = "free" | "paid";
export type KeyStatus = "ok" | "limit_minute" | "limit_daily" | "no_credit" | "invalid" | "error";

export type PoolKey = {
  id: string;
  tier: KeyTier;
  enabled: boolean;
  status: string;
  cooldown_until: string | null;
  created_at: string;
};

export const KEY_STATUS_LABELS: Record<KeyStatus, string> = {
  ok: "Funcionando",
  limit_minute: "Limite por minuto",
  limit_daily: "Limite diário atingido",
  no_credit: "Sem crédito / faturamento",
  invalid: "Chave recusada",
  error: "Erro temporário",
};

const MIN = 60_000;
/** How long a key rests after each failure kind (invalid keys wait for a manual reset). */
export const COOLDOWN_MS: Record<Exclude<KeyStatus, "ok">, number> = {
  limit_minute: MIN,
  limit_daily: 6 * 60 * MIN,
  no_credit: 24 * 60 * MIN,
  invalid: 365 * 24 * 60 * MIN,
  error: 30_000,
};

/** Maps a Gemini HTTP failure to a key status. */
export function classifyGeminiFailure(status: number, detail: string): Exclude<KeyStatus, "ok"> {
  const d = detail.toLowerCase();
  if (d.includes("billing") || d.includes("prepayment") || d.includes("credit") || status === 402) return "no_credit";
  if (status === 429 || d.includes("resource_exhausted") || d.includes("quota")) {
    return d.includes("perday") || d.includes("per day") || d.includes("daily") ? "limit_daily" : "limit_minute";
  }
  if (status === 401 || status === 403 || d.includes("api_key_invalid") || d.includes("api key not valid")) return "invalid";
  return "error";
}

/** Usable keys in try order: free before paid, then oldest first. */
export function orderKeys<T extends PoolKey>(keys: T[], now = Date.now()): T[] {
  return keys
    .filter((k) => k.enabled && (!k.cooldown_until || Date.parse(k.cooldown_until) <= now))
    .sort((a, b) => (a.tier === b.tier ? a.created_at.localeCompare(b.created_at) : a.tier === "free" ? -1 : 1));
}

/** Shows prefix and last four characters only (works for AQ.… and AIza… keys). */
export function maskKey(key: string): string {
  if (key.length <= 10) return "••••";
  const prefix = key.startsWith("AQ.") ? key.slice(0, 6) : key.slice(0, 6);
  return `${prefix}••••••••${key.slice(-4)}`;
}

/** Player-facing message when every key failed, naming the worst reason. */
export function exhaustedMessage(reasons: string[]): string {
  if (reasons.includes("limit_daily")) return "As chaves do Gemini atingiram o limite diário. A rodada segue sem a IA.";
  if (reasons.includes("no_credit")) return "As chaves do Gemini estão sem crédito. A rodada segue sem a IA.";
  if (reasons.includes("limit_minute")) return "O Gemini atingiu o limite de uso agora. Espere alguns segundos e tente de novo.";
  if (reasons.includes("invalid")) return "A chave do Gemini foi recusada. Confira se ela está correta e ativa.";
  return "O Gemini está sobrecarregado no momento. Tente de novo em instantes.";
}
