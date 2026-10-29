/**
 * Party mini-game AI. Each game has its own isolated instructions; none of them reuse
 * or modify the Stop judge prompt. Only the existing provider helper is shared.
 * Every caller has a deterministic fallback, so AI failures never corrupt a match.
 */
import { generateJsonGemini } from "./ai.server";
import type { PartyTone } from "./party-games";

const TONES: Record<PartyTone, string> = {
  padrao: "",
  leve: " Tom definido pelo administrador: leve e carinhoso, sem humilhar ninguém.",
  acido: " Tom definido pelo administrador: ácido e bem sarcástico, mas sem ofender.",
  teatral: " Tom definido pelo administrador: teatral, dramático e exagerado.",
};

/** Optional developer-chosen tone; it only changes style, never rules, votes or scores. */
function toneLine(tone?: PartyTone) {
  return tone ? TONES[tone] ?? "" : "";
}

const SAFETY = [
  "Conteúdo 100% fictício e de brincadeira entre amigos, em português do Brasil.",
  "Proibido: crimes reais graves, violência, conteúdo sexual, drogas, ofensas a grupos, política partidária, dados pessoais e desafios perigosos ou ilegais.",
  "Seja curto, engraçado e direto.",
].join(" ");

const PROMPT_TIMEOUT_MS = 9_000;

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export async function aiTribunalCase(defendant: string, previous: string[], tone?: PartyTone) {
  const result = await withTimeout(
    generateJsonGemini<{ titulo: string; acusacao: string }>({
      instructions: `Você cria casos para o jogo "Tribunal dos Amigos": uma acusação fictícia, absurda e cotidiana contra um amigo. ${SAFETY} A acusação tem no máximo 25 palavras e cita o réu pelo apelido.${toneLine(tone)}`,
      input: JSON.stringify({ reu: defendant, evitar_parecidos_com: previous.slice(-10) }),
      schemaName: "tribunal_case",
      schema: { type: "object", additionalProperties: false, required: ["titulo", "acusacao"], properties: { titulo: { type: "string" }, acusacao: { type: "string" } } },
    }),
    PROMPT_TIMEOUT_MS,
  );
  const title = clean(result.titulo, 60);
  const text = clean(result.acusacao, 220);
  if (!title || !text) throw new Error("vazio");
  return { title, text };
}

export async function aiTribunalVerdict(input: {
  caso: string;
  reu: string;
  defesa: string;
  acusacoes: string[];
  veredito: "culpado" | "inocente";
  votos_culpado: number;
  votos_inocente: number;
}, tone?: PartyTone) {
  const result = await generateJsonGemini<{ sentenca: string }>({
    instructions: `Você é o Juiz do "Tribunal dos Amigos", sarcástico e teatral. O júri já decidiu o veredito; você NÃO pode mudá-lo, apenas anunciá-lo com uma sentença cômica e uma "pena" fictícia e inofensiva. ${SAFETY} Máximo de 45 palavras.${toneLine(tone)}`,
    input: JSON.stringify(input),
    schemaName: "tribunal_verdict",
    schema: { type: "object", additionalProperties: false, required: ["sentenca"], properties: { sentenca: { type: "string" } } },
  });
  return clean(result.sentenca, 400);
}

export async function aiAutorPrompt(previous: string[], tone?: PartyTone) {
  const result = await withTimeout(
    generateJsonGemini<{ pergunta: string }>({
      instructions: `Você cria perguntas para o jogo "Quem Escreveu Essa Desgraça?": perguntas abertas e engraçadas que rendem respostas criativas e curtas. ${SAFETY} Máximo de 20 palavras.${toneLine(tone)}`,
      input: JSON.stringify({ evitar_parecidas_com: previous.slice(-10) }),
      schemaName: "autor_prompt",
      schema: { type: "object", additionalProperties: false, required: ["pergunta"], properties: { pergunta: { type: "string" } } },
    }),
    PROMPT_TIMEOUT_MS,
  );
  const text = clean(result.pergunta, 200);
  if (!text) throw new Error("vazio");
  return text;
}

export async function aiAutorComment(input: { pergunta: string; respostas: { texto: string; autor: string; quantos_adivinharam_o_autor: number }[] }, tone?: PartyTone) {
  const result = await generateJsonGemini<{ comentario: string }>({
    instructions: `Você é o apresentador debochado do jogo "Quem Escreveu Essa Desgraça?". Comente a rodada em tom de zoeira leve, elegendo a resposta mais "desgraçada". Não altere pontos. ${SAFETY} Máximo de 45 palavras.${toneLine(tone)}`,
    input: JSON.stringify(input),
    schemaName: "autor_comment",
    schema: { type: "object", additionalProperties: false, required: ["comentario"], properties: { comentario: { type: "string" } } },
  });
  return clean(result.comentario, 400);
}

export async function aiDebateTopic(previous: string[], tone?: PartyTone) {
  const result = await withTimeout(
    generateJsonGemini<{ tema: string; lado_a: string; lado_b: string }>({
      instructions: `Você cria temas para o jogo "Debate Impossível": um tema absurdo e cotidiano e dois lados opostos. ${SAFETY} O tema tem até 6 palavras. Cada lado é só uma POSIÇÃO curta e neutra (até 5 palavras), como "A favor (aconchego total)" ou "Contra (aberração nos pés)". Nunca escreva um argumento pronto nos lados: quem joga é que vai argumentar.${toneLine(tone)}`,
      input: JSON.stringify({ evitar_parecidos_com: previous.slice(-10) }),
      schemaName: "debate_topic",
      schema: { type: "object", additionalProperties: false, required: ["tema", "lado_a", "lado_b"], properties: { tema: { type: "string" }, lado_a: { type: "string" }, lado_b: { type: "string" } } },
    }),
    PROMPT_TIMEOUT_MS,
  );
  const title = clean(result.tema, 80);
  const sideA = clean(result.lado_a, 60);
  const sideB = clean(result.lado_b, 60);
  if (!title || !sideA || !sideB) throw new Error("vazio");
  return { title, sideA, sideB };
}

const JUDGE_TIMEOUT_MS = 20_000;

/**
 * Debate judge: arguments arrive under neutral labels (no nicknames) so the AI judges the text only.
 * Returns the winning label, a 0–2 bonus for how decisive the win was and a short verdict.
 */
export async function aiJudgeDebate(input: { tema: string; lado_a: string; lado_b: string; argumentos: { rotulo: string; lado: "A" | "B"; texto: string }[] }, tone?: PartyTone) {
  const labels = input.argumentos.map((a) => a.rotulo);
  const result = await withTimeout(
    generateJsonGemini<{ vencedor: string; bonus: number; veredito: string }>({
      instructions: `Você é o juiz de um tribunal de debates cômico e rigoroso no jogo "Debate Impossível". Cada argumento defende o lado sorteado (A ou B), concordando ou não. Avalie oratória, convicção, criatividade, nível de absurdo bem usado e humor; ignore erros de digitação. Argumento vazio ou fora do tema perde. Escolha UM vencedor pelo rótulo. "bonus": 0 vitória apertada, 1 vitória clara, 2 massacre. "veredito": anuncie o vencedor com humor sarcástico citando o porquê, sem humilhar ninguém. Refira-se aos argumentos só como "o Lado A" e "o Lado B" (ou "a defesa do Lado A"), nunca pelo rótulo ou número. ${SAFETY} Máximo de 45 palavras no veredito.${toneLine(tone)}`,
      input: JSON.stringify(input),
      schemaName: "debate_judge",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["vencedor", "bonus", "veredito"],
        properties: { vencedor: { type: "string", enum: labels }, bonus: { type: "integer", minimum: 0, maximum: 2 }, veredito: { type: "string" } },
      },
    }),
    JUDGE_TIMEOUT_MS,
  );
  const winner = labels.includes(result.vencedor) ? result.vencedor : null;
  const verdict = clean(result.veredito, 400);
  if (!winner || !verdict) throw new Error("vazio");
  return { winner, bonus: Number(result.bonus) || 0, verdict };
}

/** Roleta judge: 0–3 points per answer for meeting the challenge with wit, plus a one-line note each. */
export async function aiJudgeRoleta(input: { desafio: string; respostas: { rotulo: string; texto: string }[] }, tone?: PartyTone) {
  const labels = input.respostas.map((r) => r.rotulo);
  const result = await withTimeout(
    generateJsonGemini<{ notas: { rotulo: string; pontos: number; comentario: string }[]; resumo: string }>({
      instructions: `Você é o juiz da "Roleta do Caos". Para cada resposta, dê de 0 a 3 pontos: 0 não cumpriu o desafio, 1 cumpriu sem graça, 2 cumpriu com criatividade, 3 genial e hilária. "comentario" com até 12 palavras por resposta. "resumo": eleja a melhor com humor, até 35 palavras, citando um trecho dela e nunca pelo rótulo ou número. ${SAFETY}${toneLine(tone)}`,
      input: JSON.stringify(input),
      schemaName: "roleta_judge",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["notas", "resumo"],
        properties: {
          notas: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["rotulo", "pontos", "comentario"],
              properties: { rotulo: { type: "string", enum: labels }, pontos: { type: "integer", minimum: 0, maximum: 3 }, comentario: { type: "string" } },
            },
          },
          resumo: { type: "string" },
        },
      },
    }),
    JUDGE_TIMEOUT_MS,
  );
  const notes: Record<string, { points: number; comment: string }> = {};
  for (const row of result.notas ?? []) {
    if (!labels.includes(row.rotulo)) continue;
    notes[row.rotulo] = { points: Math.max(0, Math.min(3, Math.round(Number(row.pontos) || 0))), comment: clean(row.comentario, 120) };
  }
  if (Object.keys(notes).length === 0) throw new Error("vazio");
  return { notes, summary: clean(result.resumo, 300) };
}

/**
 * Tribunal judge: the defense and accusations arrive with neutral labels; the AI decides the verdict,
 * may pick the best accusation and gives a 0–2 bonus. Scoring stays in the deterministic engine.
 */
export async function aiJudgeTribunal(input: { caso: string; defesa: string; acusacoes: { rotulo: string; texto: string }[] }, tone?: PartyTone) {
  const labels = input.acusacoes.map((a) => a.rotulo);
  const result = await withTimeout(
    generateJsonGemini<{ veredito: "culpado" | "inocente"; melhor_acusacao: string; bonus: number; sentenca: string; raciocinio: string }>({
      instructions: `Você é o Juiz Supremo do "Tribunal dos Amigos", teatral e sarcástico. O caso é fictício e absurdo. Leia a defesa do réu e as acusações e decida com justiça cômica: "culpado" se a acusação convenceu mais, "inocente" se a defesa convenceu mais. Avalie criatividade, lógica absurda bem usada, humor e convicção; texto vazio ou fora do caso perde. "melhor_acusacao": o rótulo da acusação mais convincente (ou "nenhuma" se não houver). "bonus": 0 decisão apertada, 1 clara, 2 massacre. "sentenca": se culpado, uma pena fictícia, absurda e inofensiva; se inocente, a absolvição com pompa (até 30 palavras). "raciocinio": o porquê do veredito com humor (até 40 palavras). Refira-se só a "a defesa" e "a acusação", nunca a rótulos ou números. ${SAFETY}${toneLine(tone)}`,
      input: JSON.stringify(input),
      schemaName: "tribunal_judge",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["veredito", "melhor_acusacao", "bonus", "sentenca", "raciocinio"],
        properties: {
          veredito: { type: "string", enum: ["culpado", "inocente"] },
          melhor_acusacao: { type: "string", enum: [...labels, "nenhuma"] },
          bonus: { type: "integer", minimum: 0, maximum: 2 },
          sentenca: { type: "string" },
          raciocinio: { type: "string" },
        },
      },
    }),
    JUDGE_TIMEOUT_MS,
  );
  const verdict = result.veredito === "culpado" || result.veredito === "inocente" ? result.veredito : null;
  const sentence = clean(result.sentenca, 300);
  const reasoning = clean(result.raciocinio, 360);
  if (!verdict || (!sentence && !reasoning)) throw new Error("vazio");
  return {
    verdict,
    bestLabel: labels.includes(result.melhor_acusacao) ? result.melhor_acusacao : null,
    bonus: Number(result.bonus) || 0,
    sentence,
    reasoning,
  };
}

/**
 * Debate podium: comic awards for the whole match. Players arrive as labels with their nickname so the
 * text can name them; the AI never changes scores, it only comments on the final ranking.
 */
export async function aiMatchSummaryDebate(input: {
  rodadas: { tema: string; lado_a: string; lado_b: string; argumentos: { rotulo: string; lado: "A" | "B"; texto: string }[] }[];
  jogadores: { rotulo: string; apelido: string; pontos: number }[];
}, tone?: PartyTone) {
  const labels = input.jogadores.map((j) => j.rotulo);
  const result = await withTimeout(
    generateJsonGemini<{ advogado_do_diabo: { rotulo: string; texto: string }; mestre_do_malabarismo: { rotulo: string; texto: string }; palavra_final: string }>({
      instructions: `Você é a Corte Suprema do "Debate Impossível" e vai encerrar a partida com troféus cômicos, lendo os argumentos de todas as rodadas. "advogado_do_diabo": quem usou os argumentos mais perigosamente convincentes. "mestre_do_malabarismo": quem defendeu o lado mais impossível com mais cara de pau (de preferência outra pessoa; em dupla pode ser qualquer um). Em cada troféu, "texto" com até 20 palavras citando o apelido e algo que a pessoa escreveu. "palavra_final": comentário ácido e divertido sobre o embate de toda a partida, até 50 palavras, citando apelidos. Não altere pontos nem o ranking. ${SAFETY}${toneLine(tone)}`,
      input: JSON.stringify(input),
      schemaName: "debate_match_summary",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["advogado_do_diabo", "mestre_do_malabarismo", "palavra_final"],
        properties: {
          advogado_do_diabo: { type: "object", additionalProperties: false, required: ["rotulo", "texto"], properties: { rotulo: { type: "string", enum: labels }, texto: { type: "string" } } },
          mestre_do_malabarismo: { type: "object", additionalProperties: false, required: ["rotulo", "texto"], properties: { rotulo: { type: "string", enum: labels }, texto: { type: "string" } } },
          palavra_final: { type: "string" },
        },
      },
    }),
    JUDGE_TIMEOUT_MS,
  );
  const highlights: { label: string; title: string; text: string }[] = [];
  const devil = result.advogado_do_diabo;
  const juggler = result.mestre_do_malabarismo;
  if (devil && labels.includes(devil.rotulo) && clean(devil.texto, 200)) highlights.push({ label: devil.rotulo, title: "Advogado do Diabo", text: clean(devil.texto, 200) });
  if (juggler && labels.includes(juggler.rotulo) && clean(juggler.texto, 200)) highlights.push({ label: juggler.rotulo, title: "Mestre do Malabarismo", text: clean(juggler.texto, 200) });
  const summary = clean(result.palavra_final, 420);
  if (highlights.length === 0 && !summary) throw new Error("vazio");
  return { highlights, summary };
}

export async function aiDebateComment(input: { tema: string; lado_a: string; lado_b: string; argumentos: { lado: string; autor: string; texto: string; votos: number }[] }, tone?: PartyTone) {
  const result = await generateJsonGemini<{ comentario: string }>({
    instructions: `Você é o mediador irônico do "Debate Impossível". Comente o debate destacando o argumento mais cara de pau. A votação já definiu o resultado; não mude pontos. ${SAFETY} Máximo de 45 palavras.${toneLine(tone)}`,
    input: JSON.stringify(input),
    schemaName: "debate_comment",
    schema: { type: "object", additionalProperties: false, required: ["comentario"], properties: { comentario: { type: "string" } } },
  });
  return clean(result.comentario, 400);
}

export async function aiRoletaChallenge(intensity: "leve" | "media" | "caotica", previous: string[], adminTone?: PartyTone) {
  const tone = intensity === "leve" ? "bem leve e fofo" : intensity === "media" ? "engraçado e criativo" : "caótico e absurdo, porém inofensivo";
  const result = await withTimeout(
    generateJsonGemini<{ titulo: string; desafio: string }>({
      instructions: `Você cria desafios para a "Roleta do Caos". O desafio é cumprido POR ESCRITO no celular, em uma resposta curta. Tom: ${tone}. ${SAFETY} Nunca peça informações pessoais, fotos, contato com terceiros ou ações físicas. Título com até 4 palavras; desafio com até 25 palavras.${toneLine(adminTone)}`,
      input: JSON.stringify({ evitar_parecidos_com: previous.slice(-10) }),
      schemaName: "roleta_challenge",
      schema: { type: "object", additionalProperties: false, required: ["titulo", "desafio"], properties: { titulo: { type: "string" }, desafio: { type: "string" } } },
    }),
    PROMPT_TIMEOUT_MS,
  );
  const title = clean(result.titulo, 50);
  const text = clean(result.desafio, 220);
  if (!title || !text) throw new Error("vazio");
  return { title, text };
}
