import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const devToken = z.string().max(300).optional();
const adminId = async (token?: string) => (await import("./dev-session.server")).adminUserId(token);

/**
 * Developer mode without a shared password: the caller signs in with an account that holds the
 * "admin" role (checked on the server) and receives a short-lived token bound to that account.
 */
export const unlockDeveloper = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ accessToken: z.string().min(10).max(4096) }).parse(input))
  .handler(async ({ data }) => {
    const credits = await import("./credits.server");
    const userId = await credits.userIdFromToken(data.accessToken);
    if (!userId) return { ok: false as const, reason: "signed_out" as const };
    if (!(await credits.isAdmin(userId))) return { ok: false as const, reason: "not_admin" as const };
    const dev = await import("./dev-session.server");
    try {
      const session = await dev.getDeveloperSession();
      await session.update({ unlocked: true, uid: userId });
    } catch { /* cookies are optional; the token is enough */ }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_audit").insert({ actor_user_id: userId, action: "developer_unlock" });
    return { ok: true as const, token: dev.createDevToken(userId) };
  });

const presetCategories = z.array(z.string().trim().min(1).max(160)).min(1).max(100);

/** Saves a shared category list. Writes go only through here (validated, limited per network). */
export const saveCategoryPreset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ name: z.string().trim().min(1).max(40), categories: presetCategories, sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { consumeRateLimit } = await import("./party.server");
    if (!(await consumeRateLimit(data.sessionId, "preset_save"))) return { ok: false as const, reason: "limit" as const };
    const categories = [...new Map(data.categories.map((c) => [c.toLowerCase(), c] as const)).values()];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("category_presets").insert({ name: data.name, categories });
    if (error) return { ok: false as const, reason: error.code === "23505" ? ("duplicate" as const) : ("error" as const) };
    return { ok: true as const };
  });

export const deleteCategoryPreset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ presetId: z.string().uuid(), token: devToken }).parse(input))
  .handler(async ({ data }) => {
    if (!(await adminId(data.token))) return { ok: false as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("category_presets").delete().eq("id", data.presetId);
    if (error) throw new Error("Não foi possível apagar a lista");
    return { ok: true as const };
  });

export const getDeveloperStatus = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: devToken }).parse(input ?? {}))
  .handler(async ({ data }) => ({ unlocked: (await adminId(data.token)) !== null }));

export const updateCategoryPreset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        presetId: z.string().uuid(),
        categories: presetCategories,
        token: devToken,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await adminId(data.token))) throw new Error("Acesso de administrador necessário");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("category_presets")
      .update({ categories: data.categories })
      .eq("id", data.presetId);
    if (error) throw new Error("Não foi possível salvar a lista");
    return { ok: true as const };
  });
