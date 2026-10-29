/**
 * Authoritative party-game server logic. Only server functions call this module.
 * Public state (party_rooms.public_state) is readable by every client; secrets
 * (infiltrado word/role, anonymous authorship, votes before reveal) stay in
 * party_private / party_submissions, which have no client grants.
 */
import { createHash, randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json, Tables } from "@/integrations/supabase/types";
import { MAX_CATEGORIES_PER_ROUND, generateRoomCode, pickCategories, pickLetter } from "./game";
import { ROUND_COUNTDOWN_MS } from "./round-pacing";
import {
  addScores,
  assignSides,
  normalizeText,
  pickUnused,
  scoreAutor,
  scoreDebate,
  scoreDebateJudge,
  scoreInfiltrado,
  scoreRoleta,
  scoreRoletaJudge,
  scoreTribunal,
  shuffle,
  tribunalDefendant,
  type Deltas,
  type Verdict,
} from "./party-engine";
import {
  FIRST_PHASE,
  PARTY_GAMES,
  STOP_INTENSITY_SARCASM,
  lobbyGameMeta,
  sanitizeStopAnswers,
  stopAnswersComplete,
  stopRoundDeltas,
  PARTY_GAME_IDS,
  PARTY_TEXT_MAX,
  PHASE_SECONDS,
  effectiveJudge,
  hostPhaseSeconds,
  isPartyGame,
  judgeModeFor,
  missingPlayers,
  phaseSecondsFor,
  readPartyAdmin,
  readPartySettings,
  readPublicState,
  type PartyAdminConfig,
  type PartyEntry,
  type PartyGameId,
  type PartyPhaseId,
  type PartyMine,
  type PartyPrivateViewData,
  type PartyPrompt,
  type PartyResults,
  type PartyPublicState,
  type PartySettings,
  type StopRoundState,
} from "./party-games";
import {
  AUTOR_PROMPTS,
  DEBATE_TOPICS,
  INFILTRADO_WORDS,
  ROLETA_CHALLENGES,
  ROLETA_EVENTS,
  TRIBUNAL_CASES,
} from "./party-content.server";

type RoomRow = Tables<"party_rooms">;
type PlayerRow = Tables<"party_players">;

type RoundPrivate = {
  prompt?: PartyPrompt;
  defendantId?: string;
  sides?: Record<string, "A" | "B">;
  infiltradoId?: string;
  word?: string;
  category?: string;
  playerIds?: string[];
  entries?: { id: string; authorId: string }[];
  votes?: Record<string, string>;
  /** Secret per-round salt so anonymous entry ids cannot be derived from public player ids. */
  salt?: string;
  stop?: { letter: string; categories: string[] };
};

type RoomPrivate = {
  used?: Partial<Record<PartyGameId | "roleta_leve" | "roleta_media" | "roleta_caotica", number[]>>;
  history?: string[];
  /** Stop: letters drawn in the current match and when each category was last played (LRU rotation). */
  letters?: string[];
  categoryUsage?: Record<string, number>;
};

const MAX_PLAYERS = 12;
const SUBMIT_GRACE_MS = 2_000;
const TEXT_PHASES: PartyPhaseId[] = ["defense", "write", "clues", "argue", "respond", "last_guess"];
/** Stop: STOP! locks everyone's answers after this delay; the judge gets this long before anyone may retry. */
const STOP_LOCK_MS = 3_000;
const STOP_EVAL_MS = 90_000;
/** Debate/Roleta AI judge: the claim expires after this long so a dead request can be retried. */
const JUDGE_EVAL_MS = 30_000;

const db = () => supabaseAdmin;

function hashSession(sessionId: string) {
  return createHash("sha256").update(`party:${sessionId}`).digest("hex");
}

function asJson(value: unknown) {
  return value as Json;
}

function gameOf(room: RoomRow): PartyGameId {
  return (PARTY_GAME_IDS as readonly string[]).includes(room.game) ? (room.game as PartyGameId) : "tribunal";
}

/** Host-chosen times (Debate argument, Roleta answer) win over developer timings. */
function deadline(game: PartyGameId, phase: PartyPhaseId, admin: PartyAdminConfig, settings: PartySettings) {
  const seconds = hostPhaseSeconds(game, phase, settings) ?? phaseSecondsFor(game, phase, admin);
  return seconds ? new Date(Date.now() + seconds * 1000).toISOString() : null;
}

/* Developer settings per game (app_settings "party"): briefly cached per worker isolate. */
const ADMIN_KEY = "party";
let adminCache: { at: number; value: PartyAdminConfig } | null = null;

export async function loadPartyAdmin(): Promise<PartyAdminConfig> {
  if (adminCache && Date.now() - adminCache.at < 10_000) return adminCache.value;
  const { data } = await db().from("app_settings").select("value").eq("key", ADMIN_KEY).maybeSingle();
  const value = readPartyAdmin(data?.value ?? {});
  adminCache = { at: Date.now(), value };
  return value;
}

export async function savePartyAdmin(input: { token?: string | undefined; game: PartyGameId; config: unknown }) {
  const { isDeveloper } = await import("./dev-session.server");
  if (!(await isDeveloper(input.token))) throw new Error("Só o desenvolvedor pode salvar estas configurações.");
  const current = await loadPartyAdmin().catch(() => ({}) as PartyAdminConfig);
  const next = readPartyAdmin({ ...current, [input.game]: input.config });
  const { error } = await db().from("app_settings").upsert({ key: ADMIN_KEY, value: asJson(next), updated_at: new Date().toISOString() });
  if (error) throw new Error("Não foi possível salvar as configurações do jogo.");
  adminCache = { at: Date.now(), value: next };
  return { ok: true as const, config: next };
}

/* Developer room management: list and delete group rooms (players, secrets and submissions cascade). */
async function requireDeveloper(token?: string | undefined) {
  const { isDeveloper } = await import("./dev-session.server");
  if (!(await isDeveloper(token))) throw new Error("Acesso de desenvolvedor necessário.");
}

export async function listPartyRoomsAdmin(input: { token?: string | undefined }) {
  await requireDeveloper(input.token);
  const { data, error } = await db()
    .from("party_rooms")
    .select("id, code, game, status, created_at, updated_at, party_players(count)")
    .order("updated_at", { ascending: false })
    .limit(60);
  if (error) throw new Error("Não foi possível carregar as salas da galera.");
  return (data ?? []).map((room) => ({
    id: room.id,
    code: room.code,
    game: room.game,
    status: room.status,
    createdAt: room.created_at,
    updatedAt: room.updated_at,
    playerCount: (room.party_players as unknown as Array<{ count: number }>)[0]?.count ?? 0,
  }));
}

export async function deletePartyRoomAdmin(input: { token?: string | undefined; roomId: string }) {
  await requireDeveloper(input.token);
  const { error } = await db().from("party_rooms").delete().eq("id", input.roomId);
  if (error) throw new Error("Não foi possível apagar a sala.");
  return { ok: true as const };
}

async function loadRoom(roomId: string) {
  const { data, error } = await db().from("party_rooms").select("*").eq("id", roomId).maybeSingle();
  if (error || !data) throw new Error("Sala não encontrada");
  return data;
}

async function loadPlayers(roomId: string) {
  const { data, error } = await db().from("party_players").select("*").eq("room_id", roomId).order("created_at");
  if (error) throw new Error("Não foi possível carregar os jogadores");
  return data ?? [];
}

async function requireSession(roomId: string, playerId: string, sessionId: string) {
  const { data } = await db()
    .from("party_sessions")
    .select("player_id")
    .eq("room_id", roomId)
    .eq("player_id", playerId)
    .eq("session_hash", hashSession(sessionId))
    .maybeSingle();
  if (!data) throw new Error("Sessão inválida. Entre novamente na sala.");
  const { data: player } = await db().from("party_players").select("*").eq("id", playerId).maybeSingle();
  if (!player) throw new Error("Você não está mais nesta sala.");
  return player;
}

async function requireHost(roomId: string, playerId: string, sessionId: string) {
  const player = await requireSession(roomId, playerId, sessionId);
  if (!player.is_host) throw new Error("Só o mestre da sala pode fazer isso.");
  return player;
}

async function readPrivate<T>(roomId: string, round: number): Promise<T> {
  const { data } = await db().from("party_private").select("data").eq("room_id", roomId).eq("round_number", round).maybeSingle();
  return ((data?.data ?? {}) as unknown) as T;
}

async function writePrivate(roomId: string, round: number, data: unknown) {
  const { error } = await db().from("party_private").upsert({ room_id: roomId, round_number: round, data: asJson(data) }, { onConflict: "room_id,round_number" });
  if (error) throw new Error("Não foi possível preparar a rodada");
}

/** Version-guarded update: exactly one concurrent caller wins a phase transition. */
async function guardedUpdate(room: RoomRow, patch: Partial<RoomRow>) {
  const { data } = await db()
    .from("party_rooms")
    .update({ ...patch, version: room.version + 1, updated_at: new Date().toISOString() })
    .eq("id", room.id)
    .eq("version", room.version)
    .select()
    .maybeSingle();
  return data ?? null;
}

async function uniqueCode() {
  for (let i = 0; i < 10; i += 1) {
    const code = generateRoomCode();
    const [{ data: party }, { data: stop }] = await Promise.all([
      db().from("party_rooms").select("id").eq("code", code).maybeSingle(),
      db().from("rooms").select("id").eq("code", code).maybeSingle(),
    ]);
    if (!party && !stop) return code;
  }
  throw new Error("Não consegui gerar um código de sala. Tente de novo.");
}

/* ---------------------------------- Rooms --------------------------------- */

export async function createPartyRoom(input: { game?: PartyGameId | undefined; nickname: string; sessionId: string }) {
  const code = await uniqueCode();
  const { data: room, error } = await db()
    .from("party_rooms")
    .insert({ code, game: input.game ?? "lobby", settings: asJson(readPartySettings({})), public_state: asJson({ scores: {} }) })
    .select()
    .single();
  if (error || !room) throw new Error("Não foi possível criar a sala");
  const { data: player, error: playerError } = await db()
    .from("party_players")
    .insert({ room_id: room.id, nickname: input.nickname.trim(), is_host: true })
    .select()
    .single();
  if (playerError || !player) throw new Error("Não foi possível entrar na sala");
  await db().from("party_sessions").insert({ player_id: player.id, room_id: room.id, session_hash: hashSession(input.sessionId) });
  return { code: room.code, roomId: room.id, playerId: player.id };
}

export async function joinPartyRoom(input: { code: string; nickname: string; sessionId: string }) {
  const code = input.code.trim().toUpperCase();
  const { data: room } = await db().from("party_rooms").select("*").eq("code", code).maybeSingle();
  if (!room) throw new Error("Sala não encontrada");
  const sessionHash = hashSession(input.sessionId);
  const { data: existing } = await db().from("party_sessions").select("player_id").eq("room_id", room.id).eq("session_hash", sessionHash).maybeSingle();
  if (existing) {
    await db().from("party_players").update({ last_seen: new Date().toISOString() }).eq("id", existing.player_id);
    return { kind: "party" as const, code: room.code, roomId: room.id, playerId: existing.player_id, reconnected: true };
  }
  const players = await loadPlayers(room.id);
  const nickname = input.nickname.trim();
  if (!nickname) throw new Error("Coloca um apelido primeiro");
  if (players.some((p) => p.nickname.toLocaleLowerCase("pt-BR") === nickname.toLocaleLowerCase("pt-BR"))) {
    throw new Error("Já existe alguém com esse apelido nesta sala");
  }
  if (players.length >= MAX_PLAYERS) throw new Error(`A sala está cheia (máximo de ${MAX_PLAYERS}).`);
  const { data: player, error } = await db()
    .from("party_players")
    .insert({ room_id: room.id, nickname, is_host: players.length === 0 })
    .select()
    .single();
  if (error || !player) throw new Error("Não foi possível entrar na sala");
  await db().from("party_sessions").insert({ player_id: player.id, room_id: room.id, session_hash: sessionHash });
  return { kind: "party" as const, code: room.code, roomId: room.id, playerId: player.id, reconnected: false };
}

export async function leavePartyRoom(input: { roomId: string; playerId: string; sessionId: string }) {
  const player = await requireSession(input.roomId, input.playerId, input.sessionId);
  await db().from("party_players").delete().eq("id", player.id);
  const remaining = await loadPlayers(input.roomId);
  if (remaining.length === 0) {
    await db().from("party_rooms").delete().eq("id", input.roomId);
    return { ok: true };
  }
  if (player.is_host && !remaining.some((p) => p.is_host)) {
    await db().from("party_players").update({ is_host: true }).eq("id", remaining[0]!.id);
  }
  const room = await loadRoom(input.roomId);
  if (room.status === "playing" && (isPartyGame(room.game) || room.game === "stop")) await syncSubmitted(room.id);
  return { ok: true };
}

/* ------------------------------ Group room flow ----------------------------- */

const RESET_TO_LOBBY = {
  status: "lobby",
  phase: "lobby",
  round_number: 0,
  phase_started_at: null,
  phase_ends_at: null,
  public_state: asJson({ scores: {} }),
} satisfies Partial<RoomRow>;

async function clearRoundData(roomId: string) {
  await Promise.all([
    db().from("party_submissions").delete().eq("room_id", roomId),
    db().from("party_private").delete().eq("room_id", roomId).gt("round_number", 0),
  ]);
}

/** Host picks (or changes) the game while the group waits in the lobby. */
export async function selectPartyGame(input: { roomId: string; playerId: string; sessionId: string; game: PartyGameId | "stop" }) {
  await requireHost(input.roomId, input.playerId, input.sessionId);
  const room = await loadRoom(input.roomId);
  if (room.status !== "lobby") throw new Error("Termine ou encerre a partida antes de trocar de jogo.");
  if (room.game === input.game) return { ok: true };
  const updated = await guardedUpdate(room, { game: input.game });
  if (!updated) throw new Error("A sala mudou ao mesmo tempo. Tente de novo.");
  return { ok: true };
}

/** Host sends everyone back to the group lobby, keeping the room code and every player. */
export async function returnPartyToLobby(input: { roomId: string; playerId: string; sessionId: string }) {
  await requireHost(input.roomId, input.playerId, input.sessionId);
  const room = await loadRoom(input.roomId);
  if (room.game === "lobby" && room.status === "lobby") return { ok: true };
  await clearRoundData(room.id);
  const updated = await guardedUpdate(room, { ...RESET_TO_LOBBY, game: "lobby" });
  if (!updated) {
    const fresh = await loadRoom(room.id);
    if (fresh.game === "lobby" && fresh.status === "lobby") return { ok: true };
    throw new Error("A sala mudou ao mesmo tempo. Tente de novo.");
  }
  return { ok: true };
}

/** "Jogar novamente": same game, fresh scores, straight into round one. */
export async function replayPartyGame(input: { roomId: string; playerId: string; sessionId: string }) {
  await restartPartyRoom(input);
  return startPartyGame(input);
}

export async function updatePartySettings(input: { roomId: string; playerId: string; sessionId: string; settings: Partial<PartySettings> }) {
  await requireHost(input.roomId, input.playerId, input.sessionId);
  const room = await loadRoom(input.roomId);
  if (room.status === "playing") throw new Error("As regras só mudam antes da partida começar.");
  const settings = readPartySettings({ ...readPartySettings(room.settings), ...input.settings });
  const updated = await guardedUpdate(room, { settings: asJson(settings) });
  if (!updated) throw new Error("A sala mudou ao mesmo tempo. Tente de novo.");
  return { ok: true };
}

export async function startPartyGame(input: { roomId: string; playerId: string; sessionId: string }) {
  await requireHost(input.roomId, input.playerId, input.sessionId);
  const room = await loadRoom(input.roomId);
  if (room.status === "playing") return { ok: true };
  if (!isPartyGame(room.game) && room.game !== "stop") throw new Error("Escolha um jogo primeiro.");
  const game = room.game;
  const players = await loadPlayers(room.id);
  const min = lobbyGameMeta(game).minPlayers;
  if (players.length < min) throw new Error(`Este jogo precisa de pelo menos ${min} jogadores.`);
  await Promise.all([
    db().from("party_submissions").delete().eq("room_id", room.id),
    db().from("party_private").delete().eq("room_id", room.id).gt("round_number", 0),
  ]);
  const scores = Object.fromEntries(players.map((p) => [p.id, 0]));
  if (game === "stop") await startStopRound(room, players, 1, scores);
  else await startRound(room, players, 1, scores, readPartySettings(room.settings).skips);
  return { ok: true };
}

export async function restartPartyRoom(input: { roomId: string; playerId: string; sessionId: string }) {
  await requireHost(input.roomId, input.playerId, input.sessionId);
  const room = await loadRoom(input.roomId);
  await clearRoundData(room.id);
  const updated = await guardedUpdate(room, RESET_TO_LOBBY);
  if (!updated) throw new Error("A sala mudou ao mesmo tempo. Tente de novo.");
  return { ok: true };
}

/* ---------------------------------- Rounds -------------------------------- */

async function buildPrompt(room: RoomRow, players: PlayerRow[], round: number, settings: PartySettings, admin: PartyAdminConfig) {
  const game = gameOf(room);
  const tone = admin[game]?.tone;
  const roomPrivate = await readPrivate<RoomPrivate>(room.id, 0);
  const used = { ...(roomPrivate.used ?? {}) };
  const history = [...(roomPrivate.history ?? [])];
  const ai = settings.ai;
  const data: RoundPrivate = { playerIds: players.map((p) => p.id), salt: randomUUID() };

  const remember = (key: keyof NonNullable<RoomPrivate["used"]>, index: number) => {
    used[key] = [...(used[key] ?? []), index];
  };

  if (game === "tribunal") {
    const defendantId = tribunalDefendant(players, round) ?? players[0]!.id;
    const defendant = players.find((p) => p.id === defendantId)?.nickname ?? "Réu";
    data.defendantId = defendantId;
    let prompt: PartyPrompt | null = null;
    if (ai) {
      try {
        const made = await (await import("./party-ai.server")).aiTribunalCase(defendant, history, tone);
        prompt = { ...made, source: "ai" };
      } catch { prompt = null; }
    }
    if (!prompt) {
      const index = pickUnused(TRIBUNAL_CASES.length, used.tribunal ?? []);
      remember("tribunal", index);
      const item = TRIBUNAL_CASES[index]!;
      prompt = { title: item.title, text: item.text.replaceAll("{reu}", `@${defendant}`), source: "banco" };
    }
    data.prompt = prompt;
  } else if (game === "autor") {
    let prompt: PartyPrompt | null = null;
    if (ai) {
      try {
        const text = await (await import("./party-ai.server")).aiAutorPrompt(history, tone);
        prompt = { title: "A pergunta é…", text, source: "ai" };
      } catch { prompt = null; }
    }
    if (!prompt) {
      const index = pickUnused(AUTOR_PROMPTS.length, used.autor ?? []);
      remember("autor", index);
      prompt = { title: "A pergunta é…", text: AUTOR_PROMPTS[index]!, source: "banco" };
    }
    data.prompt = prompt;
  } else if (game === "infiltrado") {
    const index = pickUnused(INFILTRADO_WORDS.length, used.infiltrado ?? []);
    remember("infiltrado", index);
    const item = INFILTRADO_WORDS[index]!;
    data.word = item.word;
    data.category = item.category;
    data.infiltradoId = shuffle(players.map((p) => p.id))[0] ?? players[0]!.id;
    data.prompt = { title: `Categoria: ${item.category}`, text: "Escreva uma pista curta sobre a palavra secreta, sem entregá-la.", category: item.category, source: "banco" };
  } else if (game === "debate") {
    const judge = effectiveJudge(settings.debateJudge, players.length) === "ia" ? "o juiz" : "a galera";
    const debateHelp = `Apresente seus melhores argumentos (lógicos, dramáticos ou absurdos) para convencer ${judge}!`;
    let prompt: PartyPrompt | null = null;
    if (ai) {
      try {
        const made = await (await import("./party-ai.server")).aiDebateTopic(history, tone);
        prompt = { title: made.title, text: debateHelp, sideA: made.sideA, sideB: made.sideB, source: "ai" };
      } catch { prompt = null; }
    }
    if (!prompt) {
      const index = pickUnused(DEBATE_TOPICS.length, used.debate ?? []);
      remember("debate", index);
      const item = DEBATE_TOPICS[index]!;
      prompt = { title: item.title, text: debateHelp, sideA: item.sideA, sideB: item.sideB, source: "banco" };
    }
    data.prompt = prompt;
    data.sides = assignSides(players.map((p) => p.id));
  } else {
    data.prompt = await roletaPrompt(settings, used, history, remember, admin);
  }

  if (data.prompt) history.push(data.prompt.text);
  await writePrivate(room.id, 0, { used, history: history.slice(-30) } satisfies RoomPrivate);
  return data;
}

async function roletaPrompt(
  settings: PartySettings,
  used: NonNullable<RoomPrivate["used"]>,
  history: string[],
  remember: (key: keyof NonNullable<RoomPrivate["used"]>, index: number) => void,
  admin: PartyAdminConfig,
): Promise<PartyPrompt> {
  // Developer can switch chaos events off: every round then scores normally (×1).
  const event = admin.roleta?.events === false
    ? { label: "Rodada normal", multiplier: 1 }
    : ROLETA_EVENTS[Math.floor(Math.random() * ROLETA_EVENTS.length)] ?? ROLETA_EVENTS[0]!;
  if (settings.ai) {
    try {
      const made = await (await import("./party-ai.server")).aiRoletaChallenge(settings.intensity, history, admin.roleta?.tone);
      return { ...made, event, source: "ai" };
    } catch { /* fall back to the built-in list */ }
  }
  const key = `roleta_${settings.intensity}` as const;
  const list = ROLETA_CHALLENGES[settings.intensity];
  const index = pickUnused(list.length, used[key] ?? []);
  remember(key, index);
  return { ...list[index]!, event, source: "banco" };
}

async function startRound(room: RoomRow, players: PlayerRow[], round: number, scores: Record<string, number>, skipsLeft: number | undefined) {
  const settings = readPartySettings(room.settings);
  const game = gameOf(room);
  const admin = await loadPartyAdmin();
  const candidate = await buildPrompt(room, players, round, settings, admin);
  // First writer of a round's private data wins; every racer then reads back the same stored round.
  await db().from("party_private").upsert({ room_id: room.id, round_number: round, data: asJson(candidate) }, { onConflict: "room_id,round_number", ignoreDuplicates: true });
  const stored = await readPrivate<RoundPrivate>(room.id, round);
  const phase = FIRST_PHASE[game];
  const state: PartyPublicState = {
    ...(stored.prompt ? { prompt: stored.prompt } : {}),
    eligible: stored.playerIds ?? players.map((p) => p.id),
    submitted: [],
    scores,
    ...(stored.defendantId ? { defendantId: stored.defendantId } : {}),
    ...(stored.sides ? { sides: stored.sides } : {}),
    ...(game === "roleta" ? { skipsLeft: skipsLeft ?? settings.skips } : {}),
  };
  const updated = await guardedUpdate(room, {
    status: "playing",
    round_number: round,
    phase,
    phase_started_at: new Date().toISOString(),
    phase_ends_at: deadline(game, phase, admin, settings),
    public_state: asJson(state),
  });
  return updated;
}

export async function nextPartyRound(input: { roomId: string; playerId: string; sessionId: string; round: number }) {
  await requireHost(input.roomId, input.playerId, input.sessionId);
  const room = await loadRoom(input.roomId);
  if (room.phase !== "reveal" || room.round_number !== input.round) return { ok: true };
  const settings = readPartySettings(room.settings);
  const state = readPublicState(room.public_state);
  if (room.round_number >= settings.rounds) {
    await guardedUpdate(room, { status: "ended", phase: "final", phase_ends_at: null });
    return { ok: true };
  }
  const players = await loadPlayers(room.id);
  const min = room.game === "stop" ? lobbyGameMeta("stop").minPlayers : PARTY_GAMES[gameOf(room)].minPlayers;
  if (players.length < min) throw new Error(`Faltam jogadores: este jogo precisa de pelo menos ${min}.`);
  if (room.game === "stop") await startStopRound(room, players, room.round_number + 1, state.scores ?? {});
  else await startRound(room, players, room.round_number + 1, state.scores ?? {}, state.skipsLeft);
  return { ok: true };
}

export async function skipRoletaChallenge(input: { roomId: string; playerId: string; sessionId: string; round: number }) {
  await requireHost(input.roomId, input.playerId, input.sessionId);
  const room = await loadRoom(input.roomId);
  const state = readPublicState(room.public_state);
  if (gameOf(room) !== "roleta" || room.phase !== "respond" || room.round_number !== input.round) return { ok: true };
  if ((state.skipsLeft ?? 0) <= 0) throw new Error("Não há mais pulos disponíveis nesta partida.");
  const settings = readPartySettings(room.settings);
  const admin = await loadPartyAdmin();
  const roomPrivate = await readPrivate<RoomPrivate>(room.id, 0);
  const used = { ...(roomPrivate.used ?? {}) };
  const history = [...(roomPrivate.history ?? [])];
  const prompt = await roletaPrompt(settings, used, history, (key, index) => { used[key] = [...(used[key] ?? []), index]; }, admin);
  history.push(prompt.text);
  const roundPrivate = await readPrivate<RoundPrivate>(room.id, room.round_number);
  const updated = await guardedUpdate(room, {
    phase_started_at: new Date().toISOString(),
    phase_ends_at: deadline("roleta", "respond", admin, settings),
    public_state: asJson({ ...state, prompt, submitted: [], skipsLeft: (state.skipsLeft ?? 1) - 1 }),
  });
  if (!updated) throw new Error("A rodada mudou ao mesmo tempo. Tente de novo.");
  await Promise.all([
    writePrivate(room.id, 0, { used, history: history.slice(-30) }),
    writePrivate(room.id, room.round_number, { ...roundPrivate, prompt }),
    db().from("party_submissions").delete().eq("room_id", room.id).eq("round_number", room.round_number).eq("phase", "respond"),
  ]);
  return { ok: true };
}

/* -------------------------------- Submissions ------------------------------ */

function textPayload(payload: unknown) {
  const text = typeof (payload as { text?: unknown })?.text === "string" ? (payload as { text: string }).text.replace(/\s+/g, " ").trim() : "";
  if (!text) throw new Error("Escreva alguma coisa antes de enviar.");
  return { text: text.slice(0, PARTY_TEXT_MAX) };
}

function targetPayload(payload: unknown, voterId: string, allowed: readonly string[]) {
  const target = (payload as { target?: unknown })?.target;
  if (typeof target !== "string" || !allowed.includes(target)) throw new Error("Voto inválido.");
  if (target === voterId) throw new Error("Não vale votar em si mesmo.");
  return { target };
}

export async function submitPartyAction(input: { roomId: string; playerId: string; sessionId: string; round: number; phase: string; payload: unknown }) {
  const player = await requireSession(input.roomId, input.playerId, input.sessionId);
  const room = await loadRoom(input.roomId);
  if (room.status !== "playing" || room.round_number !== input.round || room.phase !== input.phase) {
    throw new Error("Essa etapa já foi encerrada.");
  }
  if (room.phase_ends_at && Date.now() > new Date(room.phase_ends_at).getTime() + SUBMIT_GRACE_MS) {
    throw new Error("O tempo desta etapa acabou.");
  }
  const state = readPublicState(room.public_state);
  if (!(state.eligible ?? []).includes(player.id)) throw new Error("Você não participa desta etapa.");
  const game = gameOf(room);
  const phase = room.phase as PartyPhaseId;
  const entryAuthors = (state.entries ?? []).map((entry) => entry.playerId).filter((id): id is string => Boolean(id));

  let payload: Record<string, unknown>;
  if (room.game === "stop") {
    if (phase !== "write" || !state.stop) throw new Error("Esta etapa não recebe respostas.");
    const raw = input.payload as { answers?: unknown; done?: unknown };
    payload = { answers: sanitizeStopAnswers(raw?.answers, state.stop.categories), done: raw?.done === true };
  } else if (TEXT_PHASES.includes(phase)) {
    payload = textPayload(input.payload);
  } else if (phase === "vote" && game === "tribunal") {
    const verdict = (input.payload as { verdict?: unknown })?.verdict;
    if (verdict !== "culpado" && verdict !== "inocente") throw new Error("Voto inválido.");
    payload = { verdict };
  } else if (phase === "vote") {
    const allowed = game === "infiltrado" ? (state.eligible ?? []) : entryAuthors;
    payload = targetPayload(input.payload, player.id, allowed);
  } else if (phase === "guess" && game === "autor") {
    const roundPrivate = await readPrivate<RoundPrivate>(room.id, room.round_number);
    const ownEntry = roundPrivate.entries?.find((entry) => entry.authorId === player.id)?.id;
    const authorIds = new Set((roundPrivate.entries ?? []).map((entry) => entry.authorId));
    const raw = (input.payload as { guesses?: unknown })?.guesses;
    const guesses: Record<string, string> = {};
    if (raw && typeof raw === "object") {
      for (const [entryId, target] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof target !== "string" || entryId === ownEntry || target === player.id || !authorIds.has(target)) continue;
        if (!(state.entries ?? []).some((entry) => entry.id === entryId)) continue;
        guesses[entryId] = target;
      }
    }
    if (Object.keys(guesses).length === 0) throw new Error("Escolha pelo menos um autor.");
    payload = { guesses };
  } else {
    throw new Error("Esta etapa não recebe respostas.");
  }

  const { error } = await db()
    .from("party_submissions")
    .upsert({ room_id: room.id, round_number: room.round_number, phase: room.phase, player_id: player.id, payload: asJson(payload) }, { onConflict: "room_id,round_number,phase,player_id" });
  if (error) throw new Error("Não foi possível enviar. Tente de novo.");
  await syncSubmitted(room.id);
  return { ok: true };
}

/** Recomputes who submitted from the table (source of truth) and advances when everyone present is done. */
async function syncSubmitted(roomId: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const room = await loadRoom(roomId);
    if (room.status !== "playing" || !PHASE_SECONDS[room.phase as PartyPhaseId]) return;
    const state = readPublicState(room.public_state);
    const [{ data: subs }, players] = await Promise.all([
      db().from("party_submissions").select("player_id, payload").eq("room_id", room.id).eq("round_number", room.round_number).eq("phase", room.phase),
      loadPlayers(room.id),
    ]);
    const present = new Set(players.map((p) => p.id));
    const eligibleNow = (state.eligible ?? []).filter((id) => present.has(id));
    // Stop drafts are saved continuously: only "Terminei"/STOP counts as finished.
    const finished = room.game === "stop" ? (subs ?? []).filter((s) => (s.payload as PartyMine | null)?.done === true) : (subs ?? []);
    const submitted = finished.map((s) => s.player_id).filter((id) => eligibleNow.includes(id));
    if (eligibleNow.every((id) => submitted.includes(id))) {
      // A concurrent submit may have bumped the version first; retry with fresh state instead of stalling.
      if (await advance(room)) return;
      continue;
    }
    const same = JSON.stringify([...(state.submitted ?? [])].sort()) === JSON.stringify([...submitted].sort());
    if (same) return;
    const updated = await guardedUpdate(room, { public_state: asJson({ ...state, submitted }) });
    if (updated) return;
  }
}

export async function advancePartyPhase(input: { roomId: string; playerId: string; sessionId: string; round: number; phase: string }) {
  const player = await requireSession(input.roomId, input.playerId, input.sessionId);
  const room = await loadRoom(input.roomId);
  if (room.status !== "playing" || room.round_number !== input.round || room.phase !== input.phase) return { ok: true };
  const expired = room.phase_ends_at !== null && Date.now() >= new Date(room.phase_ends_at).getTime() - 500;
  if (!expired && !player.is_host) throw new Error("Ainda há tempo nesta etapa.");
  await advance(room);
  return { ok: true };
}

/* --------------------------------- Advance --------------------------------- */

async function submissionsFor(room: RoomRow, phase: string) {
  const { data } = await db().from("party_submissions").select("player_id, payload, created_at").eq("room_id", room.id).eq("round_number", room.round_number).eq("phase", phase).order("created_at");
  return (data ?? []) as unknown as { player_id: string; payload: PartyMine; created_at: string }[];
}

function textEntries(subs: { player_id: string; payload: PartyMine }[], present: Set<string>): PartyEntry[] {
  return subs
    .filter((s) => present.has(s.player_id) && typeof s.payload.text === "string")
    .map((s) => ({ id: s.player_id, playerId: s.player_id, text: String(s.payload.text) }));
}

function targetVotes(subs: { player_id: string; payload: PartyMine }[]) {
  const votes: Record<string, string> = {};
  for (const s of subs) if (typeof s.payload.target === "string") votes[s.player_id] = s.payload.target;
  return votes;
}

/** Returns true when this call (or a concurrent one) moved the room past the given phase. */
async function advance(room: RoomRow): Promise<boolean> {
  const moved = await advanceOnce(room);
  if (moved) return true;
  const fresh = await loadRoom(room.id);
  return fresh.phase !== room.phase || fresh.round_number !== room.round_number;
}

async function advanceOnce(room: RoomRow): Promise<boolean> {
  if (room.game === "stop") return advanceStop(room);
  if (!isPartyGame(room.game)) return false;
  const game = gameOf(room);
  const phase = room.phase as PartyPhaseId;
  const state = readPublicState(room.public_state);
  const settings = readPartySettings(room.settings);
  const admin = await loadPartyAdmin();
  const tone = admin[game]?.tone;
  const players = await loadPlayers(room.id);
  const present = new Set(players.map((p) => p.id));
  const presentIds = players.map((p) => p.id);
  const roundPrivate = await readPrivate<RoundPrivate>(room.id, room.round_number);
  const subs = await submissionsFor(room, phase);
  const nickname = (id: string | undefined) => players.find((p) => p.id === id)?.nickname ?? "Alguém";

  const toPhase = async (next: PartyPhaseId, extra: PartyPublicState) =>
    Boolean(await guardedUpdate(room, {
      phase: next,
      phase_started_at: new Date().toISOString(),
      phase_ends_at: deadline(game, next, admin, settings),
      public_state: asJson({ ...state, ...extra, submitted: [] }),
    }));

  const reveal = async (results: PartyResults, deltas: Deltas, comment: (() => Promise<string>) | null): Promise<boolean> => {
    const ai = comment && settings.ai ? { status: "pending" as const } : { status: "off" as const };
    const updated = await guardedUpdate(room, {
      phase: "reveal",
      phase_started_at: new Date().toISOString(),
      phase_ends_at: null,
      public_state: asJson({ ...state, submitted: [], results, deltas, scores: addScores(state.scores ?? {}, deltas), ai }),
    });
    if (!updated) return false;
    if (!comment || !settings.ai) return true;
    let aiState: PartyPublicState["ai"];
    try {
      const text = await comment();
      aiState = text ? { status: "done", text } : { status: "failed" };
    } catch {
      aiState = { status: "failed" };
    }
    await guardedUpdate(updated, { public_state: asJson({ ...readPublicState(updated.public_state), ai: aiState }) });
    return true;
  };

  const ai = () => import("./party-ai.server");

  // Debate/Roleta with the AI judge: claim "evaluating" once (version-guarded), then judge and reveal.
  const claimJudge = async (extra: PartyPublicState) => {
    const claimed = await guardedUpdate(room, {
      phase: "evaluating",
      phase_started_at: new Date().toISOString(),
      phase_ends_at: new Date(Date.now() + JUDGE_EVAL_MS).toISOString(),
      public_state: asJson({ ...state, ...extra, submitted: [], ai: { status: "pending" } }),
    });
    if (!claimed) return false;
    await runPartyJudge(claimed, presentIds, settings, admin);
    return true;
  };
  if (phase === "evaluating") {
    // Retry only when a previous judge request died past its deadline.
    if (room.phase_ends_at !== null && Date.now() < Date.parse(room.phase_ends_at)) return false;
    return claimJudge({});
  }
  const judgedByAi = (() => {
    const mode = judgeModeFor(game, settings);
    return mode !== null && effectiveJudge(mode, presentIds.length) === "ia";
  })();

  if (game === "tribunal") {
    if (phase === "defense") {
      const entries = textEntries(subs, present).sort((a, b) => (a.playerId === state.defendantId ? -1 : b.playerId === state.defendantId ? 1 : 0));
      const voters = presentIds.filter((id) => id !== state.defendantId);
      return toPhase("vote", { entries, eligible: voters });
    }
    const votes: Record<string, Verdict> = {};
    for (const s of subs) if (s.payload.verdict === "culpado" || s.payload.verdict === "inocente") votes[s.player_id] = s.payload.verdict;
    const defendantId = state.defendantId ?? "";
    const result = scoreTribunal(defendantId, votes);
    const defense = state.entries?.find((e) => e.playerId === defendantId)?.text ?? "(o réu ficou em silêncio)";
    return reveal({ verdict: result.verdict, guilty: result.guilty, innocent: result.innocent, votes }, result.deltas, async () =>
      (await ai()).aiTribunalVerdict({
        caso: state.prompt?.text ?? "",
        reu: nickname(defendantId),
        defesa: defense,
        acusacoes: (state.entries ?? []).filter((e) => e.playerId !== defendantId).map((e) => e.text),
        veredito: result.verdict,
        votos_culpado: result.guilty,
        votos_inocente: result.innocent,
      }, tone),
    );
  }

  if (game === "autor") {
    if (phase === "write") {
      const written = textEntries(subs, present);
      // Ids are stable for concurrent advancers but unguessable without the secret round salt.
      const shuffled = shuffle(written).map((entry) => ({
        id: createHash("sha256").update(`${roundPrivate.salt ?? room.id}:${entry.playerId}`).digest("hex").slice(0, 12),
        authorId: entry.playerId!,
        text: entry.text,
      }));
      await writePrivate(room.id, room.round_number, { ...roundPrivate, entries: shuffled.map(({ id, authorId }) => ({ id, authorId })) });
      if (shuffled.length < 2) {
        return reveal({ entries: shuffled.map((e) => ({ id: e.id, text: e.text, authorId: e.authorId, correct: [], fooled: 0 })), notice: "Poucas respostas para adivinhar nesta rodada." }, {}, null);
      }
      // Public entries carry no author: authorship stays in party_private until the reveal.
      return toPhase("guess", { entries: shuffled.map(({ id, text }) => ({ id, text })), eligible: presentIds });
    }
    const guesses: Record<string, Record<string, string>> = {};
    for (const s of subs) if (s.payload.guesses && typeof s.payload.guesses === "object") guesses[s.player_id] = s.payload.guesses as Record<string, string>;
    const entries = roundPrivate.entries ?? [];
    const result = scoreAutor(entries, guesses);
    const revealed = result.perEntry.map((entry) => ({
      ...entry,
      text: state.entries?.find((e) => e.id === entry.id)?.text ?? "",
      picks: Object.fromEntries(Object.entries(guesses).map(([guesser, picks]) => [guesser, picks[entry.id]]).filter(([, pick]) => pick)),
    }));
    return reveal({ entries: revealed }, result.deltas, async () =>
      (await ai()).aiAutorComment({
        pergunta: state.prompt?.text ?? "",
        respostas: revealed.map((entry) => ({ texto: entry.text, autor: nickname(entry.authorId), quantos_adivinharam_o_autor: entry.correct.length })),
      }, tone),
    );
  }

  if (game === "infiltrado") {
    const roundPlayers = (roundPrivate.playerIds ?? []).filter((id) => present.has(id));
    const infiltradoId = roundPrivate.infiltradoId ?? "";
    const finish = (votes: Record<string, string>, guess: string | null) => {
      const guessCorrect = guess === null ? null : normalizeText(guess).replace(/ /g, "") === normalizeText(roundPrivate.word ?? "").replace(/ /g, "");
      const result = scoreInfiltrado({ infiltradoId, playerIds: roundPlayers, votes, guessCorrect });
      return reveal({ infiltradoId, word: roundPrivate.word ?? "", category: roundPrivate.category ?? "", votes, counts: result.counts, accusedId: result.accusedId, guess, guessCorrect, outcome: result.outcome }, result.deltas, null);
    };
    if (phase === "clues") return toPhase("vote", { entries: textEntries(subs, present), eligible: roundPlayers });
    if (phase === "vote") {
      const votes = targetVotes(subs);
      const result = scoreInfiltrado({ infiltradoId, playerIds: roundPlayers, votes, guessCorrect: null });
      if (result.accusedId === infiltradoId && present.has(infiltradoId)) {
        await writePrivate(room.id, room.round_number, { ...roundPrivate, votes });
        return toPhase("last_guess", { accusedId: infiltradoId, eligible: [infiltradoId] });
      }
      return finish(votes, null);
    }
    const guess = subs.find((s) => s.player_id === infiltradoId)?.payload.text;
    return finish(roundPrivate.votes ?? {}, typeof guess === "string" ? guess : "");
  }

  if (game === "debate") {
    if (phase === "argue") {
      const entries = textEntries(subs, present);
      if (entries.length < 2) return reveal({ votes: {}, counts: {}, sideTotals: { A: 0, B: 0 }, winnerSide: null, notice: "Poucos argumentos para julgar nesta rodada." }, {}, null);
      if (judgedByAi) return claimJudge({ entries, eligible: [] });
      return toPhase("vote", { entries, eligible: presentIds });
    }
    const authors = (state.entries ?? []).map((e) => e.playerId!).filter(Boolean);
    const sides = Object.fromEntries(Object.entries(state.sides ?? {}).filter(([id]) => authors.includes(id)));
    const votes = targetVotes(subs);
    const result = scoreDebate(sides, votes);
    return reveal({ votes, counts: result.counts, sideTotals: result.sideTotals, winnerSide: result.winnerSide }, result.deltas, async () =>
      (await ai()).aiDebateComment({
        tema: state.prompt?.title ?? "",
        lado_a: state.prompt?.sideA ?? "",
        lado_b: state.prompt?.sideB ?? "",
        argumentos: (state.entries ?? []).map((e) => ({ lado: state.sides?.[e.playerId ?? ""] ?? "?", autor: nickname(e.playerId), texto: e.text, votos: result.counts[e.playerId ?? ""] ?? 0 })),
      }, tone),
    );
  }

  // Roleta do Caos
  if (phase === "respond") {
    const entries = textEntries(subs, present);
    if (entries.length < (judgedByAi ? 1 : 2)) return reveal({ votes: {}, counts: {}, multiplier: state.prompt?.event?.multiplier ?? 1, notice: "Poucas respostas para votar nesta rodada." }, {}, null);
    if (judgedByAi) return claimJudge({ entries, eligible: [] });
    return toPhase("vote", { entries, eligible: presentIds });
  }
  const authors = (state.entries ?? []).map((e) => e.playerId!).filter(Boolean);
  const votes = targetVotes(subs);
  const multiplier = state.prompt?.event?.multiplier ?? 1;
  const result = scoreRoleta(votes, authors, multiplier);
  return reveal({ votes, counts: result.counts, multiplier }, result.deltas, null);
}

/**
 * AI judge for Debate/Roleta. Entries reach the AI under neutral labels (no nicknames); scoring stays in
 * the deterministic engine. If the AI fails, the round falls back to a group vote instead of stalling.
 */
async function runPartyJudge(room: RoomRow, presentIds: string[], settings: PartySettings, admin: PartyAdminConfig) {
  const game = gameOf(room);
  const state = readPublicState(room.public_state);
  const entries = (state.entries ?? []).filter((e) => e.playerId);
  const labelled = entries.map((entry, index) => ({ label: String(index + 1), id: entry.playerId!, text: entry.text }));
  const idOf = (label: string) => labelled.find((l) => l.label === label)?.id ?? null;
  const tone = admin[game]?.tone;
  try {
    const ai = await import("./party-ai.server");
    let results: PartyResults;
    let deltas: Deltas;
    let text: string;
    if (game === "debate") {
      const sides = Object.fromEntries(Object.entries(state.sides ?? {}).filter(([id]) => labelled.some((l) => l.id === id)));
      const made = await ai.aiJudgeDebate({
        tema: state.prompt?.title ?? "",
        lado_a: state.prompt?.sideA ?? "",
        lado_b: state.prompt?.sideB ?? "",
        argumentos: labelled.filter((l) => sides[l.id]).map((l) => ({ rotulo: l.label, lado: sides[l.id]!, texto: l.text })),
      }, tone);
      const winnerId = idOf(made.winner);
      const scored = scoreDebateJudge(sides, winnerId, made.bonus);
      results = { votes: {}, counts: {}, winnerSide: scored.winnerSide, judge: { by: "ia", bestId: winnerId, bonus: Math.max(0, Math.min(2, Math.round(made.bonus))) } };
      deltas = scored.deltas;
      text = made.verdict;
    } else {
      const multiplier = state.prompt?.event?.multiplier ?? 1;
      const made = await ai.aiJudgeRoleta({ desafio: state.prompt?.text ?? "", respostas: labelled.map((l) => ({ rotulo: l.label, texto: l.text })) }, tone);
      const points: Record<string, number> = {};
      const notes: Record<string, string> = {};
      for (const l of labelled) {
        points[l.id] = made.notes[l.label]?.points ?? 0;
        if (made.notes[l.label]?.comment) notes[l.id] = made.notes[l.label]!.comment;
      }
      const scored = scoreRoletaJudge(points, labelled.map((l) => l.id), multiplier);
      const top = Math.max(0, ...Object.values(scored.counts));
      const best = Object.entries(scored.counts).filter(([, v]) => v === top && top > 0);
      results = { votes: {}, counts: scored.counts, multiplier, judge: { by: "ia", bestId: best.length === 1 ? best[0]![0] : null, notes } };
      deltas = scored.deltas;
      text = made.summary;
    }
    await guardedUpdate(room, {
      phase: "reveal",
      phase_started_at: new Date().toISOString(),
      phase_ends_at: null,
      public_state: asJson({ ...state, submitted: [], results, deltas, scores: addScores(state.scores ?? {}, deltas), ai: text ? { status: "done", text } : { status: "off" } }),
    });
  } catch {
    await guardedUpdate(room, {
      phase: "vote",
      phase_started_at: new Date().toISOString(),
      phase_ends_at: deadline(game, "vote", admin, settings),
      public_state: asJson({ ...state, eligible: presentIds, submitted: [], ai: { status: "failed", text: "O juiz de IA não respondeu. Desta vez, votem vocês!" } }),
    });
  }
}

/* ----------------------------------- Stop ---------------------------------- */

/** Draws the letter (no repeats within a match) and up to eight least-recently-played categories. */
async function startStopRound(room: RoomRow, players: PlayerRow[], round: number, scores: Record<string, number>) {
  const settings = readPartySettings(room.settings);
  const roomPrivate = await readPrivate<RoomPrivate>(room.id, 0);
  const letters = round === 1 ? [] : [...(roomPrivate.letters ?? [])];
  const usage = { ...(roomPrivate.categoryUsage ?? {}) };
  const letter = pickLetter(letters, []);
  const categories = pickCategories(settings.categories, usage, Math.min(MAX_CATEGORIES_PER_ROUND, settings.categories.length));
  const candidate: RoundPrivate = { playerIds: players.map((p) => p.id), salt: randomUUID(), stop: { letter, categories } };
  // First writer of the round wins; every racer then reads back the same letter and categories.
  await db().from("party_private").upsert({ room_id: room.id, round_number: round, data: asJson(candidate) }, { onConflict: "room_id,round_number", ignoreDuplicates: true });
  const stored = await readPrivate<RoundPrivate>(room.id, round);
  const drawn = stored.stop ?? candidate.stop!;
  if (stored.salt === candidate.salt) {
    const now = Date.now();
    for (const category of drawn.categories) usage[category] = now;
    await writePrivate(room.id, 0, { ...roomPrivate, letters: [...letters, drawn.letter], categoryUsage: usage } satisfies RoomPrivate);
  }
  const startsAt = Date.now() + ROUND_COUNTDOWN_MS;
  const stop: StopRoundState = { letter: drawn.letter, categories: drawn.categories, startsAt: new Date(startsAt).toISOString() };
  const state: PartyPublicState = { stop, eligible: stored.playerIds ?? players.map((p) => p.id), submitted: [], scores };
  return guardedUpdate(room, {
    status: "playing",
    round_number: round,
    phase: "write",
    phase_started_at: stop.startsAt,
    phase_ends_at: new Date(startsAt + settings.stopSeconds * 1000).toISOString(),
    public_state: asJson(state),
  });
}

/** STOP!: a player who filled every category locks everyone's answers in three seconds. */
export async function stopPartyRound(input: { roomId: string; playerId: string; sessionId: string; round: number; answers: unknown }) {
  const player = await requireSession(input.roomId, input.playerId, input.sessionId);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const room = await loadRoom(input.roomId);
    const state = readPublicState(room.public_state);
    if (room.game !== "stop" || room.status !== "playing" || room.phase !== "write" || room.round_number !== input.round || !state.stop) {
      throw new Error("Essa rodada já foi encerrada.");
    }
    if (!(state.eligible ?? []).includes(player.id)) throw new Error("Você entra na próxima rodada.");
    if (Date.now() < Date.parse(state.stop.startsAt)) throw new Error("Aguarde a contagem para começar.");
    if (state.stop.stopBy) return { ok: true };
    const answers = sanitizeStopAnswers(input.answers, state.stop.categories);
    if (!stopAnswersComplete(answers, state.stop.categories)) throw new Error("Preencha todas as categorias para gritar STOP!");
    await db()
      .from("party_submissions")
      .upsert({ room_id: room.id, round_number: room.round_number, phase: "write", player_id: player.id, payload: asJson({ answers, done: true }) }, { onConflict: "room_id,round_number,phase,player_id" });
    const lockAt = Date.now() + STOP_LOCK_MS;
    const endsAt = room.phase_ends_at ? Math.min(Date.parse(room.phase_ends_at), lockAt) : lockAt;
    const updated = await guardedUpdate(room, {
      phase_ends_at: new Date(endsAt).toISOString(),
      public_state: asJson({ ...state, stop: { ...state.stop, stopBy: player.id, stopAt: new Date().toISOString() } }),
    });
    if (updated) return { ok: true };
  }
  throw new Error("A rodada mudou ao mesmo tempo. Tente de novo.");
}

async function advanceStop(room: RoomRow): Promise<boolean> {
  const state = readPublicState(room.public_state);
  if (!state.stop) return false;
  if (room.phase === "write") {
    const claimed = await guardedUpdate(room, {
      phase: "evaluating",
      phase_started_at: new Date().toISOString(),
      phase_ends_at: new Date(Date.now() + STOP_EVAL_MS).toISOString(),
      public_state: asJson({ ...state, submitted: [], ai: { status: "pending" } }),
    });
    if (!claimed) return false;
    await judgeStop(claimed);
    return true;
  }
  if (room.phase === "evaluating") {
    // Retry only after a failure or when a previous judge request died past its deadline.
    const running = state.ai?.status === "pending" && room.phase_ends_at !== null && Date.now() < Date.parse(room.phase_ends_at);
    if (running) return false;
    const claimed = await guardedUpdate(room, {
      phase_ends_at: new Date(Date.now() + STOP_EVAL_MS).toISOString(),
      public_state: asJson({ ...state, ai: { status: "pending" } }),
    });
    if (!claimed) return false;
    await judgeStop(claimed);
    return true;
  }
  return false;
}

/** Runs Stop's unchanged AI judge with the host's scoring mode and intensity, then reveals and scores. */
async function judgeStop(room: RoomRow) {
  const state = readPublicState(room.public_state);
  const stop = state.stop!;
  const settings = readPartySettings(room.settings);
  const [players, subs, saved] = await Promise.all([
    loadPlayers(room.id),
    submissionsFor(room, "write"),
    db().from("app_settings").select("value").eq("key", "ai").maybeSingle(),
  ]);
  const eligible = new Set(state.eligible ?? []);
  const judged = players.filter((p) => eligible.has(p.id));
  const list = judged.map((p) => {
    const answers = sanitizeStopAnswers(subs.find((s) => s.player_id === p.id)?.payload.answers, stop.categories);
    return { jogador_id: p.id, apelido: p.nickname, respostas: answers };
  });
  const judge = await import("./stop-judge.server");
  try {
    const { evaluation } = await judge.judgeRound({
      letter: stop.letter,
      categories: stop.categories,
      players: list,
      dev: { ...judge.readSavedJudge(saved.data?.value), sarcasm: STOP_INTENSITY_SARCASM[settings.aiIntensity], scoringMode: settings.scoring },
    });
    const deltas = stopRoundDeltas(evaluation.resultados);
    await guardedUpdate(room, {
      phase: "reveal",
      phase_started_at: new Date().toISOString(),
      phase_ends_at: null,
      public_state: asJson({ ...state, submitted: [], results: { stop: evaluation.resultados }, deltas, scores: addScores(state.scores ?? {}, deltas), ai: { status: "off" } }),
    });
  } catch (err) {
    const text = err instanceof Error ? err.message : "A IA não respondeu.";
    await guardedUpdate(room, { phase_ends_at: null, public_state: asJson({ ...state, ai: { status: "failed", text } }) });
  }
}

/* ------------------------------- Private view ------------------------------ */

export async function getPartyPrivateView(input: { roomId: string; playerId: string; sessionId: string }): Promise<PartyPrivateViewData> {
  const player = await requireSession(input.roomId, input.playerId, input.sessionId);
  const room = await loadRoom(input.roomId);
  const empty: PartyPrivateViewData = { role: null, word: null, myEntryId: null, mine: null };
  if (room.status !== "playing" || room.round_number < 1) return empty;
  const [roundPrivate, { data: mine }] = await Promise.all([
    readPrivate<RoundPrivate>(room.id, room.round_number),
    db().from("party_submissions").select("payload").eq("room_id", room.id).eq("round_number", room.round_number).eq("phase", room.phase).eq("player_id", player.id).maybeSingle(),
  ]);
  const view: PartyPrivateViewData = { ...empty, mine: (mine?.payload ?? null) as PartyMine | null };
  const game = gameOf(room);
  if (game === "infiltrado" && room.phase !== "reveal") {
    if (!(roundPrivate.playerIds ?? []).includes(player.id)) view.role = "espectador";
    else if (roundPrivate.infiltradoId === player.id) view.role = "infiltrado";
    else {
      view.role = "cidadao";
      view.word = roundPrivate.word ?? null;
    }
  }
  if (game === "autor") view.myEntryId = roundPrivate.entries?.find((entry) => entry.authorId === player.id)?.id ?? null;
  return view;
}
