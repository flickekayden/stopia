/**
 * Browser-safe presence rules for group rooms. Players are never removed for a
 * network blip: someone silent for longer than ACTIVE_WINDOW_MS only stops counting
 * toward "everyone is done", minimum player counts and new-round seats; their
 * scores and seat in the room stay until they leave or the host removes them.
 */
export const HEARTBEAT_MS = 30_000;
/** The server skips writes when last_seen is fresher than this, so heartbeats stay cheap. */
export const TOUCH_THROTTLE_MS = 20_000;
/** Tolerates phones that lock or switch apps for a couple of minutes. */
export const ACTIVE_WINDOW_MS = 3 * 60_000;

type PresenceRow = { is_bot: boolean; last_seen: string };

export function isActivePlayer(player: PresenceRow, now = Date.now()) {
  if (player.is_bot) return true;
  const seen = Date.parse(player.last_seen);
  return Number.isFinite(seen) && now - seen <= ACTIVE_WINDOW_MS;
}

export function activePlayers<T extends PresenceRow>(players: T[], now = Date.now()) {
  return players.filter((p) => isActivePlayer(p, now));
}

/**
 * Roleta: each submission records which challenge it answered (the skips counter at
 * submit time), so answers written before "Pular desafio" never reach the next challenge.
 */
export function roletaChallengeKey(skipsLeft: number | undefined) {
  return `c${skipsLeft ?? 0}`;
}

export function forChallenge<T extends { payload: unknown }>(subs: T[], key: string) {
  return subs.filter((s) => (s.payload as { challenge?: unknown } | null)?.challenge === key);
}
