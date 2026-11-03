/**
 * Server-only AI credit wallets. Identity comes from a verified account access token or a
 * server-issued guest token (stored only as a hash). Balances change exclusively through the
 * credit_* database functions, which lock the wallet row and keep an append-only ledger.
 */
import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readBillingConfig, type BillingConfig, type CreditCredentials, type WalletSummary } from "./billing";
import { bonusAllowedNow, walletMayPayAi, type BonusStatus } from "./signup-bonus";

const db = () => supabaseAdmin;

type WalletRow = {
  id: string;
  user_id: string | null;
  guest_token_hash: string | null;
  balance: number;
  free_granted: number;
  purchased_total: number;
  consumed_total: number;
  merged_into: string | null;
};

const WALLET_COLUMNS = "id, user_id, guest_token_hash, balance, free_granted, purchased_total, consumed_total, merged_into";
const GUEST_TOKEN = /^[A-Za-z0-9_-]{40,64}$/;

export function hashGuestToken(token: string) {
  return createHash("sha256").update(`guest:${token}`).digest("hex");
}

let configCache: { at: number; value: BillingConfig } | null = null;

export async function loadBillingConfig(): Promise<BillingConfig> {
  if (configCache && Date.now() - configCache.at < 30_000) return configCache.value;
  const { data } = await db().from("app_settings").select("value").eq("key", "billing").maybeSingle();
  const value = readBillingConfig(data?.value);
  configCache = { at: Date.now(), value };
  return value;
}

/** Verified account id for an access token, or null (expired, forged or missing). */
export async function userIdFromToken(accessToken?: string) {
  if (!accessToken || accessToken.length > 4096) return null;
  const { data, error } = await db().auth.getUser(accessToken);
  if (error || !data.user) return null;
  return data.user.id;
}

async function walletById(id: string): Promise<WalletRow | null> {
  const { data } = await db().from("credit_wallets").select(WALLET_COLUMNS).eq("id", id).maybeSingle();
  return (data as WalletRow | null) ?? null;
}

/** Follows a guest wallet that was merged into an account to the account wallet. */
async function resolveMerged(wallet: WalletRow | null): Promise<WalletRow | null> {
  let current = wallet;
  for (let i = 0; i < 3 && current?.merged_into; i += 1) current = await walletById(current.merged_into);
  return current;
}

async function networkKey() {
  let ip = "";
  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    ip = (getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for")?.split(",")[0] ?? "").trim();
  } catch { /* not inside a request */ }
  return ip ? createHash("sha256").update(`rate:${ip}`).digest("hex") : null;
}

/**
 * The one-time signup bonus. The amount comes from server configuration and the identity from the
 * verified account; the database function locks the wallet and records the grant permanently (per
 * account and per normalized e-mail hash), so repeated or concurrent calls never grant twice.
 * Many new accounts from one network on the same day get the bonus later instead of being refused.
 */
async function applySignupBonus(userId: string, wallet: WalletRow): Promise<BonusStatus> {
  if (wallet.free_granted > 0) return "already";
  const key = await networkKey();
  if (key) {
    const { count } = await db()
      .from("party_rate_events")
      .select("id", { count: "exact", head: true })
      .eq("key_hash", key)
      .eq("kind", "signup_bonus")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());
    if (!bonusAllowedNow(count ?? 0)) {
      // Only postpone accounts that could still receive it.
      const { data: marker } = await db().from("credit_ledger").select("id").eq("kind", "free_grant").eq("reference", `free:user:${userId}`).maybeSingle();
      return marker ? "identity_used" : "deferred";
    }
  }
  const config = await loadBillingConfig();
  const { data, error } = await db().rpc("credit_grant_signup", { p_user: userId, p_amount: config.freeCredits });
  if (error) {
    console.error("credit_grant_signup failed", error.code);
    return "deferred";
  }
  const status = String(data) as BonusStatus | "no_user";
  if (status === "granted" && key) await db().from("party_rate_events").insert({ key_hash: key, kind: "signup_bonus" });
  return status === "no_user" ? "no_identity" : status;
}

async function accountWallet(userId: string): Promise<{ wallet: WalletRow; bonus: BonusStatus }> {
  const { data: existing } = await db().from("credit_wallets").select(WALLET_COLUMNS).eq("user_id", userId).maybeSingle();
  let wallet = existing as WalletRow | null;
  if (!wallet) {
    const { data: created } = await db().from("credit_wallets").insert({ user_id: userId }).select(WALLET_COLUMNS).maybeSingle();
    // A concurrent request may have created it first (UNIQUE user_id).
    wallet = (created as WalletRow | null) ?? ((await db().from("credit_wallets").select(WALLET_COLUMNS).eq("user_id", userId).maybeSingle()).data as WalletRow | null);
    if (!wallet) throw new Error("Não foi possível abrir seu saldo. Tente de novo.");
  }
  const bonus = await applySignupBonus(userId, wallet);
  if (bonus === "granted") wallet = (await walletById(wallet.id)) ?? wallet;
  return { wallet, bonus };
}

export type ResolvedWallet = { wallet: WalletRow; userId: string | null; bonus?: BonusStatus };

/**
 * Wallet that pays a new room's AI: only a signed-in account. Guests can create rooms and play every
 * mode, but their rooms run without AI until the creator signs in (see `linkRoomToAccount`).
 */
export async function ensureHostWallet(cred: CreditCredentials): Promise<ResolvedWallet | null> {
  const userId = await userIdFromToken(cred.accessToken);
  if (!userId) return null;
  const { wallet, bonus } = await accountWallet(userId);
  return { wallet, userId, bonus };
}

/**
 * The caller's wallet, never creating a guest wallet. Signed-in callers get their account wallet
 * (with the one-time bonus check); a legacy guest token only reads its preserved balance.
 */
export async function findWallet(cred: CreditCredentials): Promise<ResolvedWallet | null> {
  const userId = await userIdFromToken(cred.accessToken);
  if (userId) {
    const { wallet, bonus } = await accountWallet(userId);
    return { wallet, userId, bonus };
  }
  if (cred.guestToken && GUEST_TOKEN.test(cred.guestToken)) {
    const { data } = await db().from("credit_wallets").select(WALLET_COLUMNS).eq("guest_token_hash", hashGuestToken(cred.guestToken)).maybeSingle();
    const wallet = await resolveMerged((data as WalletRow | null) ?? null);
    if (wallet && !wallet.user_id) return { wallet, userId: null };
  }
  return null;
}

export async function summarize(wallet: WalletRow, userId: string | null, bonus?: BonusStatus): Promise<WalletSummary> {
  const { count } = await db().from("payment_transactions").select("id", { count: "exact", head: true }).eq("wallet_id", wallet.id).eq("status", "confirmed");
  return {
    balance: wallet.balance,
    freeGranted: wallet.free_granted,
    purchasedTotal: wallet.purchased_total,
    consumedTotal: wallet.consumed_total,
    packsBought: count ?? 0,
    kind: userId ? "account" : "guest",
    bonus: userId ? bonus ?? null : null,
  };
}

export async function walletHistory(walletId: string) {
  const [{ data: ledger }, { data: payments }] = await Promise.all([
    db().from("credit_ledger").select("id, delta, kind, note, balance_after, created_at").eq("wallet_id", walletId).order("created_at", { ascending: false }).limit(40),
    db().from("payment_transactions").select("id, status, credits, price_label, created_at, confirmed_at, test_purchase").eq("wallet_id", walletId).neq("status", "initiated").order("created_at", { ascending: false }).limit(30),
  ]);
  return { ledger: ledger ?? [], payments: payments ?? [] };
}

/* ------------------------------ Room billing ------------------------------ */

export async function bindRoomWallet(roomId: string, walletId: string) {
  await db().from("party_room_billing").upsert({ room_id: roomId, wallet_id: walletId }, { onConflict: "room_id", ignoreDuplicates: true });
}

/** The account wallet paying this room's AI, or null (no binding, or a legacy guest wallet). */
async function roomWallet(roomId: string): Promise<WalletRow | null> {
  const { data } = await db().from("party_room_billing").select("wallet_id").eq("room_id", roomId).maybeSingle();
  if (!data) return null;
  const wallet = await resolveMerged(await walletById(data.wallet_id));
  return walletMayPayAi(wallet) ? wallet : null;
}

export async function roomBalance(roomId: string) {
  const wallet = await roomWallet(roomId);
  return wallet ? { billed: true as const, balance: wallet.balance } : { billed: false as const, balance: 0 };
}

/**
 * The host signed in after creating the room as a guest: their account starts paying this room's AI.
 * Never takes over a room already paid by another account.
 */
export async function linkRoomToAccount(roomId: string, userId: string) {
  const { wallet } = await accountWallet(userId);
  const { data: current } = await db().from("party_room_billing").select("wallet_id").eq("room_id", roomId).maybeSingle();
  if (!current) {
    await bindRoomWallet(roomId, wallet.id);
  } else if (current.wallet_id !== wallet.id) {
    const bound = await resolveMerged(await walletById(current.wallet_id));
    // Only a legacy guest wallet (which can no longer pay) is replaced.
    if (!walletMayPayAi(bound)) await db().from("party_room_billing").update({ wallet_id: wallet.id }).eq("room_id", roomId).eq("wallet_id", current.wallet_id);
  }
  return roomBalance(roomId);
}

export type AiCharge = { status: "charged" | "duplicate" | "insufficient" | "unbilled"; walletId: string | null };

/** Consumes one AI request from the room creator's account wallet; the same usage key is never charged twice. */
export async function chargeRoomAi(roomId: string, usageKey: string, label: string): Promise<AiCharge> {
  const wallet = await roomWallet(roomId);
  if (!wallet) return { status: "unbilled", walletId: null };
  const { data, error } = await db().rpc("credit_consume", { p_wallet: wallet.id, p_key: usageKey, p_room: roomId, p_label: label });
  if (error) {
    console.error("chargeRoomAi failed", error.code);
    // Never spend the owner's AI key without a recorded charge.
    return { status: "insufficient", walletId: wallet.id };
  }
  const status = data === "charged" || data === "duplicate" ? data : "insufficient";
  return { status, walletId: wallet.id };
}

export async function refundRoomAi(walletId: string, usageKey: string) {
  await db().rpc("credit_refund", { p_wallet: walletId, p_key: usageKey });
}

/* ------------------------------ Accounts ------------------------------ */

/** Moves a guest wallet into the signed-in account (once; credit_merge is atomic and idempotent). */
export async function claimGuest(userId: string, guestToken: string) {
  if (!GUEST_TOKEN.test(guestToken)) return { status: "skipped" as const, moved: 0 };
  const { data: guest } = await db().from("credit_wallets").select(WALLET_COLUMNS).eq("guest_token_hash", hashGuestToken(guestToken)).maybeSingle();
  if (!guest || guest.user_id || guest.merged_into) return { status: "skipped" as const, moved: 0 };
  const { data, error } = await db().rpc("credit_merge", { p_guest: guest.id, p_user: userId });
  if (error) throw new Error("Não foi possível juntar o saldo de convidado à sua conta. Tente de novo.");
  const result = (data ?? {}) as { status?: string; moved?: number };
  return { status: (result.status ?? "skipped") as "adopted" | "merged" | "skipped", moved: Number(result.moved ?? 0) };
}

export async function isAdmin(userId: string | null) {
  if (!userId) return false;
  const { data } = await db().from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return Boolean(data);
}
