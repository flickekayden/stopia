import { memo, type CSSProperties } from "react";

import type { PartyPlayer } from "@/hooks/use-party-room";
import { nightKingId, pointsBehind, rankPlayers } from "@/lib/ranking";
import { cn } from "@/lib/utils";

/**
 * Round scoreboard shared by Stop and the party games. Shows the server's scores and
 * this round's deltas only: shared places for ties, the gap to the leader, and a short
 * staggered entrance (disabled by prefers-reduced-motion through the shared classes).
 */
export const RoundScoreboard = memo(function RoundScoreboard({
  players,
  scores,
  deltas,
  meId,
  title = "Placar",
}: {
  players: PartyPlayer[];
  scores: Record<string, number>;
  deltas: Record<string, number>;
  meId: string;
  title?: string;
}) {
  const ranked = rankPlayers(players.map((p) => ({ ...p, score: scores[p.id] ?? 0, delta: deltas[p.id] ?? 0 })));
  const leader = ranked[0]?.player.score ?? 0;
  const king = nightKingId(players);
  return (
    <section className="party-panel space-y-2" aria-label={title}>
      <p className="section-label">{title}</p>
      <ol className="space-y-1.5">
        {ranked.map(({ player: p, place }, index) => {
          const behind = pointsBehind(p.score, leader);
          const mine = p.id === meId;
          return (
            <li
              key={p.id}
              className={cn("scoreboard-row flex items-center gap-3 rounded-lg px-2 py-1.5", mine && "bg-secondary/60")}
              style={{ "--enter-index": index } as CSSProperties}
              aria-label={`${place}º lugar: ${p.nickname}, ${p.score} pontos${p.delta > 0 ? `, mais ${p.delta} nesta rodada` : ""}`}
            >
              <span className="rank-badge !size-7 !text-sm" data-place={place} aria-hidden="true">{place}</span>
              <span className="min-w-0 flex-1" aria-hidden="true">
                <span className="block truncate font-semibold">
                  {p.id === king && <span title="Rei da Noite">👑 </span>}
                  {p.nickname}
                  {mine && <span className="text-muted-foreground"> (você)</span>}
                </span>
                {behind > 0 && <span className="block text-xs text-muted-foreground tabular-nums">a {behind} do líder</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums" aria-hidden="true">
                {p.delta > 0 && <span className="points-badge rounded-md bg-success/15 px-1.5 text-sm font-bold text-success" style={{ "--enter-index": index } as CSSProperties}>+{p.delta}</span>}
                <span className="font-display text-xl">{p.score}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
});
