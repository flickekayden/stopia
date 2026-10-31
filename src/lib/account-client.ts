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
  supabase.auth.onAuthStateChange((event, session) => {
    if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
    if (event === "SIGNED_IN" && session?.access_token) {
      // Deferred so no auth call runs inside the auth callback.
      const token = session.access_token;
      window.setTimeout(() => void afterSignIn(token), 0);
    }
    emitAccountChange();
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

const TERMS_FLAG = "stopia-accept-terms";

/** Remembers that the player ticked "aceito os termos" before an OAuth redirect or email sign-up. */
export function markTermsAccepted() {
  if (typeof window !== "undefined") window.sessionStorage.setItem(TERMS_FLAG, "1");
}

export type ClaimResult = { status: "adopted" | "merged" | "skipped"; moved: number };
const claimListeners = new Set<(result: ClaimResult) => void>();

export function onGuestClaimed(listener: (result: ClaimResult) => void) {
  claimListeners.add(listener);
  return () => claimListeners.delete(listener);
}

/** After sign-in: records accepted terms and moves this device's guest balance into the account (once). */
async function afterSignIn(accessToken: string) {
  const { claimGuestWallet, updateMyProfile } = await import("./account.functions");
  if (window.sessionStorage.getItem(TERMS_FLAG) === "1") {
    try {
      await updateMyProfile({ data: { accessToken, acceptTerms: true } });
      window.sessionStorage.removeItem(TERMS_FLAG);
    } catch { /* retried on the next sign-in */ }
  }
  const guestToken = getGuestToken();
  if (!guestToken) return;
  try {
    const result = await claimGuestWallet({ data: { accessToken, guestToken } });
    // The guest wallet now belongs to the account (or was already linked): forget the guest token.
    window.localStorage.removeItem(GUEST_KEY);
    for (const listener of claimListeners) listener(result);
    emitAccountChange();
  } catch { /* keeps the guest token; the next sign-in retries */ }
}
