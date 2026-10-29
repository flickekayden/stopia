import { describe, expect, test } from "bun:test";

import {
  LOBBY_GAMES,
  missingPlayers,
  phaseSecondsFor,
  PHASE_SECONDS,
  readPartyAdmin,
  readRoomGame,
} from "../src/lib/party-games";

describe("group room", () => {
  test("lobby offers Stop plus the five party games", () => {
    expect(LOBBY_GAMES.map((game) => game.id)).toEqual(["stop", "tribunal", "autor", "infiltrado", "debate", "roleta"]);
  });

  test("a room with no chosen game reads as the lobby", () => {
    expect(readRoomGame("lobby")).toBe("lobby");
    expect(readRoomGame("stop")).toBe("stop");
    expect(readRoomGame("infiltrado")).toBe("infiltrado");
    expect(readRoomGame("xadrez")).toBe("lobby");
  });

  test("start is blocked until the chosen game's minimum players are present", () => {
    expect(missingPlayers("tribunal", 1)).toBe(1);
    expect(missingPlayers("tribunal", 2)).toBe(0);
    expect(missingPlayers("autor", 2)).toBe(1);
    expect(missingPlayers("stop", 1)).toBe(1);
    expect(missingPlayers("roleta", 2)).toBe(0);
  });
});

describe("developer settings per game", () => {
  test("a game's timing override applies only to that game", () => {
    const admin = readPartyAdmin({ tribunal: { seconds: { vote: 30 } }, autor: { seconds: { write: 120 } } });
    expect(phaseSecondsFor("autor", "write", admin)).toBe(120);
    expect(phaseSecondsFor("tribunal", "vote", admin)).toBe(30);
    expect(phaseSecondsFor("infiltrado", "vote", admin)).toBe(PHASE_SECONDS.vote!);
  });

  test("seconds are clamped to 15–300 and foreign phases are ignored", () => {
    const admin = readPartyAdmin({ infiltrado: { seconds: { clues: 5, vote: 999, defense: 100 } } });
    expect(admin.infiltrado?.seconds).toEqual({ clues: 15, vote: 300 });
  });

  test("AI tone is kept only for games that use AI, chaos events only for Roleta", () => {
    const admin = readPartyAdmin({ infiltrado: { tone: "acido" }, tribunal: { tone: "acido", events: false }, roleta: { events: false } });
    expect(admin.infiltrado?.tone).toBeUndefined();
    expect(admin.tribunal).toEqual({ tone: "acido" });
    expect(admin.roleta?.events).toBe(false);
  });
});
