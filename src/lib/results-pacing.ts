export const RESULTS_VIEW_MS = 120_000;
export const RESULTS_FORCE_MS = 10_000;
export const RESULTS_INACTIVE_MS = 15_000;

export function resultsDeadline(endsAt: string | null) {
  return endsAt ? new Date(endsAt).getTime() : null;
}

export function isResultsPlayerActive(player: { is_online: boolean; last_seen: string }, now: number) {
  return player.is_online && now - new Date(player.last_seen).getTime() <= RESULTS_INACTIVE_MS;
}