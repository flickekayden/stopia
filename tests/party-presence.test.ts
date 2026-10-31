import { describe, expect, test } from "bun:test";

import { ACTIVE_WINDOW_MS, activePlayers, forChallenge, isActivePlayer, roletaChallengeKey } from "../src/lib/party-presence";

const NOW = Date.parse("2026-10-31T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("group room presence", () => {
  test("a player seen within three minutes still counts", () => {
    expect(ACTIVE_WINDOW_MS).toBe(180_000);
    expect(isActivePlayer({ is_bot: false, last_seen: ago(179_000) }, NOW)).toBe(true);
  });

  test("a player silent for more than three minutes stops counting", () => {
    expect(isActivePlayer({ is_bot: false, last_seen: ago(181_000) }, NOW)).toBe(false);
  });

  test("training bots always count", () => {
    expect(isActivePlayer({ is_bot: true, last_seen: ago(3_600_000) }, NOW)).toBe(true);
  });

  test("silent players are filtered, never removed from the input", () => {
    const players = [
      { id: "a", is_bot: false, last_seen: ago(5_000) },
      { id: "b", is_bot: false, last_seen: ago(600_000) },
    ];
    expect(activePlayers(players, NOW).map((p) => p.id)).toEqual(["a"]);
    expect(players).toHaveLength(2);
  });
});

describe("roleta challenge skips", () => {
  test("answers to a skipped challenge are ignored for the new one", () => {
    const before = roletaChallengeKey(2);
    const after = roletaChallengeKey(1);
    const subs = [
      { player_id: "a", payload: { text: "old", challenge: before } },
      { player_id: "b", payload: { text: "new", challenge: after } },
      { player_id: "c", payload: { text: "untagged" } },
    ];
    expect(forChallenge(subs, after).map((s) => s.player_id)).toEqual(["b"]);
  });
});
