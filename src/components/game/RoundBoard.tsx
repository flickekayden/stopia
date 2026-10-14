import { Check, Keyboard, Loader2, Rocket, ShieldAlert } from "lucide-react";
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
  const [keyboardPreference, setKeyboardPreference] = useState<"native" | "app" | null>(null);
  const appKeyboard = (keyboardPreference ?? dev.keyboard.mode) === "app";
  const startsAt = roundStartsAt(round.started_at);
  const starting = round.status === "answering" && now < startsAt;
  const countdownVisible = round.status === "answering" && now < startsAt + 600;
  const startCount = Math.max(0, Math.ceil((startsAt - now) / 1000));
  const countdownCue = useRef<number | null>(null);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("stop-keyboard-mode");
      if (saved === "native" || saved === "app") setKeyboardPreference(saved);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (round.status !== "answering" || now - startsAt > 600) return;
    if (countdownCue.current === startCount) return;
    countdownCue.current = startCount;
    vibrate(startCount > 0 ? 15 : 30);
    play(startCount > 0 ? "ready" : "allReady");
  }, [now, play, round.status, startCount, startsAt]);
  const [focusedCat, setFocusedCat] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const compactHeader = focusedCat !== null || keyboardOpen;
  const filledCount = round.categories.filter((c) => (values[c] ?? "").trim()).length;

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const resize = () => setKeyboardOpen(window.innerHeight - viewport.height > 150);
    viewport.addEventListener("resize", resize);
    resize();
    return () => viewport.removeEventListener("resize", resize);
  }, []);

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
      <div className={`sticky top-0 z-20 flex items-center border-b border-border bg-background/95 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur ${compactHeader ? "gap-3 px-0 pb-3" : "gap-4 px-0 pb-4"}`}>
        <div className={`flex shrink-0 items-center justify-center bg-primary ${compactHeader ? "size-10 rounded-md" : "size-20 rounded-2xl"}`}>
          <span className={`font-display text-primary-foreground ${compactHeader ? "text-2xl" : "text-5xl"}`}>{round.letter}</span>
        </div>
        <div className={`min-w-0 flex-1 ${compactHeader ? "flex items-center justify-between gap-2" : ""}`}>
          <p className="text-sm text-muted-foreground">
            Rodada {round.number} de {room.total_rounds}
          </p>
          {secondsLeft !== null ? (
            <p
              role="timer"
              aria-label={`${secondsLeft} segundos restantes${secondsLeft <= 10 ? ", tempo acabando" : ""}`}
              className={`font-display ${compactHeader ? "text-xl" : "text-4xl"} ${secondsLeft <= 10 ? "text-destructive" : "text-foreground"}`}
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

      <div className="space-y-1">
        <div className="text-right text-sm font-medium tabular-nums text-muted-foreground" aria-hidden="true">{filledCount}/{round.categories.length} preenchidas</div>
        <progress aria-label="Progresso das respostas" className="answer-progress h-1.5 w-full" value={filledCount} max={round.categories.length || 1} />
      </div>

      {round.status === "answering" && stopCountdown !== null && stopCountdown > 0 && (
        <div className="animate-scale-in rounded-2xl border-2 border-destructive bg-destructive/15 p-4 text-center" role="status" aria-live="assertive">
          <ShieldAlert className="mx-auto size-7 text-destructive" />
          <p className="mt-1 font-display text-2xl text-destructive">✋ @{round.stopped_by ?? "alguém"} gritou STOP!</p>
          <p className="text-sm font-bold text-foreground">Respostas bloqueiam em {stopCountdown}s</p>
        </div>
      )}

      {showEveryoneFinished && (
        <div className="animate-scale-in rounded-2xl border border-success bg-success/15 p-4 text-center" role="status" aria-live="polite">
          <Rocket className="mx-auto size-7 text-success" />
          <p className="mt-1 font-display text-2xl text-success">🚀 Todos terminaram!</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {players.map((p) => (
          <span
            key={p.id}
            className={`game-chip flex items-center gap-1 rounded-lg px-3 py-1 text-sm ${
              finishedIds.includes(p.id)
                ? "bg-success/20 text-success"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {finishedIds.includes(p.id) && <Check className="size-3" />}
            {p.nickname}
            <PlayerPresence player={p} />
          </span>
        ))}
      </div>

      <div className="space-y-3">
        {round.categories.map((category, index) => (
          <div key={category} className="game-field rounded-lg border border-border bg-card p-3">
            <label htmlFor={`answer-field-${index}`} className="flex items-start gap-2 text-sm font-semibold text-foreground"><span className="shrink-0 text-xs tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><span className="text-balance-safe">{category}</span></label>
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
                if (next) { next.focus(); next.scrollIntoView({ behavior: "smooth", block: "center" }); }
                else { event.currentTarget.blur(); setFocusedCat(null); }
              }}
              inputMode={appKeyboard ? "none" : "text"}
              onFocus={() => setFocusedCat(category)}
              onBlur={() => { if (!appKeyboard) setFocusedCat(null); }}
              name={`stop-answer-${index}`}
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              className="mt-2 h-12 rounded-lg text-base"
            />
          </div>
        ))}
      </div>

      {saveError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive p-3 text-sm"><p>Suas respostas continuam aqui, mas ainda não foram salvas.</p><Button variant="outline" disabled={sending || starting || round.status !== "answering"} onClick={() => void flush()}>Tentar salvar</Button></div>}
      <div className={`mobile-bottom-bar fixed inset-x-0 bottom-[var(--keyboard-inset,0px)] mx-auto flex flex-wrap w-full max-w-md gap-3 ${dev.buttonLayout === "reversed" ? "flex-row-reverse" : dev.buttonLayout === "stacked" ? "flex-col" : ""} border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur`}>
        {!evaluating && <Button variant="ghost" disabled={starting || sending} className="w-full justify-center text-xs text-muted-foreground" onClick={() => {
          const next = appKeyboard ? "native" : "app";
          setKeyboardPreference(next);
          try { window.localStorage.setItem("stop-keyboard-mode", next); } catch { /* ignore */ }
          const index = Math.max(0, round.categories.indexOf(focusedCat ?? ""));
          window.requestAnimationFrame(() => answerInputs.current[index]?.focus({ preventScroll: true }));
        }}><Keyboard className="size-4" />{appKeyboard ? "Teclado do celular" : "Teclado da tela"}</Button>}
        {appKeyboard && !evaluating && !starting && (() => {
          const target = () => focusedCat ?? round.categories[0] ?? "";
          const type = (k: string) => { const c = target(); setValue(c, (values[c] ?? "") + k); };
          const back = () => { const c = target(); setValue(c, (values[c] ?? "").slice(0, -1)); };
          const key = (k: string) => (
            <Button variant="secondary" key={k} type="button" disabled={sending} onMouseDown={(e) => e.preventDefault()} onClick={() => type(k)} className="keyboard-key h-12 min-h-12 min-w-0 flex-1 rounded-md px-0 text-base font-bold">{k}</Button>
          );
          return (
            <div className="flex w-full flex-col gap-1.5">
              <div className="keyboard-row flex gap-1">{[..."QWERTYUIOP"].map(key)}</div>
              <div className="keyboard-row flex gap-1">{[..."ASDFGHJKLÇ"].map(key)}</div>
              <div className="keyboard-row flex gap-1">
                <div className="flex-[0.5]" />
                {[..."ZXCVBNM"].map(key)}
                <Button variant="secondary" type="button" aria-label="Apagar" disabled={sending} onMouseDown={(e) => e.preventDefault()} onClick={back} className="keyboard-key h-12 min-h-12 min-w-0 flex-[1.5] rounded-md px-0 text-base">⌫</Button>
              </div>
              <div className="flex gap-1">
                <div className="flex-[2]" />
                <Button variant="secondary" type="button" disabled={sending} onMouseDown={(e) => e.preventDefault()} onClick={() => type(" ")} className="h-12 min-h-12 flex-[6] rounded-md text-sm">Espaço</Button>
                <div className="flex-[2]" />
              </div>
            </div>
          );
        })()}
        {evaluating ? (
          <EvaluationLoading />
        ) : (
          <>
            <Button
              variant="secondary"
              disabled={sending || starting}
              onClick={() => void markFinished()}
              className="h-14 flex-1 rounded-lg text-base font-bold"
            >
              {sending ? <Loader2 className="animate-spin" /> : mine?.finished ? <Check /> : null}{devText(dev.texts.finishButton, "Terminei")}
            </Button>
            <Button
              onClick={() => void handleStopClick()}
              disabled={!canStop || sending || starting || stopCountdown !== null}
              className="h-14 flex-1 rounded-lg bg-accent font-display text-2xl text-accent-foreground hover:bg-accent/90"
            >
              {sending ? <Loader2 className="animate-spin" /> : devText(dev.texts.stopButton, "STOP!")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
