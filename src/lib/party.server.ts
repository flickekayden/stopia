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
  scoreTribunalJudge,
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
  PARTY_CHAT_MAX,
  PARTY_CHAT_QUICK,
  PARTY_GAME_IDS,
  PHASE_SECONDS,
  effectiveJudgeFor,
  hostPhaseSeconds,
  isPartyGame,
  missingPlayers,
  phaseSecondsFor,
  readPartyAdmin,
  readPartySettings,
  readPublicState,
  textMaxFor,
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
import { MAX_BOTS, botDelayMs, fallbackBotLine, fallbackStopAnswers, nextBotName, seededPick, seededUnit, type BotActionKind } from "./party-bots";
import { APPEAL_SECONDS, appealBlocker, appealClosed, appealOutcome, appealPoints, type AppealVote, type StopAppeal } from "./stop-appeal";

type RoomRow = Tables<"party_rooms">;
type PlayerRow = Tables<"party_players">;

/** Training bots' per-round cache (stored at round_number = -round, never in public state). */
type BotCache = { stop?: Record<string, Record<string, string>>; texts?: Record<string, string> };

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
  // Both lookups use ids the caller already sent, so they run in one round-trip.
  const [{ data }, { data: player }] = await Promise.all([
    db()
      .from("party_sessions")
      .select("player_id")
      .eq("room_id", roomId)
      .eq("player_id", playerId)
      .eq("session_hash", hashSession(sessionId))
      .maybeSingle(),
    db().from("party_players").select("*").eq("id", playerId).eq("room_id", roomId).maybeSingle(),
  ]);
  if (!data) throw new Error("Sessão inválida. Entre novamente na sala.");
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

/** A code not used by legacy Stop rooms; the party_rooms UNIQUE constraint stays the final guarantee. */
async function candidateCode() {
  for (let i = 0; i < 6; i += 1) {
    const code = generateRoomCode();
    const { data: stop } = await db().from("rooms").select("id").eq("code", code).maybeSingle();
    if (!stop) return code;
  }
  return generateRoomCode();
}

/* Abuse limits: counted per network address (falls back to the device session) in a server-only table. */
const RATE_LIMITS = {
  create: { max: 15, windowMs: 60 * 60_000 },
  join_miss: { max: 20, windowMs: 10 * 60_000 },
} as const;

async function rateKey(sessionId: string) {
  let ip = "";
  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    ip = (getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for")?.split(",")[0] ?? "").trim();
  } catch { /* not inside a request (tests) */ }
  return createHash("sha256").update(`rate:${ip || `s:${sessionId}`}`).digest("hex");
}

async function rateLimited(key: string, kind: keyof typeof RATE_LIMITS) {
  const { max, windowMs } = RATE_LIMITS[kind];
  const { count, error } = await db()
    .from("party_rate_events")
    .select("id", { count: "exact", head: true })
    .eq("key_hash", key)
    .eq("kind", kind)
    .gte("created_at", new Date(Date.now() - windowMs).toISOString());
  if (error) return false; // never lock friends out because the counter itself failed
  return (count ?? 0) >= max;
}

async function recordRate(key: string, kind: keyof typeof RATE_LIMITS) {
  await db().from("party_rate_events").insert({ key_hash: key, kind });
  // Occasional cleanup keeps the counter table small.
  if (Math.random() < 0.02) await db().from("party_rate_events").delete().lt("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());
}

/* ---------------------------------- Rooms --------------------------------- */

export async function createPartyRoom(input: { game?: PartyGameId | undefined; nickname: string; sessionId: string }) {
  const nickname = input.nickname.trim();
  if (!nickname) throw new Error("Coloca um apelido primeiro");
  const key = await rateKey(input.sessionId);
  if (await rateLimited(key, "create")) throw new Error("Muitas salas criadas em pouco tempo. Espere alguns minutos e tente de novo.");
  let room: RoomRow | null = null;
  for (let attempt = 0; attempt < 5 && !room; attempt += 1) {
    const code = await candidateCode();
    const { data, error } = await db()
      .from("party_rooms")
      .insert({ code, game: input.game ?? "lobby", settings: asJson(readPartySettings({})), public_state: asJson({ scores: {} }) })
      .select()
      .single();
    if (data) room = data;
    else if (error?.code !== "23505") {
      console.error("createPartyRoom: room insert failed", error?.code);
      throw new Error("Não foi possível criar a sala. Tente de novo.");
    }
    // 23505: another room took this code at the same moment; draw a new one.
  }
  if (!room) throw new Error("Não consegui gerar um código de sala. Tente de novo.");
  const { data: player, error: playerError } = await db()
    .from("party_players")
    .insert({ room_id: room.id, nickname, is_host: true })
    .select()
    .single();
  const { error: sessionError } = player
    ? await db().from("party_sessions").insert({ player_id: player.id, room_id: room.id, session_hash: hashSession(input.sessionId) })
    : { error: playerError };
  if (playerError || !player || sessionError) {
    // Compensate: an inaccessible room is removed (players and sessions cascade).
    await db().from("party_rooms").delete().eq("id", room.id);
    console.error("createPartyRoom: host setup failed", playerError?.code ?? sessionError?.code);
    throw new Error("Não foi possível criar a sala. Nada foi salvo, tente de novo.");
  }
  await recordRate(key, "create");
  return { code: room.code, roomId: room.id, playerId: player.id };
}

export async function joinPartyRoom(input: { code: string; nickname: string; sessionId: string }) {
  const code = input.code.trim().toUpperCase();
  const key = await rateKey(input.sessionId);
  if (await rateLimited(key, "join_miss")) throw new Error("Muitas tentativas com códigos errados. Espere alguns minutos e confira o código com quem criou a sala.");
  const { data: room } = await db().from("party_rooms").select("*").eq("code", code).maybeSingle();
  if (!room) {
    await recordRate(key, "join_miss");
    throw new Error("Sala não encontrada. Confira o código com quem criou a sala.");
  }
  const sessionHash = hashSession(input.sessionId);
  const { data: existing } = await db().from("party_sessions").select("player_id").eq("room_id", room.id).eq("session_hash", sessionHash).maybeSingle();
  if (existing) {
    // Same device again (retry after a network failure or returning later): reuse the seat, never duplicate it.
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
  if (error || !player) throw new Error("Não foi possível entrar na sala. Tente de novo.");
  const { error: sessionError } = await db().from("party_sessions").insert({ player_id: player.id, room_id: room.id, session_hash: sessionHash });
  if (sessionError) {
    // Compensate so a retry can join with the same nickname instead of hitting a ghost seat.
    await db().from("party_players").delete().eq("id", player.id);
    console.error("joinPartyRoom: session insert failed", sessionError.code);
    throw new Error("Não foi possível entrar na sala. Tente de novo.");
  }
  return { kind: "party" as const, code: room.code, roomId: room.id, playerId: player.id, reconnected: false };
}

/** Presence heartbeat: refreshes last_seen at most every TOUCH_THROTTLE_MS so it never floods realtime. */
export async function touchPartyPresence(input: { roomId: string; playerId: string; sessionId: string }) {
  await requireSession(input.roomId, input.playerId, input.sessionId);
  const now = Date.now();
  await db()
    .from("party_players")
    .update({ last_seen: new Date(now).toISOString() })
    .eq("id", input.playerId)
    .lt("last_seen", new Date(now - TOUCH_THROTTLE_MS).toISOString());
  return { ok: true as const };
}

export async function leavePartyRoom(input: { roomId: string; playerId: string; sessionId: string }) {
  const player = await requireSession(input.roomId, input.playerId, input.sessionId);
  await db().from("party_players").delete().eq("id", player.id);
  const remaining = await loadPlayers(input.roomId);
  if (remaining.length === 0) {
    await db().from("party_rooms").delete().eq("id", input.roomId);
    return { ok: true };
  }
  // Bots never keep a room alive or become host: with no people left, the room closes.
  const humans = remaining.filter((p) => !p.is_bot);
  if (humans.length === 0) {
    await db().from("party_rooms").delete().eq("id", input.roomId);
    return { ok: true };
  }
  if (!humans.some((p) => p.is_host)) {
    await Promise.all([
      db().from("party_players").update({ is_host: true }).eq("id", humans[0]!.id),
      ...remaining.filter((p) => p.is_bot && p.is_host).map((p) => db().from("party_players").update({ is_host: false }).eq("id", p.id)),
    ]);
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

/** Deletes a finished match's round rows; every failure is reported instead of silently ignored. */
async function clearRoundData(roomId: string) {
  const results = await Promise.all([
    db().from("party_submissions").delete().eq("room_id", roomId),
    // Positive rows are rounds, negative rows are the training bots' per-round cache; 0 is room history.
    db().from("party_private").delete().eq("room_id", roomId).neq("round_number", 0),
  ]);
  const failed = results.find((r) => r.error)?.error;
  if (failed) {
    console.error("clearRoundData failed", failed.code);
    throw new Error("Não foi possível preparar a sala. Tente de novo.");
  }
}

/** After a transition already committed, leftover rows are harmless (the next start clears again). */
async function clearAfterTransition(roomId: string) {
  await clearRoundData(roomId).catch(() => undefined);
}

/** Host picks (or changes) the game while the group waits in the lobby. */
export async function selectPartyGame(input: { roomId: string; playerId: string; sessionId: string; game: PartyGameId | "stop" }) {
  const [, room] = await Promise.all([requireHost(input.roomId, input.playerId, input.sessionId), loadRoom(input.roomId)]);
  if (room.status !== "lobby") throw new Error("Termine ou encerre a partida antes de trocar de jogo.");
  if (room.game === input.game) return { ok: true };
  const updated = await guardedUpdate(room, { game: input.game });
  if (!updated) throw new Error("A sala mudou ao mesmo tempo. Tente de novo.");
  return { ok: true };
}

/** Host sends everyone back to the group lobby, keeping the room code and every player. */
export async function returnPartyToLobby(input: { roomId: string; playerId: string; sessionId: string }) {
  const [, room] = await Promise.all([requireHost(input.roomId, input.playerId, input.sessionId), loadRoom(input.roomId)]);
  if (room.game === "lobby" && room.status === "lobby") return { ok: true };
  // Transition first (version-guarded); round data is only cleared once the room is safely in the lobby.
  const updated = await guardedUpdate(room, { ...RESET_TO_LOBBY, game: "lobby" });
  if (!updated) {
    const fresh = await loadRoom(room.id);
    if (fresh.game === "lobby" && fresh.status === "lobby") return { ok: true };
    throw new Error("A sala mudou ao mesmo tempo. Tente de novo.");
  }
  await clearAfterTransition(room.id);
  return { ok: true };
}

/** "Jogar novamente": same game, fresh scores, straight into round one. */
export async function replayPartyGame(input: { roomId: string; playerId: string; sessionId: string }) {
  await restartPartyRoom(input);
  return startPartyGame(input);
}

export async function updatePartySettings(input: { roomId: string; playerId: string; sessionId: string; settings: Partial<PartySettings> }) {
  const [, room] = await Promise.all([requireHost(input.roomId, input.playerId, input.sessionId), loadRoom(input.roomId)]);
  if (room.status === "playing") throw new Error("As regras só mudam antes da partida começar.");
  const settings = readPartySettings({ ...readPartySettings(room.settings), ...input.settings });
  const updated = await guardedUpdate(room, { settings: asJson(settings) });
  if (!updated) throw new Error("A sala mudou ao mesmo tempo. Tente de novo.");
  return { ok: true };
}

export async function startPartyGame(input: { roomId: string; playerId: string; sessionId: string }) {
  const [host, room] = await Promise.all([requireHost(input.roomId, input.playerId, input.sessionId), loadRoom(input.roomId)]);
  if (room.status === "playing") return { ok: true };
  if (!isPartyGame(room.game) && room.game !== "stop") throw new Error("Escolha um jogo primeiro.");
  const game = room.game;
  // The host pressing "Começar" is present by definition.
  await db().from("party_players").update({ last_seen: new Date().toISOString() }).eq("id", host.id);
  const players = activePlayers(await loadPlayers(room.id));
  const min = lobbyGameMeta(game).minPlayers;
  if (players.length < min) throw new Error(`Este jogo precisa de pelo menos ${min} jogadores conectados.`);
  // Claim the start (version bump) before touching round data: a repeated or concurrent
  // start loses here and leaves the winner's fresh round alone.
  const claimed = await guardedUpdate(room, RESET_TO_LOBBY);
  if (!claimed) return { ok: true };
  await clearRoundData(room.id);
  const scores = Object.fromEntries(players.map((p) => [p.id, 0]));
  const started = game === "stop"
    ? await startStopRound(claimed, players, 1, scores)
    : await startRound(claimed, players, 1, scores, readPartySettings(claimed.settings).skips);
  if (!started) {
    const fresh = await loadRoom(room.id);
    if (fresh.status === "playing") return { ok: true };
    throw new Error("Não foi possível começar a partida. A sala continua no lobby, tente de novo.");
  }
  return { ok: true };
}

export async function restartPartyRoom(input: { roomId: string; playerId: string; sessionId: string }) {
  const [, room] = await Promise.all([requireHost(input.roomId, input.playerId, input.sessionId), loadRoom(input.roomId)]);
  const updated = await guardedUpdate(room, RESET_TO_LOBBY);
  if (!updated) throw new Error("A sala mudou ao mesmo tempo. Tente de novo.");
  await clearAfterTransition(room.id);
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
    // Host theme: pick only among that theme's words (indices stay global, so "used" keeps working).
    const pool = INFILTRADO_WORDS.map((item, i) => ({ item, i })).filter(({ item }) => settings.infiltradoTheme === "todas" || item.category === settings.infiltradoTheme);
    const candidates = pool.length > 0 ? pool.map(({ i }) => i) : INFILTRADO_WORDS.map((_, i) => i);
    const usedHere = (used.infiltrado ?? []).filter((i) => candidates.includes(i));
    const index = candidates[pickUnused(candidates.length, usedHere.map((i) => candidates.indexOf(i)))] ?? 0;
    // Theme exhausted: start the theme over without forgetting other themes' history.
    if (usedHere.length >= candidates.length) used.infiltrado = (used.infiltrado ?? []).filter((i) => !candidates.includes(i));
    remember("infiltrado", index);
    const item = INFILTRADO_WORDS[index]!;
    data.word = item.word;
    data.category = item.category;
    data.infiltradoId = shuffle(players.map((p) => p.id))[0] ?? players[0]!.id;
    data.prompt = { title: `Categoria: ${item.category}`, text: "Escreva uma pista curta sobre a palavra secreta, sem entregá-la.", category: item.category, source: "banco" };
  } else if (game === "debate") {
    const judge = effectiveJudgeFor("debate", settings, players.length) === "ia" ? "o juiz" : "a galera";
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
  const [, room] = await Promise.all([requireHost(input.roomId, input.playerId, input.sessionId), loadRoom(input.roomId)]);
  if (room.phase !== "reveal" || room.round_number !== input.round) return { ok: true };
  return nextRoundFor(room);
}

/** Moves a revealed round on (next round or final podium); an open Stop appeal is settled first. */
async function nextRoundFor(initial: RoomRow) {
  let room = initial;
  const open = readPublicState(room.public_state).appeal;
  if (open?.status === "open") {
    if (!appealClosed(open, Date.now())) throw new Error("Espere a votação do recurso terminar.");
    room = (await settleAppeal(room)) ?? (await loadRoom(room.id));
    if (room.phase !== "reveal") return { ok: true };
  }
  const settings = readPartySettings(room.settings);
  const state = readPublicState(room.public_state);
  if (room.round_number >= settings.rounds) {
    // Debate/Tribunal with AI on: the podium shows right away and the AI awards fill in when ready.
    const withAwards = (room.game === "debate" || room.game === "tribunal") && settings.ai;
    const ended = await guardedUpdate(room, {
      status: "ended",
      phase: "final",
      phase_ends_at: null,
      ...(withAwards ? { public_state: asJson({ ...state, finalCommentary: { status: "pending" } }) } : {}),
    });
    if (!ended) return { ok: true };
    // Only the caller that ended the match adds it to the room's "Rei da Noite" tally.
    await addNightScores(room.id, state.scores ?? {});
    if (withAwards) await (room.game === "debate" ? buildDebateCommentary(ended) : buildTribunalCommentary(ended));
    return { ok: true };
  }
  // Long-silent players sit the round out (scores kept); they rejoin the next round once back.
  const players = activePlayers(await loadPlayers(room.id));
  const min = room.game === "stop" ? lobbyGameMeta("stop").minPlayers : PARTY_GAMES[gameOf(room)].minPlayers;
  if (players.length < min) throw new Error(`Faltam jogadores conectados: este jogo precisa de pelo menos ${min}. Quem saiu do app pode voltar pelo mesmo link.`);
  if (room.game === "stop") await startStopRound(room, players, room.round_number + 1, state.scores ?? {});
  else await startRound(room, players, room.round_number + 1, state.scores ?? {}, state.skipsLeft);
  return { ok: true };
}

export async function skipRoletaChallenge(input: { roomId: string; playerId: string; sessionId: string; round: number }) {
  const [, room] = await Promise.all([requireHost(input.roomId, input.playerId, input.sessionId), loadRoom(input.roomId)]);
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

function textPayload(payload: unknown, max: number) {
  const text = typeof (payload as { text?: unknown })?.text === "string" ? (payload as { text: string }).text.replace(/\s+/g, " ").trim() : "";
  if (!text) throw new Error("Escreva alguma coisa antes de enviar.");
  return { text: text.slice(0, max) };
}

function targetPayload(payload: unknown, voterId: string, allowed: readonly string[]) {
  const target = (payload as { target?: unknown })?.target;
  if (typeof target !== "string" || !allowed.includes(target)) throw new Error("Voto inválido.");
  if (target === voterId) throw new Error("Não vale votar em si mesmo.");
  return { target };
}

export async function submitPartyAction(input: { roomId: string; playerId: string; sessionId: string; round: number; phase: string; payload: unknown }) {
  const [player, room] = await Promise.all([requireSession(input.roomId, input.playerId, input.sessionId), loadRoom(input.roomId)]);
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
    payload = textPayload(input.payload, textMaxFor(game));
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
  const [player, room] = await Promise.all([requireSession(input.roomId, input.playerId, input.sessionId), loadRoom(input.roomId)]);
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
  // Independent reads in one round-trip (four requests, under the per-batch budget).
  const [admin, players, roundPrivate, subs] = await Promise.all([
    loadPartyAdmin(),
    loadPlayers(room.id),
    readPrivate<RoundPrivate>(room.id, room.round_number),
    submissionsFor(room, phase),
  ]);
  const tone = admin[game]?.tone;
  const present = new Set(players.map((p) => p.id));
  const presentIds = players.map((p) => p.id);
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
  const judgedByAi = effectiveJudgeFor(game, settings, presentIds.length) === "ia";

  if (game === "tribunal") {
    if (phase === "defense") {
      const entries = textEntries(subs, present).sort((a, b) => (a.playerId === state.defendantId ? -1 : b.playerId === state.defendantId ? 1 : 0));
      const voters = presentIds.filter((id) => id !== state.defendantId);
      if (judgedByAi) {
        if (entries.length === 0) return reveal({ notice: "Ninguém escreveu nada: o tribunal foi adiado sem pontos." }, {}, null);
        return claimJudge({ entries, eligible: [] });
      }
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
 * AI judge for Tribunal/Debate/Roleta. Entries reach the AI under neutral labels (no nicknames); scoring
 * stays in the deterministic engine. If the AI fails, the round falls back to a group vote instead of
 * stalling — except a Tribunal duel, where a one-person jury makes no sense, so it ends in a draw.
 */
async function runPartyJudge(room: RoomRow, presentIds: string[], settings: PartySettings, admin: PartyAdminConfig) {
  const game = gameOf(room);
  const state = readPublicState(room.public_state);
  const entries = (state.entries ?? []).filter((e) => e.playerId);
  const labelled = entries.map((entry, index) => ({ label: String(index + 1), id: entry.playerId!, text: entry.text }));
  const idOf = (label: string) => labelled.find((l) => l.label === label)?.id ?? null;
  const tone = admin[game]?.tone;
  const defendantId = state.defendantId ?? "";
  try {
    const ai = await import("./party-ai.server");
    let results: PartyResults;
    let deltas: Deltas;
    let text: string;
    if (game === "tribunal") {
      const defense = labelled.find((l) => l.id === defendantId)?.text ?? "(o réu ficou em silêncio)";
      const accusations = labelled.filter((l) => l.id !== defendantId).map((l, index) => ({ ...l, label: String(index + 1) }));
      const made = await ai.aiJudgeTribunal({
        caso: state.prompt?.text ?? "",
        defesa: defense,
        acusacoes: accusations.map((a) => ({ rotulo: a.label, texto: a.text })),
      }, tone);
      const bestAccuserId = made.bestLabel ? accusations.find((a) => a.label === made.bestLabel)?.id ?? null : null;
      const scored = scoreTribunalJudge({ defendantId, accuserIds: accusations.map((a) => a.id), verdict: made.verdict, bestAccuserId, bonus: made.bonus });
      results = {
        verdict: made.verdict,
        judge: { by: "ia", bestId: scored.bestAccuserId, bonus: Math.max(0, Math.min(2, Math.round(made.bonus))), sentence: made.sentence },
      };
      deltas = scored.deltas;
      text = made.reasoning;
    } else if (game === "debate") {
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
    if (game === "tribunal" && presentIds.length <= 2) {
      const scored = scoreTribunalJudge({ defendantId, accuserIds: presentIds.filter((id) => id !== defendantId), verdict: null, bonus: 0 });
      await guardedUpdate(room, {
        phase: "reveal",
        phase_started_at: new Date().toISOString(),
        phase_ends_at: null,
        public_state: asJson({
          ...state,
          submitted: [],
          results: { notice: "O Juiz de IA não respondeu a tempo. Empate técnico: +2 para cada um." },
          deltas: scored.deltas,
          scores: addScores(state.scores ?? {}, scored.deltas),
          ai: { status: "off" },
        }),
      });
      return;
    }
    const voters = game === "tribunal" ? presentIds.filter((id) => id !== defendantId) : presentIds;
    await guardedUpdate(room, {
      phase: "vote",
      phase_started_at: new Date().toISOString(),
      phase_ends_at: deadline(game, "vote", admin, settings),
      public_state: asJson({ ...state, eligible: voters, submitted: [], ai: { status: "failed", text: "O juiz de IA não respondeu. Desta vez, votem vocês!" } }),
    });
  }
}

/**
 * Debate podium: the AI hands out comic awards for the whole match. Runs once, after the room reached
 * "final"; a failure only marks the card as failed, the ranking is already final.
 */
async function buildDebateCommentary(room: RoomRow) {
  const admin = await loadPartyAdmin();
  const [players, { data: subs }, { data: rounds }] = await Promise.all([
    loadPlayers(room.id),
    db().from("party_submissions").select("round_number, player_id, payload").eq("room_id", room.id).eq("phase", "argue"),
    db().from("party_private").select("round_number, data").eq("room_id", room.id).gt("round_number", 0).order("round_number"),
  ]);
  const state = readPublicState(room.public_state);
  const scores = state.scores ?? {};
  const label = new Map(players.map((p, index) => [p.id, `J${index + 1}`]));
  const idOf = (value: string) => players.find((p) => label.get(p.id) === value)?.id ?? null;
  let finalCommentary: PartyPublicState["finalCommentary"];
  try {
    const rodadas = (rounds ?? []).map((row) => {
      const data = (row.data ?? {}) as RoundPrivate;
      const args = (subs ?? [])
        .filter((s) => s.round_number === row.round_number && label.has(s.player_id))
        .map((s) => ({ rotulo: label.get(s.player_id)!, lado: data.sides?.[s.player_id] ?? ("A" as const), texto: String((s.payload as PartyMine | null)?.text ?? "").slice(0, 400) }))
        .filter((a) => a.texto);
      return { tema: data.prompt?.title ?? "", lado_a: data.prompt?.sideA ?? "", lado_b: data.prompt?.sideB ?? "", argumentos: args };
    }).filter((r) => r.argumentos.length > 0);
    if (rodadas.length === 0) throw new Error("sem argumentos");
    const made = await (await import("./party-ai.server")).aiMatchSummaryDebate({
      rodadas,
      jogadores: players.map((p) => ({ rotulo: label.get(p.id)!, apelido: p.nickname, pontos: scores[p.id] ?? 0 })),
    }, admin.debate?.tone);
    const highlights = made.highlights.map((h) => ({ playerId: idOf(h.label) ?? "", title: h.title, text: h.text })).filter((h) => h.playerId);
    finalCommentary = { status: "ready", title: "Sentença Final da Corte", highlights, summary: made.summary };
  } catch {
    finalCommentary = { status: "failed" };
  }
  await guardedUpdate(room, { public_state: asJson({ ...state, finalCommentary }) });
}

/** Tribunal podium: comic awards (best alibi, toughest prosecutor) and a summary of the group's "criminal record". */
async function buildTribunalCommentary(room: RoomRow) {
  const admin = await loadPartyAdmin();
  const [players, { data: subs }, { data: rounds }] = await Promise.all([
    loadPlayers(room.id),
    db().from("party_submissions").select("round_number, player_id, payload").eq("room_id", room.id).eq("phase", "defense"),
    db().from("party_private").select("round_number, data").eq("room_id", room.id).gt("round_number", 0).order("round_number"),
  ]);
  const state = readPublicState(room.public_state);
  const scores = state.scores ?? {};
  const label = new Map(players.map((p, index) => [p.id, `J${index + 1}`]));
  const idOf = (value: string) => players.find((p) => label.get(p.id) === value)?.id ?? null;
  let finalCommentary: PartyPublicState["finalCommentary"];
  try {
    const casos = (rounds ?? []).map((row) => {
      const data = (row.data ?? {}) as RoundPrivate;
      const texts = (subs ?? []).filter((s) => s.round_number === row.round_number && label.has(s.player_id));
      const text = (id: string) => String((texts.find((s) => s.player_id === id)?.payload as PartyMine | null)?.text ?? "").slice(0, 400);
      const defendantId = data.defendantId ?? "";
      return {
        caso: data.prompt?.text ?? "",
        reu: label.get(defendantId) ?? "?",
        defesa: text(defendantId),
        acusacoes: texts.filter((s) => s.player_id !== defendantId).map((s) => ({ rotulo: label.get(s.player_id)!, texto: text(s.player_id) })).filter((a) => a.texto),
      };
    }).filter((c) => c.defesa || c.acusacoes.length > 0);
    if (casos.length === 0) throw new Error("sem casos");
    const made = await (await import("./party-ai.server")).aiMatchSummaryTribunal({
      casos,
      jogadores: players.map((p) => ({ rotulo: label.get(p.id)!, apelido: p.nickname, pontos: scores[p.id] ?? 0 })),
    }, admin.tribunal?.tone);
    const highlights = made.highlights.map((h) => ({ playerId: idOf(h.label) ?? "", title: h.title, text: h.text })).filter((h) => h.playerId);
    finalCommentary = { status: "ready", title: "Veredito da História", highlights, summary: made.summary };
  } catch {
    finalCommentary = { status: "failed" };
  }
  await guardedUpdate(room, { public_state: asJson({ ...state, finalCommentary }) });
}

/** "Rei da Noite": each finished match adds its points to party_players.score, at most six writes at a time. */
async function addNightScores(roomId: string, scores: Record<string, number>) {
  const players = await loadPlayers(roomId);
  const updates = players.filter((p) => (scores[p.id] ?? 0) > 0);
  for (let i = 0; i < updates.length; i += 6) {
    await Promise.all(updates.slice(i, i + 6).map((p) => db().from("party_players").update({ score: p.score + (scores[p.id] ?? 0) }).eq("id", p.id)));
  }
}

/* ---------------------------------- Chat ----------------------------------- */

export async function listPartyChat(input: { roomId: string; playerId: string; sessionId: string }) {
  await requireSession(input.roomId, input.playerId, input.sessionId);
  const { data, error } = await db()
    .from("party_chat")
    .select("id, room_id, player_id, nickname, content, created_at")
    .eq("room_id", input.roomId)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw new Error("Não foi possível carregar o chat.");
  return (data ?? []).reverse();
}

export async function sendPartyChat(input: { roomId: string; playerId: string; sessionId: string; content: string }) {
  const [player, room] = await Promise.all([requireSession(input.roomId, input.playerId, input.sessionId), loadRoom(input.roomId)]);
  const content = input.content.replace(/\s+/g, " ").trim().slice(0, PARTY_CHAT_MAX);
  if (!content) throw new Error("Escreva uma mensagem.");
  // While Stop answers are open, only one-tap reactions go through, so nobody can share answers.
  const stopWriting = room.game === "stop" && room.status === "playing" && room.phase === "write";
  if (stopWriting && !(PARTY_CHAT_QUICK as readonly string[]).includes(content)) {
    throw new Error("Durante as respostas do Stop, só valem as reações rápidas.");
  }
  // Light flood guard: at most 5 messages from the same player in 10 seconds.
  const since = new Date(Date.now() - 10_000).toISOString();
  const { count } = await db().from("party_chat").select("id", { count: "exact", head: true }).eq("room_id", room.id).eq("player_id", player.id).gte("created_at", since);
  if ((count ?? 0) >= 5) throw new Error("Calma! Espere uns segundos para mandar mais.");
  const { data, error } = await db()
    .from("party_chat")
    .insert({ room_id: room.id, player_id: player.id, nickname: player.nickname, content })
    .select("id, room_id, player_id, nickname, content, created_at")
    .single();
  if (error || !data) throw new Error("Não foi possível enviar.");
  return data;
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
    // Training bots that were still "writing" hand in what they had when the round closed.
    await fillStopBots(room, state, true).catch(() => undefined);
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
  const [player, room] = await Promise.all([requireSession(input.roomId, input.playerId, input.sessionId), loadRoom(input.roomId)]);
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

/* ------------------------------ Training bots ------------------------------ */

async function inBatches<T>(items: readonly T[], run: (item: T) => PromiseLike<unknown>) {
  for (let i = 0; i < items.length; i += 6) await Promise.all(items.slice(i, i + 6).map(run));
}

async function readBotCache(roomId: string, round: number) {
  return readPrivate<BotCache>(roomId, -round);
}

async function writeBotCache(roomId: string, round: number, cache: BotCache) {
  await db().from("party_private").upsert({ room_id: roomId, round_number: -round, data: asJson(cache) }, { onConflict: "room_id,round_number" });
}

/** Bots' Stop answers for the round: generated once (AI, falling back to a built-in bank) and cached. */
async function botStopAnswers(room: RoomRow, stop: StopRoundState, bots: PlayerRow[]) {
  const cache = await readBotCache(room.id, room.round_number);
  const known = cache.stop ?? {};
  const missing = bots.filter((b) => !known[b.id]);
  if (missing.length === 0) return known;
  let made: Record<string, Record<string, string>> = {};
  try {
    const labels = missing.map((_, i) => `R${i + 1}`);
    const ai = await (await import("./party-ai.server")).aiBotStopAnswers({ letra: stop.letter, categorias: stop.categories, bots: labels });
    made = Object.fromEntries(missing.map((b, i) => [b.id, ai[labels[i]!] ?? {}]));
  } catch { made = {}; }
  const next = { ...known };
  for (const bot of missing) {
    const fallback = fallbackStopAnswers(bot.id, room.round_number, stop.letter, stop.categories);
    const fromAi = made[bot.id] ?? {};
    next[bot.id] = Object.fromEntries(stop.categories.map((c) => [c, fromAi[c] !== undefined && (fromAi[c] === "" || fromAi[c]!.toUpperCase().startsWith(stop.letter)) ? fromAi[c]! : fallback[c] ?? ""]));
  }
  await writeBotCache(room.id, room.round_number, { ...cache, stop: next });
  return next;
}

/**
 * Hands in Stop answers for bots whose "thinking time" is over (or all of them when the round is closing).
 * A bot interrupted early (somebody shouted STOP) only gets part of its categories filled.
 */
async function fillStopBots(room: RoomRow, state: PartyPublicState, force: boolean, known?: PlayerRow[]) {
  const stop = state.stop;
  if (!stop) return [];
  const players = known ?? (await loadPlayers(room.id));
  const eligible = new Set(state.eligible ?? []);
  const bots = players.filter((p) => p.is_bot && eligible.has(p.id));
  if (bots.length === 0) return [];
  const now = Date.now();
  const startedAt = Date.parse(stop.startsAt);
  if (now < startedAt) return [];
  const subs = await submissionsFor(room, "write");
  const done = new Set(subs.filter((s) => s.payload?.done === true).map((s) => s.player_id));
  const pending = bots.filter((b) => !done.has(b.id));
  if (pending.length === 0) return [];
  const endsAt = room.phase_ends_at ? Date.parse(room.phase_ends_at) : null;
  const phaseSeconds = endsAt ? (endsAt - startedAt) / 1000 : readPartySettings(room.settings).stopSeconds;
  const delay = (bot: PlayerRow) => botDelayMs({ botId: bot.id, round: room.round_number, phase: "write", kind: "stop", phaseSeconds });
  const humansDone = players.filter((p) => !p.is_bot && eligible.has(p.id)).every((p) => done.has(p.id));
  const urgent = force || Boolean(stop.stopBy) || humansDone || (endsAt !== null && endsAt - now < 3_000);
  const due = pending.filter((b) => urgent || now - startedAt >= delay(b));
  if (due.length === 0) return [];
  const cache = await botStopAnswers(room, stop, bots);
  const rows = due.map((bot) => {
    const full = cache[bot.id] ?? fallbackStopAnswers(bot.id, room.round_number, stop.letter, stop.categories);
    const progress = Math.min(1, Math.max(0.3, (now - startedAt) / Math.max(1, delay(bot))));
    const keep = Math.ceil(stop.categories.length * progress);
    const answers = sanitizeStopAnswers(Object.fromEntries(stop.categories.map((c, i) => [c, i < keep ? full[c] ?? "" : ""])), stop.categories);
    return { bot, answers };
  });
  await inBatches(rows, (row) =>
    db().from("party_submissions").upsert(
      { room_id: room.id, round_number: room.round_number, phase: "write", player_id: row.bot.id, payload: asJson({ answers: row.answers, done: true }) },
      { onConflict: "room_id,round_number,phase,player_id" },
    ),
  );
  return rows;
}

/** A bot with every category filled sometimes shouts STOP!, locking answers in three seconds like a person would. */
async function botShoutStop(roomId: string, botId: string, round: number) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const room = await loadRoom(roomId);
    const state = readPublicState(room.public_state);
    if (room.game !== "stop" || room.phase !== "write" || room.round_number !== round || !state.stop || state.stop.stopBy) return;
    const lockAt = Date.now() + STOP_LOCK_MS;
    const endsAt = room.phase_ends_at ? Math.min(Date.parse(room.phase_ends_at), lockAt) : lockAt;
    const updated = await guardedUpdate(room, {
      phase_ends_at: new Date(endsAt).toISOString(),
      public_state: asJson({ ...state, stop: { ...state.stop, stopBy: botId, stopAt: new Date().toISOString() } }),
    });
    if (updated) return;
  }
}

type BotRole = { papel: string; fallback: string; contexto: string };

function botRole(game: PartyGameId, bot: PlayerRow, state: PartyPublicState, rp: RoundPrivate): BotRole {
  const prompt = state.prompt;
  if (game === "tribunal") {
    const defendant = bot.id === state.defendantId;
    return { papel: defendant ? "réu: escreve a própria defesa" : "acusador: escreve a acusação contra o réu", fallback: defendant ? "defesa" : "acusacao", contexto: prompt?.text ?? "" };
  }
  if (game === "infiltrado") {
    const infiltrado = rp.infiltradoId === bot.id;
    return {
      papel: infiltrado ? `infiltrado: NÃO sabe a palavra, só a categoria ${rp.category ?? ""}; blefa com uma pista vaga` : `cidadão: a palavra secreta é "${rp.word ?? ""}"; dá uma pista curta sem dizer a palavra`,
      fallback: "pista",
      contexto: prompt?.title ?? "",
    };
  }
  if (game === "debate") {
    const side = state.sides?.[bot.id] ?? "A";
    return { papel: `defende o lado ${side}: ${side === "A" ? prompt?.sideA ?? "" : prompt?.sideB ?? ""}`, fallback: "debate", contexto: prompt?.title ?? "" };
  }
  if (game === "autor") return { papel: "responde à pergunta de forma engraçada", fallback: "autor", contexto: prompt?.text ?? "" };
  return { papel: "responde ao desafio", fallback: "roleta", contexto: prompt?.text ?? "" };
}

/** Bots' texts for the current writing phase, generated once per prompt and cached (AI only when the room has AI on). */
async function botTexts(room: RoomRow, state: PartyPublicState, rp: RoundPrivate, bots: PlayerRow[]) {
  const game = gameOf(room);
  const prefix = `${room.phase}:${Math.round(seededUnit(state.prompt?.text ?? "") * 1e5)}:`;
  const cache = await readBotCache(room.id, room.round_number);
  const texts = { ...(cache.texts ?? {}) };
  const missing = bots.filter((b) => !texts[prefix + b.id]);
  if (missing.length > 0) {
    const roles = missing.map((b) => botRole(game, b, state, rp));
    let made: Record<string, string> = {};
    if (readPartySettings(room.settings).ai) {
      try {
        made = await (await import("./party-ai.server")).aiBotTexts({
          jogo: lobbyGameMeta(game).name,
          contexto: roles[0]?.contexto ?? "",
          papeis: missing.map((_, i) => ({ rotulo: `R${i + 1}`, papel: roles[i]!.papel })),
        });
      } catch { made = {}; }
    }
    missing.forEach((bot, i) => {
      texts[prefix + bot.id] = made[`R${i + 1}`] ?? fallbackBotLine(roles[i]!.fallback, `${bot.id}:${room.round_number}:${room.phase}`);
    });
    await writeBotCache(room.id, room.round_number, { ...cache, texts });
  }
  return Object.fromEntries(bots.map((b) => [b.id, texts[prefix + b.id] ?? ""]));
}

function botVotePayload(game: PartyGameId, phase: PartyPhaseId, bot: PlayerRow, state: PartyPublicState, rp: RoundPrivate, round: number): Record<string, unknown> | null {
  const seed = `${bot.id}:${round}:${phase}`;
  if (game === "tribunal") return { verdict: seededUnit(seed) < 0.5 ? "culpado" : "inocente" };
  if (game === "autor" && phase === "guess") {
    const own = rp.entries?.find((e) => e.authorId === bot.id)?.id;
    const authors = [...new Set((rp.entries ?? []).map((e) => e.authorId))].filter((id) => id !== bot.id);
    const guesses: Record<string, string> = {};
    for (const entry of state.entries ?? []) {
      if (entry.id === own) continue;
      const pick = seededPick(authors, `${seed}:${entry.id}`);
      if (pick) guesses[entry.id] = pick;
    }
    return Object.keys(guesses).length > 0 ? { guesses } : null;
  }
  const allowed = game === "infiltrado" ? (state.eligible ?? []) : (state.entries ?? []).map((e) => e.playerId).filter((id): id is string => Boolean(id));
  const target = seededPick(allowed.filter((id) => id !== bot.id), seed);
  return target ? { target } : null;
}

async function tickPartyGameBots(room: RoomRow, state: PartyPublicState, players: PlayerRow[]) {
  const game = gameOf(room);
  const phase = room.phase as PartyPhaseId;
  const kind: BotActionKind | null = TEXT_PHASES.includes(phase) ? "text" : phase === "vote" || phase === "guess" ? "vote" : null;
  if (!kind) return 0;
  const eligible = new Set(state.eligible ?? []);
  const bots = players.filter((p) => p.is_bot && eligible.has(p.id));
  if (bots.length === 0) return 0;
  const subs = await submissionsFor(room, room.phase);
  const done = new Set(subs.map((s) => s.player_id));
  const pending = bots.filter((b) => !done.has(b.id));
  if (pending.length === 0) return 0;
  const now = Date.now();
  const startedAt = Date.parse(room.phase_started_at ?? room.updated_at);
  const endsAt = room.phase_ends_at ? Date.parse(room.phase_ends_at) : null;
  const phaseSeconds = endsAt ? (endsAt - startedAt) / 1000 : null;
  const humansDone = players.filter((p) => !p.is_bot && eligible.has(p.id)).every((p) => done.has(p.id));
  const urgent = humansDone || (endsAt !== null && endsAt - now < 3_000);
  const due = pending.filter((b) => urgent || now - startedAt >= botDelayMs({ botId: b.id, round: room.round_number, phase: room.phase, kind, phaseSeconds }));
  const rp = await readPrivate<RoundPrivate>(room.id, room.round_number);
  // Texts are prepared on the first tick so a slow AI never delays the bots' turn.
  const texts = kind === "text" && !(game === "infiltrado" && phase === "last_guess") ? await botTexts(room, state, rp, pending) : {};
  if (due.length === 0) return 0;
  const rows = due
    .map((bot) => {
      let payload: Record<string, unknown> | null;
      if (kind === "vote") payload = botVotePayload(game, phase, bot, state, rp, room.round_number);
      else if (game === "infiltrado" && phase === "last_guess") {
        const pick = seededPick(INFILTRADO_WORDS.filter((w) => w.category === rp.category), `${bot.id}:${room.round_number}:guess`);
        payload = { text: pick?.word ?? "Não faço ideia" };
      } else payload = textPayload({ text: texts[bot.id] || fallbackBotLine(botRole(game, bot, state, rp).fallback, bot.id) }, textMaxFor(game));
      return payload ? { bot, payload } : null;
    })
    .filter((row): row is { bot: PlayerRow; payload: Record<string, unknown> } => row !== null);
  await inBatches(rows, (row) =>
    db().from("party_submissions").upsert(
      { room_id: room.id, round_number: room.round_number, phase: room.phase, player_id: row.bot.id, payload: asJson(row.payload) },
      { onConflict: "room_id,round_number,phase,player_id" },
    ),
  );
  return rows.length;
}

/** Bots vote on an open "Recorrer ao Juiz" a few seconds after it opens. */
async function botsVoteOnAppeal(room: RoomRow, state: PartyPublicState, players: PlayerRow[]) {
  const appeal = state.appeal;
  if (room.game !== "stop" || appeal?.status !== "open") return 0;
  const openedAt = Date.parse(appeal.endsAt) - APPEAL_SECONDS * 1000;
  const now = Date.now();
  const bots = players.filter((p) => p.is_bot && appeal.voters.includes(p.id) && !appeal.votes[p.id]);
  const due = bots.filter((b) => now - openedAt >= 3_000 + seededUnit(`${b.id}:${room.round_number}:appeal`) * 4_000);
  if (due.length === 0) {
    if (appealClosed(appeal, now)) await settleAppeal(room);
    return 0;
  }
  const votes = { ...appeal.votes };
  for (const bot of due) votes[bot.id] = seededUnit(`${bot.id}:${appeal.category}:vote`) < 0.5 ? "aceitar" : "manter";
  const next: StopAppeal = { ...appeal, votes };
  const updated = await guardedUpdate(room, { public_state: asJson({ ...state, appeal: next }) });
  if (updated && appealClosed(next, Date.now())) await settleAppeal(updated);
  return due.length;
}

/** Host device heartbeat while bots play: each due bot acts once; the server re-checks phase and timing. */
export async function tickPartyBots(input: { roomId: string; playerId: string; sessionId: string }) {
  const [, room] = await Promise.all([requireHost(input.roomId, input.playerId, input.sessionId), loadRoom(input.roomId)]);
  if (room.status !== "playing") return { ok: true, acted: 0 };
  const players = await loadPlayers(room.id);
  if (!players.some((p) => p.is_bot)) return { ok: true, acted: 0 };
  const state = readPublicState(room.public_state);
  if (room.phase === "reveal") return { ok: true, acted: await botsVoteOnAppeal(room, state, players) };
  if (room.game === "stop") {
    if (room.phase !== "write" || !state.stop) return { ok: true, acted: 0 };
    const eligible = new Set(state.eligible ?? []);
    await botStopAnswers(room, state.stop, players.filter((p) => p.is_bot && eligible.has(p.id)));
    const rows = await fillStopBots(room, state, false, players);
    if (rows.length > 0) {
      const humans = players.filter((p) => !p.is_bot && eligible.has(p.id));
      const subs = await submissionsFor(room, "write");
      const humansDone = humans.every((h) => subs.some((s) => s.player_id === h.id && s.payload?.done === true));
      const shouter = rows.find((r) => stopAnswersComplete(r.answers, state.stop!.categories) && seededUnit(`${r.bot.id}:${room.round_number}:shout`) < 0.3);
      if (shouter && !state.stop.stopBy && !humansDone) await botShoutStop(room.id, shouter.bot.id, room.round_number);
      await syncSubmitted(room.id);
    }
    return { ok: true, acted: rows.length };
  }
  if (!isPartyGame(room.game)) return { ok: true, acted: 0 };
  const acted = await tickPartyGameBots(room, state, players);
  if (acted > 0) await syncSubmitted(room.id);
  return { ok: true, acted };
}

/* ------------------------ Developer room controls -------------------------- */

export type DevRoomAction = "addBot" | "removeBots" | "kick" | "forceAdvance" | "toLobby";

/** Developer tools for the room the developer is in: training bots, skipping a stuck step, kicking, resetting. */
export async function devRoomAction(input: { token?: string | undefined; roomId: string; playerId: string; sessionId: string; action: DevRoomAction; targetId?: string | undefined }) {
  await requireDeveloper(input.token);
  const me = await requireSession(input.roomId, input.playerId, input.sessionId);
  const room = await loadRoom(input.roomId);
  const players = await loadPlayers(room.id);

  if (input.action === "addBot") {
    if (room.status === "playing") throw new Error("Adicione robôs antes de a partida começar.");
    if (players.filter((p) => p.is_bot).length >= MAX_BOTS) throw new Error(`No máximo ${MAX_BOTS} robôs por sala.`);
    if (players.length >= MAX_PLAYERS) throw new Error(`A sala está cheia (máximo de ${MAX_PLAYERS}).`);
    const { error } = await db().from("party_players").insert({ room_id: room.id, nickname: nextBotName(players.map((p) => p.nickname)), is_bot: true, is_host: false });
    if (error) throw new Error("Não foi possível adicionar o robô.");
    return { ok: true };
  }
  if (input.action === "removeBots") {
    await db().from("party_players").delete().eq("room_id", room.id).eq("is_bot", true);
    if (room.status === "playing") await syncSubmitted(room.id);
    return { ok: true };
  }
  if (input.action === "kick") {
    const target = players.find((p) => p.id === input.targetId);
    if (!target) throw new Error("Esse jogador já saiu.");
    if (target.id === me.id) throw new Error("Para sair, use o botão Sair da sala.");
    await db().from("party_players").delete().eq("id", target.id);
    if (target.is_host) {
      const heir = players.find((p) => p.id !== target.id && !p.is_bot);
      if (heir) await db().from("party_players").update({ is_host: true }).eq("id", heir.id);
    }
    if (room.status === "playing") await syncSubmitted(room.id);
    return { ok: true };
  }
  if (input.action === "toLobby") {
    await clearRoundData(room.id);
    const updated = await guardedUpdate(room, { ...RESET_TO_LOBBY, game: "lobby" });
    if (!updated) throw new Error("A sala mudou ao mesmo tempo. Tente de novo.");
    return { ok: true };
  }
  // forceAdvance: close the current step now, whatever the clock says.
  if (room.status !== "playing") throw new Error("Nenhuma partida em andamento.");
  if (room.phase === "reveal") {
    let current = room;
    if (readPublicState(room.public_state).appeal?.status === "open") current = (await settleAppeal(room)) ?? (await loadRoom(room.id));
    await nextRoundFor(current);
    return { ok: true };
  }
  if (room.phase === "evaluating") {
    // Let a stuck judge be retried right away by expiring its claim.
    const expired = await guardedUpdate(room, { phase_ends_at: new Date(Date.now() - 1_000).toISOString() });
    if (expired) await advance(expired);
    return { ok: true };
  }
  await advance(room);
  return { ok: true };
}

/* --------------------------- Stop: "Recorrer ao Juiz" --------------------------- */

function isStopReveal(room: RoomRow, round: number) {
  return room.game === "stop" && room.status === "playing" && room.phase === "reveal" && room.round_number === round;
}

export async function openStopAppeal(input: { roomId: string; playerId: string; sessionId: string; round: number; category: string }) {
  const player = await requireSession(input.roomId, input.playerId, input.sessionId);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const room = await loadRoom(input.roomId);
    if (!isStopReveal(room, input.round)) throw new Error("O resultado desta rodada já foi encerrado.");
    const state = readPublicState(room.public_state);
    const results = state.results?.stop ?? [];
    const blocker = appealBlocker({ results, playerId: player.id, category: input.category, current: state.appeal, used: state.appealsUsed ?? [] });
    if (blocker) throw new Error(blocker);
    const players = await loadPlayers(room.id);
    const voters = players.map((p) => p.id).filter((id) => id !== player.id);
    if (voters.length === 0) throw new Error("Não há ninguém para votar no recurso.");
    const row = results.find((r) => r.jogador_id === player.id && r.categoria === input.category)!;
    const appeal: StopAppeal = { playerId: player.id, category: input.category, answer: row.resposta, voters, votes: {}, endsAt: new Date(Date.now() + APPEAL_SECONDS * 1000).toISOString(), status: "open" };
    const updated = await guardedUpdate(room, { public_state: asJson({ ...state, appeal, appealsUsed: [...(state.appealsUsed ?? []), player.id] }) });
    if (updated) return { ok: true };
  }
  throw new Error("A sala mudou ao mesmo tempo. Tente de novo.");
}

export async function voteStopAppeal(input: { roomId: string; playerId: string; sessionId: string; round: number; vote: AppealVote }) {
  const player = await requireSession(input.roomId, input.playerId, input.sessionId);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const room = await loadRoom(input.roomId);
    if (!isStopReveal(room, input.round)) throw new Error("O resultado desta rodada já foi encerrado.");
    const state = readPublicState(room.public_state);
    const appeal = state.appeal;
    if (appeal?.status !== "open") throw new Error("Esse recurso já foi decidido.");
    if (!appeal.voters.includes(player.id)) throw new Error("Só os outros jogadores votam neste recurso.");
    if (appealClosed(appeal, Date.now())) {
      await settleAppeal(room);
      return { ok: true };
    }
    const next: StopAppeal = { ...appeal, votes: { ...appeal.votes, [player.id]: input.vote } };
    const updated = await guardedUpdate(room, { public_state: asJson({ ...state, appeal: next }) });
    if (updated) {
      if (appealClosed(next, Date.now())) await settleAppeal(updated);
      return { ok: true };
    }
  }
  throw new Error("A sala mudou ao mesmo tempo. Tente de novo.");
}

/** Any player may close an appeal once its time is up; the server re-checks the deadline. */
export async function resolveStopAppeal(input: { roomId: string; playerId: string; sessionId: string; round: number }) {
  await requireSession(input.roomId, input.playerId, input.sessionId);
  const room = await loadRoom(input.roomId);
  if (!isStopReveal(room, input.round)) return { ok: true };
  const appeal = readPublicState(room.public_state).appeal;
  if (appeal?.status === "open" && appealClosed(appeal, Date.now())) await settleAppeal(room);
  return { ok: true };
}

/** Version-guarded: applies the group's decision once; an accepted appeal adds its points to the round and the match. */
async function settleAppeal(room: RoomRow): Promise<RoomRow | null> {
  const state = readPublicState(room.public_state);
  const appeal = state.appeal;
  if (appeal?.status !== "open") return room;
  const { accepted } = appealOutcome(appeal.votes);
  if (!accepted) return guardedUpdate(room, { public_state: asJson({ ...state, appeal: { ...appeal, status: "rejected" } }) });
  const results = state.results?.stop ?? [];
  const points = appealPoints(results, appeal.playerId, appeal.category, appeal.answer);
  const nextResults = results.map((r) => r.jogador_id === appeal.playerId && r.categoria === appeal.category ? { ...r, pontos: points, comentario: `⚖️ Recurso aceito pela galera: +${points}.` } : r);
  const deltas = { ...(state.deltas ?? {}), [appeal.playerId]: (state.deltas?.[appeal.playerId] ?? 0) + points };
  return guardedUpdate(room, {
    public_state: asJson({
      ...state,
      results: { ...(state.results ?? {}), stop: nextResults },
      deltas,
      scores: addScores(state.scores ?? {}, { [appeal.playerId]: points }),
      appeal: { ...appeal, status: "accepted", points },
    }),
  });
}
