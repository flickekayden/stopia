/**
 * Party mini-game AI. Each game has its own isolated instructions; none of them reuse
 * or modify the Stop judge prompt. Only the existing provider helper is shared.
 * Every caller has a deterministic fallback, so AI failures never corrupt a match.
 */
import { generateJsonGemini } from "./ai.server";

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

export async function aiTribunalCase(defendant: string, previous: string[]) {
  const result = await withTimeout(
    generateJsonGemini<{ titulo: string; acusacao: string }>({
      instructions: `Você cria casos para o jogo "Tribunal dos Amigos": uma acusação fictícia, absurda e cotidiana contra um amigo. ${SAFETY} A acusação tem no máximo 25 palavras e cita o réu pelo apelido.`,
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
}) {
  const result = await generateJsonGemini<{ sentenca: string }>({
    instructions: `Você é o Juiz do "Tribunal dos Amigos", sarcástico e teatral. O júri já decidiu o veredito; você NÃO pode mudá-lo, apenas anunciá-lo com uma sentença cômica e uma "pena" fictícia e inofensiva. ${SAFETY} Máximo de 45 palavras.`,
    input: JSON.stringify(input),
    schemaName: "tribunal_verdict",
    schema: { type: "object", additionalProperties: false, required: ["sentenca"], properties: { sentenca: { type: "string" } } },
  });
  return clean(result.sentenca, 400);
}

export async function aiAutorPrompt(previous: string[]) {
  const result = await withTimeout(
    generateJsonGemini<{ pergunta: string }>({
      instructions: `Você cria perguntas para o jogo "Quem Escreveu Essa Desgraça?": perguntas abertas e engraçadas que rendem respostas criativas e curtas. ${SAFETY} Máximo de 20 palavras.`,
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

export async function aiAutorComment(input: { pergunta: string; respostas: { texto: string; autor: string; acertos: number }[] }) {
  const result = await generateJsonGemini<{ comentario: string }>({
    instructions: `Você é o apresentador debochado do jogo "Quem Escreveu Essa Desgraça?". Comente a rodada em tom de zoeira leve, elegendo a resposta mais "desgraçada". Não altere pontos. ${SAFETY} Máximo de 45 palavras.`,
    input: JSON.stringify(input),
    schemaName: "autor_comment",
    schema: { type: "object", additionalProperties: false, required: ["comentario"], properties: { comentario: { type: "string" } } },
  });
  return clean(result.comentario, 400);
}

export async function aiDebateTopic(previous: string[]) {
  const result = await withTimeout(
    generateJsonGemini<{ tema: string; lado_a: string; lado_b: string }>({
      instructions: `Você cria dilemas para o jogo "Debate Impossível": um tema absurdo e dois lados opostos, ambos defensáveis de forma cômica. ${SAFETY} Tema com até 8 palavras; cada lado com até 12 palavras.`,
      input: JSON.stringify({ evitar_parecidos_com: previous.slice(-10) }),
      schemaName: "debate_topic",
      schema: { type: "object", additionalProperties: false, required: ["tema", "lado_a", "lado_b"], properties: { tema: { type: "string" }, lado_a: { type: "string" }, lado_b: { type: "string" } } },
    }),
    PROMPT_TIMEOUT_MS,
  );
  const title = clean(result.tema, 80);
  const sideA = clean(result.lado_a, 120);
  const sideB = clean(result.lado_b, 120);
  if (!title || !sideA || !sideB) throw new Error("vazio");
  return { title, sideA, sideB };
}

export async function aiDebateComment(input: { tema: string; lado_a: string; lado_b: string; argumentos: { lado: string; autor: string; texto: string; votos: number }[] }) {
  const result = await generateJsonGemini<{ comentario: string }>({
    instructions: `Você é o mediador irônico do "Debate Impossível". Comente o debate destacando o argumento mais cara de pau. A votação já definiu o resultado; não mude pontos. ${SAFETY} Máximo de 45 palavras.`,
    input: JSON.stringify(input),
    schemaName: "debate_comment",
    schema: { type: "object", additionalProperties: false, required: ["comentario"], properties: { comentario: { type: "string" } } },
  });
  return clean(result.comentario, 400);
}

export async function aiRoletaChallenge(intensity: "leve" | "media" | "caotica", previous: string[]) {
  const tone = intensity === "leve" ? "bem leve e fofo" : intensity === "media" ? "engraçado e criativo" : "caótico e absurdo, porém inofensivo";
  const result = await withTimeout(
    generateJsonGemini<{ titulo: string; desafio: string }>({
      instructions: `Você cria desafios para a "Roleta do Caos". O desafio é cumprido POR ESCRITO no celular, em uma resposta curta. Tom: ${tone}. ${SAFETY} Nunca peça informações pessoais, fotos, contato com terceiros ou ações físicas. Título com até 4 palavras; desafio com até 25 palavras.`,
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
