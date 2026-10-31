import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import {
  DEFAULT_BILLING,
  aiRequestEstimate,
  balanceTone,
  canStartWithBalance,
  classifyPlayPurchase,
  formatBRL,
  readBillingConfig,
  reversalAmount,
  transferableCredits,
} from "../src/lib/billing";
import { readPartySettings } from "../src/lib/party-games";
import { EVAL_INSTRUCTIONS, buildEval, clampPoints, evaluationSchema } from "../src/lib/stop-judge.server";

describe("AI credit packs (owner's rules)", () => {
  test("every new wallet starts with 20 free AI requests", () => {
    expect(DEFAULT_BILLING.freeCredits).toBe(20);
  });

  test("one pack is 20 AI requests for R$ 5,00", () => {
    expect(DEFAULT_BILLING.packCredits).toBe(20);
    expect(DEFAULT_BILLING.priceCents).toBe(500);
    expect(formatBRL(DEFAULT_BILLING.priceCents).replace(/\s/g, " ")).toBe("R$ 5,00");
  });

  test("price and pack size are configurable on the server, invalid values fall back", () => {
    expect(readBillingConfig({ priceCents: 700, packCredits: 30 }).priceCents).toBe(700);
    expect(readBillingConfig({ priceCents: 700, packCredits: 30 }).packCredits).toBe(30);
    expect(readBillingConfig({ priceCents: -1 }).priceCents).toBe(500);
    expect(readBillingConfig({ packCredits: "lots" }).packCredits).toBe(20);
  });

  test("three or fewer requests left shows the low warning; zero is empty", () => {
    expect(balanceTone(4)).toBe("ok");
    expect(balanceTone(3)).toBe("low");
    expect(balanceTone(0)).toBe("empty");
  });

  test("Stop needs at least one request to start; other games start even at zero", () => {
    expect(canStartWithBalance("stop", 0)).toBe(false);
    expect(canStartWithBalance("stop", 1)).toBe(true);
    expect(canStartWithBalance("debate", 0)).toBe(true);
  });
});

describe("AI request estimate per match", () => {
  const base = readPartySettings({ rounds: 3 });

  test("Stop uses one judge request per round", () => {
    expect(aiRequestEstimate("stop", base, 4)).toBe(3);
  });

  test("Infiltrado never uses the AI", () => {
    expect(aiRequestEstimate("infiltrado", base, 4)).toBe(0);
  });

  test("Debate with AI content and AI judge: topic + judge per round + final awards", () => {
    expect(aiRequestEstimate("debate", readPartySettings({ rounds: 3, debateJudge: "ia" }), 4)).toBe(7);
  });

  test("Roleta with group vote only spends the challenge per round", () => {
    expect(aiRequestEstimate("roleta", readPartySettings({ rounds: 3, roletaJudge: "voto" }), 4)).toBe(3);
  });

  test("AI content off and group vote: Tribunal spends nothing", () => {
    expect(aiRequestEstimate("tribunal", readPartySettings({ rounds: 3, ai: false, tribunalJudge: "voto" }), 4)).toBe(0);
  });
});

describe("guest to account and refunds", () => {
  test("only bought credits move to an account that already has a wallet (free are spent first)", () => {
    expect(transferableCredits(35, 20)).toBe(20);
    expect(transferableCredits(15, 20)).toBe(15);
    expect(transferableCredits(12, 0)).toBe(0);
  });

  test("a refund never takes the balance below zero", () => {
    expect(reversalAmount(20, 8)).toBe(8);
    expect(reversalAmount(20, 50)).toBe(20);
    expect(reversalAmount(20, 0)).toBe(0);
  });
});

describe("Google Play verification", () => {
  const product = "stopia_ia_20";

  test("paid purchase with an order id is confirmed", () => {
    expect(classifyPlayPurchase({ purchaseState: 0, orderId: "GPA.1", consumptionState: 0 }, product)).toEqual({ status: "confirmed", orderId: "GPA.1", test: false, alreadyConsumed: false });
  });

  test("pending, canceled and forged purchases never grant credits", () => {
    expect(classifyPlayPurchase({ purchaseState: 2, orderId: "GPA.2" }, product).status).toBe("pending");
    expect(classifyPlayPurchase({ purchaseState: 1, orderId: "GPA.3" }, product).status).toBe("canceled");
    expect(classifyPlayPurchase(null, product).status).toBe("invalid");
    expect(classifyPlayPurchase({ purchaseState: 0 }, product).status).toBe("invalid");
    expect(classifyPlayPurchase({ purchaseState: 0, orderId: "GPA.4", productId: "outro" }, product).status).toBe("invalid");
  });

  test("license-tester purchases are flagged as test", () => {
    const verdict = classifyPlayPurchase({ purchaseState: 0, orderId: "GPA.5", purchaseType: 0 }, product);
    expect(verdict.status === "confirmed" && verdict.test).toBe(true);
  });
});

describe("Stop AI judge is unchanged (regression)", () => {
  const hash = (v: unknown) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");

  test("judge prompt text is byte-identical", () => {
    expect(hash(EVAL_INSTRUCTIONS)).toBe("6ea3b4c7c4eafb0524143c7fbe753fc7b63fa666efe0dbbec4dc20222058f5db");
  });

  test("judge response schema is identical", () => {
    expect(hash(evaluationSchema)).toBe("cb77164aa98abf1773978287150cd39ae089a748ca6bcb0dc4df92ab3590fc8a");
  });

  test("buildEval output is identical for default and free scoring", () => {
    expect(hash(buildEval(undefined))).toBe("5617e1e147f453dd3a0e3e439c604e58cf2fafec2091a38bcc33f53ded65443f");
    expect(hash(buildEval({ scoringMode: "free", sarcasm: 3 }))).toBe("b8d58588fb7d53ef8f5ecd6b6e0a39ab7e6090e6d014b14c58a2e6d2f76ec26c");
  });

  test("point normalisation is unchanged", () => {
    expect([clampPoints(7, false), clampPoints(7, true), clampPoints(25, true), clampPoints(-3, false), clampPoints("x", false)]).toEqual([5, 7, 20, 0, 0]);
  });
});
