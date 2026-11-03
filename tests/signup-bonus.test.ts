import { describe, expect, test } from "bun:test";

import { DEFAULT_BILLING, formatBRL } from "../src/lib/billing";
import { BONUS_PER_NETWORK_PER_DAY, bonusAllowedNow, bonusMessage, safeReturnPath, walletMayPayAi } from "../src/lib/signup-bonus";

describe("signup bonus (owner's rules)", () => {
  test("the bonus is 20 free AI credits and the pack stays 20 credits for R$ 5,00 (stopia_ia_20)", () => {
    expect(DEFAULT_BILLING.freeCredits).toBe(20);
    expect(DEFAULT_BILLING.packCredits).toBe(20);
    expect(formatBRL(DEFAULT_BILLING.priceCents).replace(/\s/g, " ")).toBe("R$ 5,00");
    expect(DEFAULT_BILLING.playProductId).toBe("stopia_ia_20");
  });

  test("only account wallets may pay for AI; guest wallets never consume", () => {
    expect(walletMayPayAi({ user_id: "6b0c0f3e-8f4e-4c55-9c1a-0d6a3a7e2b11" })).toBe(true);
    expect(walletMayPayAi({ user_id: null })).toBe(false);
    expect(walletMayPayAi(null)).toBe(false);
  });

  test("past 5 bonuses from one network in a day the bonus is postponed", () => {
    expect(BONUS_PER_NETWORK_PER_DAY).toBe(5);
    expect(bonusAllowedNow(4)).toBe(true);
    expect(bonusAllowedNow(5)).toBe(false);
  });

  test("an e-mail that already received the bonus is told the benefit is single-use", () => {
    expect(bonusMessage("identity_used")).toContain("único");
    expect(bonusMessage("unconfirmed")).toContain("Confirme seu e-mail");
  });

  test("after signing in, players only return to same-site pages", () => {
    expect(safeReturnPath("/festa/ABCD")).toBe("/festa/ABCD");
    expect(safeReturnPath("//evil.example")).toBe("/perfil");
    expect(safeReturnPath("https://evil.example")).toBe("/perfil");
    expect(safeReturnPath(undefined)).toBe("/perfil");
  });
});
