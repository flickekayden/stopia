import { z } from "zod";

/** Game payloads are small JSON objects; the caps keep oversized or deeply nested input out of the database. */
export const MAX_PAYLOAD_BYTES = 8_000;
export const MAX_PAYLOAD_KEYS = 40;
export const MAX_STOP_ANSWER_CATEGORIES = 30;

export const partyPayloadSchema = z
  .record(z.string().max(60), z.unknown())
  .refine((value) => Object.keys(value).length <= MAX_PAYLOAD_KEYS && JSON.stringify(value).length <= MAX_PAYLOAD_BYTES, "Resposta grande demais");

export const stopAnswersSchema = z
  .record(z.string().max(160), z.string().max(400))
  .refine((value) => Object.keys(value).length <= MAX_STOP_ANSWER_CATEGORIES, "Categorias demais");
