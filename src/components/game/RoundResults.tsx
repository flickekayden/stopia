import { useEffect, useMemo, useRef, useState } from "react";
import { FastForward, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSound } from "@/components/SoundProvider";
import { AnswerCard, type AnswerCardData, answerCardId } from "@/components/game/AnswerCard";
import { VoiceReactions } from "@/components/game/VoiceReactions";
import type { Player, Room, Round } from "@/hooks/use-room";
import { supabase } from "@/integrations/supabase/client";
import type { Evaluation } from "@/lib/game";
import { RESULTS_VIEW_MS, RESULTS_FORCE_MS, isResultsPlayerActive, resultsDeadline } from "@/lib/results-pacing";
import { vibrate } from "@/lib/haptics";

export function RoundResults({
  room,
  round,
  players,
  playerId,
  sessionId,
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
  sessionId: string | null;
  isHost: boolean;
  advancing: boolean;
  onNextRound: (force?: boolean) => void;
  onQuote: (answer: AnswerCardData) => void;
  highlightedAnswer: string | null;
}) {
  const { play } = useSound();
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [openedAt] = useState(() => Date.now());
  const [markingSeen, setMarkingSeen] = useState(false);
  const categoryHeading = useRef<HTMLDivElement | null>(null);
  const evaluation = round.evaluation as unknown as Evaluation | null;
  const cards = useMemo(() => round.categories.map((category) => ({
    category,
    answers: players.map((player): AnswerCardData => {
      const row = evaluation?.resultados.find((result) => result.categoria === category && result.jogador_id === player.id);
      return { roundId: round.id, category, playerId: player.id, playerName: player.nickname, response: row?.resposta ?? "", points: row?.pontos ?? 0, comment: row?.comentario ?? "" };
    }),
  })), [round.id, round.categories, evaluation, players]);
  const categories = round.categories;
  const category = categories[index] ?? "";
  const isLastCategory = index >= categories.length - 1;
  const isLastRound = round.number >= room.total_rounds;

  const deadline = resultsDeadline(round.ends_at) ?? openedAt + RESULTS_VIEW_MS;
  const secondsLeft = Math.max(0, Math.ceil((deadline - now) / 1000));
  const forceAvailable = now >= deadline - RESULTS_VIEW_MS + RESULTS_FORCE_MS;
  const pending = secondsLeft === 0 ? [] : players.filter((p) => isResultsPlayerActive(p, now) && p.ready_round < round.number);
  const everyoneReady = pending.length === 0;
  const hasSeen = secondsLeft === 0 || players.some((p) => p.id === playerId && p.ready_round >= round.number);
  const previousPending = useRef(pending.length);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (secondsLeft === 0 && !markingSeen && players.some((p) => p.id === playerId && p.ready_round < round.number)) void markSeen();
  }, [secondsLeft, markingSeen, players, playerId, round.number]);

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

  useEffect(() => {
    if (!highlightedAnswer) return;
    const target = cards.findIndex((item) => item.answers.some((answer) => answerCardId(answer) === highlightedAnswer));
    if (target >= 0) setIndex(target);
  }, [highlightedAnswer, cards]);

  async function markSeen() {
    if (markingSeen || players.some((p) => p.id === playerId && p.ready_round >= round.number)) return;
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

  const categoryCards = cards[index]?.answers ?? [];

  useEffect(() => {
    const advance = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isLastCategory) return;
      if (event.key !== " " && event.key !== "ArrowRight") return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, button, a, [contenteditable]:not([contenteditable='false']), [role='button'], [role='dialog']")) return;
      if (document.querySelector("[role='dialog'][data-state='open'], [role='alertdialog']")) return;
      event.preventDefault();
      setIndex((current) => Math.min(current + 1, categories.length - 1));
    };
    window.addEventListener("keydown", advance);
    return () => window.removeEventListener("keydown", advance);
  }, [categories.length, isLastCategory]);

  return (
    <div className="dock-clearance results-clearance space-y-4">
      <div ref={categoryHeading} className="scroll-mt-4 space-y-2 pt-2 text-center">
        <p className="text-sm text-muted-foreground">Rodada {round.number} · letra {round.letter}</p>
        <h2 className="font-display text-3xl">Resultado da rodada</h2>
      </div>
      <section key={category} id={`result-category-${index}`} className="game-section scroll-mt-4 space-y-3" aria-label={`Respostas de ${category}`}>
          <div className="space-y-2 pb-1" aria-live="polite">
            <p className="text-xs font-semibold tabular-nums text-muted-foreground">Categoria {Math.min(index + 1, categories.length)} de {categories.length}</p>
            <h3 className="text-balance-safe font-display text-3xl text-primary">{category}</h3>
            <progress aria-label="Categorias vistas" className="answer-progress h-1 w-full" value={index + 1} max={categories.length || 1} />
          </div>
          {categoryCards.map((data) => <AnswerCard key={data.playerId} data={data} highlighted={highlightedAnswer === answerCardId(data)} onQuote={onQuote} />)}
      </section>

      <div className="mobile-bottom-bar fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
        {sessionId && <VoiceReactions key={round.id} roomId={room.id} roundId={round.id} playerId={playerId} sessionId={sessionId} />}
        <p className="mb-2 text-center text-xs tabular-nums text-muted-foreground" role="timer">{secondsLeft > 0 ? `Leitura · ${secondsLeft}s` : "Leitura concluída"}</p>
        {isHost && forceAvailable && !everyoneReady && <Button variant="outline" disabled={advancing} className="mb-2 w-full" onClick={() => onNextRound(true)}><FastForward /> {isLastRound ? "Forçar resultado final" : "Forçar avanço"}</Button>}
        {!isLastCategory ? (
          <Button
            onClick={() => setIndex((i) => i + 1)}
            className="h-14 w-full text-lg font-bold"
          >
            Próxima categoria <ArrowRight />
          </Button>
        ) : (
          <div className="space-y-2">
            {!hasSeen && (
              <Button
                onClick={() => { vibrate(15); void markSeen(); }}
                disabled={markingSeen}
                className="h-14 w-full rounded-2xl text-lg font-bold"
              >
                {markingSeen ? "Marcando..." : "Terminei"}
              </Button>
            )}
            {!everyoneReady && (
              <p className="text-center text-sm text-muted-foreground">{pending.length} {pending.length === 1 ? "jogador ainda vendo" : "jogadores ainda vendo"}</p>
            )}
            {isHost && hasSeen ? (
              <Button
                onClick={() => onNextRound()}
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
