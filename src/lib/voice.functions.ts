import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { z } from "zod";

const identity = z.object({ roomId: z.string().uuid(), playerId: z.string().uuid(), sessionId: z.string().uuid(), roundId: z.string().uuid() });

async function verifyVoicePlayer(data: z.infer<typeof identity>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const hex = createHash("sha256").update(data.sessionId).digest("hex").slice(0, 32);
  const hash = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const { data: player } = await supabaseAdmin.from("players").select("id,nickname").eq("id", data.playerId).eq("room_id", data.roomId).eq("session_id", hash).maybeSingle();
  if (!player) throw new Error("Sua sessão na sala expirou");
  const [{ data: round }, { data: room }] = await Promise.all([
    supabaseAdmin.from("rounds").select("id,status,number").eq("id", data.roundId).eq("room_id", data.roomId).maybeSingle(),
    supabaseAdmin.from("rooms").select("status,current_round").eq("id", data.roomId).maybeSingle(),
  ]);
  if (!round || round.status !== "results" || !room || room.status !== "playing" || room.current_round !== round.number) throw new Error("Reações de voz estão disponíveis apenas nos resultados da rodada atual");
  return { player, db: supabaseAdmin };
}

export const sendVoiceNote = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("Gravação inválida");
    const data = identity.extend({ durationMs: z.coerce.number().int().min(1).max(7000) }).parse(Object.fromEntries(input));
    const audio = input.get("audio");
    if (!(audio instanceof Blob) || !audio.size || audio.size > 500 * 1024) throw new Error("O áudio está vazio ou grande demais");
    const mime = audio.type.split(";")[0] ?? "";
    if (!["audio/webm", "audio/mp4", "audio/aac", "audio/ogg"].includes(mime)) throw new Error("Formato de áudio não suportado");
    return { ...data, audio, mime };
  })
  .handler(async ({ data }) => {
    const { player, db } = await verifyVoicePlayer(data);
    const { data: recent } = await db.from("room_voice_notes").select("id").eq("player_id", player.id).gt("created_at", new Date(Date.now() - 1500).toISOString()).limit(1);
    if (recent?.length) throw new Error("Espere um instante antes da próxima reação");
    const extension = ({ "audio/webm": "webm", "audio/mp4": "m4a", "audio/aac": "aac", "audio/ogg": "ogg" } as Record<string, string>)[data.mime];
    const path = `${data.roomId}/${data.roundId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await db.storage.from("voice-notes").upload(path, await data.audio.arrayBuffer(), { contentType: data.mime, upsert: false });
    if (uploadError) throw new Error("Não consegui enviar o áudio. Tente novamente");
    const { data: note, error } = await db.from("room_voice_notes").insert({ room_id: data.roomId, player_id: player.id, round_id: data.roundId, nickname: player.nickname, storage_path: path, duration_ms: data.durationMs }).select("id").single();
    if (error || !note) {
      await db.storage.from("voice-notes").remove([path]);
      throw new Error("Não consegui compartilhar sua reação");
    }
    return { id: note.id };
  });

export const getVoicePlayback = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => identity.extend({ noteId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await verifyVoicePlayer(data);
    const { data: note } = await db.from("room_voice_notes").select("id,nickname,storage_path,duration_ms").eq("id", data.noteId).eq("room_id", data.roomId).eq("round_id", data.roundId).maybeSingle();
    if (!note) throw new Error("Reação indisponível");
    const { data: signed, error } = await db.storage.from("voice-notes").createSignedUrl(note.storage_path, 120);
    if (error || !signed) throw new Error("Não consegui abrir essa reação");
    // Keep URLs on the browser-facing origin, including isolated preview stacks.
    const signedUrl = new URL(signed.signedUrl);
    const browserBase = import.meta.env['VITE_SUPABASE_URL'];
    const audioUrl = browserBase ? `${browserBase.replace(/\/$/, "")}${signedUrl.pathname}${signedUrl.search}` : signed.signedUrl;
    return { id: note.id, nickname: note.nickname, audioUrl, duration: note.duration_ms };
  });