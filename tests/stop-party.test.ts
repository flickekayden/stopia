import { describe, expect, test } from "bun:test";

import { DEFAULT_CATEGORIES } from "../src/lib/game";
import {
  readPartySettings,
  sanitizeStopAnswers,
  STOP_INTENSITY_SARCASM,
  stopAnswersComplete,
  stopRoundDeltas,
} from "../src/lib/party-games";

describe("Stop in the group room: host rules", () => {
  test("new rooms default to 5 rounds, 90s, classic scoring, balanced AI and the default categories", () => {
    const settings = readPartySettings({});
    expect(settings.rounds).toBe(5);
    expect(settings.stopSeconds).toBe(90);
    expect(settings.scoring).toBe("fixed");
    expect(settings.aiIntensity).toBe("padrao");
    expect(settings.categories).toEqual(DEFAULT_CATEGORIES);
  });

  test("rounds are only 3, 5 or 8", () => {
    expect(readPartySettings({ rounds: 8 }).rounds).toBe(8);
    expect(readPartySettings({ rounds: 4 }).rounds).toBe(5);
  });

  test("round time stays between 60 and 180 seconds", () => {
    expect(readPartySettings({ stopSeconds: 30 }).stopSeconds).toBe(60);
    expect(readPartySettings({ stopSeconds: 999 }).stopSeconds).toBe(180);
    expect(readPartySettings({ stopSeconds: 120 }).stopSeconds).toBe(120);
  });

  test("the host's free scoring and merciless intensity are kept", () => {
    const settings = readPartySettings({ scoring: "free", aiIntensity: "acida" });
    expect(settings.scoring).toBe("free");
    expect(settings.aiIntensity).toBe("acida");
    expect(readPartySettings({ scoring: "outro", aiIntensity: "x" }).scoring).toBe("fixed");
  });

  test("AI intensity maps to judge sarcasm 2, 6 and 10", () => {
    expect(STOP_INTENSITY_SARCASM).toEqual({ leve: 2, padrao: 6, acida: 10 });
  });

  test("category lists drop blanks and case-insensitive duplicates", () => {
    expect(readPartySettings({ categories: ["Nome", " nome ", "", "Fruta"] }).categories).toEqual(["Nome", "Fruta"]);
    expect(readPartySettings({ categories: [] }).categories).toEqual(DEFAULT_CATEGORIES);
  });
});

describe("Stop in the group room: answers and points", () => {
  test("only the round's categories are stored", () => {
    expect(sanitizeStopAnswers({ Nome: "  Paulo ", Hack: "x" }, ["Nome", "Cor"])).toEqual({ Nome: "Paulo", Cor: "" });
  });

  test("STOP! needs every category filled", () => {
    expect(stopAnswersComplete({ Nome: "Paulo", Cor: "" }, ["Nome", "Cor"])).toBe(false);
    expect(stopAnswersComplete({ Nome: "Paulo", Cor: "Prata" }, ["Nome", "Cor"])).toBe(true);
  });

  test("round points are the sum of the judge's points per player", () => {
    const deltas = stopRoundDeltas([
      { categoria: "Nome", jogador_id: "a", resposta: "Paulo", pontos: 10, comentario: "" },
      { categoria: "Cor", jogador_id: "a", resposta: "Prata", pontos: 15, comentario: "" },
      { categoria: "Nome", jogador_id: "b", resposta: "", pontos: 0, comentario: "" },
    ]);
    expect(deltas).toEqual({ a: 25 });
  });
});
