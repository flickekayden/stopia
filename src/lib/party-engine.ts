/**
 * Deterministic, browser-safe party rules: vote validation and scoring.
 * The server is the only caller that applies these results; clients only display them.
 */

export type Deltas = Record<string, number>;

function add(deltas: Deltas, id: string, points: number) {
  if (!points) return;
  deltas[id] = (deltas[id] ?? 0) + points;
}

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function addScores(scores: Record<string, number>, deltas: Deltas) {
  const next = { ...scores };
  for (const [id, points] of Object.entries(deltas)) next[id] = (next[id] ?? 0) + points;
  return next;
}

/** Players sorted by join order take turns in the defendant's seat. */
export function tribunalDefendant<T extends { id: string; created_at: string }>(players: readonly T[], round: number) {
  const ordered = [...players].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  if (ordered.length === 0) return null;
  return ordered[(Math.max(1, round) - 1) % ordered.length]?.id ?? null;
}

export type Verdict = "culpado" | "inocente";

export function scoreTribunal(defendantId: string, votes: Record<string, Verdict>) {
  let guilty = 0;
  let innocent = 0;
  for (const [voter, verdict] of Object.entries(votes)) {
    if (voter === defendantId) continue;
    if (verdict === "culpado") guilty += 1;
    else innocent += 1;
  }
  const verdict: Verdict = guilty > innocent ? "culpado" : "inocente";
  const deltas: Deltas = {};
  if (verdict === "inocente") add(deltas, defendantId, 3);
  for (const [voter, vote] of Object.entries(votes)) {
    if (voter !== defendantId && vote === verdict) add(deltas, voter, 1);
  }
  return { verdict, guilty, innocent, deltas };
}

/**
 * Tribunal judged by the AI. Innocent: the defendant gets 3 (+0..2 bonus).
 * Guilty: every accuser who wrote gets 2 and the best accusation 1 more (+0..2 bonus); in a duel the
 * prosecutor is the only accuser, so it gets 3 (+bonus). No verdict (AI undecided) = 2 each, no bonus.
 */
export function scoreTribunalJudge(params: {
  defendantId: string;
  accuserIds: readonly string[];
  verdict: Verdict | null;
  bestAccuserId?: string | null;
  bonus: number;
}) {
  const deltas: Deltas = {};
  const extra = Math.max(0, Math.min(2, Math.round(Number.isFinite(params.bonus) ? params.bonus : 0)));
  const accusers = params.accuserIds.filter((id) => id !== params.defendantId);
  if (params.verdict === null) {
    add(deltas, params.defendantId, 2);
    for (const id of accusers) add(deltas, id, 2);
    return { deltas, bestAccuserId: null };
  }
  if (params.verdict === "inocente") {
    add(deltas, params.defendantId, 3 + extra);
    return { deltas, bestAccuserId: null };
  }
  const best = params.bestAccuserId && accusers.includes(params.bestAccuserId) ? params.bestAccuserId : accusers.length === 1 ? accusers[0]! : null;
  for (const id of accusers) add(deltas, id, 2);
  if (best) add(deltas, best, 1 + extra);
  return { deltas, bestAccuserId: best };
}

/** Counts votes keyed by voter, ignoring self-votes and targets outside the allowed set. */
export function tallyVotes(votes: Record<string, string>, allowedTargets?: readonly string[]) {
  const counts: Record<string, number> = {};
  for (const [voter, target] of Object.entries(votes)) {
    if (voter === target) continue;
    if (allowedTargets && !allowedTargets.includes(target)) continue;
    counts[target] = (counts[target] ?? 0) + 1;
  }
  return counts;
}

/** A unique most-voted player, or null on a tie / no votes. */
export function uniqueTop(counts: Record<string, number>) {
  let best: string | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [id, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
      tied = false;
    } else if (count === bestCount && count > 0) {
      tied = true;
    }
  }
  return tied || bestCount === 0 ? null : best;
}

export function scoreAutor(
  entries: readonly { id: string; authorId: string }[],
  guesses: Record<string, Record<string, string>>,
) {
  const deltas: Deltas = {};
  const perEntry = entries.map((entry) => {
    const correct: string[] = [];
    let fooled = 0;
    for (const [guesser, picks] of Object.entries(guesses)) {
      if (guesser === entry.authorId) continue;
      const pick = picks[entry.id];
      if (!pick || pick === guesser) continue;
      if (pick === entry.authorId) {
        correct.push(guesser);
        add(deltas, guesser, 1);
      } else {
        fooled += 1;
      }
    }
    add(deltas, entry.authorId, fooled);
    return { id: entry.id, authorId: entry.authorId, correct, fooled };
  });
  return { deltas, perEntry };
}

export type InfiltradoOutcome = "escapou" | "adivinhou" | "grupo";

export function scoreInfiltrado(params: {
  infiltradoId: string;
  playerIds: readonly string[];
  votes: Record<string, string>;
  guessCorrect: boolean | null;
}) {
  const counts = tallyVotes(params.votes, params.playerIds);
  const accusedId = uniqueTop(counts);
  const deltas: Deltas = {};
  let outcome: InfiltradoOutcome;
  if (accusedId !== params.infiltradoId) {
    outcome = "escapou";
    add(deltas, params.infiltradoId, 3);
  } else if (params.guessCorrect) {
    outcome = "adivinhou";
    add(deltas, params.infiltradoId, 2);
  } else {
    outcome = "grupo";
    for (const id of params.playerIds) if (id !== params.infiltradoId) add(deltas, id, 1);
    for (const [voter, target] of Object.entries(params.votes)) {
      if (target === params.infiltradoId && voter !== params.infiltradoId) add(deltas, voter, 1);
    }
  }
  return { counts, accusedId, outcome, deltas };
}

export function assignSides(playerIds: readonly string[], random: () => number = Math.random) {
  const shuffled = shuffle(playerIds, random);
  const sides: Record<string, "A" | "B"> = {};
  shuffled.forEach((id, index) => {
    sides[id] = index % 2 === 0 ? "A" : "B";
  });
  return sides;
}

export function scoreDebate(sides: Record<string, "A" | "B">, votes: Record<string, string>) {
  const counts = tallyVotes(votes, Object.keys(sides));
  const sideTotals = { A: 0, B: 0 };
  const deltas: Deltas = {};
  for (const [id, count] of Object.entries(counts)) {
    add(deltas, id, count);
    const side = sides[id];
    if (side) sideTotals[side] += count;
  }
  const winnerSide: "A" | "B" | null = sideTotals.A === sideTotals.B ? null : sideTotals.A > sideTotals.B ? "A" : "B";
  if (winnerSide) for (const [id, side] of Object.entries(sides)) if (side === winnerSide) add(deltas, id, 1);
  return { counts, sideTotals, winnerSide, deltas };
}

/** Debate judged by the AI: best argument +2 (+0..2 bonus), every member of its side +1. Unknown winner = no points. */
export function scoreDebateJudge(sides: Record<string, "A" | "B">, winnerId: string | null, bonus: number) {
  const deltas: Deltas = {};
  const winnerSide = winnerId ? sides[winnerId] ?? null : null;
  if (!winnerId || !winnerSide) return { winnerSide: null, deltas };
  const extra = Math.max(0, Math.min(2, Math.round(Number.isFinite(bonus) ? bonus : 0)));
  add(deltas, winnerId, 2 + extra);
  for (const [id, side] of Object.entries(sides)) if (side === winnerSide) add(deltas, id, 1);
  return { winnerSide, deltas };
}

/** Roleta judged by the AI: 0–3 points per answer, multiplied by the round's chaos event. */
export function scoreRoletaJudge(points: Record<string, number>, allowedTargets: readonly string[], multiplier: number) {
  const counts: Record<string, number> = {};
  const deltas: Deltas = {};
  for (const id of allowedTargets) {
    const raw = Number(points[id]);
    const value = Math.max(0, Math.min(3, Math.round(Number.isFinite(raw) ? raw : 0)));
    counts[id] = value;
    if (value > 0) add(deltas, id, value * multiplier);
  }
  return { counts, deltas };
}

export function scoreRoleta(votes: Record<string, string>, allowedTargets: readonly string[], multiplier: number) {
  const counts = tallyVotes(votes, allowedTargets);
  const deltas: Deltas = {};
  for (const [id, count] of Object.entries(counts)) add(deltas, id, count * multiplier);
  return { counts, deltas };
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

/** Picks an unused index first; when everything was used, the pool restarts. */
export function pickUnused(total: number, used: readonly number[], random: () => number = Math.random) {
  if (total <= 0) return -1;
  const usedSet = new Set(used);
  const free = Array.from({ length: total }, (_, i) => i).filter((i) => !usedSet.has(i));
  const pool = free.length > 0 ? free : Array.from({ length: total }, (_, i) => i);
  return pool[Math.floor(random() * pool.length)] ?? 0;
}
