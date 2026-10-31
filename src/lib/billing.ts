/**
 * Browser-safe rules for AI credits ("solicitações de IA"). One credit = one request to the AI service
 * made while a room plays. Only the room creator's wallet pays; players who join never spend anything.
 * Amounts are configurable on the server (app_settings "billing"); these are the defaults.
 */
import { effectiveJudgeFor, type PartyGameId, type PartySettings } from "./party-games";

export type BillingConfig = {
  freeCredits: number;
  packCredits: number;
  priceCents: number;
  currency: "BRL";
  playProductId: string;
  androidPackage: string;
};

export const DEFAULT_BILLING: BillingConfig = {
  freeCredits: 20,
  packCredits: 20,
  priceCents: 500,
  currency: "BRL",
  playProductId: "stopia_ia_20",
  androidPackage: "app.stopia.twa",
};

/** Balances at or below this show the friendly "acabando" warning. */
export const LOW_BALANCE = 3;

function positiveInt(value: unknown, fallback: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= max ? n : fallback;
}

function idLike(value: unknown, fallback: string) {
  return typeof value === "string" && /^[a-z][a-z0-9_.]{2,99}$/.test(value) ? value : fallback;
}

export function readBillingConfig(raw: unknown): BillingConfig {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<BillingConfig>;
  return {
    freeCredits: positiveInt(value.freeCredits, DEFAULT_BILLING.freeCredits, 1000),
    packCredits: positiveInt(value.packCredits, DEFAULT_BILLING.packCredits, 1000),
    priceCents: positiveInt(value.priceCents, DEFAULT_BILLING.priceCents, 100_000),
    currency: "BRL",
    playProductId: idLike(value.playProductId, DEFAULT_BILLING.playProductId),
    androidPackage: idLike(value.androidPackage, DEFAULT_BILLING.androidPackage),
  };
}

export function formatBRL(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export type BalanceTone = "ok" | "low" | "empty";

export function balanceTone(balance: number): BalanceTone {
  if (balance <= 0) return "empty";
  return balance <= LOW_BALANCE ? "low" : "ok";
}

export function requestsLabel(n: number) {
  return `${n} ${n === 1 ? "solicitação" : "solicitações"}`;
}

/**
 * Credits a guest wallet can move into an account that already has its own wallet. Free credits are
 * spent first, so whatever is left up to the amount bought is paid credit; unused free credits stay behind.
 */
export function transferableCredits(balance: number, purchasedTotal: number) {
  return Math.max(0, Math.min(balance, purchasedTotal));
}

/**
 * Most AI requests a match can use with these rules (shown to the host before starting). Each item is
 * one request: generated content per round, the AI judge or the AI comment after a group vote, and the
 * final awards (Debate/Tribunal). Infiltrado uses none; Stop uses one judge request per round.
 */
export function aiRequestEstimate(game: PartyGameId | "stop", settings: PartySettings, players: number) {
  const rounds = settings.rounds;
  if (game === "stop") return rounds;
  if (game === "infiltrado") return 0;
  const content = settings.ai ? 1 : 0;
  if (game === "autor") return rounds * (content + (settings.ai ? 1 : 0));
  const judgeIsAi = effectiveJudgeFor(game, settings, players) === "ia";
  if (game === "roleta") return rounds * (content + (judgeIsAi ? 1 : 0));
  // Tribunal and Debate: the AI judge, or an AI comment after the group vote; plus the final awards.
  const perRound = content + (judgeIsAi ? 1 : settings.ai ? 1 : 0);
  return rounds * perRound + (settings.ai ? 1 : 0);
}

/** Stop cannot be judged without the AI, so a Stop match needs at least one credit to start. */
export function canStartWithBalance(game: PartyGameId | "stop", balance: number) {
  return game !== "stop" || balance >= 1;
}

/* ------------------------------ Google Play ------------------------------ */

export type PlayPurchaseResource = {
  purchaseState?: number;
  consumptionState?: number;
  orderId?: string;
  purchaseType?: number;
  productId?: string;
  acknowledgementState?: number;
};

export type PlayVerdict =
  | { status: "confirmed"; orderId: string; test: boolean; alreadyConsumed: boolean }
  | { status: "pending" }
  | { status: "canceled" }
  | { status: "invalid"; reason: string };

/** Maps Google's purchases.products resource to what the app does with it. */
export function classifyPlayPurchase(resource: PlayPurchaseResource | null, expectedProductId: string): PlayVerdict {
  if (!resource || typeof resource !== "object") return { status: "invalid", reason: "Resposta vazia da loja" };
  if (resource.productId && resource.productId !== expectedProductId) return { status: "invalid", reason: "Produto diferente do pacote" };
  if (resource.purchaseState === 1) return { status: "canceled" };
  if (resource.purchaseState === 2) return { status: "pending" };
  if (resource.purchaseState !== 0) return { status: "invalid", reason: "Estado de compra desconhecido" };
  const orderId = typeof resource.orderId === "string" && resource.orderId ? resource.orderId : "";
  if (!orderId) return { status: "invalid", reason: "Compra sem número de pedido" };
  return { status: "confirmed", orderId, test: resource.purchaseType === 0, alreadyConsumed: resource.consumptionState === 1 };
}

/** Credits to remove when a confirmed purchase is refunded: never more than what is left. */
export function reversalAmount(credits: number, balance: number) {
  return Math.max(0, Math.min(credits, balance));
}

export type LedgerKind = "free_grant" | "purchase" | "ai_use" | "ai_refund" | "admin_adjust" | "reversal" | "transfer_in" | "transfer_out";

export const LEDGER_LABELS: Record<LedgerKind, string> = {
  free_grant: "Solicitações grátis",
  purchase: "Pacote comprado",
  ai_use: "Uso da IA",
  ai_refund: "Devolvida (a IA não respondeu)",
  admin_adjust: "Ajuste do suporte",
  reversal: "Compra estornada",
  transfer_in: "Recebido do convidado",
  transfer_out: "Transferido para a conta",
};

export type PaymentStatus = "initiated" | "pending" | "confirmed" | "canceled" | "declined" | "refunded" | "error";

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  initiated: "Não concluído",
  pending: "Pagamento pendente",
  confirmed: "Pagamento confirmado",
  canceled: "Pagamento cancelado",
  declined: "Pagamento recusado",
  refunded: "Pagamento estornado",
  error: "Erro na confirmação",
};

/* ------------------------------ Shared shapes ------------------------------ */

export type WalletSummary = {
  balance: number;
  freeGranted: number;
  purchasedTotal: number;
  consumedTotal: number;
  packsBought: number;
  kind: "guest" | "account";
};

export type CreditCredentials = { accessToken?: string | undefined; guestToken?: string | undefined };
