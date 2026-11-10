import { classifyGeminiFailure, COOLDOWN_MS, orderKeys, type KeyStatus } from "./gemini-keys";

/** Server-only Gemini key pool backed by `ai_api_keys` (no client grants). */
export type StoredKey = {
  id: string;
  label: string;
  api_key: string;
  tier: "free" | "paid";
  enabled: boolean;
  status: string;
  cooldown_until: string | null;
  created_at: string;
};

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

let cache: { at: number; keys: StoredKey[] } | null = null;

export function invalidateKeyCache() {
  cache = null;
}

export async function loadKeys(): Promise<StoredKey[]> {
  if (cache && Date.now() - cache.at < 20_000) return cache.keys;
  try {
    const { data } = await (await db())
      .from("ai_api_keys")
      .select("id, label, api_key, tier, enabled, status, cooldown_until, created_at");
    cache = { at: Date.now(), keys: (data ?? []) as StoredKey[] };
  } catch {
    cache = { at: Date.now(), keys: [] };
  }
  return cache.keys;
}

export async function usableKeys() {
  return orderKeys(await loadKeys());
}

export async function markKeyFailure(id: string, status: number, detail: string): Promise<Exclude<KeyStatus, "ok">> {
  const kind = classifyGeminiFailure(status, detail);
  const now = Date.now();
  const until = new Date(now + COOLDOWN_MS[kind]).toISOString();
  const k = cache?.keys.find((x) => x.id === id);
  if (k) { k.status = kind; k.cooldown_until = until; }
  try {
    await (await db()).from("ai_api_keys").update({
      status: kind,
      cooldown_until: until,
      last_error: `${status}: ${detail.slice(0, 280)}`,
      last_error_at: new Date(now).toISOString(),
    }).eq("id", id);
  } catch { /* best effort */ }
  console.warn(`[gemini-pool] key ${id} → ${kind} (${status})`);
  return kind;
}

export async function markKeySuccess(id: string) {
  const k = cache?.keys.find((x) => x.id === id);
  const wasBad = k && k.status !== "ok";
  if (k) { k.status = "ok"; k.cooldown_until = null; }
  try {
    const client = await db();
    const { data } = await client.from("ai_api_keys").select("uses").eq("id", id).maybeSingle();
    await client.from("ai_api_keys").update({
      uses: (data?.uses ?? 0) + 1,
      last_used_at: new Date().toISOString(),
      ...(wasBad ? { status: "ok", cooldown_until: null } : {}),
    }).eq("id", id);
  } catch { /* best effort */ }
}
