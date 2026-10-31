/**
 * "Recorrer ao Juiz" (browser-safe rules): after a Stop round, a player may contest one of their own
 * answers that the AI scored 0. The other players vote; only a strict majority of "aceitar" overturns it.
 */
import { normalizeText } from "./party-engine";
import type { StopJudgedAnswer } from "./party-games";

export const APPEAL_SECONDS = 30;
/** Points granted when the group accepts an appeal: unique answer vs. an answer someone else also wrote. */
export const APPEAL_POINTS_UNIQUE = 10;
export const APPEAL_POINTS_SHARED = 5;

export type AppealVote = "aceitar" | "manter";

export type StopAppeal = {
  playerId: string;
  category: string;
  answer: string;
  voters: string[];
  votes: Record<string, AppealVote>;
  endsAt: string;
  status: "open" | "accepted" | "rejected";
  points?: number;
};

/** Why an appeal cannot be opened (null = allowed). */
export function appealBlocker(input: {
  results: readonly StopJudgedAnswer[];
  playerId: string;
  category: string;
  current?: StopAppeal | undefined;
  used: readonly string[];
}): string | null {
  if (input.current?.status === "open") return "Já tem um recurso em votação. Espere terminar.";
  if (input.used.includes(input.playerId)) return "Você já usou seu recurso nesta rodada.";
  const row = input.results.find((r) => r.jogador_id === input.playerId && r.categoria === input.category);
  if (!row || !row.resposta.trim()) return "Só dá para recorrer de uma resposta sua que não ficou em branco.";
  if (row.pontos !== 0) return "Só dá para recorrer de respostas que ficaram com zero.";
  return null;
}

/** Ties keep the zero: the answer is accepted only when "aceitar" beats "manter". */
export function appealOutcome(votes: Record<string, AppealVote>) {
  const values = Object.values(votes);
  const accept = values.filter((v) => v === "aceitar").length;
  const keep = values.filter((v) => v === "manter").length;
  return { accept, keep, accepted: accept > keep };
}

/** The vote closes once every voter has voted or the deadline passed. */
export function appealClosed(appeal: StopAppeal, now: number) {
  return appeal.voters.every((id) => appeal.votes[id]) || now >= Date.parse(appeal.endsAt);
}

/** Accepted answers are worth 10, or 5 when another player wrote the same answer in that category. */
export function appealPoints(results: readonly StopJudgedAnswer[], playerId: string, category: string, answer: string) {
  const mine = normalizeText(answer).replace(/ /g, "");
  const shared = results.some((r) => r.categoria === category && r.jogador_id !== playerId && normalizeText(r.resposta).replace(/ /g, "") === mine && mine !== "");
  return shared ? APPEAL_POINTS_SHARED : APPEAL_POINTS_UNIQUE;
}
