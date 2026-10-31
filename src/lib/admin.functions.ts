import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Commercial admin tools. Every call re-checks the admin role on the server (token bound to the admin's
 * account); balance corrections go through the audited ledger with reason and operator.
 */
const token = { token: z.string().max(300).optional() };

async function requireAdmin(t?: string) {
  const uid = await (await import("./dev-session.server")).adminUserId(t);
  if (!uid) throw new Error("Acesso de administrador necessário.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { uid, db: supabaseAdmin };
}

export const adminOverview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(token).parse(input))
  .handler(async ({ data }) => {
    const { db } = await requireAdmin(data.token);
    const count = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
    const [wallets, accounts, aiUses, confirmed, pending, failed, refunded, rooms, openReports] = await Promise.all([
      count(db.from("credit_wallets").select("id", { count: "exact", head: true })),
      count(db.from("credit_wallets").select("id", { count: "exact", head: true }).not("user_id", "is", null)),
      count(db.from("ai_usage").select("wallet_id", { count: "exact", head: true }).eq("status", "charged")),
      count(db.from("payment_transactions").select("id", { count: "exact", head: true }).eq("status", "confirmed")),
      count(db.from("payment_transactions").select("id", { count: "exact", head: true }).eq("status", "pending")),
      count(db.from("payment_transactions").select("id", { count: "exact", head: true }).in("status", ["error", "declined"])),
      count(db.from("payment_transactions").select("id", { count: "exact", head: true }).eq("status", "refunded")),
      count(db.from("party_rooms").select("id", { count: "exact", head: true })),
      count(db.from("content_reports").select("id", { count: "exact", head: true }).eq("status", "aberta")),
    ]);
    const { playConfigured } = await import("./google-play.server");
    return { wallets, accounts, aiUses, confirmed, pending, failed, refunded, rooms, openReports, storeReady: playConfigured() };
  });

export const adminReconcile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(token).parse(input))
  .handler(async ({ data }) => {
    const { uid, db } = await requireAdmin(data.token);
    const report = await (await import("./payments.server")).reconcilePayments();
    await db.from("admin_audit").insert({ actor_user_id: uid, action: "reconcile_payments", detail: report });
    return report;
  });

export const adminAdjustCredits = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ ...token, email: z.string().trim().toLowerCase().email().max(200), delta: z.number().int().min(-1000).max(1000).refine((n) => n !== 0), reason: z.string().trim().min(5).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { uid, db } = await requireAdmin(data.token);
    // Look the account up by email through the auth admin API (paged, server-only).
    let target: string | null = null;
    for (let page = 1; page <= 10 && !target; page += 1) {
      const { data: list } = await db.auth.admin.listUsers({ page, perPage: 200 });
      target = list?.users.find((u) => u.email?.toLowerCase() === data.email)?.id ?? null;
      if (!list || list.users.length < 200) break;
    }
    if (!target) throw new Error("Nenhuma conta com esse e-mail.");
    const { data: wallet } = await db.from("credit_wallets").select("id, balance").eq("user_id", target).maybeSingle();
    if (!wallet) throw new Error("Essa conta ainda não abriu um saldo.");
    if (wallet.balance + data.delta < 0) throw new Error(`O saldo não pode ficar negativo (saldo atual: ${wallet.balance}).`);
    const reference = crypto.randomUUID();
    const { data: after, error } = await db.rpc("credit_apply", { p_wallet: wallet.id, p_delta: data.delta, p_kind: "admin_adjust", p_reference: reference, p_note: data.reason, p_actor: uid });
    if (error) throw new Error("Não foi possível ajustar o saldo.");
    await db.from("admin_audit").insert({ actor_user_id: uid, action: "adjust_credits", target: target, detail: { delta: data.delta, reason: data.reason, balance_after: after } });
    return { balance: Number(after) };
  });

export const adminListReports = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(token).parse(input))
  .handler(async ({ data }) => {
    const { db } = await requireAdmin(data.token);
    const { data: reports } = await db.from("content_reports").select("id, room_code, target_nickname, excerpt, reason, detail, status, created_at").order("created_at", { ascending: false }).limit(50);
    return reports ?? [];
  });

export const adminSetReportStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ ...token, id: z.string().uuid(), status: z.enum(["resolvida", "descartada"]) }).parse(input))
  .handler(async ({ data }) => {
    const { uid, db } = await requireAdmin(data.token);
    await db.from("content_reports").update({ status: data.status }).eq("id", data.id);
    await db.from("admin_audit").insert({ actor_user_id: uid, action: "report_status", target: data.id, detail: { status: data.status } });
    return { ok: true as const };
  });
