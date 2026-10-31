/**
 * Browser-side identity for credits: the optional account (Lovable Cloud auth, loaded lazily so the
 * home page stays light) and the server-issued guest token. The guest token only identifies a wallet;
 * the server decides everything about balances.
 */
import type { CreditCredentials } from "./billing";

const GUEST_KEY = "stopia-guest-token";
const listeners = new Set<() => void>();

export function getGuestToken() {
  if (typeof window === "undefined") return undefined;
  return window.localStorage.getItem(GUEST_KEY) ?? undefined;
}

export function setGuestToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(GUEST_KEY, token);
  else window.localStorage.removeItem(GUEST_KEY);
  emitAccountChange();
}

export function onAccountChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitAccountChange() {
  for (const listener of listeners) listener();
}

export async function supabaseClient() {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase;
}

let authWired = false;

/** One auth listener for the whole app: identity changes refresh every balance on screen. */
export async function wireAuthEvents() {
  if (authWired || typeof window === "undefined") return;
  authWired = true;
  const supabase = await supabaseClient();
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") emitAccountChange();
  });
}

export async function getAccessToken() {
  if (typeof window === "undefined") return undefined;
  const supabase = await supabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? undefined;
}

export async function currentUser() {
  const supabase = await supabaseClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function creditCredentials(): Promise<CreditCredentials> {
  const accessToken = await getAccessToken().catch(() => undefined);
  return { accessToken, guestToken: getGuestToken() };
}
