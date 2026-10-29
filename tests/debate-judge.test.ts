import { describe, expect, test } from "bun:test";

import { scoreDebateJudge, scoreRoletaJudge } from "../src/lib/party-engine";
import { effectiveJudge, hostPhaseSeconds, readPartySettings } from "../src/lib/party-games";

describe("host rules for Debate and Roleta", () => {
  test("defaults: 90s debate, 60s roleta, automatic judge", () => {
    const settings = readPartySettings({});
    expect(settings.debateSeconds).toBe(90);
    expect(settings.roletaSeconds).toBe(60);
    expect(settings.debateJudge).toBe("auto");
    expect(settings.roletaJudge).toBe("auto");
  });

  test("only the offered times are accepted (60/90/120 debate, 45/60/90 roleta)", () => {
    expect(readPartySettings({ debateSeconds: 120 }).debateSeconds).toBe(120);
    expect(readPartySettings({ debateSeconds: 45 }).debateSeconds).toBe(90);
    expect(readPartySettings({ roletaSeconds: 45 }).roletaSeconds).toBe(45);
    expect(readPartySettings({ roletaSeconds: 120 }).roletaSeconds).toBe(60);
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
    expect(hostPhaseSeconds("tribunal", "defense", settings)).toBeNull();
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
