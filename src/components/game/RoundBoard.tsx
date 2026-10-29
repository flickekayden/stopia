import { Check, Loader2, Rocket, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PlayerPresence } from "@/components/game/PlayerPresence";
import { useSound } from "@/components/SoundProvider";
import { Input } from "@/components/ui/input";
import type { Answer, Player, Room, Round } from "@/hooks/use-room";
import { supabase } from "@/integrations/supabase/client";
import { devText, useEffectiveDevSettings } from "@/lib/dev-settings";
import { vibrate } from "@/lib/haptics";
import { EvaluationLoading } from "@/components/game/EvaluationLoading";
import { roundStartsAt } from "@/lib/round-pacing";

export function RoundBoard({
  room,
  round,
  players,
  answers,
  playerId,
  isHost,
  onStop,
}: {
  room: Room;
  round: Round;
  players: Player[];
  answers: Answer[];
  playerId: string;
  isHost: boolean;
  onStop: (reason: "stop" | "timer") => Promise<void>;
}) {
  const { play } = useSound();
  const dev = useEffectiveDevSettings();
  const mine = answers.find((a) => a.round_id === round.id && a.player_id === playerId);
  const [values, setValues] = useState<Record<string, string>>(
    () => (mine?.values as Record<string, string>) ?? {},
  );
  const [hydrated, setHydrated] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const actionInFlight = useRef(false);
  const editedCategories = useRef(new Set<string>());
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const [showEveryoneFinished, setShowEveryoneFinished] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstAnswerInput = useRef<HTMLInputElement | null>(null);
  const answerInputs = useRef<(HTMLInputElement | null)[]>([]);
  const startsAt = roundStartsAt(round.started_at);
  const starting = round.status === "answering" && now < startsAt;
  const countdownVisible = round.status === "answering" && now < startsAt + 600;
  const startCount = Math.max(0, Math.ceil((startsAt - now) / 1000));
  const countdownCue = useRef<number | null>(null);
  useEffect(() => {
    if (round.status !== "answering" || now - startsAt > 600) return;
    if (countdownCue.current === startCount) return;
    countdownCue.current = startCount;
    vibrate(startCount > 0 ? 15 : 30);
    play(startCount > 0 ? "ready" : "allReady");
  }, [now, play, round.status, startCount, startsAt]);
  const [focusedCat, setFocusedCat] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [scrolledPastHud, setScrolledPastHud] = useState(false);
  const compactHeader = focusedCat !== null || keyboardOpen || scrolledPastHud;
  const filledCount = round.categories.filter((c) => (values[c] ?? "").trim()).length;
  const actionsBar = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () => setKeyboardOpen(window.innerHeight - viewport.height > 150);
    viewport.addEventListener("resize", resize);
    resize();
    return () => viewport.removeEventListener("resize", resize);
  }, []);

  // Compact the HUD once the player scrolls into the fields; hysteresis avoids flicker at the threshold.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        setScrolledPastHud((current) => (current ? y > 40 : y > 140));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  function releaseFocus() {
    // Moving between answers fires blur before the next focus; keep the HUD compact across that gap.
    window.requestAnimationFrame(() => {
      if (!(document.activeElement instanceof HTMLInputElement && document.activeElement.id.startsWith("answer-field-"))) setFocusedCat(null);
    });
  }

  useEffect(() => {
    setValues({});
    setHydrated(false);
  }, [round.id]);

  useEffect(() => {
    if (round.status !== "answering" || starting) return;
    const frame = window.requestAnimationFrame(() => {
      firstAnswerInput.current?.focus({ preventScroll: true });
      firstAnswerInput.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [round.id, round.status, starting]);

  useEffect(() => {
    if (hydrated) return;
    if (mine) {
      const saved = (mine.values as Record<string, string>) ?? {};
      const onlyThisRound: Record<string, string> = {};
      for (const category of round.categories) {
        if (saved[category]) onlyThisRound[category] = saved[category];
      }
      setValues((current) => ({ ...onlyThisRound, ...Object.fromEntries(Object.entries(current).filter(([category]) => editedCategories.current.has(category))) }));
      setHydrated(true);
    }
  }, [mine, hydrated, round.categories]);

  useEffect(() => {
    if (round.status !== "answering") return;
    const id = setInterval(() => setNow(Date.now()), countdownVisible ? 100 : 1_000);
    return () => clearInterval(id);
  }, [round.status, round.ends_at, round.stop_requested_at, countdownVisible]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const secondsLeft = useMemo(() => {
    if (!round.ends_at) return null;
    return Math.max(0, Math.ceil((new Date(round.ends_at).getTime() - Math.max(now, startsAt)) / 1000));
  }, [round.ends_at, now, startsAt]);

  const firedTimer = useRef(false);
  const timeoutHaptic = useRef(false);
  useEffect(() => {
    if (secondsLeft === 0 && !timeoutHaptic.current && round.status === "answering") {
      timeoutHaptic.current = true;
      vibrate([50, 50, 50]);
    }
    if (secondsLeft === 0 && !firedTimer.current && isHost && round.status === "answering") {
      firedTimer.current = true;
      void onStop("timer").catch(() => { firedTimer.current = false; });
    }
  }, [secondsLeft, isHost, round.status, onStop]);

  const warnedAtFifteen = useRef(false);
  useEffect(() => {
    if (secondsLeft !== 15 || warnedAtFifteen.current || round.status !== "answering") return;
    warnedAtFifteen.current = true;
    toast.warning("⏳ Restam 15 segundos!", { duration: 2_500 });
  }, [round.status, secondsLeft]);

  const latestValues = useRef(values);
  latestValues.current = values;

  function save(next: Record<string, string>, finished: boolean): Promise<boolean> {
    const task = saveQueue.current.then(async () => {
    if (Date.now() < startsAt) return false;
    const { error } = await supabase.from("answers").upsert(
      {
        round_id: round.id,
        player_id: playerId,
        values: next,
        finished,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "round_id,player_id" },
    );
    if (error) {
      play("error");
      setSaveError(true);
      return false;
    }
    setSaveError(false);
    return true;
    }).catch(() => { setSaveError(true); return false; });
    saveQueue.current = task;
    return task;
  }

  function persist(next: Record<string, string>) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void save(next, mine?.finished ?? false);
    }, 400);
  }

  async function flush(finished?: boolean) {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    return save(latestValues.current, finished ?? mine?.finished ?? false);
  }

  function setValue(category: string, value: string) {
    if (starting || round.status !== "answering") return;
    const next = { ...values, [category]: value };
    editedCategories.current.add(category);
    latestValues.current = next;
    setValues(next);
    persist(next);
  }

  async function markFinished() {
    if (actionInFlight.current || starting) return;
    actionInFlight.current = true;
    vibrate(15);
    setSending(true);
    try {
      await flush(true);
    } finally {
      actionInFlight.current = false;
      setSending(false);
    }
  }

  async function handleStopClick() {
    if (actionInFlight.current || starting) return;
    actionInFlight.current = true;
    vibrate(40);
    setSending(true);
    try {
      if (!await flush()) return;
      await onStop("stop");
    } catch {
      // The room action already displays its failure.
    } finally {
      actionInFlight.current = false;
      setSending(false);
    }
  }

  const canStop = room.stop_policy === "anyone" || isHost;
  const finishedIds = useMemo(() => answers.filter((a) => a.finished).map((a) => a.player_id), [answers]);
  const previousFinishedIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const current = new Set(finishedIds);
    const previous = previousFinishedIds.current;
    if (previous) {
      for (const id of current) {
        if (previous.has(id)) continue;
        const player = players.find((item) => item.id === id);
        if (player) {
          play("ready");
          toast.success(`✅ @${player.nickname} terminou de responder!`, { duration: 2_200 });
        }
      }
      if (players.length > 0 && current.size === players.length && previous.size < players.length) {
        play("allReady");
        setShowEveryoneFinished(true);
        const timer = window.setTimeout(() => setShowEveryoneFinished(false), 2_600);
        previousFinishedIds.current = current;
        return () => window.clearTimeout(timer);
      }
    }
    previousFinishedIds.current = current;
    return undefined;
  }, [answers, finishedIds, play, players]);

  const stopCountdown = round.stop_requested_at
    ? Math.max(0, 3 - Math.floor((now - new Date(round.stop_requested_at).getTime()) / 1_000))
    : null;
  const evaluating = round.status !== "answering" || stopCountdown === 0;

  return (
    <div className="game-screen dock-clearance space-y-4">
      <div className={`round-hud sticky top-0 z-20 -mx-4 flex items-center border-b border-border/70 pl-4 pr-[calc(var(--top-actions-space)+0.5rem)] pt-[calc(0.75rem+env(safe-area-inset-top))] transition-[padding] duration-200 ${compactHeader ? "gap-3 pb-3" : "gap-4 pb-4"}`}>
        <div className={`letter-tile flex shrink-0 items-center justify-center transition-[width,height,border-radius] duration-200 ${compactHeader ? "size-11 rounded-lg" : "size-20 rounded-2xl"}`} aria-label={`Letra ${round.letter}`}>
          <span className={`font-display leading-none ${compactHeader ? "text-3xl" : "text-6xl"}`}>{round.letter}</span>
        </div>
        <div className={`min-w-0 flex-1 ${compactHeader ? "flex items-center justify-between gap-2" : "space-y-1.5"}`}>
          <p className="section-label">
            Rodada <span className="tabular-nums text-foreground">{round.number}</span> de {room.total_rounds}
          </p>
          {secondsLeft !== null ? (
            <p
              role="timer"
              aria-label={`${secondsLeft} segundos restantes${secondsLeft <= 10 ? ", tempo acabando" : ""}`}
              data-state={secondsLeft <= 10 ? "critical" : secondsLeft <= 30 ? "low" : "normal"}
              className={`round-timer ${compactHeader ? "text-2xl" : "text-5xl"} text-foreground`}
            >
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Sem cronômetro</p>
          )}
        </div>
        <div id="round-chat-slot" className="relative shrink-0" />
      </div>

      {countdownVisible && (
        <div className="pointer-events-none fixed inset-y-0 left-1/2 z-30 grid w-full max-w-md -translate-x-1/2 place-items-center bg-background/70 backdrop-blur-sm" role="status" aria-live="assertive" aria-label={starting ? `Começa em ${startCount}` : "VALENDO!"}>
          <span key={startCount} className="evaluation-phrase font-display text-7xl text-primary">{starting ? startCount : "VALENDO!"}</span>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3" aria-hidden="true">
          <span className="section-label">Respostas</span>
          <span className="text-sm font-bold tabular-nums text-foreground">{filledCount}<span className="text-muted-foreground">/{round.categories.length} preenchidas</span></span>
        </div>
        <progress aria-label="Progresso das respostas" className="answer-progress h-1.5 w-full" value={filledCount} max={round.categories.length || 1} />
      </div>

      {round.status === "answering" && stopCountdown !== null && stopCountdown > 0 && (
        <div className="animate-scale-in rounded-2xl border border-destructive/70 bg-destructive/12 p-4 text-center" role="status" aria-live="assertive">
          <ShieldAlert className="mx-auto size-7 text-destructive" />
          <p className="mt-1 font-display text-2xl text-destructive">✋ @{round.stopped_by ?? "alguém"} gritou STOP!</p>
          <p className="text-sm font-bold text-foreground">Respostas bloqueiam em <span className="tabular-nums">{stopCountdown}</span>s</p>
        </div>
      )}

      {showEveryoneFinished && (
        <div className="animate-scale-in rounded-2xl border border-success/60 bg-success/12 p-4 text-center" role="status" aria-live="polite">
          <Rocket className="mx-auto size-7 text-success" />
          <p className="mt-1 font-display text-2xl text-success">🚀 Todos terminaram!</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {players.map((p) => (
          <span
            key={p.id}
            className={`game-chip flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
              finishedIds.includes(p.id)
                ? "border-success/40 bg-success/12 text-success"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {finishedIds.includes(p.id) && <Check className="size-3.5" />}
            {p.nickname}
            <PlayerPresence player={p} />
          </span>
        ))}
      </div>

      <div className="space-y-2.5">
        {round.categories.map((category, index) => (
          <div key={category} className="game-field" data-filled={(values[category] ?? "").trim() ? "true" : "false"}>
            <label htmlFor={`answer-field-${index}`} className="flex items-center gap-2.5 text-sm font-bold text-foreground"><span className="field-index" aria-hidden="true">{(values[category] ?? "").trim() ? <Check className="size-3.5" /> : String(index + 1).padStart(2, "0")}</span><span className="text-balance-safe">{category}</span></label>
            <Input
              id={`answer-field-${index}`}
              ref={(input) => { answerInputs.current[index] = input; if (index === 0) firstAnswerInput.current = input; }}
              aria-label={category}
              value={values[category] ?? ""}
              disabled={evaluating || starting}
              onChange={(e) => setValue(category, e.target.value)}
              placeholder={`Com ${round.letter}...`}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="sentences"
              spellCheck={false}
              enterKeyHint={index < round.categories.length - 1 ? "next" : "done"}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                const next = answerInputs.current[index + 1];
                if (next) { next.focus({ preventScroll: true }); next.scrollIntoView({ behavior: "smooth", block: "center" }); }
                else {
                  event.currentTarget.blur();
                  // Bring "Terminei" and "STOP!" into reach once the last answer is done.
                  window.setTimeout(() => actionsBar.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 120);
                }
              }}
              inputMode="text"
              onFocus={() => setFocusedCat(category)}
              onBlur={releaseFocus}
              name={`stop-answer-${index}`}
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              className="mt-2.5 h-12 rounded-lg text-base font-semibold"
            />
          </div>
        ))}
      </div>

      {saveError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/70 bg-destructive/10 p-3 text-sm"><p>Suas respostas continuam aqui, mas ainda não foram salvas.</p><Button variant="outline" disabled={sending || starting || round.status !== "answering"} onClick={() => void flush()}>Tentar salvar</Button></div>}
      <div ref={actionsBar} className={`round-actions mt-6 flex w-full flex-wrap gap-3 ${dev.buttonLayout === "reversed" ? "flex-row-reverse" : dev.buttonLayout === "stacked" ? "flex-col" : ""} border-t border-border/70 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom))]`}>
        {evaluating ? (
          <EvaluationLoading />
        ) : (
          <>
            <Button
              variant="secondary"
              disabled={sending || starting}
              onClick={() => void markFinished()}
              aria-busy={sending}
              className={`h-16 flex-1 rounded-xl text-base font-bold ${mine?.finished ? "border-success/50 text-success" : ""}`}
            >
              {sending ? <Loader2 className="animate-spin" /> : mine?.finished ? <Check /> : null}{devText(dev.texts.finishButton, "Terminei")}
            </Button>
            <Button
              onClick={() => void handleStopClick()}
              disabled={!canStop || sending || starting || stopCountdown !== null}
              aria-busy={sending}
              className="stop-button h-16 flex-[1.4] rounded-xl text-3xl"
            >
              {sending ? <Loader2 className="animate-spin" /> : devText(dev.texts.stopButton, "STOP!")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
