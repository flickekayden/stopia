import { describe, expect, test } from "bun:test";
import { DEFAULT_THEME, THEMES, sanitizeTheme } from "../src/lib/themes";

describe("player themes", () => {
  test("offers six distinct schemes with the classic one as default", () => {
    expect(THEMES.map((theme) => theme.id)).toEqual(["premium", "neon", "brasa", "floresta", "festa", "caderno"]);
    expect(DEFAULT_THEME).toBe("premium");
  });
  test("unknown or missing saved values fall back to the default", () => {
    expect(sanitizeTheme("caderno")).toBe("caderno");
    expect(sanitizeTheme("roxo")).toBe("premium");
    expect(sanitizeTheme(null)).toBe("premium");
  });
});
