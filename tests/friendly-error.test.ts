import { describe, expect, test } from "bun:test";

import { OFFLINE_MESSAGE, friendlyError } from "../src/lib/friendly-error";

describe("player-facing errors", () => {
  test("messages written for players pass through", () => {
    expect(friendlyError(new Error("Já existe alguém com esse apelido nesta sala"), "x")).toBe("Já existe alguém com esse apelido nesta sala");
  });

  test("network failures become the offline guidance", () => {
    expect(friendlyError(new TypeError("Failed to fetch"), "x")).toBe(OFFLINE_MESSAGE);
  });

  test("validation dumps are replaced by the fallback", () => {
    expect(friendlyError(new Error('[{"code":"too_big","maximum":20,"path":["nickname"]}]'), "Apelido inválido")).toBe("Apelido inválido");
  });

  test("database details are never shown", () => {
    expect(friendlyError(new Error('duplicate key value violates unique constraint "party_rooms_code_key"'), "Tente de novo")).toBe("Tente de novo");
  });
});
