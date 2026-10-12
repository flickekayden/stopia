import { Loader2, Trophy } from "lucide-react";
import { useEffect, useRef } from "react";

import { useSound } from "@/components/SoundProvider";
import { Button } from "@/components/ui/button";
import type { Player, Room } from "@/hooks/use-room";
import type { FinalAnalysis } from "@/lib/game";

export function FinalRanking({
  room,
  players,
  playerId,
  loadingAnalysis,
  analysisError = null,
  isHost,
  restarting,
  onPlayAgain,
}: {
  room: Room;
  players: Player[];
  playerId: string;
  loadingAnalysis: boolean;
  analysisError?: string | null;
  isHost: boolean;
  restarting: boolean;
  onPlayAgain: () => void;
}) {
  const { play } = useSound();
  const ranking = [...players].sort((a, b) => b.score - a.score);
  const analysis = room.final_analysis as unknown as FinalAnalysis | null;
  const playedResult = useRef(false);

  useEffect(() => {
    if (playedResult.current || ranking.length === 0) return;
    playedResult.current = true;
    play(ranking[0]?.id === playerId ? "victory" : "defeat");
  }, [playerId, play, ranking]);

  return (
    <div className="space-y-4 pb-10">
      <div className="rounded-3xl border border-border bg-card p-6 text-center">
        <Trophy className="mx-auto size-10 text-gold" />
        <h2 className="mt-2 font-display text-3xl">Fim de jogo!</h2>
        <p className="text-muted-foreground">
          {ranking[0] ? `${ranking[0].nickname} levou a melhor` : "Sem vencedores"}
        </p>
      </div>

      {loadingAnalysis && !analysis && (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-secondary p-4">
          <Loader2 className="size-5 animate-spin" /> A IA está preparando as zoeiras finais...
        </div>
      )}

      {!analysis && analysisError && (
        <div className="rounded-2xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
          {analysisError} O ranking abaixo continua valendo.
        </div>
      )}

      <div className="space-y-3">
        {ranking.map((p, i) => {
          const texto = analysis?.analises.find((a) => a.jogador_id === p.id)?.texto;
          return (
            <div
              key={p.id}
              className={`rounded-2xl border p-4 ${i === 0 ? "border-gold bg-card" : "border-border bg-card"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-display text-xl">
                  {i + 1}º {p.nickname}
                </p>
                <span className="font-display text-2xl text-primary">{p.score}</span>
              </div>
              {texto && (
                <p className="text-balance-safe mt-2 text-sm break-words text-muted-foreground italic">
                  “{texto}”
                </p>
              )}
            </div>
          );
        })}
      </div>

      {isHost ? (
        <Button
          onClick={onPlayAgain}
          disabled={restarting}
          variant="secondary"
          className="h-14 w-full rounded-2xl text-lg font-bold"
        >
          {restarting ? "Preparando sala..." : "Jogar de novo"}
        </Button>
      ) : (
        <p className="text-center text-sm text-muted-foreground">Esperando o mestre preparar outra partida...</p>
      )}
    </div>
  );
}
