/**
 * Pack purchases (server only). Flow: startPurchase records an "initiated" transaction; the Android app
 * pays through Google Play; verifyPurchase asks Google about the purchase token, and only a purchase that
 * Google reports as paid grants credits — exactly once, keyed by the store order id.
 */
import { createHash } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classifyPlayPurchase, formatBRL, reversalAmount, type CreditCredentials } from "./billing";
import { findWallet, loadBillingConfig } from "./credits.server";

const db = () => supabaseAdmin;

function tokenHash(token: string) {
  return createHash("sha256").update(`play:${token}`).digest("hex");
}

async function play() {
  return import("./google-play.server");
}

export async function startPurchase(cred: CreditCredentials) {
  const config = await loadBillingConfig();
  // Credits are only usable by accounts, so buying needs a signed-in account (never a guest wallet).
  const resolved = await findWallet(cred);
  if (!resolved?.userId) throw new Error("Entre na sua conta para comprar créditos de IA.");
  const { data, error } = await db()
    .from("payment_transactions")
    .insert({ wallet_id: resolved.wallet.id, platform: "google_play", product_id: config.playProductId, credits: config.packCredits, price_label: formatBRL(config.priceCents) })
    .select("id")
    .single();
  if (error || !data) throw new Error("Não foi possível iniciar a compra. Nada foi cobrado.");
  return { transactionId: data.id, productId: config.playProductId, credits: config.packCredits, newGuestToken: null };
}

async function ownTransaction(cred: CreditCredentials, transactionId: string) {
  const resolved = await findWallet(cred);
  if (!resolved) throw new Error("Não encontramos seu saldo neste aparelho.");
  const { data: tx } = await db().from("payment_transactions").select("*").eq("id", transactionId).eq("wallet_id", resolved.wallet.id).maybeSingle();
  if (!tx) throw new Error("Compra não encontrada.");
  return { tx, wallet: resolved.wallet };
}

export async function cancelPurchase(cred: CreditCredentials, transactionId: string) {
  const { tx } = await ownTransaction(cred, transactionId);
  if (tx.status === "initiated") await db().from("payment_transactions").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("id", tx.id).eq("status", "initiated");
  return { ok: true as const };
}

type TxRow = { id: string; wallet_id: string; product_id: string; credits: number; status: string; purchase_token: string | null; store_consumed: boolean };

/** Asks Google about the purchase and settles the transaction. Safe to repeat any number of times. */
async function settle(tx: TxRow, purchaseToken: string) {
  const config = await loadBillingConfig();
  const google = await play();
  const resource = await google.getProductPurchase(config.androidPackage, tx.product_id, purchaseToken);
  const verdict = classifyPlayPurchase(resource, tx.product_id);
  const now = new Date().toISOString();
  if (verdict.status === "invalid") {
    await db().from("payment_transactions").update({ status: "declined", error: verdict.reason, updated_at: now }).eq("id", tx.id).neq("status", "confirmed");
    return { status: "declined" as const, message: "A loja não confirmou este pagamento. Nada foi liberado." };
  }
  if (verdict.status === "pending") {
    await db().from("payment_transactions").update({ status: "pending", updated_at: now }).eq("id", tx.id).neq("status", "confirmed");
    return { status: "pending" as const, message: "Pagamento pendente. Assim que a Google Play confirmar, as solicitações entram no seu saldo." };
  }
  if (verdict.status === "canceled") {
    await db().from("payment_transactions").update({ status: "canceled", updated_at: now }).eq("id", tx.id).neq("status", "confirmed");
    return { status: "canceled" as const, message: "Pagamento cancelado. Nada foi cobrado." };
  }
  // Paid: the order id may grant credits only once, whatever transaction row the client used.
  const { data: sameOrder } = await db().from("payment_transactions").select("id").eq("order_id", verdict.orderId).neq("id", tx.id).maybeSingle();
  if (sameOrder) return { status: "duplicate" as const, message: "Este pagamento já foi usado." };
  const { error: markError } = await db()
    .from("payment_transactions")
    .update({ status: "confirmed", order_id: verdict.orderId, confirmed_at: now, updated_at: now, test_purchase: verdict.test, error: null })
    .eq("id", tx.id);
  if (markError) return { status: "duplicate" as const, message: "Este pagamento já foi usado." };
  await db().rpc("credit_apply", { p_wallet: tx.wallet_id, p_delta: tx.credits, p_kind: "purchase", p_reference: `play:${verdict.orderId}`, p_note: verdict.test ? "Compra de teste" : "Pacote Google Play", p_actor: null as unknown as string });
  // Lets the player buy the pack again; a failure here is retried by reconciliation.
  const consumed = verdict.alreadyConsumed || (await google.consumeProductPurchase(config.androidPackage, tx.product_id, purchaseToken).catch(() => false));
  await db().from("payment_transactions").update({ store_consumed: consumed }).eq("id", tx.id);
  return { status: "confirmed" as const, message: `Pagamento confirmado: +${tx.credits} solicitações de IA.` };
}

export async function verifyPurchase(cred: CreditCredentials, transactionId: string, purchaseToken: string) {
  const { tx } = await ownTransaction(cred, transactionId);
  if (tx.status === "confirmed") return { status: "confirmed" as const, message: "Pagamento já confirmado." };
  const hash = tokenHash(purchaseToken);
  const { data: reused } = await db().from("payment_transactions").select("id, status").eq("purchase_token_hash", hash).neq("id", tx.id).maybeSingle();
  if (reused) return { status: "duplicate" as const, message: "Este comprovante já foi usado." };
  const { error } = await db().from("payment_transactions").update({ purchase_token_hash: hash, purchase_token: purchaseToken, updated_at: new Date().toISOString() }).eq("id", tx.id);
  if (error) return { status: "duplicate" as const, message: "Este comprovante já foi usado." };
  try {
    return await settle(tx as TxRow, purchaseToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao confirmar.";
    await db().from("payment_transactions").update({ status: "error", error: message.slice(0, 300), updated_at: new Date().toISOString() }).eq("id", tx.id).neq("status", "confirmed");
    return { status: "error" as const, message: `${message} Seu pagamento não se perde: tente "Verificar de novo" ou fale com o suporte.` };
  }
}

/** Admin reconciliation: re-checks pending/failed purchases, retries store consumption, applies refunds. */
export async function reconcilePayments() {
  const config = await loadBillingConfig();
  const google = await play();
  const report = { rechecked: 0, confirmed: 0, consumed: 0, refunded: 0, errors: [] as string[] };
  const { data: open } = await db().from("payment_transactions").select("id, wallet_id, product_id, credits, status, purchase_token, store_consumed").in("status", ["pending", "error"]).not("purchase_token", "is", null).limit(50);
  for (const tx of (open ?? []) as TxRow[]) {
    report.rechecked += 1;
    try {
      const result = await settle(tx, tx.purchase_token!);
      if (result.status === "confirmed") report.confirmed += 1;
    } catch (err) {
      report.errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  const { data: unconsumed } = await db().from("payment_transactions").select("id, product_id, purchase_token").eq("status", "confirmed").eq("store_consumed", false).not("purchase_token", "is", null).limit(50);
  for (const tx of unconsumed ?? []) {
    if (await google.consumeProductPurchase(config.androidPackage, tx.product_id, tx.purchase_token!).catch(() => false)) {
      await db().from("payment_transactions").update({ store_consumed: true }).eq("id", tx.id);
      report.consumed += 1;
    }
  }
  const voided = await google.listVoidedPurchases(config.androidPackage).catch((err) => {
    report.errors.push(err instanceof Error ? err.message : String(err));
    return [];
  });
  for (const item of voided) {
    if (!item.orderId) continue;
    const { data: tx } = await db().from("payment_transactions").select("id, wallet_id, credits, status").eq("order_id", item.orderId).eq("status", "confirmed").maybeSingle();
    if (!tx) continue;
    const { data: wallet } = await db().from("credit_wallets").select("balance").eq("id", tx.wallet_id).single();
    const amount = reversalAmount(tx.credits, wallet?.balance ?? 0);
    // History is kept: the transaction becomes "refunded" and the ledger records the reversal.
    await db().from("payment_transactions").update({ status: "refunded", updated_at: new Date().toISOString() }).eq("id", tx.id);
    if (amount > 0) await db().rpc("credit_apply", { p_wallet: tx.wallet_id, p_delta: -amount, p_kind: "reversal", p_reference: `void:${item.orderId}`, p_note: "Estorno na Google Play", p_actor: null as unknown as string });
    report.refunded += 1;
  }
  return report;
}
