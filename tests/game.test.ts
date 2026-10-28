import { describe, expect, test } from "bun:test";
import { DEFAULT_CATEGORIES, pickCategories, pickLetter } from "../src/lib/game";
import { rankPlayers } from "../src/lib/ranking";
import { ROUND_COUNTDOWN_MS, roundStartsAt } from "../src/lib/round-pacing";
import { RESULTS_VIEW_MS, isResultsPlayerActive, resultsDeadline } from "../src/lib/results-pacing";

describe("game invariants", () => {
  test("default categories and rotation cap", () => {
    expect(DEFAULT_CATEGORIES).toHaveLength(8);
    expect(pickCategories(Array.from({ length: 20 }, (_, i) => `C${i}`), {})).toHaveLength(8);
  });
  test("unused categories precede repeats", () => {
    const pool = Array.from({ length: 12 }, (_, i) => `C${i}`);
    const first = pickCategories(pool, {});
    const usage = Object.fromEntries(first.map((category) => [category, 1]));
    const next = pickCategories(pool, usage);
    expect(next.slice(0, 4).every((category) => !first.includes(category))).toBe(true);
    expect(new Set(next).size).toBe(8);
  });
  test("category rotation trims and deduplicates", () => {
    expect(pickCategories(["Nome", " Nome ", "", "Animal"], {})).toHaveLength(2);
  });
  test("letter selection respects exclusions and unused letters", () => {
    expect(pickLetter([], ["A"])).not.toBe("A");
    expect(pickLetter("BCDEFGHIJLMNOPQRSTUVZ".split(""), [])).toBe("A");
  });
  test("tied ranks do not invent a winner or mutate players", () => {
    const players = [{ score: 10 }, { score: 20 }, { score: 20 }, { score: 0 }];
    expect(rankPlayers(players).map((row) => row.place)).toEqual([1, 1, 3, 4]);
    expect(players[0]?.score).toBe(10);
    expect(rankPlayers([])).toEqual([]);
  });
  test("timing follows shared server timestamps", () => {
    expect(ROUND_COUNTDOWN_MS).toBe(3000);
    expect(roundStartsAt("bad")).toBe(0);
    expect(resultsDeadline(null)).toBeNull();
    expect(isResultsPlayerActive({ is_online: true, last_seen: new Date(100000).toISOString() }, 110000)).toBe(true);
    expect(isResultsPlayerActive({ is_online: true, last_seen: new Date(100000).toISOString() }, 120000)).toBe(false);
  });
  test("players get 120 seconds in total to read all round answers", () => {
    expect(RESULTS_VIEW_MS).toBe(120_000);
  });
});
