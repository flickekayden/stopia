/** Equal scores share a competition rank; presentation never invents a tie-breaker. */
export function rankPlayers<T extends { score: number }>(players: readonly T[]) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let place = 0;
  return sorted.map((player, index) => {
    if (index === 0 || player.score !== sorted[index - 1]?.score) place = index + 1;
    return { player, place };
  });
}