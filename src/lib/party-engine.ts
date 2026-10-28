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
