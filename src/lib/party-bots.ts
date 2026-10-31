/**
 * Browser-safe rules for developer training bots. Bots are ordinary party_players rows (is_bot) with
 * no session; the host's device asks the server to "tick" them, and the server decides what they play.
 * Everything here is deterministic per (bot, round, phase) so concurrent ticks agree.
 */
import { normalizeText } from "./party-engine";

export const BOT_NICKNAMES = [
  "Robô Estagiário",
  "Dona Neusa Bot",
  "Tio do Pavê Bot",
  "Cleiton Robô",
  "Bot do Zap",
  "Siri Paraguaia",
  "Robozão da Firma",
  "Vó Conectada",
] as const;

/** At most this many bots per room, so a training table never crowds out real friends. */
export const MAX_BOTS = 5;

/** First bot nickname not already used in the room (case-insensitive), with a number when all are taken. */
export function nextBotName(taken: readonly string[]) {
  const used = new Set(taken.map((name) => name.toLocaleLowerCase("pt-BR")));
  const free = BOT_NICKNAMES.find((name) => !used.has(name.toLocaleLowerCase("pt-BR")));
  if (free) return free;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `Robô ${n}`;
    if (!used.has(candidate.toLocaleLowerCase("pt-BR"))) return candidate;
  }
  return `Robô ${Date.now() % 1000}`;
}

/** Stable pseudo-random number in [0, 1) for a seed (FNV-1a). */
export function seededUnit(seed: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % 100_000) / 100_000;
}

export type BotActionKind = "stop" | "text" | "vote";

/**
 * How long a bot "thinks" before acting, counted from the start of the phase. Votes are quick (2.5–8.5s);
 * writing takes part of the phase; it always leaves at least 4 seconds before the deadline.
 */
export function botDelayMs(input: { botId: string; round: number; phase: string; kind: BotActionKind; phaseSeconds?: number | null }) {
  const u = seededUnit(`${input.botId}:${input.round}:${input.phase}`);
  if (input.kind === "vote") return Math.round(2_500 + u * 6_000);
  const total = Math.max(20, input.phaseSeconds ?? 60) * 1000;
  const [from, span] = input.kind === "stop" ? [0.35, 0.4] : [0.2, 0.4];
  const wanted = Math.max(4_000, total * (from + u * span));
  return Math.round(Math.min(wanted, total - 4_000));
}

/* ------------------------------- Stop answers ------------------------------- */

type BankKey = "nome" | "animal" | "objeto" | "comida" | "cor" | "filme" | "profissao" | "lugar";
const BANK_ORDER: BankKey[] = ["nome", "animal", "objeto", "comida", "cor", "filme", "profissao", "lugar"];

/** One fallback answer per letter for the default category types (used when the AI is unavailable). */
const STOP_BANK: Record<string, string> = {
  A: "Ana|Abelha|Agulha|Arroz|Amarelo|Avatar|Advogado|Amazonas",
  B: "Bruno|Baleia|Bola|Banana|Branco|Batman|Bombeiro|Bahia",
  C: "Carla|Cavalo|Cadeira|Cuscuz|Cinza|Coringa|Cozinheiro|Curitiba",
  D: "Daniel|Dromedário|Dado|Doce de leite|Dourado|Divertida Mente|Dentista|Dinamarca",
  E: "Eduardo|Elefante|Escova|Empada|Esmeralda|Encanto|Engenheiro|Espanha",
  F: "Fernanda|Foca|Faca|Feijoada|Fúcsia|Frozen|Farmacêutico|Fortaleza",
  G: "Gabriel|Girafa|Garfo|Goiabada|Grafite|Gladiador|Garçom|Goiânia",
  H: "Helena|Hipopótamo|Hidrante|Hambúrguer|Havana|Harry Potter|Historiador|Holanda",
  I: "Isabela|Iguana|Ímã|Inhame|Índigo|Interestelar|Instrutor|Itália",
  J: "João|Jacaré|Jarra|Jabuticaba|Jade|Jurassic Park|Jornalista|Japão",
  L: "Lucas|Leão|Lápis|Lasanha|Laranja|Lilo & Stitch|Locutor|Londres",
  M: "Maria|Macaco|Mesa|Macarrão|Marrom|Matrix|Médico|Manaus",
  N: "Natália|Naja|Navalha|Nhoque|Nude|Noé|Nutricionista|Natal",
  O: "Otávio|Onça|Óculos|Omelete|Ocre|Oppenheimer|Oftalmologista|Olinda",
  P: "Pedro|Pato|Panela|Pizza|Preto|Pantera Negra|Professor|Paris",
  Q: "Quitéria|Quati|Quadro|Queijo||Quarteto Fantástico|Químico|Quixadá",
  R: "Rafael|Rato|Relógio|Risoto|Roxo|Rocky|Repórter|Recife",
  S: "Sofia|Sapo|Sofá|Sushi|Salmão|Shrek|Sapateiro|Salvador",
  T: "Thiago|Tatu|Tesoura|Torta|Turquesa|Titanic|Taxista|Tóquio",
  U: "Úrsula|Urso|Urna|Uva|Ultravioleta|Up|Urologista|Uruguai",
  V: "Vitória|Vaca|Vassoura|Vatapá|Verde|Velozes e Furiosos|Veterinário|Veneza",
  Z: "Zeca|Zebra|Zíper|Zabaione||Zootopia|Zelador|Zâmbia",
};

function bankKey(category: string): BankKey | null {
  const c = normalizeText(category);
  if (c.includes("nome")) return "nome";
  if (c.includes("animal") || c.includes("bicho")) return "animal";
  if (c.includes("objeto") || c.includes("coisa")) return "objeto";
  if (c.includes("comida") || c.includes("fruta") || c.includes("doce") || c.includes("prato") || c.includes("bebida")) return "comida";
  if (c.includes("cor")) return "cor";
  if (c.includes("filme") || c.includes("serie") || c.includes("desenho")) return "filme";
  if (c.includes("profiss")) return "profissao";
  if (c.includes("cep") || c.includes("cidade") || c.includes("estado") || c.includes("pais") || c.includes("lugar")) return "lugar";
  return null;
}

/** Built-in Stop answers for one bot: known category types get a word, ~12% are left blank on purpose. */
export function fallbackStopAnswers(botId: string, round: number, letter: string, categories: readonly string[]) {
  const row = (STOP_BANK[letter.toUpperCase()] ?? "").split("|");
  const answers: Record<string, string> = {};
  for (const category of categories) {
    const key = bankKey(category);
    const word = key ? row[BANK_ORDER.indexOf(key)] ?? "" : "";
    answers[category] = seededUnit(`${botId}:${round}:${category}`) < 0.12 ? "" : word;
  }
  return answers;
}

/* ---------------------------- Party text fallbacks ---------------------------- */

const LINES: Record<string, readonly string[]> = {
  defesa: [
    "Excelência, eu estava dormindo. Tenho 14 testemunhas: meus travesseiros.",
    "Isso é armação! Fui vítima de um sistema que não entende gênios.",
    "Confesso que estava lá, mas em espírito. Fisicamente eu estava no sofá.",
  ],
  acusacao: [
    "O réu é culpado e a cara de inocente dele só piora a situação.",
    "Tenho provas: prints, áudios e a minha intuição, que nunca falha.",
    "Todo mundo viu. Ele até pediu desculpas antes de fazer, isso é premeditação!",
  ],
  autor: ["Um pastel de vento com muita confiança.", "Minha tia no grupo da família às 6h da manhã.", "Fingir que o Wi-Fi caiu."],
  pista: ["Lembra a minha infância.", "Todo mundo já viu um.", "Tem a ver com o dia a dia."],
  debate: [
    "Esse lado é óbvio: qualquer pessoa sensata concordaria depois de um café.",
    "Os fatos, a lógica e a minha avó estão do meu lado. Caso encerrado.",
    "Se o outro lado estivesse certo, o mundo já teria acabado.",
  ],
  roleta: ["Eu faria isso de olhos fechados e cantando.", "Fácil: chamaria minha mãe e diria que foi ideia dela.", "Sairia correndo e voltaria com pão de queijo."],
};

/** A canned line for a bot when the AI is off or fails; role is "defesa", "acusacao", "autor", "pista", "debate" or "roleta". */
export function fallbackBotLine(role: string, seed: string) {
  const list = LINES[role] ?? LINES["roleta"]!;
  return list[Math.floor(seededUnit(seed) * list.length)] ?? list[0]!;
}

/** Deterministic pick from a list (votes and guesses). */
export function seededPick<T>(items: readonly T[], seed: string): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(seededUnit(seed) * items.length)];
}
