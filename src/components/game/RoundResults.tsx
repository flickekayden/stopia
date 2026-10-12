import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSound } from "@/components/SoundProvider";
import { AnswerCard, type AnswerCardData, answerCardId } from "@/components/game/AnswerCard";
import { PlayerPresence } from "@/components/game/PlayerPresence";
import { ScoringRules } from "@/components/game/ScoringRules";
import type { Player, Room, Round } from "@/hooks/use-room";
import { supabase } from "@/integrations/supabase/client";
import type { Evaluation } from "@/lib/game";

export function RoundResults({
  room,
  round,
  players,
  playerId,
  isHost,
  advancing,
  onNextRound,
  onQuote,
  highlightedAnswer,
}: {
  room: Room;
  round: Round;
  players: Player[];
  playerId: string;
  isHost: boolean;
  advancing: boolean;
  onNextRound: () => void;
  onQuote: (answer: AnswerCardData) => void;
  highlightedAnswer: string | null;
}) {
  const { play } = useSound();
  const [index, setIndex] = useState(0);
  const [markingSeen, setMarkingSeen] = useState(false);
  const categoryHeading = useRef<HTMLDivElement | null>(null);
  const evaluation = round.evaluation as unknown as Evaluation | null;
  const categories = round.categories;
  const category = categories[index]!;
  const isLastCategory = index >= categories.length - 1;
  const isLastRound = round.number >= room.total_rounds;

  const pending = players.filter((p) => p.ready_round < round.number);
  const everyoneReady = pending.length === 0;
  const hasSeen = !pending.some((p) => p.id === playerId);
  const previousPending = useRef(pending.length);

  useEffect(() => {
    if (previousPending.current > 0 && pending.length === 0) play("allReady");
    previousPending.current = pending.length;
  }, [pending.length, play]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      categoryHeading.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [index, round.id]);

  async function markSeen() {
    if (markingSeen || hasSeen) return;
    setMarkingSeen(true);
    const { error } = await supabase
      .from("players")
      .update({ ready_round: round.number })
      .eq("id", playerId)
      .lt("ready_round", round.number);
    if (error) {
      play("error");
      toast.error("Não consegui marcar a avaliação como vista");
      setMarkingSeen(false);
    }
  }

  const rows = (evaluation?.resultados ?? []).filter((r) => r.categoria === category);

  return (
    <div className="space-y-4 pb-32">
      <div ref={categoryHeading} className="scroll-mt-4 rounded-3xl border border-border bg-card p-4 text-center">
        <p className="text-sm text-muted-foreground">
          Rodada {round.number} · letra {round.letter} · categoria {index + 1} de {categories.length}
        </p>
        <h2 className="font-display text-3xl text-primary">{category}</h2>
      </div>

      <div className="space-y-3">
        {players.map((p) => {
          const row = rows.find((r) => r.jogador_id === p.id);
          const data: AnswerCardData = {
            roundId: round.id,
            category,
            playerId: p.id,
            playerName: p.nickname,
            response: row?.resposta ?? "",
            points: row?.pontos ?? 0,
            comment: row?.comentario ?? "",
          };
          return (
            <AnswerCard key={`${p.id}-${category}`} data={data} highlighted={highlightedAnswer === answerCardId(data)} onQuote={onQuote} />
          );
        })}
      </div>

      <ScoringRules />

      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
        {!isLastCategory ? (
          <Button
            onClick={() => setIndex((i) => i + 1)}
            className="h-14 w-full rounded-2xl text-lg font-bold"
          >
            Próxima categoria
          </Button>
        ) : (
          <div className="space-y-2">
            {!hasSeen && (
              <Button
                onClick={() => void markSeen()}
                disabled={markingSeen}
                className="h-14 w-full rounded-2xl text-lg font-bold"
              >
                {markingSeen ? "Marcando..." : "Terminei"}
              </Button>
            )}
            {!everyoneReady && (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="text-sm text-muted-foreground">Ainda vendo:</span>
                {pending.map((p) => (
                  <span
                    key={p.id}
                    className="rounded-full bg-secondary px-3 py-1 text-sm text-muted-foreground"
                  >
                    {p.nickname} <PlayerPresence player={p} />
                  </span>
                ))}
              </div>
            )}
            {isHost && hasSeen ? (
              <Button
                onClick={onNextRound}
                disabled={advancing || !everyoneReady}
                className="h-14 w-full rounded-2xl text-lg font-bold"
              >
                {advancing
                  ? "Aguarde..."
                  : !everyoneReady
                    ? "Esperando todos verem..."
                    : isLastRound
                      ? "Ver resultado final"
                      : "Próxima rodada"}
              </Button>
            ) : hasSeen ? (
              <p className="py-4 text-center text-muted-foreground">
                Esperando o mestre seguir para a próxima etapa...
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
