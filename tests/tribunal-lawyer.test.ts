import { describe, expect, test } from "bun:test";
import { scoreTribunal, scoreTribunalJudge, tribunalLawyer } from "../src/lib/party-engine";
import { TRIBUNAL_SECONDS_OPTIONS } from "../src/lib/party-games";

describe("Tribunal defense lawyer", () => {
  test("duel has no lawyer; 3+ players draw one among non-defendants", () => {
    expect(tribunalLawyer(["reu", "a"], "reu", 0.5)).toBeNull();
    for (const roll of [0, 0.4, 0.99]) {
      const id = tribunalLawyer(["reu", "a", "b", "c"], "reu", roll);
      expect(["a", "b", "c"]).toContain(id);
    }
  });
  test("jury: lawyer cannot vote and earns 3 when innocent", () => {
    const r = scoreTribunal("reu", { adv: "culpado", a: "inocente", b: "inocente" }, "adv");
    expect(r.verdict).toBe("inocente");
    expect(r.deltas).toEqual({ reu: 3, adv: 3, a: 1, b: 1 });
    expect(scoreTribunal("reu", { a: "culpado", b: "culpado" }, "adv").deltas).toEqual({ a: 1, b: 1 });
  });
  test("AI judge: lawyer shares innocent points and is never an accuser", () => {
    expect(scoreTribunalJudge({ defendantId: "reu", lawyerId: "adv", accuserIds: ["adv", "a"], verdict: "inocente", bonus: 1 }).deltas).toEqual({ reu: 4, adv: 4 });
    expect(scoreTribunalJudge({ defendantId: "reu", lawyerId: "adv", accuserIds: ["adv", "a", "b"], verdict: "culpado", bestAccuserId: "a", bonus: 0 }).deltas).toEqual({ a: 3, b: 2 });
  });
  test("host can pick 4 and 5 minutes", () => {
    expect(TRIBUNAL_SECONDS_OPTIONS).toContain(240);
    expect(TRIBUNAL_SECONDS_OPTIONS).toContain(300);
  });
});
