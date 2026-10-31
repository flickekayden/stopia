/** Equal scores share a competition rank; presentation never invents a tie-breaker. */
export function rankPlayers<T extends { score: number }>(players: readonly T[]) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let place = 0;
  return sorted.map((player, index) => {
    if (index === 0 || player.score !== sorted[index - 1]?.score) place = index + 1;
    return { player, place };
  });
}

/** "Rei da Noite": the single player with the most room-wide points tonight; ties or zero crown nobody. */
export function nightKingId(players: readonly { id: string; score: number }[]) {
  const top = Math.max(0, ...players.map((p) => p.score));
  const leaders = players.filter((p) => p.score === top && top > 0);
  return leaders.length === 1 ? leaders[0]!.id : null;
}
