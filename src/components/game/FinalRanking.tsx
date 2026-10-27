import { Crown, Loader2, Share2, Trophy } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

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
      <div className="stage-glow -mx-4 px-4 py-6 text-center">
        <span className="letter-tile mx-auto grid size-16 place-items-center rounded-2xl"><Trophy className="size-8" aria-hidden="true" /></span>
        <h2 className="mt-4 text-3xl leading-tight">Fim de jogo!</h2>
        <p className="mt-1 text-balance-safe text-muted-foreground">
          {winners.length > 1 ? `Empate no 1º lugar · ${winners.map((p) => p.nickname).join(" e ")}` : ranking[0] ? <><span className="font-bold text-primary">{ranking[0].nickname}</span> levou a melhor</> : "Sem vencedores"}
        </p>
      </div>

      {loadingAnalysis && !analysis && (
        <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-4 text-sm">
          <Loader2 className="size-5 animate-spin text-primary" /> A IA está preparando as zoeiras finais...
        </div>
      )}

      {!analysis && analysisError && (
        <div role="alert" className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">
          {analysisError} O ranking abaixo continua valendo.
        </div>
      )}

      {winners.length <= 1 && <div className="flex items-end justify-center gap-2 pt-2" aria-label="Pódio">
        {[1, 0, 2].map((place) => {
          const p = ranking[place];
          if (!p) return null;
          const rank = getRank(p.score);
          return (
            <div key={p.id} className="min-w-0 flex-1 text-center">
              {rank === 1 && <Crown className="mx-auto mb-1 size-6 text-gold" aria-hidden="true" />}
              <p className={`mb-2 w-full truncate font-bold ${rank === 1 ? "text-base text-foreground" : "text-sm text-muted-foreground"}`}>{p.nickname}</p>
              <div
                data-place={rank}
                className={`podium-step flex flex-col items-center justify-center gap-0.5 ${
                  rank === 1 ? "h-40 text-gold" : rank === 2 ? "h-28 text-silver" : "h-20 text-bronze"
                }`}
              >
                <span className="font-display text-xl leading-none">{rank}º</span>
                <strong className={`font-display tabular-nums leading-none text-foreground ${rank === 1 ? "text-4xl" : "text-2xl"}`}>{p.score}</strong>
                <span className="text-[0.625rem] font-bold uppercase tracking-wider text-muted-foreground">pontos</span>
              </div>
            </div>
          );
        })}
      </div>}

      <div className="space-y-2">
        {ranking.map((p, index) => {
          const rank = getRank(p.score);
          const texto = analysis?.analises.find((a) => a.jogador_id === p.id)?.texto;
          return (
            <div
              key={p.id}
              data-first={rank === 1 ? "true" : "false"}
              style={{ "--enter-index": Math.min(index, 10) } as CSSProperties}
              className="ranking-row p-4"
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <span className="rank-badge" data-place={rank <= 3 ? rank : undefined} aria-label={`${rank}º lugar`}>{rank}</span>
                <p className={`min-w-0 text-balance-safe text-lg font-bold ${p.id === playerId ? "text-primary" : ""}`}>
                  {p.nickname}{p.id === playerId && <span className="ml-1.5 text-xs font-semibold text-muted-foreground">(você)</span>}
                </p>
                <span className="shrink-0 font-display text-2xl tabular-nums text-foreground">{p.score}</span>
              </div>
              {texto && (
                <p className="mt-3 break-words border-l-2 border-primary/40 pl-3 text-sm italic text-muted-foreground text-balance-safe">
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
