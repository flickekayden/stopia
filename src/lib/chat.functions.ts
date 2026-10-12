import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const quoteSchema = z.object({
  roundId: z.string().uuid(),
  category: z.string().min(1).max(80),
  playerId: z.string().uuid(),
  playerName: z.string().min(1).max(20),
  response: z.string().max(120),
  points: z.number().int().min(0).max(20),
  comment: z.string().max(500),
});

const identitySchema = z.object({ roomId: z.string().uuid(), playerId: z.string().uuid() });
const QUICK_MESSAGES = ["❌ Discordo", "😂 KKKK", "⏳ Corre!", "👏 Boa"] as const;

async function validatePlayer(roomId: string, playerId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: player } = await supabaseAdmin
    .from("players")
    .select("id, nickname, room_id")
    .eq("id", playerId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (!player) throw new Error("Jogador não pertence a esta sala");
  return { player, supabaseAdmin };
}

export const listChatMessages = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => identitySchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await validatePlayer(data.roomId, data.playerId);
    const { data: messages, error } = await supabaseAdmin
      .from("chat_messages")
      .select("id, room_id, player_id, content, quote, created_at")
      .eq("room_id", data.roomId)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw new Error("Não foi possível carregar o chat");
    return messages ?? [];
  });

export const sendChatMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    identitySchema
      .extend({ content: z.string().max(100), quote: quoteSchema.nullable().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const content = data.content.trim();
    if (!content && !data.quote) throw new Error("Escreva uma mensagem ou escolha uma reação");

    const { player, supabaseAdmin } = await validatePlayer(data.roomId, data.playerId);
    const { data: room } = await supabaseAdmin.from("rooms").select("status").eq("id", data.roomId).maybeSingle();
    const { data: currentRound } = await supabaseAdmin
      .from("rounds")
      .select("id, status, evaluation")
      .eq("room_id", data.roomId)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (room?.status !== "lobby" && currentRound?.status === "answering") {
      if (!QUICK_MESSAGES.includes(content as (typeof QUICK_MESSAGES)[number]) || data.quote) {
        throw new Error("Durante a rodada, use apenas as mensagens rápidas");
      }
    }

    let verifiedQuote: z.infer<typeof quoteSchema> | null = null;
    if (data.quote) {
      if (!currentRound || currentRound.id !== data.quote.roundId || currentRound.status !== "results") {
        throw new Error("Essa resposta não está mais disponível para citação");
      }
      const evaluation = currentRound.evaluation as {
        resultados?: Array<{ categoria: string; jogador_id: string; resposta: string; pontos: number; comentario: string }>;
      } | null;
      const result = evaluation?.resultados?.find(
        (item) => item.categoria === data.quote?.category && item.jogador_id === data.quote?.playerId,
      );
      const { data: quotedPlayer } = await supabaseAdmin
        .from("players")
        .select("nickname")
        .eq("id", data.quote.playerId)
        .eq("room_id", data.roomId)
        .maybeSingle();
      if (!result || !quotedPlayer) throw new Error("Resposta citada inválida");
      verifiedQuote = {
        roundId: currentRound.id,
        category: result.categoria,
        playerId: result.jogador_id,
        playerName: quotedPlayer.nickname,
        response: result.resposta,
        points: result.pontos,
        comment: result.comentario,
      };
    }

    const { data: message, error } = await supabaseAdmin
      .from("chat_messages")
      .insert({ room_id: data.roomId, player_id: player.id, content, quote: verifiedQuote })
      .select("id, room_id, player_id, content, quote, created_at")
      .single();
    if (error) throw new Error("Não foi possível enviar a mensagem");
    return message;
  });

export type ChatQuote = z.infer<typeof quoteSchema>;