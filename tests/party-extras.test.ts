import { describe, expect, test } from "bun:test";

import { AUTOR_BLUFF_BONUS, scoreAutor } from "../src/lib/party-engine";
import { hostPhaseSeconds, PARTY_CHAT_QUICK, readPartySettings } from "../src/lib/party-games";
import { NICKNAME_MAX, randomNickname } from "../src/lib/nicknames";

describe("Quem Escreveu: bluff bonus and host time", () => {
  test("nobody finds the author but someone guessed: +1 per fooled player and +2 bluff bonus", () => {
    const result = scoreAutor([{ id: "e1", authorId: "ana" }], { beto: { e1: "caio" }, caio: { e1: "beto" } });
    expect(AUTOR_BLUFF_BONUS).toBe(2);
    expect(result.deltas).toEqual({ ana: 4 });
    expect(result.perEntry[0]?.bluff).toBe(true);
  });

  test("no bluff bonus when someone finds the author or nobody guessed", () => {
    expect(scoreAutor([{ id: "e1", authorId: "ana" }], { beto: { e1: "ana" }, caio: { e1: "beto" } }).deltas).toEqual({ beto: 1, ana: 1 });
    expect(scoreAutor([{ id: "e1", authorId: "ana" }], {}).deltas).toEqual({});
  });

  test("writing time: 75s by default, host picks 60/75/90/120", () => {
    expect(readPartySettings({}).autorSeconds).toBe(75);
    expect(readPartySettings({ autorSeconds: 120 }).autorSeconds).toBe(120);
    expect(readPartySettings({ autorSeconds: 200 }).autorSeconds).toBe(75);
    expect(hostPhaseSeconds("autor", "write", readPartySettings({ autorSeconds: 90 }))).toBe(90);
  });
});

describe("Infiltrado theme", () => {
  test("mixed by default; only known themes are kept", () => {
    expect(readPartySettings({}).infiltradoTheme).toBe("todas");
    expect(readPartySettings({ infiltradoTheme: "Animal" }).infiltradoTheme).toBe("Animal");
    expect(readPartySettings({ infiltradoTheme: "Hacker" }).infiltradoTheme).toBe("todas");
  });
});

describe("room chat and nicknames", () => {
  test("quick reactions offered in the chat", () => {
    expect([...PARTY_CHAT_QUICK]).toEqual(["😂 KKKK", "🔥 Boa!", "❌ Mentira!", "⏳ Corre!"]);
  });

  test("generated nicknames fit the 20-character limit", () => {
    for (let i = 0; i < 50; i += 1) expect(randomNickname().length).toBeLessThanOrEqual(NICKNAME_MAX);
  });
});

import { describe as d2, expect as e2, it as i2 } from "bun:test";
d2("infiltrado clue time", () => {
  i2("defaults to 90s and honours host choice", () => {
    e2(hostPhaseSeconds("infiltrado", "clues", readPartySettings({}))).toBe(90);
    e2(hostPhaseSeconds("infiltrado", "clues", readPartySettings({ infiltradoSeconds: 180 }))).toBe(180);
    e2(hostPhaseSeconds("infiltrado", "clues", readPartySettings({ infiltradoSeconds: 999 }))).toBe(90);
  });
});
