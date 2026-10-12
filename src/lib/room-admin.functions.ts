import { createHash, timingSafeEqual } from "node:crypto";

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function passwordMatches(input: string, expected: string) {
  const inputHash = createHash("sha256").update(input, "utf8").digest();
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(inputHash, expectedHash);
}

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
    developerUnlocked: await (await import("./dev-session.server")).developerIsUnlocked(),
  };
});

export const unlockDeveloper = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ password: z.string().min(1).max(100) }).parse(input))
  .handler(async ({ data }) => {
    const expected = process.env["DEVELOPER_PASSWORD"];
    if (!expected) throw new Error("A senha de desenvolvedor não está configurada");
    if (!passwordMatches(data.password, expected)) return { ok: false as const };

    const session = await (await import("./dev-session.server")).getDeveloperSession();
    await session.update({ unlocked: true });
    return { ok: true as const, token: (await import("./dev-session.server")).createDevToken() };
  });

export const deleteRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ roomId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    if (!(await (await import("./dev-session.server")).developerIsUnlocked())) throw new Error("Acesso de desenvolvedor necessário");

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
  .inputValidator((input: unknown) =>
    z.object({ presetId: z.string().uuid(), password: z.string().max(100).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    let unlocked = await (await import("./dev-session.server")).developerIsUnlocked();
    if (!unlocked && data.password) {
      const expected = process.env["DEVELOPER_PASSWORD"];
      if (expected && passwordMatches(data.password, expected)) {
        const session = await (await import("./dev-session.server")).getDeveloperSession();
        await session.update({ unlocked: true });
        unlocked = true;
      }
    }
    if (!unlocked) return { ok: false as const, needsPassword: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("category_presets").delete().eq("id", data.presetId);
    if (error) throw new Error("Não foi possível apagar a lista");
    return { ok: true as const, needsPassword: false };
  });

export const getDeveloperStatus = createServerFn({ method: "GET" }).handler(async () => ({
  unlocked: await (await import("./dev-session.server")).developerIsUnlocked(),
}));

export const updateCategoryPreset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        presetId: z.string().uuid(),
        categories: z.array(z.string().trim().min(1).max(60)).min(1).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!(await (await import("./dev-session.server")).developerIsUnlocked())) throw new Error("Acesso de desenvolvedor necessário");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("category_presets")
      .update({ categories: data.categories })
      .eq("id", data.presetId);
    if (error) throw new Error("Não foi possível salvar a lista");
    return { ok: true as const };
  });
