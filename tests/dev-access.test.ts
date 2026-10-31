import { describe, expect, test } from "bun:test";

import { DEV_TOKEN_RENEW_MARGIN_MS, devTokenNeedsRenewal } from "../src/lib/dev-settings";

const UID = "1400ad70-a972-454a-962b-2844e68ba81f";
const NOW = 1_800_000_000_000;

describe("developer access renewal", () => {
  test("a token with hours left is kept", () => {
    expect(devTokenNeedsRenewal(`${NOW + 6 * 3_600_000}.${UID}.sig`, NOW)).toBe(false);
  });

  test("an expired token is renewed", () => {
    expect(devTokenNeedsRenewal(`${NOW - 1}.${UID}.sig`, NOW)).toBe(true);
  });

  test("a token about to expire is renewed 30 minutes early", () => {
    expect(DEV_TOKEN_RENEW_MARGIN_MS).toBe(30 * 60_000);
    expect(devTokenNeedsRenewal(`${NOW + 29 * 60_000}.${UID}.sig`, NOW)).toBe(true);
  });

  test("missing or old-format tokens (from the retired password unlock) are renewed", () => {
    expect(devTokenNeedsRenewal(undefined, NOW)).toBe(true);
    expect(devTokenNeedsRenewal("", NOW)).toBe(true);
    expect(devTokenNeedsRenewal("abc", NOW)).toBe(true);
  });
});
