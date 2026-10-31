/**
 * Keeps developer mode in step with the signed-in administrator account. The device's developer token
 * expires (and older devices may still hold a token from the retired password unlock), so before the
 * panel is used the token is checked and silently renewed from the signed-in admin account; when the
 * account is gone or is no longer an admin, developer mode is switched off instead of failing later.
 */
import { getAccessToken } from "./account-client";
import { devTokenNeedsRenewal, getDevToken, setDevKey, setDevToken } from "./dev-settings";
import { getDeveloperStatus, unlockDeveloper } from "./room-admin.functions";

export type DevAccessResult = "ok" | "signed_out" | "not_admin" | "offline";

/** Issues a fresh developer token for the signed-in account (server re-checks the admin role). */
export async function renewDevAccess(): Promise<DevAccessResult> {
  const accessToken = await getAccessToken();
  if (!accessToken) return "signed_out";
  const res = await unlockDeveloper({ data: { accessToken } });
  if (!res.ok) return res.reason;
  setDevToken(res.token);
  setDevKey(true);
  return "ok";
}

/** The account id a developer token was issued to (`exp.uid.signature`). */
function tokenAccountId(token?: string | null) {
  return token?.split(".")[1] ?? null;
}

/**
 * Confirms this device's developer access, renewing it when needed; turns it off when it cannot be kept.
 * With `matchAccount`, a token issued to a different (or signed-out) account is renewed too.
 */
export async function ensureDevAccess({ matchAccount = false } = {}): Promise<DevAccessResult> {
  try {
    const token = getDevToken();
    let accountChanged = false;
    if (matchAccount) {
      const { supabaseClient } = await import("./account-client");
      const { data } = await (await supabaseClient()).auth.getSession();
      accountChanged = (data.session?.user.id ?? null) !== tokenAccountId(token);
    }
    if (!accountChanged && !devTokenNeedsRenewal(token, Date.now())) {
      const { unlocked } = await getDeveloperStatus({ data: { token } });
      if (unlocked) return "ok";
    }
    const result = await renewDevAccess();
    if (result === "signed_out" || result === "not_admin") {
      setDevKey(false);
      setDevToken("");
    }
    return result;
  } catch {
    // Network blips keep the current state; the next check tries again.
    return "offline";
  }
}
