import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Credits, accounts and purchases. Every call carries the caller's own credentials (account access
 * token and/or guest token); the server verifies them and only ever returns the caller's own data.
 */
const cred = {
  accessToken: z.string().max(4096).optional(),
  guestToken: z.string().max(80).optional(),
};
const credits = () => import("./credits.server");

/** Price and pack size as configured on the server (public, no personal data). */
export const getBillingInfo = createServerFn({ method: "GET" }).handler(async () => {
  const c = await (await credits()).loadBillingConfig();
  const { formatBRL } = await import("./billing");
  const play = await import("./google-play.server");
  return { freeCredits: c.freeCredits, packCredits: c.packCredits, priceLabel: formatBRL(c.priceCents), productId: c.playProductId, storeReady: play.playConfigured() };
});

export const getMyCredits = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(cred).parse(input))
  .handler(async ({ data }) => {
    const c = await credits();
    const found = await c.findWallet(data);
    return { signedIn: Boolean(found?.userId) || Boolean(await c.userIdFromToken(data.accessToken)), summary: found ? await c.summarize(found.wallet, found.userId) : null };
  });

export const getMyAccount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(cred).parse(input))
  .handler(async ({ data }) => {
    const c = await credits();
    const found = await c.findWallet(data);
    const userId = found?.userId ?? (await c.userIdFromToken(data.accessToken));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [summary, history, profile, admin] = await Promise.all([
      found ? c.summarize(found.wallet, found.userId) : Promise.resolve(null),
      found ? c.walletHistory(found.wallet.id) : Promise.resolve({ ledger: [], payments: [] }),
      userId ? supabaseAdmin.from("profiles").select("display_name, avatar, terms_accepted_at").eq("id", userId).maybeSingle().then((r) => r.data) : Promise.resolve(null),
      c.isAdmin(userId),
    ]);
    return { signedIn: Boolean(userId), isAdmin: admin, summary, history, profile };
  });

export const claimGuestWallet = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ accessToken: z.string().min(10).max(4096), guestToken: z.string().max(80) }).parse(input))
  .handler(async ({ data }) => {
    const c = await credits();
    const userId = await c.userIdFromToken(data.accessToken);
    if (!userId) throw new Error("Entre na sua conta de novo.");
    return c.claimGuest(userId, data.guestToken);
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ accessToken: z.string().min(10).max(4096), displayName: z.string().trim().max(20).optional(), avatar: z.string().max(16).optional(), acceptTerms: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const c = await credits();
    const userId = await c.userIdFromToken(data.accessToken);
    if (!userId) throw new Error("Entre na sua conta de novo.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: { display_name?: string; avatar?: string; terms_accepted_at?: string; updated_at: string } = { updated_at: new Date().toISOString() };
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.avatar !== undefined) patch.avatar = data.avatar;
    if (data.acceptTerms) patch.terms_accepted_at = new Date().toISOString();
    const { error } = await supabaseAdmin.from("profiles").upsert({ id: userId, ...patch }, { onConflict: "id" });
    if (error) throw new Error("Não foi possível salvar o perfil.");
    return { ok: true as const };
  });

/** Deletes the account. Financial history stays (anonymised wallet) as required for purchase records. */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ accessToken: z.string().min(10).max(4096), confirm: z.literal("EXCLUIR") }).parse(input))
  .handler(async ({ data }) => {
    const c = await credits();
    const userId = await c.userIdFromToken(data.accessToken);
    if (!userId) throw new Error("Entre na sua conta de novo.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("credit_wallets").update({ user_id: null, guest_token_hash: null, updated_at: new Date().toISOString() }).eq("user_id", userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error("Não foi possível excluir a conta. Tente de novo ou fale com o suporte.");
    return { ok: true as const };
  });

/* ------------------------------ Purchases ------------------------------ */

const payments = () => import("./payments.server");

export const startPackPurchase = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(cred).parse(input))
  .handler(async ({ data }) => (await payments()).startPurchase(data));

export const verifyPackPurchase = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ ...cred, transactionId: z.string().uuid(), purchaseToken: z.string().min(10).max(2000) }).parse(input))
  .handler(async ({ data }) => (await payments()).verifyPurchase(data, data.transactionId, data.purchaseToken));

export const cancelPackPurchase = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ ...cred, transactionId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => (await payments()).cancelPurchase(data, data.transactionId));
