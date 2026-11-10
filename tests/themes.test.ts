import { describe, expect, test } from "bun:test";
import { DEFAULT_THEME, THEMES, sanitizeTheme } from "../src/lib/themes";

describe("player themes", () => {
  test("offers seven distinct schemes with the sky-blue one as default", () => {
    expect(THEMES.map((theme) => theme.id)).toEqual(["ceu", "premium", "neon", "brasa", "floresta", "festa", "caderno"]);
    expect(DEFAULT_THEME).toBe("ceu");
  });
  test("unknown or missing saved values fall back to the default", () => {
    expect(sanitizeTheme("caderno")).toBe("caderno");
    expect(sanitizeTheme("roxo")).toBe("ceu");
    expect(sanitizeTheme(null)).toBe("ceu");
  });
});
