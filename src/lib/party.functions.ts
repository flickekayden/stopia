import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const session = { roomId: z.string().uuid(), playerId: z.string().uuid(), sessionId: z.string().uuid() };
const gameId = z.enum(["tribunal", "autor", "infiltrado", "debate", "roleta"]);
const server = () => import("./party.server");

export const createPartyRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ game: gameId.optional(), nickname: z.string().trim().min(1).max(20), sessionId: z.string().uuid() }).parse(input))
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
    z.object({ ...session, round: z.number().int().min(1), phase: z.string().max(20), payload: z.record(z.string(), z.unknown()) }).parse(input),
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
  .inputValidator((input: unknown) => z.object({ ...session, round: z.number().int().min(1), answers: z.record(z.string(), z.string().max(400)) }).parse(input))
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
          seconds: z.record(z.string(), z.number().int()).optional(),
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
