import { describe, expect, test } from "bun:test";
import { classifyGeminiFailure, maskKey, orderKeys } from "../src/lib/gemini-keys";
const k = (id: string, tier: "free" | "paid", created_at: string, extra = {}) => ({ id, tier, enabled: true, status: "ok", cooldown_until: null, created_at, ...extra });
describe("gemini key pool", () => {
  test("free keys are tried before paid ones", () => {
    expect(orderKeys([k("p", "paid", "2026-01-01"), k("f", "free", "2026-02-01")]).map((x) => x.id)).toEqual(["f", "p"]);
  });
  test("keys resting after a limit are skipped", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(orderKeys([k("a", "free", "1", { cooldown_until: future }), k("b", "paid", "2")]).map((x) => x.id)).toEqual(["b"]);
  });
  test("daily quota, billing and invalid keys are told apart", () => {
    expect(classifyGeminiFailure(429, "Quota exceeded GenerateRequestsPerDay")).toBe("limit_daily");
    expect(classifyGeminiFailure(429, "RESOURCE_EXHAUSTED per minute")).toBe("limit_minute");
    expect(classifyGeminiFailure(403, "billing not enabled")).toBe("no_credit");
    expect(classifyGeminiFailure(400, "API key not valid")).toBe("invalid");
  });
  test("masking keeps only prefix and last four", () => {
    expect(maskKey("AQ.Ab8xxxxxxxxxxxxxxxx1234")).toBe("AQ.Ab8••••••••1234");
  });
});
