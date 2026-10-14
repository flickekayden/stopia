import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { z } from "zod";
import { RESULTS_VIEW_MS, RESULTS_FORCE_MS, isResultsPlayerActive, resultsDeadline } from "./results-pacing";
import { ROUND_COUNTDOWN_MS, roundStartsAt } from "./round-pacing";

import {
  DEFAULT_CATEGORIES,
  MAX_CATEGORIES_PER_ROUND,
  generateRoomCode,
  pickCategories,
  pickLetter,
  type Evaluation,
  type FinalAnalysis,
} from "./game";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function hashSessionId(sessionId: string) {
  const hex = createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function requirePlayerSession(roomId: string, playerId: string, sessionId: string) {
  const supabase = await db();
  const { data: player, error } = await supabase.from("players").select("id, nickname").eq("room_id", roomId).eq("id", playerId).eq("session_id", hashSessionId(sessionId)).maybeSingle();
  if (error || !player) throw new Error("Sessão inválida. Entre novamente na sala.");
  return player;
}

export const createRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ nickname: z.string().min(1).max(20), sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = await db();
    let code = generateRoomCode();
    for (let i = 0; i < 6; i++) {
      const { data: existing } = await supabase.from("rooms").select("id").eq("code", code).maybeSingle();
      if (!existing) break;
      code = generateRoomCode();
    }

    const { data: room, error } = await supabase
      .from("rooms")
      .insert({ code, categories: DEFAULT_CATEGORIES })
      .select()
      .single();
    if (error || !room) throw new Error(error?.message ?? "Não foi possível criar a sala");

    const { data: player, error: playerError } = await supabase
      .from("players")
      .insert({
        room_id: room.id,
        nickname: data.nickname.trim(),
        is_host: true,
        session_id: hashSessionId(data.sessionId),
        is_online: true,
        last_seen: new Date().toISOString(),
      })
      .select()
      .single();
    if (playerError || !player) throw new Error(playerError?.message ?? "Erro ao entrar na sala");

    await supabase.from("rooms").update({ host_player_id: player.id }).eq("id", room.id);

    return { roomId: room.id, code: room.code, playerId: player.id };
  });

export const joinRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string().min(1).optional(),
        roomId: z.string().uuid().optional(),
        nickname: z.string().min(1).max(20),
        sessionId: z.string().uuid(),
      })
      .refine((value) => value.code || value.roomId, "Informe a sala")
      .parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = await db();
    const roomQuery = supabase.from("rooms").select("*");
    const { data: room } = data.roomId
      ? await roomQuery.eq("id", data.roomId).maybeSingle()
      : await roomQuery.eq("code", data.code?.trim().toUpperCase() ?? "").maybeSingle();
    if (!room) throw new Error("Sala não encontrada");
    if (room.status === "finished" || room.status === "ended") throw new Error("Essa partida já terminou");

    const nickname = data.nickname.trim();
    const sessionHash = hashSessionId(data.sessionId);
    const { data: players } = await supabase
      .from("players")
      .select("id, nickname, session_id, last_seen")
      .eq("room_id", room.id);
    const sameDevice = (players ?? []).find((player) => player.session_id === sessionHash);
    if (sameDevice) {
      const { error } = await supabase
        .from("players")
        .update({ is_online: true, last_seen: new Date().toISOString() })
        .eq("id", sameDevice.id)
        .eq("room_id", room.id);
      if (error) throw new Error("Não foi possível restaurar sua sessão");
      return { roomId: room.id, code: room.code, playerId: sameDevice.id, reconnected: true };
    }

    const sameNickname = (players ?? []).find(
      (player) => player.nickname.toLocaleLowerCase("pt-BR") === nickname.toLocaleLowerCase("pt-BR"),
    );
    if (sameNickname) {
      const legacySession = sameNickname.session_id === null;
      const reservationExpired = Date.now() - new Date(sameNickname.last_seen).getTime() > 5 * 60_000;
      if (!legacySession && !reservationExpired) throw new Error("Já existe um usuário com esse apelido");
      const { error } = await supabase
        .from("players")
        .update({ session_id: sessionHash, is_online: true, last_seen: new Date().toISOString() })
        .eq("id", sameNickname.id)
        .eq("room_id", room.id);
      if (error) throw new Error("Não foi possível restaurar sua sessão");
      return { roomId: room.id, code: room.code, playerId: sameNickname.id, reconnected: true };
    }

    const { data: player, error } = await supabase
      .from("players")
      .insert({
        room_id: room.id,
        nickname,
        session_id: sessionHash,
        is_online: true,
        last_seen: new Date().toISOString(),
      })
      .select()
      .single();
    if (error || !player) throw new Error(error?.message ?? "Erro ao entrar na sala");

    return { roomId: room.id, code: room.code, playerId: player.id, reconnected: false };
  });

export const heartbeatPlayer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ roomId: z.string().uuid(), playerId: z.string().uuid(), sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = await db();
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 20_000).toISOString();

    await supabase
      .from("players")
      .update({ is_online: false })
      .eq("room_id", data.roomId)
      .eq("is_online", true)
      .lt("last_seen", staleBefore);

    const { data: player, error } = await supabase
      .from("players")
      .update({ is_online: true, last_seen: now.toISOString() })
      .eq("id", data.playerId)
      .eq("room_id", data.roomId)
      .eq("session_id", hashSessionId(data.sessionId))
      .select("id")
      .maybeSingle();
    if (error || !player) throw new Error("Sessão inválida");
    return { ok: true };
  });

export const removeRoomPlayer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        roomId: z.string().uuid(),
        requesterId: z.string().uuid(),
        playerId: z.string().uuid(),
        sessionId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = await db();
    const { data: room } = await supabase.from("rooms").select("*").eq("id", data.roomId).maybeSingle();
    if (!room) throw new Error("Sala não encontrada");

    const isSelf = data.requesterId === data.playerId;
    await requirePlayerSession(room.id, data.requesterId, data.sessionId);
    if (!isSelf && room.host_player_id !== data.requesterId) {
      throw new Error("Só o mestre pode remover outro jogador");
    }

    const { data: target } = await supabase
      .from("players")
      .select("id, is_host")
      .eq("id", data.playerId)
      .eq("room_id", room.id)
      .maybeSingle();
    if (!target) return { ok: true };

    await supabase.from("answers").delete().eq("player_id", target.id);

    if (room.host_player_id === target.id) {
      const { data: successor } = await supabase
        .from("players")
        .select("id")
        .eq("room_id", room.id)
        .neq("id", target.id)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      await supabase.from("rooms").update({ host_player_id: successor?.id ?? null }).eq("id", room.id);
      if (successor) await supabase.from("players").update({ is_host: true }).eq("id", successor.id);
    }

    const { error } = await supabase.from("players").delete().eq("id", target.id).eq("room_id", room.id);
    if (error) throw new Error("Não foi possível remover o jogador");
    return { ok: true };
  });

export const restartRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ roomId: z.string().uuid(), playerId: z.string().uuid(), sessionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = await db();
    const { data: room } = await supabase.from("rooms").select("*").eq("id", data.roomId).maybeSingle();
    if (!room) throw new Error("Sala não encontrada");
    if (room.host_player_id !== data.playerId) throw new Error("Só o mestre pode reiniciar a sala");
    await requirePlayerSession(room.id, data.playerId, data.sessionId);
    if (room.status !== "ended" && room.status !== "finished") throw new Error("Espere a partida terminar para jogar novamente");

    const { data: rounds } = await supabase.from("rounds").select("id").eq("room_id", room.id);
    const roundIds = (rounds ?? []).map((round) => round.id);
    if (roundIds.length > 0) await supabase.from("answers").delete().in("round_id", roundIds);
    await supabase.from("rounds").delete().eq("room_id", room.id);
    await supabase.from("players").update({ score: 0, ready_round: 0 }).eq("room_id", room.id);
    const { error } = await supabase
      .from("rooms")
      .update({
        status: "lobby",
        current_round: 0,
        used_letters: [],
        category_usage: {},
        final_analysis: null,
      })
      .eq("id", room.id);
    if (error) throw new Error("Não foi possível preparar uma nova partida");
    return { ok: true };
  });

export const startNextRound = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ roomId: z.string().uuid(), playerId: z.string().uuid(), sessionId: z.string().uuid(), force: z.boolean().optional(), expectedRound: z.number().int().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = await db();
    const { data: room } = await supabase.from("rooms").select("*").eq("id", data.roomId).maybeSingle();
    if (!room) throw new Error("Sala não encontrada");
    if (room.host_player_id !== data.playerId) throw new Error("Só o mestre pode iniciar a rodada");
    await requirePlayerSession(room.id, data.playerId, data.sessionId);
    if (room.status !== "lobby") {
      const { data: caller } = await supabase.from("players").select("session_id").eq("id", data.playerId).eq("room_id", room.id).maybeSingle();
      if (!data.sessionId || caller?.session_id !== hashSessionId(data.sessionId)) throw new Error("Sessão inválida");
      if (data.expectedRound !== room.current_round) throw new Error("A rodada já mudou");
      const { data: current } = await supabase.from("rounds").select("status, ends_at").eq("room_id", room.id).eq("number", room.current_round).maybeSingle();
      if (room.status !== "playing" || current?.status !== "results") throw new Error("A avaliação ainda não terminou");
      const now = Date.now();
      const deadline = resultsDeadline(current.ends_at);
      const canForce = deadline !== null && now >= deadline - RESULTS_VIEW_MS + RESULTS_FORCE_MS;
      const expired = deadline !== null && now >= deadline;
      const { data: participants, error: participantsError } = await supabase.from("players").select("ready_round, is_online, last_seen").eq("room_id", room.id);
      if (participantsError) throw new Error("Não foi possível conferir os jogadores");
      const pending = (participants ?? []).some((p) => isResultsPlayerActive(p, now) && p.ready_round < room.current_round);
      if (data.force && !canForce) throw new Error("Aguarde dez segundos para forçar o avanço");
      if (pending && !expired && !(data.force && canForce)) throw new Error("Ainda há jogadores vendo os resultados");
      if (room.current_round >= room.total_rounds) {
        const { error } = await supabase.from("rooms").update({ status: "ended" }).eq("id", room.id).eq("current_round", room.current_round);
        if (error) throw new Error("Não foi possível finalizar a partida");
        return { roundId: null };
      }
    }

    const nextNumber = room.current_round + 1;
    const { data: existing } = await supabase
      .from("rounds")
      .select("*")
      .eq("room_id", room.id)
      .eq("number", nextNumber)
      .maybeSingle();
    if (existing) return { roundId: existing.id };

    const letter = pickLetter(room.used_letters ?? [], room.excluded_letters ?? []);
    const all = room.categories.length > 0 ? room.categories : DEFAULT_CATEGORIES;
    const usage = (room.category_usage ?? {}) as Record<string, number>;
    const categories = pickCategories(all, usage, Math.min(MAX_CATEGORIES_PER_ROUND, all.length));

    const startsAt = Date.now() + ROUND_COUNTDOWN_MS;
    const endsAt = room.timer_enabled
      ? new Date(startsAt + room.timer_seconds * 1000).toISOString()
      : null;

    const { data: round, error } = await supabase
      .from("rounds")
      .insert({
        room_id: room.id,
        number: nextNumber,
        letter,
        categories,
        status: "answering",
        started_at: new Date(startsAt).toISOString(),
        ends_at: endsAt,
      })
      .select()
      .single();
    if (error || !round) throw new Error(error?.message ?? "Erro ao iniciar a rodada");

    const nextUsage = { ...usage };
    for (const c of categories) nextUsage[c] = nextNumber;
    const usedLetters = [...(room.used_letters ?? [])];
    if (!usedLetters.includes(letter)) usedLetters.push(letter);

    await supabase
      .from("rooms")
      .update({
        status: "playing",
        current_round: nextNumber,
        used_letters: usedLetters,
        category_usage: nextUsage,
      })
      .eq("id", room.id);

    return { roundId: round.id };
  });

export const stopRound = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ roundId: z.string().uuid(), playerId: z.string().uuid(), sessionId: z.string().uuid(), reason: z.enum(["stop", "timer"]) }).parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = await db();
    const { data: round } = await supabase.from("rounds").select("*").eq("id", data.roundId).maybeSingle();
    if (!round) throw new Error("Rodada não encontrada");
    if (round.status !== "answering") return { ok: true };
    if (Date.now() < roundStartsAt(round.started_at)) throw new Error("Aguarde a contagem para começar");

    const { data: room } = await supabase.from("rooms").select("*").eq("id", round.room_id).maybeSingle();
    if (!room) throw new Error("Sala não encontrada");
    const verifiedPlayer = await requirePlayerSession(room.id, data.playerId, data.sessionId);
    if (data.reason === "timer" && (room.host_player_id !== data.playerId || !round.ends_at || Date.now() < Date.parse(round.ends_at))) throw new Error("O tempo da rodada ainda não terminou");
    if (data.reason === "stop" && room.stop_policy === "host" && room.host_player_id !== data.playerId) {
      throw new Error("Só o mestre pode apertar STOP");
    }

    const { data: player } = await supabase
      .from("players")
      .select("nickname")
      .eq("id", data.playerId)
      .maybeSingle();

    if (data.reason === "timer") {
      await supabase
        .from("rounds")
        .update({ status: "evaluating", stopped_by: "tempo esgotado" })
        .eq("id", data.roundId)
        .eq("status", "answering");
    } else {
      await supabase
        .from("rounds")
        .update({
          stopped_by: verifiedPlayer.nickname,
          stop_requested_at: new Date().toISOString(),
        })
        .eq("id", data.roundId)
        .eq("status", "answering")
        .is("stop_requested_at", null);
    }

    return { ok: true };
  });

export const finalizeStopRound = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ roundId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const supabase = await db();
    const { data: round } = await supabase
      .from("rounds")
      .select("status, stop_requested_at")
      .eq("id", data.roundId)
      .maybeSingle();
    if (!round || round.status !== "answering") return { ok: true };
    if (!round.stop_requested_at) throw new Error("STOP ainda não foi solicitado");

    const elapsed = Date.now() - new Date(round.stop_requested_at).getTime();
    if (elapsed < 2_800) throw new Error("A contagem do STOP ainda não terminou");

    await supabase
      .from("rounds")
      .update({ status: "evaluating" })
      .eq("id", data.roundId)
      .eq("status", "answering")
      .eq("stop_requested_at", round.stop_requested_at);
    return { ok: true };
  });

const evaluationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["resultados"],
  properties: {
    resultados: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["categoria", "jogador_id", "resposta", "pontos", "comentario"],
        properties: {
          categoria: { type: "string" },
          jogador_id: { type: "string" },
          resposta: { type: "string" },
          pontos: { type: "integer", enum: [0, 5, 10, 15, 20] },
          comentario: { type: "string" },
        },
      },
    },
  },
};

const EVAL_INSTRUCTIONS = `Você é o juiz SARCÁSTICO, DEBOCHADO e SEM PIEDADE de um jogo de Stop/Adedonha entre amigos. É um jogo privado, todos os jogadores se conhecem e esperam ser zoados. Humilhar com humor é o papel do juiz: ninguém pode se ofender e NADA deve ser gentil ou diplomático.

Regras de pontuação:
- 0: em branco, inválida, não começa com a letra sorteada ou não pertence à categoria.
- 5: repetida ou semanticamente equivalente a outra resposta da MESMA categoria (mesmo núcleo conceitual). Ex.: "celular" x "smartphone", "cerveja" x "cerveja Skol", "peixe cozido" x "peixe frito". Já "cachorro" x "gato", "carro" x "moto", "iPhone" x "Samsung Galaxy" são diferentes. Quando houver repetição, TODAS as respostas envolvidas recebem 5.
- 10: válida e comum.
- 15: claramente criativa, engraçada, irônica ou inesperada.
- 20: sacada genial e defensável (raciocínio lateral, inversão lógica, duplo sentido). Seja seletivo: não dê 20 só porque é longa, aleatória ou engraçada.

Aceite acentos, sinônimos, apelidos, nomes populares e variações conhecidas. Recuse respostas forçadas sem relação defensável com a categoria.

Comentário: MUITO curto (máx. ~12 palavras), ácido, debochado e pessoal, como um amigo irônico que acabou de ver a resposta. Atire na preguiça, no óbvio, no errado e na resposta fraca. Se a resposta for genérica, diga que é preguiçosa; se for errada, destrua com humor; se for boa, reconheça mas com desdém ("até que enfim", "parece que você pensou mesmo"). Pode usar gíria brasileira, ironia, segunda pessoa ("você") e comparações humilhantes criativas. Proibido: elogio puro, comentário neutro, tom de professor ou aviso educativo. Varie o formato: umas são zoações diretas, outras comparações, outras falsos elogios. Resposta em branco recebe 0 e uma humilhação curta e criativa por ter deixado em branco (nunca a mesma fórmula).

Devolva exatamente um item para CADA combinação de jogador x categoria, repetindo a resposta original no campo "resposta" (string vazia se em branco).`;

const DEV_MODELS = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"] as const;
const devOverridesSchema = z
  .object({
    prompt: z.string().max(8000).optional(),
    model: z.enum(DEV_MODELS).optional(),
    sarcasm: z.number().int().min(1).max(10).optional(),
    persona: z.string().max(600).optional(),
    scoringMode: z.enum(["fixed", "free"]).optional(),
    token: z.string().max(200).optional(),
  })
  .optional();
type DevOverrides = z.infer<typeof devOverridesSchema>;

async function resolveDevOverrides(dev: DevOverrides) {
  if (!dev) return undefined;
  const { isDeveloper } = await import("./dev-session.server");
  return (await isDeveloper(dev.token)) ? dev : undefined;
}

async function loadSavedAi(): Promise<DevOverrides> {
  const supabase = await db();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "ai").maybeSingle();
  const parsed = devOverridesSchema.safeParse(data?.value ?? undefined);
  return parsed.success ? parsed.data : undefined;
}

const shortStr = z.string().max(80);
const uiSchema = z.object({
  buttonLayout: z.enum(["default", "reversed", "stacked"]),
  colors: z.object({ primary: shortStr, secondary: shortStr, background: shortStr, foreground: shortStr }),
  texts: z.object({ appTitle: shortStr, startButton: shortStr, stopButton: shortStr, finishButton: shortStr }),
  scoringMode: z.enum(["fixed", "free"]),
  keyboard: z.object({ autocomplete: z.boolean(), autocorrect: z.boolean(), spellcheck: z.boolean(), mode: z.enum(["native", "app"]).optional() }),
  quickMessages: z.array(z.string().trim().min(1).max(30)).max(8).optional(),
});

/** Configurações globais (visual, teclado, modo de pontuação) para todos os aparelhos. */
export const getGlobalSettings = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await db();
  const { data } = await supabase.from("app_settings").select("key, value").in("key", ["ui", "ai"]);
  const ui = uiSchema.partial().safeParse(data?.find((r) => r.key === "ui")?.value ?? {});
  const ai = devOverridesSchema.safeParse(data?.find((r) => r.key === "ai")?.value ?? undefined);
  const result = ui.success ? ui.data : {};
  const mode = ai.success ? ai.data?.scoringMode : undefined;
  return { ...result, scoringMode: mode ?? result.scoringMode ?? "fixed" };
});

export const saveAiSettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ dev: devOverridesSchema, ui: uiSchema.optional() }).parse(input))
  .handler(async ({ data }) => {
    const dev = await resolveDevOverrides(data.dev);
    if (!dev) throw new Error("Só o desenvolvedor pode salvar as configurações");
    const { token: _t, ...value } = dev;
    const supabase = await db();
    const { error } = await supabase.from("app_settings").upsert({ key: "ai", value, updated_at: new Date().toISOString() });
    if (error) throw new Error("Não foi possível salvar as configurações");
    if (data.ui) {
      const { error: uiError } = await supabase
        .from("app_settings")
        .upsert({ key: "ui", value: { ...data.ui, scoringMode: value.scoringMode ?? data.ui.scoringMode }, updated_at: new Date().toISOString() });
      if (uiError) throw new Error("Não foi possível salvar o visual");
    }
    return { ok: true as const };
  });

const FIXED_RULES = /Regras de pontuação:[\s\S]*?(?=\n\nAceite)/;
const FREE_RULES = `Regras de pontuação (LIVRE, de 0 a 20):
- Dê QUALQUER número inteiro de 0 a 20 (ex.: 3, 7, 12, 18). NÃO se limite a múltiplos de 5.
- 0: em branco, inválida, não começa com a letra sorteada ou não pertence à categoria.
- Respostas repetidas ou equivalentes na mesma categoria valem pouco (todas as envolvidas).
- Quanto mais criativa, rara, engraçada e defensável, maior a nota; reserve 19-20 para sacadas geniais.`;

function buildEval(dev: DevOverrides) {
  const freeMode = dev?.scoringMode === "free";
  let instructions = dev?.prompt?.trim() || EVAL_INSTRUCTIONS;
  if (freeMode) {
    instructions = FIXED_RULES.test(instructions) ? instructions.replace(FIXED_RULES, FREE_RULES) : `${instructions}\n\n${FREE_RULES}`;
  }
  if (dev?.persona?.trim()) {
    instructions += `\n\nPersonalidade do juiz (prioridade sobre o tom acima): ${dev.persona.trim()}`;
  }
  if (dev?.sarcasm) {
    instructions += `\n\nNível de sarcasmo dos comentários: ${dev.sarcasm}/10 (1 = neutro e gentil, 10 = humilhação máxima). Ajuste o tom a esse nível.`;
  }
  const free = freeMode;
  const schema = free
    ? JSON.parse(JSON.stringify(evaluationSchema).replace('"enum":[0,5,10,15,20]', '"minimum":0,"maximum":20'))
    : evaluationSchema;
  return { instructions, schema, free, model: dev?.model };
}

function clampPoints(n: unknown, free: boolean) {
  const v = Math.max(0, Math.min(20, Math.round(Number(n) || 0)));
  return free ? v : Math.round(v / 5) * 5;
}

export const evaluateRound = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ roundId: z.string().uuid(), dev: devOverridesSchema, force: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const supabase = await db();
    const callerDev = await resolveDevOverrides(data.dev ?? (data.force ? {} : undefined));
    const force = Boolean(data.force && callerDev);
    const dev = force ? callerDev : await loadSavedAi();
    const { data: round } = await supabase.from("rounds").select("*").eq("id", data.roundId).maybeSingle();
    if (!round) throw new Error("Rodada não encontrada");
    if (round.evaluation && !force) return { evaluation: round.evaluation as unknown as Evaluation, latencyMs: 0 };
    const previous = (round.evaluation as unknown as Evaluation | null) ?? null;

    const [{ data: players }, { data: answers }] = await Promise.all([
      supabase.from("players").select("id, nickname, score").eq("room_id", round.room_id).order("created_at"),
      supabase.from("answers").select("player_id, values").eq("round_id", round.id),
    ]);

    const list = (players ?? []).map((p) => {
      const row = (answers ?? []).find((a) => a.player_id === p.id);
      const values = (row?.values ?? {}) as Record<string, string>;
      return {
        jogador_id: p.id,
        apelido: p.nickname,
        respostas: Object.fromEntries(
          round.categories.map((c) => [c, (values[c] ?? "").toString().trim()]),
        ),
      };
    });

    const cfg = buildEval(dev);
    const { generateJsonGemini } = await import("./ai.server");
    const started = Date.now();
    const result = await generateJsonGemini<Evaluation>({
      instructions: cfg.instructions,
      schemaName: "avaliacao_rodada",
      schema: cfg.schema,
      model: cfg.model,
      input: JSON.stringify({
        letra: round.letter,
        categorias: round.categories,
        jogadores: list,
      }),
    });
    const latencyMs = Date.now() - started;

    // Normalize: guarantee one entry per player x category.
    const resultados = round.categories.flatMap((categoria) =>
      list.map((p) => {
        const found = result.resultados.find(
          (r) => r.categoria === categoria && r.jogador_id === p.jogador_id,
        );
        const resposta = p.respostas[categoria] ?? "";
        return {
          categoria,
          jogador_id: p.jogador_id,
          resposta,
          pontos: resposta ? clampPoints(found?.pontos, cfg.free) : 0,
          comentario: found?.comentario ?? (resposta ? "Tão ruim que o juiz fingiu que não viu." : "Em branco. Estratégia ousada de perder pontos."),
        };
      }),
    );

    const evaluation: Evaluation = { resultados };
    await supabase
      .from("rounds")
      .update(force ? { evaluation } : { evaluation, status: "results", ends_at: new Date(Date.now() + RESULTS_VIEW_MS).toISOString() })
      .eq("id", round.id);

    const participants = players ?? [];
    // Respect the edge runtime's six-connection budget while updating scores.
    for (let offset = 0; offset < participants.length; offset += 6) {
      await Promise.all(participants.slice(offset, offset + 6).map(async (p) => {
      const gained = resultados
        .filter((r) => r.jogador_id === p.id)
        .reduce((sum, r) => sum + r.pontos, 0);
      const lost = (previous?.resultados ?? [])
        .filter((r) => r.jogador_id === p.id)
        .reduce((sum, r) => sum + r.pontos, 0);
      await supabase
        .from("players")
        .update({ score: Math.max(0, p.score - lost + gained) })
        .eq("id", p.id);
      }));
    }

    return { evaluation, latencyMs };
  });

export const testJudgment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        letter: z.string().min(1).max(2),
        category: z.string().min(1).max(160),
        response: z.string().max(80),
        dev: devOverridesSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const dev = await resolveDevOverrides(data.dev ?? {});
    if (!dev) throw new Error("Só o desenvolvedor pode usar o laboratório");
    const cfg = buildEval(dev);
    const { generateJsonGemini } = await import("./ai.server");
    const started = Date.now();
    const id = "00000000-0000-0000-0000-000000000001";
    const result = await generateJsonGemini<Evaluation>({
      instructions: cfg.instructions,
      schemaName: "avaliacao_rodada",
      schema: cfg.schema,
      model: cfg.model,
      input: JSON.stringify({
        letra: data.letter.toUpperCase(),
        categorias: [data.category],
        jogadores: [{ jogador_id: id, apelido: "Testador", respostas: { [data.category]: data.response.trim() } }],
      }),
    });
    const r = result.resultados?.[0];
    return {
      pontos: data.response.trim() ? clampPoints(r?.pontos, cfg.free) : 0,
      comentario: r?.comentario ?? "A IA ficou sem palavras.",
      latencyMs: Date.now() - started,
      model: cfg.model ?? "gemini-3.6-flash",
    };
  });

const finalSchema = {
  type: "object",
  additionalProperties: false,
  required: ["analises"],
  properties: {
    analises: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["jogador_id", "texto"],
        properties: {
          jogador_id: { type: "string" },
          texto: { type: "string" },
        },
      },
    },
  },
};

export const finalAnalysis = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ roomId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const supabase = await db();
    const { data: room } = await supabase.from("rooms").select("*").eq("id", data.roomId).maybeSingle();
    if (!room) throw new Error("Sala não encontrada");
    if (room.final_analysis) return { analysis: room.final_analysis as unknown as FinalAnalysis };

    const [{ data: players }, { data: rounds }] = await Promise.all([
      supabase.from("players").select("id, nickname, score").eq("room_id", room.id),
      supabase.from("rounds").select("number, letter, evaluation").eq("room_id", room.id).order("number"),
    ]);

    const resumo = (players ?? []).map((p) => ({
      jogador_id: p.id,
      apelido: p.nickname,
      pontos: p.score,
      respostas: (rounds ?? []).flatMap((r) => {
        const ev = (r.evaluation as unknown as Evaluation | null)?.resultados ?? [];
        return ev
          .filter((x) => x.jogador_id === p.id)
          .map((x) => ({ categoria: x.categoria, resposta: x.resposta, pontos: x.pontos }));
      }),
    }));

    const { generateJson } = await import("./ai.server");
    const analysis = await generateJson<FinalAnalysis>({
      instructions:
        "Você é o comentarista SARCÁSTICO, DEBOCHADO e SEM PIEDADE de uma partida de Stop/Adedonha em português do Brasil — jogo privado entre amigos que esperam ser zoados. Escreva uma análise final CURTA (1 frase, no máximo 20 palavras) e DIFERENTE para cada jogador, baseada nas respostas e no desempenho. Destrua quem fez pouco, humilhe com humor criativo quem perdeu, e para o vencedor um reconhecimento com desdém (algo como 'chocantemente, você venceu'). Gíria, ironia, falsos elogios e comparações humilhantes são bem-vindos. Proibido elogio puro, tom neutro ou de professor. Uma entrada por jogador.",
      schemaName: "analise_final",
      schema: finalSchema,
      input: JSON.stringify({ jogadores: resumo }),
    });

    await supabase.from("rooms").update({ final_analysis: analysis }).eq("id", room.id);
    return { analysis };
  });
