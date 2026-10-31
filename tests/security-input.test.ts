import { describe, expect, test } from "bun:test";

import { partyPayloadSchema, stopAnswersSchema } from "../src/lib/party-input";

describe("server input limits", () => {
  test("a normal game answer is accepted", () => {
    expect(partyPayloadSchema.safeParse({ text: "Minha defesa é que o réu é inocente." }).success).toBe(true);
  });

  test("a game payload over 8,000 characters is rejected", () => {
    expect(partyPayloadSchema.safeParse({ text: "x".repeat(8_001) }).success).toBe(false);
  });

  test("a game payload with more than 40 fields is rejected", () => {
    const big = Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`k${i}`, 1]));
    expect(partyPayloadSchema.safeParse(big).success).toBe(false);
  });

  test("Stop answers above 400 characters are rejected", () => {
    expect(stopAnswersSchema.safeParse({ Animal: "a".repeat(401) }).success).toBe(false);
  });

  test("Stop answers for more than 30 categories are rejected", () => {
    const many = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`Categoria ${i}`, "Pato"]));
    expect(stopAnswersSchema.safeParse(many).success).toBe(false);
    expect(stopAnswersSchema.safeParse({ Animal: "Pato", Cor: "Preto" }).success).toBe(true);
  });
});
