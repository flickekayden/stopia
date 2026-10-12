import { useEffect, useMemo, useRef, useState } from "react";
import { List, Layers, FastForward, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSound } from "@/components/SoundProvider";
import { AnswerCard, type AnswerCardData, answerCardId } from "@/components/game/AnswerCard";
import { PlayerPresence } from "@/components/game/PlayerPresence";
import { ScoringRules } from "@/components/game/ScoringRules";
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
  const [mode, setMode] = useState<"list" | "steps">("list");
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

  const visibleCategories = mode === "list" ? categories : [category];

  return (
    <div className="dock-clearance space-y-4">
      <div ref={categoryHeading} className="scroll-mt-4 space-y-3 text-center">
        <p className="text-sm text-muted-foreground">Rodada {round.number} · letra {round.letter}</p>
        <h2 className="font-display text-3xl">Resultado da rodada</h2>
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border p-1" role="group" aria-label="Visualização dos resultados">
          <Button variant={mode === "list" ? "selected" : "segment"} aria-pressed={mode === "list"} onClick={() => setMode("list")}><List /> Todas</Button>
          <Button variant={mode === "steps" ? "selected" : "segment"} aria-pressed={mode === "steps"} onClick={() => setMode("steps")}><Layers /> Por categoria</Button>
        </div>
        <div className="game-scroll flex gap-2 overflow-x-auto pb-2" aria-label="Categorias avaliadas">
          {categories.map((c, i) => <Button key={c} size="sm" variant={index === i ? "selected" : "segment"} aria-pressed={index === i} className="h-auto max-w-40 shrink-0 truncate rounded-lg" onClick={() => {
            setIndex(i);
            if (mode === "list") document.getElementById(`result-category-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}>{c}</Button>)}
        </div>
      </div>
      {visibleCategories.map((c) => {
        const categoryCards = cards.find((item) => item.category === c)?.answers ?? [];
        return <section key={c} id={`result-category-${categories.indexOf(c)}`} className="game-section scroll-mt-4 space-y-3">
          <h2 className="text-balance-safe font-display text-2xl text-primary">{c}</h2>
          {categoryCards.map((data) => <AnswerCard key={data.playerId} data={data} highlighted={highlightedAnswer === answerCardId(data)} onQuote={onQuote} />)}
        </section>;
      })}

      <ScoringRules />

      <div className="mobile-bottom-bar fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
        {sessionId && <VoiceReactions key={round.id} roomId={room.id} roundId={round.id} playerId={playerId} sessionId={sessionId} />}
        <p className="mb-2 text-center text-xs tabular-nums text-muted-foreground" role="timer">{secondsLeft > 0 ? `Leitura · ${secondsLeft}s` : "Leitura concluída"}</p>
        {isHost && forceAvailable && !everyoneReady && <Button variant="outline" disabled={advancing} className="mb-2 w-full" onClick={() => onNextRound(true)}><FastForward /> {isLastRound ? "Forçar resultado final" : "Forçar avanço"}</Button>}
        {mode === "steps" && !isLastCategory ? (
          <Button
            variant="secondary"
            onClick={() => setIndex((i) => i + 1)}
            className="h-14 w-full rounded-2xl text-lg font-bold"
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
              <div className="game-scroll flex max-h-20 flex-wrap items-center justify-center gap-2 overflow-y-auto">
                <span className="text-sm text-muted-foreground">Ainda vendo:</span>
                {pending.map((p) => (
                  <span
                    key={p.id}
                    className="text-balance-safe max-w-full rounded-full bg-secondary px-3 py-1 text-sm text-muted-foreground"
                  >
                    {p.nickname} <PlayerPresence player={p} />
                  </span>
                ))}
              </div>
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
