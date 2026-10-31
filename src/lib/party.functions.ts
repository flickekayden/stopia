import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const session = { roomId: z.string().uuid(), playerId: z.string().uuid(), sessionId: z.string().uuid() };
const gameId = z.enum(["tribunal", "autor", "infiltrado", "debate", "roleta"]);
const server = () => import("./party.server");
/** Game payloads are small JSON objects; the size cap keeps oversized or deeply nested input out of the database. */
const MAX_PAYLOAD_BYTES = 8_000;
const payload = z
  .record(z.string().max(60), z.unknown())
  .refine((value) => Object.keys(value).length <= 40 && JSON.stringify(value).length <= MAX_PAYLOAD_BYTES, "Resposta grande demais");
const stopAnswers = z
  .record(z.string().max(160), z.string().max(400))
  .refine((value) => Object.keys(value).length <= 30, "Categorias demais");

export const createPartyRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ game: gameId.optional(), nickname: z.string().trim().min(1).max(20), sessionId: z.string().uuid(), accessToken: z.string().max(4096).optional(), guestToken: z.string().max(80).optional() }).parse(input),
  )
  .handler(async ({ data }) => (await server()).createPartyRoom(data));

export const joinPartyRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ code: z.string().trim().min(4).max(4), nickname: z.string().trim().max(20), sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => (await server()).joinPartyRoom(data));

export const leavePartyRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(session).parse(input))
  .handler(async ({ data }) => (await server()).leavePartyRoom(data));

export const updatePartySettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        ...session,
        settings: z.object({
          rounds: z.number().int().optional(),
          ai: z.boolean().optional(),
          intensity: z.enum(["leve", "media", "caotica"]).optional(),
          skips: z.number().int().optional(),
          tribunalSeconds: z.number().int().optional(),
          tribunalJudge: z.enum(["auto", "ia", "voto"]).optional(),
          debateSeconds: z.number().int().optional(),
          debateJudge: z.enum(["auto", "ia", "voto"]).optional(),
          roletaSeconds: z.number().int().optional(),
          roletaJudge: z.enum(["auto", "ia", "voto"]).optional(),
          autorSeconds: z.number().int().optional(),
          infiltradoTheme: z.string().max(40).optional(),
          stopSeconds: z.number().int().optional(),
          scoring: z.enum(["fixed", "free"]).optional(),
          aiIntensity: z.enum(["leve", "padrao", "acida"]).optional(),
          categories: z.array(z.string().max(160)).min(1).max(250).optional(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const settings = Object.fromEntries(Object.entries(data.settings).filter(([, value]) => value !== undefined));
    return (await server()).updatePartySettings({ ...data, settings });
  });

export const startPartyGame = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(session).parse(input))
  .handler(async ({ data }) => (await server()).startPartyGame(data));

export const restartPartyRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(session).parse(input))
  .handler(async ({ data }) => (await server()).restartPartyRoom(data));

export const nextPartyRound = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ ...session, round: z.number().int().min(1) }).parse(input))
  .handler(async ({ data }) => (await server()).nextPartyRound(data));

export const skipRoletaChallenge = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ ...session, round: z.number().int().min(1) }).parse(input))
  .handler(async ({ data }) => (await server()).skipRoletaChallenge(data));

export const submitPartyAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ ...session, round: z.number().int().min(1), phase: z.string().max(20), payload }).parse(input),
  )
  .handler(async ({ data }) => (await server()).submitPartyAction(data));

export const advancePartyPhase = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ ...session, round: z.number().int().min(1), phase: z.string().max(20) }).parse(input))
  .handler(async ({ data }) => (await server()).advancePartyPhase(data));

export const getPartyPrivateView = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(session).parse(input))
  .handler(async ({ data }) => (await server()).getPartyPrivateView(data));

export const selectPartyGame = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ ...session, game: z.union([gameId, z.literal("stop")]) }).parse(input))
  .handler(async ({ data }) => (await server()).selectPartyGame(data));

export const returnPartyToLobby = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(session).parse(input))
  .handler(async ({ data }) => (await server()).returnPartyToLobby(data));

export const replayPartyGame = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(session).parse(input))
  .handler(async ({ data }) => (await server()).replayPartyGame(data));

export const stopPartyRound = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ ...session, round: z.number().int().min(1), answers: stopAnswers }).parse(input))
  .handler(async ({ data }) => (await server()).stopPartyRound(data));

/** Per-game developer settings (timings, AI tone, chaos events); not secret, read by the admin panel. */
export const getPartyAdmin = createServerFn({ method: "GET" }).handler(async () => (await server()).loadPartyAdmin());

export const savePartyAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: z.string().max(200).optional(),
        game: gameId,
        config: z.object({
          seconds: z.record(z.string().max(40), z.number().int().min(0).max(3600)).refine((value) => Object.keys(value).length <= 20).optional(),
          tone: z.enum(["padrao", "leve", "acido", "teatral"]).optional(),
          events: z.boolean().optional(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data }) => (await server()).savePartyAdmin(data));

export const listPartyRoomsAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().max(200).optional() }).parse(input))
  .handler(async ({ data }) => (await server()).listPartyRoomsAdmin(data));

export const deletePartyRoomAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().max(200).optional(), roomId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => (await server()).deletePartyRoomAdmin(data));

/* Group-room chat: the caller's hashed room session is verified before reading or posting. */
export const listPartyChat = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(session).parse(input))
  .handler(async ({ data }) => (await server()).listPartyChat(data));

export const sendPartyChat = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ ...session, content: z.string().max(400) }).parse(input))
  .handler(async ({ data }) => (await server()).sendPartyChat(data));

/* Training bots: the host's device ticks them; the server decides what each due bot plays. */
export const tickPartyBots = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(session).parse(input))
  .handler(async ({ data }) => (await server()).tickPartyBots(data));

/** Developer-only controls for the room the developer is in (dev token + room session both verified). */
export const devRoomAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        ...session,
        token: z.string().max(200).optional(),
        action: z.enum(["addBot", "removeBots", "kick", "forceAdvance", "toLobby"]),
        targetId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => (await server()).devRoomAction(data));

/* Stop "Recorrer ao Juiz": open an appeal on your own zero, vote on someone else's, close it after the deadline. */
export const openStopAppeal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ ...session, round: z.number().int().min(1), category: z.string().min(1).max(160) }).parse(input))
  .handler(async ({ data }) => (await server()).openStopAppeal(data));

export const voteStopAppeal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ ...session, round: z.number().int().min(1), vote: z.enum(["aceitar", "manter"]) }).parse(input))
  .handler(async ({ data }) => (await server()).voteStopAppeal(data));

export const resolveStopAppeal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ ...session, round: z.number().int().min(1) }).parse(input))
  .handler(async ({ data }) => (await server()).resolveStopAppeal(data));

export const touchPartyPresence = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(session).parse(input))
  .handler(async ({ data }) => (await server()).touchPartyPresence(data));

/** Host only: AI requests left in the room creator's wallet. */
export const getRoomCredits = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object(session).parse(input))
  .handler(async ({ data }) => (await server()).getRoomCredits(data));

export const reportPartyContent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        ...session,
        targetPlayerId: z.string().uuid().optional(),
        messageId: z.string().uuid().optional(),
        reason: z.enum(["ofensa", "assedio", "spam", "conteudo_improprio", "outro"]),
        detail: z.string().max(500).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => (await server()).reportPartyContent(data));
