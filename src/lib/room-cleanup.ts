/** A group room is abandoned when neither the room nor any player has shown activity for this long. */
export const ROOM_IDLE_MS = 6 * 60 * 60_000;
/** Rooms checked per cleanup pass, so one pass stays a few small requests. */
export const ROOM_CLEANUP_BATCH = 50;

/** Ids of idle rooms that have no player seen since the cutoff. */
export function abandonedRoomIds(idleRoomIds: string[], recentlySeenRoomIds: Iterable<string>) {
  const alive = new Set(recentlySeenRoomIds);
  return idleRoomIds.filter((id) => !alive.has(id));
}
