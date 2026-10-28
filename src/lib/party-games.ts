/** Browser-safe catalogue and shared types for the party mini-games (Stop stays in its own modules). */

export type PartyGameId = "tribunal" | "autor" | "infiltrado" | "debate" | "roleta";

export const PARTY_GAME_IDS: readonly PartyGameId[] = ["tribunal", "autor", "infiltrado", "debate", "roleta"];

export type PartyPhaseId =
  | "lobby"
  | "defense"
  | "write"
  | "clues"
  | "argue"
  | "respond"
  | "vote"
  | "guess"
  | "last_guess"
  | "reveal"
  | "final";

export type PartyGameMeta = {
  id: PartyGameId;
  name: string;
  short: string;
  description: string;
  minPlayers: number;
  icon: "gavel" | "feather" | "eye" | "mic" | "dices";
  rules: string[];
  scoring: string[];
};

export const PARTY_GAMES: Record<PartyGameId, PartyGameMeta> = {
  tribunal: {
    id: "tribunal",
    name: "Tribunal dos Amigos",
    short: "Acusações absurdas, defesas desesperadas e um veredito.",
    description: "A cada rodada um amigo vira réu de um caso fictício. Ele se defende, o resto acusa, e o júri decide.",
    minPlayers: 3,
    icon: "gavel",
    rules: [
      "Cada rodada sorteia um réu (todo mundo passa pelo banco dos réus) e um caso fictício e absurdo.",
      "O réu escreve a defesa; os outros escrevem uma acusação ou testemunho.",
      "Todos menos o réu votam: culpado ou inocente. Empate = inocente.",
      "É tudo brincadeira: nenhuma acusação é um fato real.",
    ],
    scoring: ["Réu absolvido: +3 para o réu.", "Quem votou com a maioria: +1."],
  },
  autor: {
    id: "autor",
    name: "Quem Escreveu Essa Desgraça?",
    short: "Respostas anônimas. Descubra quem escreveu cada uma.",
    description: "Todos respondem a mesma pergunta. As respostas aparecem sem nome e a galera tenta adivinhar o autor.",
    minPlayers: 3,
    icon: "feather",
    rules: [
      "Todo mundo responde a mesma pergunta engraçada.",
      "As respostas aparecem embaralhadas e sem nome — nem o servidor conta quem é quem antes da revelação.",
      "Para cada resposta, chute quem escreveu. Você não chuta a sua nem vota em si mesmo.",
      "Depois da revelação, a resposta não pode mais ser alterada.",
    ],
    scoring: ["Acertou o autor: +1.", "Enganou alguém com a sua resposta: +1 por pessoa enganada."],
  },
  infiltrado: {
    id: "infiltrado",
    name: "Infiltrado",
    short: "Todos sabem a palavra secreta. Menos um.",
    description: "Um jogador não recebe a palavra secreta. Dê pistas sem entregar a palavra e descubra quem está blefando.",
    minPlayers: 3,
    icon: "eye",
    rules: [
      "Todos veem a categoria. Só os cidadãos recebem a palavra secreta; o infiltrado não.",
      "Cada um escreve uma pista curta. As pistas só aparecem quando todos enviarem.",
      "Votem em quem parece ser o infiltrado (não vale votar em si mesmo).",
      "Se o infiltrado for o mais votado, ele ainda tem uma chance de adivinhar a palavra.",
    ],
    scoring: [
      "Infiltrado escapou (não foi o mais votado ou houve empate): +3 para ele.",
      "Pego, mas adivinhou a palavra: +2 para ele.",
      "Pego e errou: +1 para cada cidadão e +1 extra para quem votou nele.",
    ],
  },
  debate: {
    id: "debate",
    name: "Debate Impossível",
    short: "Defenda o indefensável. O melhor argumento vence.",
    description: "Um dilema absurdo, dois lados sorteados. Cada um defende o seu lado e o grupo vota no melhor argumento.",
    minPlayers: 2,
    icon: "mic",
    rules: [
      "A rodada traz um dilema absurdo com dois lados: A e B.",
      "Os jogadores são divididos em dois times; cada um defende o lado sorteado, concordando ou não.",
      "Todos votam no melhor argumento (não vale o próprio).",
    ],
    scoring: ["+1 por voto recebido.", "Time com mais votos no total: +1 para cada membro. Empate: ninguém ganha o bônus."],
  },
  roleta: {
    id: "roleta",
    name: "Roleta do Caos",
    short: "Desafios aleatórios, eventos malucos e votação rápida.",
    description: "A roleta sorteia um desafio e um evento do caos. Todos cumprem por escrito e o grupo vota na melhor resposta.",
    minPlayers: 2,
    icon: "dices",
    rules: [
      "A roleta sorteia um desafio da intensidade escolhida e um evento do caos (pontos em dobro, triplo...).",
      "Todos respondem por escrito. Nada perigoso, ilegal ou que exponha dados pessoais.",
      "O mestre pode pular desafios até o limite configurado.",
      "Todos votam na melhor resposta (não vale a própria).",
    ],
    scoring: ["Cada voto recebido vale pontos multiplicados pelo evento da rodada."],
  },
};

export type PartySettings = {
  rounds: number;
  ai: boolean;
  intensity: "leve" | "media" | "caotica";
  skips: number;
};

export const DEFAULT_PARTY_SETTINGS: PartySettings = { rounds: 5, ai: true, intensity: "media", skips: 1 };
export const PARTY_ROUND_OPTIONS = [3, 5, 8] as const;
export const PARTY_SKIP_OPTIONS = [0, 1, 3] as const;
export const PARTY_TEXT_MAX = 220;

export function readPartySettings(raw: unknown): PartySettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<PartySettings>;
  return {
    rounds: PARTY_ROUND_OPTIONS.includes(value.rounds as 3) ? (value.rounds as number) : DEFAULT_PARTY_SETTINGS.rounds,
    ai: typeof value.ai === "boolean" ? value.ai : DEFAULT_PARTY_SETTINGS.ai,
    intensity: value.intensity === "leve" || value.intensity === "caotica" || value.intensity === "media" ? value.intensity : DEFAULT_PARTY_SETTINGS.intensity,
    skips: PARTY_SKIP_OPTIONS.includes(value.skips as 0) ? (value.skips as number) : DEFAULT_PARTY_SETTINGS.skips,
  };
}

export type PartyPrompt = {
  title: string;
  text: string;
  sideA?: string;
  sideB?: string;
  category?: string;
  event?: { label: string; multiplier: number };
  source: "ai" | "banco";
};

export type PartyEntry = { id: string; playerId?: string; text: string };

export type PartyAiState = { status: "pending" | "done" | "failed" | "off"; text?: string };

/** Revealed round outcome; written only after the phase that hides it has closed. */
export type PartyResults = {
  notice?: string;
  counts?: Record<string, number>;
  votes?: Record<string, string>;
  verdict?: "culpado" | "inocente";
  guilty?: number;
  innocent?: number;
  entries?: { id: string; text: string; authorId: string; correct: string[]; fooled: number }[];
  infiltradoId?: string;
  word?: string;
  category?: string;
  accusedId?: string | null;
  guess?: string | null;
  guessCorrect?: boolean | null;
  outcome?: "escapou" | "adivinhou" | "grupo";
  sideTotals?: { A: number; B: number };
  winnerSide?: "A" | "B" | null;
  multiplier?: number;
};

/** What the server reveals to one specific, session-validated player. */
export type PartyPrivateViewData = {
  role: "infiltrado" | "cidadao" | "espectador" | null;
  word: string | null;
  myEntryId: string | null;
  mine: PartyMine | null;
};

/** Shape of one player's stored submission for a phase. */
export type PartyMine = { text?: string; target?: string; verdict?: string; guesses?: Record<string, string> };

/** Everything here is readable by every client in realtime: never put secrets in it. */
export type PartyPublicState = {
  prompt?: PartyPrompt;
  defendantId?: string;
  sides?: Record<string, "A" | "B">;
  eligible?: string[];
  submitted?: string[];
  entries?: PartyEntry[];
  accusedId?: string;
  results?: PartyResults;
  deltas?: Record<string, number>;
  scores?: Record<string, number>;
  ai?: PartyAiState;
  skipsLeft?: number;
  /** Code of the Stop room the group is playing right now (public: Stop codes are shareable). */
  stopCode?: string;
};

export function readPublicState(raw: unknown): PartyPublicState {
  return (raw && typeof raw === "object" ? raw : {}) as PartyPublicState;
}

export const PHASE_LABELS: Record<PartyPhaseId, string> = {
  lobby: "Sala de espera",
  defense: "Defesas e acusações",
  write: "Escreva sua resposta",
  clues: "Pistas",
  argue: "Argumentos",
  respond: "Desafio",
  vote: "Votação",
  guess: "Quem escreveu?",
  last_guess: "Última chance do infiltrado",
  reveal: "Resultado",
  final: "Fim de jogo",
};

/** Seconds per phase; deadlines are issued by the server from these values. */
export const PHASE_SECONDS: Partial<Record<PartyPhaseId, number>> = {
  defense: 90,
  write: 75,
  clues: 60,
  argue: 90,
  respond: 75,
  vote: 45,
  guess: 75,
  last_guess: 30,
};

export const FIRST_PHASE: Record<PartyGameId, PartyPhaseId> = {
  tribunal: "defense",
  autor: "write",
  infiltrado: "clues",
  debate: "argue",
  roleta: "respond",
};

/* ----------------------------- Unified group room ----------------------------- */

/** What a group room (party_rooms.game) can hold: nothing chosen yet, Stop, or a party game. */
export type RoomGameId = "lobby" | "stop" | PartyGameId;
export type LobbyGameId = "stop" | PartyGameId;

export function isPartyGame(value: unknown): value is PartyGameId {
  return typeof value === "string" && (PARTY_GAME_IDS as readonly string[]).includes(value);
}

export function readRoomGame(value: unknown): RoomGameId {
  return value === "stop" || isPartyGame(value) ? value : "lobby";
}

export type LobbyGameMeta = {
  id: LobbyGameId;
  name: string;
  short: string;
  minPlayers: number;
  duration: string;
  icon: PartyGameMeta["icon"] | "stop";
};

export const STOP_LOBBY_META: LobbyGameMeta = {
  id: "stop",
  name: "Stop",
  short: "O clássico Adedonha com o juiz de IA sarcástico de sempre.",
  minPlayers: 2,
  duration: "≈ 15 min",
  icon: "stop",
};

const DURATIONS: Record<PartyGameId, string> = {
  tribunal: "≈ 15 min",
  autor: "≈ 15 min",
  infiltrado: "≈ 12 min",
  debate: "≈ 12 min",
  roleta: "≈ 10 min",
};

/** The six games a host can pick inside a group room, in display order. */
export const LOBBY_GAMES: readonly LobbyGameMeta[] = [
  STOP_LOBBY_META,
  ...PARTY_GAME_IDS.map((id) => ({ id, name: PARTY_GAMES[id].name, short: PARTY_GAMES[id].short, minPlayers: PARTY_GAMES[id].minPlayers, duration: DURATIONS[id], icon: PARTY_GAMES[id].icon })),
];

export function lobbyGameMeta(id: LobbyGameId) {
  return LOBBY_GAMES.find((game) => game.id === id) ?? STOP_LOBBY_META;
}

/** Players still missing before a game can start (0 = ready). */
export function missingPlayers(id: LobbyGameId, players: number) {
  return Math.max(0, lobbyGameMeta(id).minPlayers - players);
}

/* ------------------------- Developer settings per game ------------------------- */

/** Timed phases each party game uses; only these can be tuned by the developer. */
export const GAME_PHASES: Record<PartyGameId, PartyPhaseId[]> = {
  tribunal: ["defense", "vote"],
  autor: ["write", "guess"],
  infiltrado: ["clues", "vote", "last_guess"],
  debate: ["argue", "vote"],
  roleta: ["respond", "vote"],
};

export const PARTY_TONES = ["padrao", "leve", "acido", "teatral"] as const;
export type PartyTone = (typeof PARTY_TONES)[number];
export const PARTY_TONE_LABELS: Record<PartyTone, string> = {
  padrao: "Padrão do jogo",
  leve: "Leve e carinhoso",
  acido: "Ácido e sarcástico",
  teatral: "Teatral e exagerado",
};
/** Games whose AI writes content or comments (Infiltrado only uses its built-in list). */
export const AI_TONE_GAMES: readonly PartyGameId[] = ["tribunal", "autor", "debate", "roleta"];

export const PHASE_SECONDS_MIN = 15;
export const PHASE_SECONDS_MAX = 300;

export type PartyGameAdmin = { seconds?: Partial<Record<PartyPhaseId, number>>; tone?: PartyTone; events?: boolean };
export type PartyAdminConfig = Partial<Record<PartyGameId, PartyGameAdmin>>;

/** Sanitizes developer settings: unknown games/phases are dropped and seconds are clamped. */
export function readPartyAdmin(raw: unknown): PartyAdminConfig {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const config: PartyAdminConfig = {};
  for (const game of PARTY_GAME_IDS) {
    const value = source[game];
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    const out: PartyGameAdmin = {};
    const seconds = entry.seconds && typeof entry.seconds === "object" ? (entry.seconds as Record<string, unknown>) : {};
    for (const phase of GAME_PHASES[game]) {
      const n = Number(seconds[phase]);
      if (Number.isFinite(n) && seconds[phase] !== null && seconds[phase] !== undefined) {
        out.seconds = { ...out.seconds, [phase]: Math.min(PHASE_SECONDS_MAX, Math.max(PHASE_SECONDS_MIN, Math.round(n))) };
      }
    }
    if (AI_TONE_GAMES.includes(game) && (PARTY_TONES as readonly string[]).includes(entry.tone as string)) out.tone = entry.tone as PartyTone;
    if (game === "roleta" && typeof entry.events === "boolean") out.events = entry.events;
    config[game] = out;
  }
  return config;
}

/** Seconds for a phase, honouring the developer override for that game only. */
export function phaseSecondsFor(game: PartyGameId, phase: PartyPhaseId, admin: PartyAdminConfig = {}) {
  if (!GAME_PHASES[game].includes(phase)) return PHASE_SECONDS[phase];
  return admin[game]?.seconds?.[phase] ?? PHASE_SECONDS[phase];
}
