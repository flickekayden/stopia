import { describe, expect, test } from "bun:test";

import { abuseKindForBonus, noteCreditAbuse, safeAbuseDetail } from "../src/lib/credit-monitor";

const USER = "6b0c0f3e-8f4e-4c55-9c1a-0d6a3a7e2b11";

describe("signup-bonus abuse monitoring", () => {
  test("only abuse signals are recorded: reused e-mail, network limit and grant failures", () => {
    expect(abuseKindForBonus("identity_used")).toBe("identity_used");
    expect(abuseKindForBonus("deferred", "rate_limit")).toBe("rate_limited");
    expect(abuseKindForBonus("deferred", "error")).toBe("grant_error");
    expect(abuseKindForBonus("granted")).toBeNull();
    expect(abuseKindForBonus("already")).toBeNull();
    expect(abuseKindForBonus("unconfirmed")).toBeNull();
  });

  test("a monitoring failure never breaks the bonus flow", async () => {
    const throwing = { rpc: () => { throw new Error("db down"); } };
    const rejecting = { rpc: () => Promise.reject(new Error("timeout")) };
    const erroring = { rpc: () => Promise.resolve({ error: { code: "42501" } }) };
    expect(await noteCreditAbuse(throwing, "identity_used", USER)).toBe(false);
    expect(await noteCreditAbuse(rejecting, "identity_used", USER)).toBe(false);
    expect(await noteCreditAbuse(erroring, "grant_error", USER, "x")).toBe(false);
  });

  test("stored detail cannot carry an e-mail or long payload", async () => {
    expect(safeAbuseDetail("ana@example.com")).toBe("anaexample.com");
    expect(safeAbuseDetail("40P01")).toBe("40P01");
    expect(safeAbuseDetail("x".repeat(100)).length).toBe(40);
    expect(safeAbuseDetail({ token: "secret" })).toBe("");
    const calls: unknown[] = [];
    await noteCreditAbuse({ rpc: (_fn, args) => { calls.push(args); return Promise.resolve({ error: null }); } }, "rate_limited", USER, "rede:5");
    expect(calls).toEqual([{ p_kind: "rate_limited", p_user: USER, p_detail: "rede:5" }]);
  });
});
