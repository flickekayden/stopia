export const ROUND_COUNTDOWN_MS = 3_000;

export function roundStartsAt(startedAt: string | null) {
  if (!startedAt) return 0;
  const timestamp = Date.parse(startedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}