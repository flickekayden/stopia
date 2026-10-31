import { describe, expect, test } from "bun:test";

import { BOT_NICKNAMES, botDelayMs, fallbackStopAnswers, nextBotName } from "../src/lib/party-bots";
import { nightKingId } from "../src/lib/ranking";
import { appealBlocker, appealClosed, appealOutcome, appealPoints, type StopAppeal } from "../src/lib/stop-appeal";
import { voiceLockReason } from "../src/lib/voice-rules";

const results = [
  { categoria: "Animal", jogador_id: "a", resposta: "Pato", pontos: 0, comentario: "" },
  { categoria: "Animal", jogador_id: "b", resposta: "pato", pontos: 10, comentario: "" },
  { categoria: "Cor", jogador_id: "a", resposta: "Prata", pontos: 0, comentario: "" },
  { categoria: "Nome", jogador_id: "a", resposta: "", pontos: 0, comentario: "" },
  { categoria: "Fruta", jogador_id: "a", resposta: "Pera", pontos: 10, comentario: "" },
];

describe("training bots", () => {
  test("bot names never repeat a nickname already in the room", () => {
    expect(nextBotName([])).toBe(BOT_NICKNAMES[0]);
    expect(nextBotName([BOT_NICKNAMES[0].toUpperCase()])).toBe(BOT_NICKNAMES[1]);
    expect(BOT_NICKNAMES.includes(nextBotName([...BOT_NICKNAMES]) as never)).toBe(false);
  });

  test("bots always act at least 4 seconds before the deadline, and votes take 2.5–8.5s", () => {
    for (let i = 0; i < 50; i += 1) {
      const write = botDelayMs({ botId: `bot-${i}`, round: 1, phase: "write", kind: "stop", phaseSeconds: 60 });
      expect(write).toBeLessThanOrEqual(56_000);
      expect(write).toBeGreaterThanOrEqual(4_000);
      const vote = botDelayMs({ botId: `bot-${i}`, round: 1, phase: "vote", kind: "vote" });
      expect(vote).toBeGreaterThanOrEqual(2_500);
      expect(vote).toBeLessThanOrEqual(8_500);
    }
  });

  test("fallback Stop answers start with the drawn letter", () => {
    const answers = fallbackStopAnswers("bot-x", 3, "P", ["Nome", "Animal", "Comida", "Profissão"]);
    for (const value of Object.values(answers)) if (value) expect(value.startsWith("P")).toBe(true);
  });
});

describe("Recorrer ao Juiz", () => {
  const open = (votes: StopAppeal["votes"], endsIn = 10_000): StopAppeal => ({ playerId: "a", category: "Animal", answer: "Pato", voters: ["b", "c"], votes, endsAt: new Date(Date.now() + endsIn).toISOString(), status: "open" });

  test("only your own non-empty zero can be appealed, once per round", () => {
    expect(appealBlocker({ results, playerId: "a", category: "Animal", used: [] })).toBeNull();
    expect(appealBlocker({ results, playerId: "a", category: "Fruta", used: [] })).not.toBeNull();
    expect(appealBlocker({ results, playerId: "a", category: "Nome", used: [] })).not.toBeNull();
    expect(appealBlocker({ results, playerId: "b", category: "Animal", used: [] })).not.toBeNull();
    expect(appealBlocker({ results, playerId: "a", category: "Cor", used: ["a"] })).not.toBeNull();
    expect(appealBlocker({ results, playerId: "a", category: "Cor", used: [], current: open({}) })).not.toBeNull();
  });

  test("a tie keeps the zero; a majority to accept overturns it", () => {
    expect(appealOutcome({ b: "aceitar", c: "manter" }).accepted).toBe(false);
    expect(appealOutcome({ b: "aceitar", c: "aceitar" }).accepted).toBe(true);
    expect(appealOutcome({}).accepted).toBe(false);
  });

  test("accepted answers are worth 10, or 5 when someone else wrote the same", () => {
    expect(appealPoints(results, "a", "Animal", "Pato")).toBe(5);
    expect(appealPoints(results, "a", "Cor", "Prata")).toBe(10);
  });

  test("the vote closes when everyone voted or the 30s are over", () => {
    expect(appealClosed(open({ b: "aceitar" }), Date.now())).toBe(false);
    expect(appealClosed(open({ b: "aceitar", c: "manter" }), Date.now())).toBe(true);
    expect(appealClosed(open({}, -1), Date.now())).toBe(true);
  });
});

describe("voice auto-mute", () => {
  test("microphones are silenced while Stop answers are open and during Infiltrado clues", () => {
    expect(voiceLockReason("stop", "playing", "write")).not.toBeNull();
    expect(voiceLockReason("infiltrado", "playing", "clues")).not.toBeNull();
    expect(voiceLockReason("autor", "playing", "guess")).not.toBeNull();
  });

  test("voice is open in the lobby, results and other phases", () => {
    expect(voiceLockReason("stop", "playing", "reveal")).toBeNull();
    expect(voiceLockReason("stop", "playing", "evaluating")).toBeNull();
    expect(voiceLockReason("stop", "lobby", "lobby")).toBeNull();
    expect(voiceLockReason("tribunal", "playing", "defense")).toBeNull();
  });
});

describe("Rei da Noite", () => {
  test("the single top scorer wears the crown; ties and zero crown nobody", () => {
    expect(nightKingId([{ id: "a", score: 12 }, { id: "b", score: 7 }])).toBe("a");
    expect(nightKingId([{ id: "a", score: 7 }, { id: "b", score: 7 }])).toBeNull();
    expect(nightKingId([{ id: "a", score: 0 }])).toBeNull();
  });
});
