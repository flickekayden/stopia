import { describe, expect, test } from "bun:test";

import { scoreDebateJudge, scoreRoletaJudge, scoreTribunalJudge } from "../src/lib/party-engine";
import { effectiveJudge, effectiveJudgeFor, hostPhaseSeconds, readPartySettings, textMaxFor } from "../src/lib/party-games";

describe("host rules for Debate and Roleta", () => {
  test("defaults: 90s debate, 60s roleta, automatic judge", () => {
    const settings = readPartySettings({});
    expect(settings.debateSeconds).toBe(90);
    expect(settings.roletaSeconds).toBe(60);
    expect(settings.debateJudge).toBe("auto");
    expect(settings.roletaJudge).toBe("auto");
  });

  test("only the offered times are accepted (60/90/120/180 debate, 45/60/90 roleta)", () => {
    expect(readPartySettings({ debateSeconds: 120 }).debateSeconds).toBe(120);
    expect(readPartySettings({ debateSeconds: 180 }).debateSeconds).toBe(180);
    expect(readPartySettings({ debateSeconds: 240 }).debateSeconds).toBe(90);
    expect(readPartySettings({ debateSeconds: 45 }).debateSeconds).toBe(90);
    expect(readPartySettings({ roletaSeconds: 45 }).roletaSeconds).toBe(45);
    expect(readPartySettings({ roletaSeconds: 120 }).roletaSeconds).toBe(60);
    expect(readPartySettings({ roletaSeconds: 180 }).roletaSeconds).toBe(180);
    expect(readPartySettings({ roletaSeconds: 300 }).roletaSeconds).toBe(300);
    expect(readPartySettings({ debateJudge: "juiz" }).debateJudge).toBe("auto");
  });

  test("automatic judge: AI with 2 players, group vote with 3 or more; explicit choice wins", () => {
    expect(effectiveJudge("auto", 2)).toBe("ia");
    expect(effectiveJudge("auto", 3)).toBe("voto");
    expect(effectiveJudge("voto", 2)).toBe("voto");
    expect(effectiveJudge("ia", 5)).toBe("ia");
  });

  test("host time applies to the writing step only", () => {
    const settings = readPartySettings({ debateSeconds: 60, roletaSeconds: 90 });
    expect(hostPhaseSeconds("debate", "argue", settings)).toBe(60);
    expect(hostPhaseSeconds("roleta", "respond", settings)).toBe(90);
    expect(hostPhaseSeconds("debate", "vote", settings)).toBeNull();
    expect(hostPhaseSeconds("tribunal", "vote", settings)).toBeNull();
  });
});

describe("longer answers", () => {
  test("debate, tribunal and roleta accept 500 characters, other games 220", () => {
    expect(textMaxFor("debate")).toBe(500);
    expect(textMaxFor("tribunal")).toBe(500);
    expect(textMaxFor("roleta")).toBe(500);
    expect(textMaxFor("autor")).toBe(220);
  });
});

describe("Tribunal dos Amigos with the AI judge", () => {
  test("host rules: 90s and automatic judge by default; 180s is offered", () => {
    const settings = readPartySettings({});
    expect(settings.tribunalSeconds).toBe(90);
    expect(settings.tribunalJudge).toBe("auto");
    expect(readPartySettings({ tribunalSeconds: 180 }).tribunalSeconds).toBe(180);
    expect(hostPhaseSeconds("tribunal", "defense", readPartySettings({ tribunalSeconds: 120 }))).toBe(120);
  });

  test("a 2-player tribunal always uses the AI judge, even if the host chose the jury", () => {
    expect(effectiveJudgeFor("tribunal", readPartySettings({ tribunalJudge: "voto" }), 2)).toBe("ia");
    expect(effectiveJudgeFor("tribunal", readPartySettings({ tribunalJudge: "voto" }), 3)).toBe("voto");
    expect(effectiveJudgeFor("tribunal", readPartySettings({ tribunalJudge: "ia" }), 4)).toBe("ia");
    expect(effectiveJudgeFor("tribunal", readPartySettings({}), 3)).toBe("voto");
    expect(effectiveJudgeFor("debate", readPartySettings({ debateJudge: "voto" }), 2)).toBe("voto");
  });

  test("duel: innocent gives the defendant 3 + bonus; guilty gives the prosecutor 3 + bonus", () => {
    expect(scoreTribunalJudge({ defendantId: "reu", accuserIds: ["pro"], verdict: "inocente", bonus: 1 }).deltas).toEqual({ reu: 4 });
    expect(scoreTribunalJudge({ defendantId: "reu", accuserIds: ["pro"], verdict: "culpado", bonus: 2 }).deltas).toEqual({ pro: 5 });
  });

  test("group: guilty gives every accuser 2 and the best accusation 1 more (+bonus capped at 2)", () => {
    const result = scoreTribunalJudge({ defendantId: "reu", accuserIds: ["a", "b"], verdict: "culpado", bestAccuserId: "b", bonus: 9 });
    expect(result.deltas).toEqual({ a: 2, b: 5 });
  });

  test("undecided judge (AI failure in a duel) is a draw: 2 points each", () => {
    expect(scoreTribunalJudge({ defendantId: "reu", accuserIds: ["pro"], verdict: null, bonus: 2 }).deltas).toEqual({ reu: 2, pro: 2 });
  });
});

describe("AI judge scoring", () => {
  test("debate duel: winner gets 2 + bonus + 1 side point, loser gets nothing", () => {
    const result = scoreDebateJudge({ ana: "A", bia: "B" }, "bia", 1);
    expect(result.winnerSide).toBe("B");
    expect(result.deltas).toEqual({ bia: 4 });
  });

  test("debate teams: winning teammates get +1, bonus is capped at 2", () => {
    const result = scoreDebateJudge({ ana: "A", bia: "B", caio: "A" }, "ana", 9);
    expect(result.deltas).toEqual({ ana: 5, caio: 1 });
  });

  test("debate with an unknown winner awards no points", () => {
    expect(scoreDebateJudge({ ana: "A", bia: "B" }, "zeca", 2).deltas).toEqual({});
  });

  test("roleta: 0–3 AI points per answer multiplied by the chaos event", () => {
    const result = scoreRoletaJudge({ ana: 3, bia: 7, caio: -1 }, ["ana", "bia", "caio"], 2);
    expect(result.counts).toEqual({ ana: 3, bia: 3, caio: 0 });
    expect(result.deltas).toEqual({ ana: 6, bia: 6 });
  });
});
