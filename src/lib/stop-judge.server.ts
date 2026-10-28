/**
 * Stop's AI judge: the exact prompt, schema and scoring normalization used by every Stop round.
 * Shared by the classic Stop rooms (game.functions) and the group-room Stop (party.server).
 * Do not edit the prompt text or scoring rules here: the AI behavior is protected.
 */
import type { Evaluation } from "./game";

export type JudgeConfig = {
  prompt?: string | undefined;
  model?: string | undefined;
  sarcasm?: number | undefined;
  persona?: string | undefined;
  scoringMode?: "fixed" | "free" | undefined;
};

export const evaluationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["resultados"],
  properties: {
    resultados: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["categoria", "jogador_id", "resposta", "pontos", "comentario"],
        properties: {
          categoria: { type: "string" },
          jogador_id: { type: "string" },
          resposta: { type: "string" },
          pontos: { type: "integer", enum: [0, 5, 10, 15, 20] },
          comentario: { type: "string" },
        },
      },
    },
  },
};

export const EVAL_INSTRUCTIONS = `Você é o juiz SARCÁSTICO, DEBOCHADO e SEM PIEDADE de um jogo de Stop/Adedonha entre amigos. É um jogo privado, todos os jogadores se conhecem e esperam ser zoados. Humilhar com humor é o papel do juiz: ninguém pode se ofender e NADA deve ser gentil ou diplomático.

Regras de pontuação:
- 0: em branco, inválida, não começa com a letra sorteada ou não pertence à categoria.
- 5: repetida ou semanticamente equivalente a outra resposta da MESMA categoria (mesmo núcleo conceitual). Ex.: "celular" x "smartphone", "cerveja" x "cerveja Skol", "peixe cozido" x "peixe frito". Já "cachorro" x "gato", "carro" x "moto", "iPhone" x "Samsung Galaxy" são diferentes. Quando houver repetição, TODAS as respostas envolvidas recebem 5.
- 10: válida e comum.
- 15: claramente criativa, engraçada, irônica ou inesperada.
- 20: sacada genial e defensável (raciocínio lateral, inversão lógica, duplo sentido). Seja seletivo: não dê 20 só porque é longa, aleatória ou engraçada.

Aceite acentos, sinônimos, apelidos, nomes populares e variações conhecidas. Recuse respostas forçadas sem relação defensável com a categoria.

Comentário: MUITO curto (máx. ~12 palavras), ácido, debochado e pessoal, como um amigo irônico que acabou de ver a resposta. Atire na preguiça, no óbvio, no errado e na resposta fraca. Se a resposta for genérica, diga que é preguiçosa; se for errada, destrua com humor; se for boa, reconheça mas com desdém ("até que enfim", "parece que você pensou mesmo"). Pode usar gíria brasileira, ironia, segunda pessoa ("você") e comparações humilhantes criativas. Proibido: elogio puro, comentário neutro, tom de professor ou aviso educativo. Varie o formato: umas são zoações diretas, outras comparações, outras falsos elogios. Resposta em branco recebe 0 e uma humilhação curta e criativa por ter deixado em branco (nunca a mesma fórmula).

Devolva exatamente um item para CADA combinação de jogador x categoria, repetindo a resposta original no campo "resposta" (string vazia se em branco).`;

const FIXED_RULES = /Regras de pontuação:[\s\S]*?(?=\n\nAceite)/;
const FREE_RULES = `Regras de pontuação (LIVRE, de 0 a 20):
- Dê QUALQUER número inteiro de 0 a 20 (ex.: 3, 7, 12, 18). NÃO se limite a múltiplos de 5.
- 0: em branco, inválida, não começa com a letra sorteada ou não pertence à categoria.
- Respostas repetidas ou equivalentes na mesma categoria valem pouco (todas as envolvidas).
- Quanto mais criativa, rara, engraçada e defensável, maior a nota; reserve 19-20 para sacadas geniais.`;

export function buildEval(dev: JudgeConfig | undefined) {
  const freeMode = dev?.scoringMode === "free";
  let instructions = dev?.prompt?.trim() || EVAL_INSTRUCTIONS;
  if (freeMode) {
    instructions = FIXED_RULES.test(instructions) ? instructions.replace(FIXED_RULES, FREE_RULES) : `${instructions}\n\n${FREE_RULES}`;
  }
  if (dev?.persona?.trim()) {
    instructions += `\n\nPersonalidade do juiz (prioridade sobre o tom acima): ${dev.persona.trim()}`;
  }
  if (dev?.sarcasm) {
    instructions += `\n\nNível de sarcasmo dos comentários: ${dev.sarcasm}/10 (1 = neutro e gentil, 10 = humilhação máxima). Ajuste o tom a esse nível.`;
  }
  const free = freeMode;
  const schema = free
    ? JSON.parse(JSON.stringify(evaluationSchema).replace('"enum":[0,5,10,15,20]', '"minimum":0,"maximum":20'))
    : evaluationSchema;
  return { instructions, schema, free, model: dev?.model };
}

export function clampPoints(n: unknown, free: boolean) {
  const v = Math.max(0, Math.min(20, Math.round(Number(n) || 0)));
  return free ? v : Math.round(v / 5) * 5;
}

export type JudgePlayer = { jogador_id: string; apelido: string; respostas: Record<string, string> };

/** One AI call for a whole round, normalized to exactly one result per player x category. */
export async function judgeRound(params: { letter: string; categories: string[]; players: JudgePlayer[]; dev: JudgeConfig | undefined }) {
  const cfg = buildEval(params.dev);
  const { generateJsonGemini } = await import("./ai.server");
  const started = Date.now();
  const result = await generateJsonGemini<Evaluation>({
    instructions: cfg.instructions,
    schemaName: "avaliacao_rodada",
    schema: cfg.schema,
    model: cfg.model,
    input: JSON.stringify({
      letra: params.letter,
      categorias: params.categories,
      jogadores: params.players,
    }),
  });
  const latencyMs = Date.now() - started;

  // Normalize: guarantee one entry per player x category.
  const resultados = params.categories.flatMap((categoria) =>
    params.players.map((p) => {
      const found = result.resultados.find(
        (r) => r.categoria === categoria && r.jogador_id === p.jogador_id,
      );
      const resposta = p.respostas[categoria] ?? "";
      return {
        categoria,
        jogador_id: p.jogador_id,
        resposta,
        pontos: resposta ? clampPoints(found?.pontos, cfg.free) : 0,
        comentario: found?.comentario ?? (resposta ? "Tão ruim que o juiz fingiu que não viu." : "Em branco. Estratégia ousada de perder pontos."),
      };
    }),
  );
  const evaluation: Evaluation = { resultados };
  return { evaluation, latencyMs };
}
