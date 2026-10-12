export const LETTERS = "ABCDEFGHIJLMNOPQRSTUVZ".split("");

export const DEFAULT_CATEGORIES = [
  "Nome",
  "Animal",
  "Objeto",
  "Comida",
  "Cor",
  "Filme ou Série",
  "Profissão",
  "CEP (cidade, estado ou país)",
];

export const MAX_CATEGORIES_PER_ROUND = 8;

export type Evaluation = {
  resultados: {
    categoria: string;
    jogador_id: string;
    resposta: string;
    pontos: number;
    comentario: string;
  }[];
};

export type FinalAnalysis = {
  analises: { jogador_id: string; texto: string }[];
};

export function pickLetter(used: string[], excluded: string[]): string {
  const pool = LETTERS.filter((l) => !excluded.includes(l));
  const available = pool.filter((l) => !used.includes(l));
  const from = available.length > 0 ? available : pool;
  if (from.length === 0) return "A";
  return from[Math.floor(Math.random() * from.length)]!;
}

/** Rotation: least-recently-used categories first, random tie-break. */
export function pickCategories(
  all: string[],
  usage: Record<string, number>,
  count = MAX_CATEGORIES_PER_ROUND,
): string[] {
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  return shuffled.sort((a, b) => (usage[a] ?? -1) - (usage[b] ?? -1)).slice(0, count);
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
