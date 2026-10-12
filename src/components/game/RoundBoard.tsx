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
  const [showEveryoneFinished, setShowEveryoneFinished] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstAnswerInput = useRef<HTMLInputElement | null>(null);
  const appKeyboard = dev.keyboard.mode === "app";
  const [focusedCat, setFocusedCat] = useState<string | null>(null);

  // Nova rodada: começa sempre com os campos vazios.
  useEffect(() => {
    setValues({});
    setHydrated(false);
  }, [round.id]);

  useEffect(() => {
    if (round.status !== "answering") return;
    const frame = window.requestAnimationFrame(() => {
      firstAnswerInput.current?.focus({ preventScroll: false });
      firstAnswerInput.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [round.id, round.status]);

  useEffect(() => {
    if (hydrated) return;
    if (mine) {
      const saved = (mine.values as Record<string, string>) ?? {};
      const onlyThisRound: Record<string, string> = {};
      for (const category of round.categories) {
        if (saved[category]) onlyThisRound[category] = saved[category];
      }
      setValues(onlyThisRound);
      setHydrated(true);
    }
  }, [mine, hydrated, round.categories]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const secondsLeft = useMemo(() => {
    if (!round.ends_at) return null;
    return Math.max(0, Math.ceil((new Date(round.ends_at).getTime() - now) / 1000));
  }, [round.ends_at, now]);

  const firedTimer = useRef(false);
  useEffect(() => {
    if (secondsLeft === 0 && !firedTimer.current && isHost && round.status === "answering") {
      firedTimer.current = true;
      void onStop("timer");
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

  async function save(next: Record<string, string>, finished: boolean) {
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
      console.error("save answers", error);
      play("error");
      toast.error("Não consegui salvar suas respostas. Confira a internet.");
    }
  }

  function persist(next: Record<string, string>) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void save(next, mine?.finished ?? false);
    }, 400);
  }

  // Grava na hora o que estiver pendente (antes de "Terminei" ou do STOP).
  async function flush(finished?: boolean) {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await save(latestValues.current, finished ?? mine?.finished ?? false);
  }

  function setValue(category: string, value: string) {
    const next = { ...values, [category]: value };
    setValues(next);
    persist(next);
  }

  async function markFinished() {
    if (sending) return;
    setSending(true);
    try {
      await flush(true);
    } finally {
      setSending(false);
    }
  }

  async function handleStopClick() {
    if (sending) return;
    setSending(true);
    try {
      await flush();
      await onStop("stop");
    } finally {
      setSending(false);
    }
  }

  const canStop = room.stop_policy === "anyone" || isHost;
  const finishedIds = answers.filter((a) => a.finished).map((a) => a.player_id);
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
    <div className={`space-y-4 ${appKeyboard ? "pb-72" : "pb-36"}`}>
      <div className="flex items-center gap-4 rounded-3xl border border-border bg-card p-4">
        <div className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-primary">
          <span className="font-display text-5xl text-primary-foreground">{round.letter}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">
            Rodada {round.number} de {room.total_rounds}
          </p>
          {secondsLeft !== null ? (
            <p
              className={`font-display text-4xl ${secondsLeft <= 10 ? "text-destructive" : "text-foreground"}`}
            >
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
            </p>
          ) : (
            <p className="font-display text-2xl text-muted-foreground">Sem cronômetro</p>
          )}
        </div>
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
            className={`flex items-center gap-1 rounded-full px-3 py-1 text-sm ${
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
          <div key={category} className="rounded-2xl border border-border bg-card p-3">
            <label className="text-sm font-semibold text-muted-foreground">{category}</label>
            <Input
              ref={index === 0 ? firstAnswerInput : undefined}
              value={values[category] ?? ""}
              disabled={evaluating}
              onChange={(e) => setValue(category, e.target.value)}
              placeholder={`Com ${round.letter}...`}
              autoComplete={dev.keyboard.autocomplete ? "on" : "off"}
              autoCorrect={dev.keyboard.autocorrect ? "on" : "off"}
              autoCapitalize={dev.keyboard.autocorrect ? "sentences" : "none"}
              spellCheck={dev.keyboard.spellcheck}
              inputMode={appKeyboard ? "none" : "text"}
              onFocus={() => setFocusedCat(category)}
              name={`stop-answer-${index}`}
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              className="mt-1 h-12 rounded-xl border-2 text-base"
            />
          </div>
        ))}
      </div>

      <div className={`fixed inset-x-0 bottom-0 mx-auto flex flex-wrap w-full max-w-md gap-3 ${dev.buttonLayout === "reversed" ? "flex-row-reverse" : dev.buttonLayout === "stacked" ? "flex-col" : ""} border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur`}>
        {appKeyboard && !evaluating && (
          <div className="grid w-full grid-cols-10 gap-1">
            {[..."QWERTYUIOPASDFGHJKLÇZXCVBNM"].map((k) => (
              <button key={k} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { const c = focusedCat ?? round.categories[0] ?? ""; setValue(c, (values[c] ?? "") + k); }} className="h-9 rounded-md bg-secondary text-sm font-bold">{k}</button>
            ))}
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { const c = focusedCat ?? round.categories[0] ?? ""; setValue(c, (values[c] ?? "") + " "); }} className="col-span-2 h-9 rounded-md bg-secondary text-xs">Espaço</button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { const c = focusedCat ?? round.categories[0] ?? ""; setValue(c, (values[c] ?? "").slice(0, -1)); }} className="h-9 rounded-md bg-secondary text-sm">⌫</button>
          </div>
        )}
        {evaluating ? (
          <div className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-secondary font-bold">
            <Loader2 className="size-5 animate-spin" /> Avaliando respostas...
          </div>
        ) : (
          <>
            <Button
              variant="secondary"
              disabled={sending}
              onClick={() => void markFinished()}
              className="h-14 flex-1 rounded-2xl text-base font-bold"
            >
              {devText(dev.texts.finishButton, "Terminei")}{mine?.finished ? " ✓" : ""}
            </Button>
            <Button
              onClick={() => void handleStopClick()}
              disabled={!canStop || sending || stopCountdown !== null}
              className="h-14 flex-1 rounded-2xl bg-accent font-display text-2xl text-accent-foreground hover:bg-accent/90"
            >
              {devText(dev.texts.stopButton, "STOP!")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
