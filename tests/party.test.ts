import { describe, expect, test } from "bun:test";

import {
  normalizeText,
  pickUnused,
  scoreAutor,
  scoreDebate,
  scoreInfiltrado,
  scoreRoleta,
  scoreTribunal,
  tallyVotes,
  tribunalDefendant,
  uniqueTop,
} from "../src/lib/party-engine";
import { PARTY_GAMES, readPartySettings } from "../src/lib/party-games";

describe("party games rules", () => {
  test("minimum players per game", () => {
    expect(PARTY_GAMES.tribunal.minPlayers).toBe(3);
    expect(PARTY_GAMES.autor.minPlayers).toBe(3);
    expect(PARTY_GAMES.infiltrado.minPlayers).toBe(3);
    expect(PARTY_GAMES.debate.minPlayers).toBe(2);
    expect(PARTY_GAMES.roleta.minPlayers).toBe(2);
  });

  test("tribunal: acquitted defendant gets 3, majority voters get 1, tie acquits", () => {
    const tie = scoreTribunal("reu", { a: "culpado", b: "inocente" });
    expect(tie.verdict).toBe("inocente");
    expect(tie.deltas).toEqual({ reu: 3, b: 1 });
    const guilty = scoreTribunal("reu", { a: "culpado", b: "culpado", c: "inocente", reu: "inocente" });
    expect(guilty.verdict).toBe("culpado");
    expect(guilty.deltas).toEqual({ a: 1, b: 1 });
  });

  test("tribunal: every player takes a turn as defendant", () => {
    const players = [
      { id: "b", created_at: "2026-01-01T00:00:02Z" },
      { id: "a", created_at: "2026-01-01T00:00:01Z" },
    ];
    expect([1, 2, 3].map((round) => tribunalDefendant(players, round))).toEqual(["a", "b", "a"]);
  });

  test("autor: +1 per correct guess, author +1 per player fooled, own entry and self-guesses ignored", () => {
    const result = scoreAutor(
      [{ id: "e1", authorId: "ana" }, { id: "e2", authorId: "beto" }],
      { ana: { e1: "beto", e2: "beto" }, beto: { e1: "caio", e2: "beto" }, caio: { e1: "ana", e2: "caio" } },
    );
    expect(result.deltas).toEqual({ ana: 2, caio: 1 });
  });

  test("votes ignore self-votes and ties produce no accused", () => {
    expect(tallyVotes({ a: "a", b: "a", c: "b" })).toEqual({ a: 1, b: 1 });
    expect(uniqueTop({ a: 1, b: 1 })).toBeNull();
    expect(uniqueTop({ a: 2, b: 1 })).toBe("a");
  });

  test("infiltrado: escapes for 3, steals with a correct guess for 2, otherwise citizens win", () => {
    const ids = ["inf", "a", "b"];
    expect(scoreInfiltrado({ infiltradoId: "inf", playerIds: ids, votes: { a: "b", b: "a", inf: "a" }, guessCorrect: null }).deltas).toEqual({ inf: 3 });
    expect(scoreInfiltrado({ infiltradoId: "inf", playerIds: ids, votes: { a: "inf", b: "inf" }, guessCorrect: true }).deltas).toEqual({ inf: 2 });
    expect(scoreInfiltrado({ infiltradoId: "inf", playerIds: ids, votes: { a: "inf", b: "inf", inf: "a" }, guessCorrect: false }).deltas).toEqual({ a: 2, b: 2 });
  });

  test("infiltrado word guesses ignore case and accents", () => {
    expect(normalizeText("  Pão de QUEIJO ")).toBe(normalizeText("pao de queijo"));
  });

  test("debate: +1 per vote and +1 for the winning side; tied sides get no bonus", () => {
    const sides = { a: "A", b: "B", c: "A" } as const;
    const win = scoreDebate(sides, { b: "a", c: "a", a: "b" });
    expect(win.winnerSide).toBe("A");
    expect(win.deltas).toEqual({ a: 3, b: 1, c: 1 });
    expect(scoreDebate({ a: "A", b: "B" }, { a: "b", b: "a" }).winnerSide).toBeNull();
  });

  test("roleta: votes multiplied by the chaos event", () => {
    expect(scoreRoleta({ a: "b", c: "b", b: "a" }, ["a", "b", "c"], 3).deltas).toEqual({ b: 6, a: 3 });
  });

  test("content rotation uses unused items before repeating", () => {
    expect(pickUnused(3, [0, 1])).toBe(2);
    expect([0, 1, 2]).toContain(pickUnused(3, [0, 1, 2]));
  });

  test("settings fall back to safe defaults", () => {
    expect(readPartySettings({ rounds: 99, skips: 7, intensity: "x" })).toEqual({ rounds: 5, ai: true, intensity: "media", skips: 1 });
  });
});
