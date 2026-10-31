/**
 * Google Play Billing inside the Android app (Trusted Web Activity), through the Digital Goods API and
 * the Payment Request API. In a normal browser these APIs do not exist and purchases are unavailable.
 * The purchase token returned here proves nothing by itself: the server verifies it with Google.
 */
const PLAY_METHOD = "https://play.google.com/billing";

type DigitalGoodsService = {
  getDetails(ids: string[]): Promise<{ itemId: string; title: string; price: { currency: string; value: string } }[]>;
};

type WindowWithGoods = Window & { getDigitalGoodsService?: (method: string) => Promise<DigitalGoodsService> };

async function service() {
  const w = window as WindowWithGoods;
  if (typeof w.getDigitalGoodsService !== "function" || typeof window.PaymentRequest !== "function") return null;
  try {
    return await w.getDigitalGoodsService(PLAY_METHOD);
  } catch {
    return null;
  }
}

export async function playBillingAvailable() {
  if (typeof window === "undefined") return false;
  return (await service()) !== null;
}

/** Store price as shown by Google Play (authoritative on Android), e.g. "R$ 5,00". */
export async function playPrice(productId: string) {
  const goods = await service();
  if (!goods) return null;
  try {
    const [item] = await goods.getDetails([productId]);
    if (!item) return null;
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: item.price.currency }).format(Number(item.price.value));
  } catch {
    return null;
  }
}

export type PlayPurchaseOutcome = { kind: "paid"; purchaseToken: string } | { kind: "canceled" } | { kind: "failed"; message: string };

/** Opens the Google Play purchase sheet for the pack. Only call from a tap after the player confirmed. */
export async function purchaseWithPlay(productId: string): Promise<PlayPurchaseOutcome> {
  try {
    const request = new PaymentRequest([{ supportedMethods: PLAY_METHOD, data: { sku: productId } }], { total: { label: "Total", amount: { currency: "BRL", value: "0" } } });
    const response = await request.show();
    const token = (response.details as { purchaseToken?: string } | undefined)?.purchaseToken;
    await response.complete(token ? "success" : "fail");
    return token ? { kind: "paid", purchaseToken: token } : { kind: "failed", message: "A Google Play não devolveu o comprovante." };
  } catch (err) {
    if (err instanceof DOMException && (err.name === "AbortError" || err.name === "NotAllowedError")) return { kind: "canceled" };
    return { kind: "failed", message: err instanceof Error ? err.message : "Falha ao abrir a Google Play." };
  }
}
