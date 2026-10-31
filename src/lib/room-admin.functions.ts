import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const devToken = z.string().max(300).optional();
const adminId = async (token?: string) => (await import("./dev-session.server")).adminUserId(token);

export const listRooms = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("rooms")
    .select("id, code, status, current_round, total_rounds, created_at, players(count)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw new Error("Não foi possível carregar as salas");
  return {
    rooms: (data ?? []).map((room) => ({
      id: room.id,
      code: room.code,
      status: room.status,
      currentRound: room.current_round,
      totalRounds: room.total_rounds,
      createdAt: room.created_at,
      playerCount: room.players[0]?.count ?? 0,
    })),
    developerUnlocked: await (await import("./dev-session.server")).developerIsUnlocked().catch(() => false),
  };
});

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

export const deleteRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ roomId: z.string().uuid(), token: devToken }).parse(input))
  .handler(async ({ data }) => {
    if (!(await adminId(data.token))) throw new Error("Acesso de administrador necessário");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rounds, error: roundsReadError } = await supabaseAdmin
      .from("rounds")
      .select("id")
      .eq("room_id", data.roomId);
    if (roundsReadError) throw new Error("Não foi possível localizar os dados da sala");

    const roundIds = (rounds ?? []).map((round) => round.id);
    if (roundIds.length > 0) {
      const { error } = await supabaseAdmin.from("answers").delete().in("round_id", roundIds);
      if (error) throw new Error("Não foi possível apagar as respostas da sala");
    }

    const { error: chatError } = await supabaseAdmin.from("chat_messages").delete().eq("room_id", data.roomId);
    if (chatError) throw new Error("Não foi possível apagar o chat da sala");

    const { error: roundsError } = await supabaseAdmin.from("rounds").delete().eq("room_id", data.roomId);
    if (roundsError) throw new Error("Não foi possível apagar as rodadas da sala");

    const { error: playersError } = await supabaseAdmin.from("players").delete().eq("room_id", data.roomId);
    if (playersError) throw new Error("Não foi possível apagar os jogadores da sala");

    const { error: roomError } = await supabaseAdmin.from("rooms").delete().eq("id", data.roomId);
    if (roomError) throw new Error("Não foi possível apagar a sala");
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
        categories: z.array(z.string().trim().min(1).max(160)).min(1).max(100),
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
