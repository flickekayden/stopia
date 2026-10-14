import { Loader2, Share2, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { toast } from "sonner";
import { useSound } from "@/components/SoundProvider";
import { Button } from "@/components/ui/button";
import type { Player, Room } from "@/hooks/use-room";
import type { FinalAnalysis } from "@/lib/game";
import { rankPlayers } from "@/lib/ranking";

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
  const ranked = rankPlayers(players);
  const ranking = ranked.map((row) => row.player);
  const winners = ranking.filter((player) => player.score === ranking[0]?.score);
  const analysis = room.final_analysis as unknown as FinalAnalysis | null;
  const playedResult = useRef(false);
  const [sharing, setSharing] = useState(false);
  const sharingRef = useRef(false);

  useEffect(() => {
    if (playedResult.current || ranking.length === 0) return;
    playedResult.current = true;
    play(ranking.some((p) => p.id === playerId && p.score === ranking[0]?.score) ? "victory" : "defeat");
  }, [playerId, play, ranking]);

  const getRank = (score: number) => ranking.findIndex((p) => p.score === score) + 1;

  async function shareSummary() {
    if (sharingRef.current) return;
    sharingRef.current = true;
    setSharing(true);
    const champion = winners.length === 1 ? ranking[0] : undefined;
    const roast = analysis?.analises.find((a) => a.jogador_id === champion?.id)?.texto;
    const text = [
      `🏆 STOPIA — Resultado`,
      winners.length > 1 ? `Empate no 1º lugar: ${winners.map((p) => p.nickname).join(", ")}` : "",
      ...ranking.map((p) => `${getRank(p.score)}º ${p.nickname}: ${p.score} pontos`),
      roast ? `\n😂 ${champion?.nickname}: “${roast}”` : "",
      "\nBora jogar de novo?",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: "Resumo da Zoeira — STOP!", text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success("Resumo copiado para compartilhar!");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        toast.error("Não foi possível compartilhar o resumo");
      }
    } finally {
      sharingRef.current = false;
      setSharing(false);
    }
  }

  return (
    <div className="game-screen dock-clearance space-y-4">
      <div className="py-6 text-center">
        <Trophy className="mx-auto size-12 text-gold" />
        <h2 className="mt-4 text-3xl">Fim de jogo!</h2>
        <p className="text-balance-safe text-muted-foreground">
          {winners.length > 1 ? `Empate no 1º lugar · ${winners.map((p) => p.nickname).join(" e ")}` : ranking[0] ? `${ranking[0].nickname} levou a melhor` : "Sem vencedores"}
        </p>
      </div>

      {loadingAnalysis && !analysis && (
        <div role="status" className="flex items-center justify-center gap-2 rounded-lg bg-secondary p-4 text-sm">
          <Loader2 className="size-5 animate-spin" /> A IA está preparando as zoeiras finais...
        </div>
      )}

      {!analysis && analysisError && (
        <div className="rounded-2xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
          {analysisError} O ranking abaixo continua valendo.
        </div>
      )}

      {winners.length <= 1 && <div className="flex items-end justify-center gap-2 pt-4" aria-label="Pódio">
        {[1, 0, 2].map((place) => {
          const p = ranking[place];
          if (!p) return null;
          const rank = getRank(p.score);
          return (
            <div key={p.id} className="min-w-0 flex-1 text-center">
              <p className="mb-2 truncate text-sm font-bold w-full">{p.nickname}</p>
              <div
                className={`flex flex-col items-center justify-center rounded-t-lg border border-current ${
                  rank === 1 ? "h-36 bg-gold/15 text-gold" : rank === 2 ? "h-28 bg-silver/15 text-silver" : "h-20 bg-bronze/15 text-bronze"
                }`}
              >
                <Trophy className="size-5" aria-hidden="true" />
                <strong className="font-display text-2xl">{p.score}</strong>
                <span className="text-xs">{rank}º lugar</span>
              </div>
            </div>
          );
        })}
      </div>}

      <div className="space-y-3">
        {ranking.map((p) => {
          const rank = getRank(p.score);
          const texto = analysis?.analises.find((a) => a.jogador_id === p.id)?.texto;
          return (
            <div
              key={p.id}
              className={`ranking-row border p-4 ${rank === 1 ? "border-gold bg-card" : "border-border bg-card"}`}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <p className="min-w-0 text-balance-safe text-lg font-bold">
                  {rank}º {p.nickname}
                </p>
                <span className="shrink-0 font-display text-2xl tabular-nums text-primary">{p.score}</span>
              </div>
              {texto && (
                <p className="mt-2 break-words text-sm italic text-muted-foreground text-balance-safe">
                  “{texto}”
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mobile-bottom-bar fixed inset-x-0 bottom-0 mx-auto w-full max-w-md space-y-3 border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
        <Button
          onClick={() => void shareSummary()}
          variant="outline"
          disabled={sharing}
          aria-busy={sharing}
          className="min-h-12 w-full"
        >
          {sharing ? <Loader2 className="animate-spin" /> : <Share2 />} {sharing ? "Compartilhando..." : "Compartilhar resultado"}
        </Button>
        {isHost ? (
          <Button
            onClick={onPlayAgain}
            disabled={restarting}
            variant="default"
            className="h-14 w-full rounded-2xl text-lg font-bold"
          >
            {restarting ? "Preparando sala..." : "Jogar de novo"}
          </Button>
        ) : (
          <p className="text-center text-sm text-muted-foreground">Esperando o mestre preparar outra partida...</p>
        )}
      </div>
    </div>
  );
}
