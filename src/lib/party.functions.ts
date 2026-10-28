import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const session = { roomId: z.string().uuid(), playerId: z.string().uuid(), sessionId: z.string().uuid() };
const gameId = z.enum(["tribunal", "autor", "infiltrado", "debate", "roleta"]);
const server = () => import("./party.server");

export const createPartyRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ game: gameId, nickname: z.string().trim().min(1).max(20), sessionId: z.string().uuid() }).parse(input))
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
        }),
      })
      .parse(input),
  )
  .handler(async ({ data }) => (await server()).updatePartySettings(data));

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
