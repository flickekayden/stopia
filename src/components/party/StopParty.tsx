import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Pencil, Plus, RefreshCw, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";

import { AnswerCard, type AnswerCardData } from "@/components/game/AnswerCard";
import { CategoryPresets } from "@/components/game/CategoryPresets";
import { EvaluationLoading } from "@/components/game/EvaluationLoading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PartyActions, PartyCtx } from "@/components/party/PartyStage";
import type { LobbyCtx } from "@/components/party/PartyStage";
import { MAX_CATEGORIES_PER_ROUND } from "@/lib/game";
import { vibrate } from "@/lib/haptics";
import {
  PARTY_ROUND_OPTIONS,
  STOP_ANSWER_MAX,
  STOP_CATEGORY_MAX_LENGTH,
  STOP_INTENSITIES,
  STOP_INTENSITY_LABELS,
  STOP_RULES,
  STOP_SCORINGS,
  STOP_SCORING_LABELS,
  STOP_SECONDS_OPTIONS,
  stopAnswersComplete,
  type PartySettings,
} from "@/lib/party-games";
import { cn } from "@/lib/utils";

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function nick(players: PartyCtx["players"], id: string | undefined) {
  return players.find((p) => p.id === id)?.nickname ?? "Alguém que saiu";
}

/* --------------------------------- Lobby ---------------------------------- */

/** The host's official rules, readable by everyone before (and during) the match. */
export function StopRulesSummary({ settings, className }: { settings: PartySettings; className?: string }) {
  const perRound = Math.min(MAX_CATEGORIES_PER_ROUND, settings.categories.length);
  const tags = [
    `${settings.rounds} rodadas`,
    `${settings.stopSeconds}s por rodada`,
    `Pontuação: ${STOP_SCORING_LABELS[settings.scoring].name}`,
    `IA: ${STOP_INTENSITY_LABELS[settings.aiIntensity].name}`,
    `${perRound} de ${settings.categories.length} categorias por rodada`,
  ];
  return (
    <ul className={cn("flex flex-wrap gap-2", className)} aria-label="Regras da partida definidas pelo mestre">
      {tags.map((tag) => <li key={tag} className="game-chip text-balance-safe">{tag}</li>)}
    </ul>
  );
}

export function StopRules() {
  return (
    <ul className="space-y-1.5 text-sm text-muted-foreground">
      {STOP_RULES.map((rule) => <li key={rule} className="flex gap-2"><span className="party-accent" aria-hidden="true">•</span><span>{rule}</span></li>)}
    </ul>
  );
}

function OptionButton({ active, disabled, onClick, title, detail, label }: { active: boolean; disabled: boolean; onClick: () => void; title: string; detail?: string; label?: string }) {
  return (
    <Button
      variant={active ? "selected" : "secondary"}
      aria-pressed={active}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-auto min-h-12 flex-col gap-0 whitespace-normal px-2 py-2 text-center leading-tight"
    >
      <span className="font-bold">{title}</span>
      {detail && <span className="text-xs font-medium opacity-80">{detail}</span>}
    </Button>
  );
}

function CategoryManager({ ctx, actions }: { ctx: LobbyCtx; actions: PartyActions }) {
  const categories = ctx.settings.categories;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const busy = ctx.busy !== null;

  async function add() {
    const value = draft.replace(/\s+/g, " ").trim();
    if (!value) return;
    if (categories.some((c) => c.toLocaleLowerCase("pt-BR") === value.toLocaleLowerCase("pt-BR"))) {
      toast.error("Essa categoria já está na lista");
      return;
    }
    if (await actions.updateSettings({ categories: [...categories, value] })) setDraft("");
  }

  function remove(index: number) {
    if (categories.length <= 1) {
      toast.error("Precisa de pelo menos uma categoria");
      return;
    }
    void actions.updateSettings({ categories: categories.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">Categorias <span className="tabular-nums text-foreground">({categories.length})</span></p>
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Pencil /> {open ? "Fechar" : "Gerenciar categorias"}</Button>
      </div>
      {!open && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Categorias da sala">
          {categories.slice(0, 12).map((c) => <li key={c} className="game-chip text-balance-safe">{c}</li>)}
          {categories.length > 12 && <li className="game-chip text-muted-foreground">+{categories.length - 12}</li>}
        </ul>
      )}
      {open && (
        <div className="space-y-4">
          <ul className="space-y-1.5">
            {categories.map((c, i) => (
              <li key={c} className="flex items-center gap-2 rounded-lg border border-border/60 py-1 pl-3 pr-1">
                <span className="min-w-0 flex-1 text-sm font-semibold text-balance-safe">{c}</span>
                <Button variant="ghost" size="icon" className="size-10 shrink-0 text-destructive" aria-label={`Remover categoria ${c}`} disabled={busy} onClick={() => remove(i)}><X /></Button>
              </li>
            ))}
          </ul>
          <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); void add(); }}>
            <Input value={draft} maxLength={STOP_CATEGORY_MAX_LENGTH} placeholder="Nova categoria" aria-label="Nova categoria" onChange={(e) => setDraft(e.target.value)} className="h-12" />
            <Button type="submit" size="icon" className="size-12 shrink-0" aria-label="Adicionar categoria" disabled={busy || !draft.trim()}><Plus /></Button>
          </form>
          <CategoryPresets categories={categories} onApply={(list) => actions.updateSettings({ categories: list })} />
        </div>
      )}
    </div>
  );
}

/** Host-only controls for Stop's official rules; guests get the read-only summary. */
export function StopLobbySettings({ ctx, actions }: { ctx: LobbyCtx; actions: PartyActions }) {
  const { settings } = ctx;
  const busy = ctx.busy !== null;
  if (!ctx.isHost) {
    return (
      <section className="party-panel space-y-2" aria-labelledby="stop-rules-guest">
        <h2 id="stop-rules-guest" className="text-base font-bold">Regras definidas pelo mestre</h2>
        <StopRulesSummary settings={settings} />
      </section>
    );
  }
  return (
    <section className="party-panel space-y-5" aria-labelledby="stop-rules-host">
      <h2 id="stop-rules-host" className="text-lg font-bold">Regras da partida</h2>
      <div>
        <p className="mb-2 text-sm font-semibold text-muted-foreground">Modo de pontuação</p>
        <div className="grid grid-cols-2 gap-2">
          {STOP_SCORINGS.map((value) => (
            <OptionButton key={value} active={settings.scoring === value} disabled={busy} onClick={() => void actions.updateSettings({ scoring: value })} title={STOP_SCORING_LABELS[value].name} detail={STOP_SCORING_LABELS[value].detail} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-muted-foreground">Intensidade da IA</p>
        <div className="grid grid-cols-3 gap-2">
          {STOP_INTENSITIES.map((value) => (
            <OptionButton key={value} active={settings.aiIntensity === value} disabled={busy} onClick={() => void actions.updateSettings({ aiIntensity: value })} title={STOP_INTENSITY_LABELS[value].name} detail={STOP_INTENSITY_LABELS[value].detail} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-muted-foreground">Rodadas</p>
        <div className="grid grid-cols-3 gap-2">
          {PARTY_ROUND_OPTIONS.map((n) => (
            <OptionButton key={n} active={settings.rounds === n} disabled={busy} onClick={() => void actions.updateSettings({ rounds: n })} title={String(n)} label={`${n} rodadas`} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-muted-foreground">Tempo da rodada</p>
        <div className="grid grid-cols-4 gap-2">
          {STOP_SECONDS_OPTIONS.map((n) => (
            <OptionButton key={n} active={settings.stopSeconds === n} disabled={busy} onClick={() => void actions.updateSettings({ stopSeconds: n })} title={`${n}s`} label={`${n} segundos por rodada`} />
          ))}
        </div>
      </div>
      <CategoryManager ctx={ctx} actions={actions} />
    </section>
  );
}

/* --------------------------------- Round ---------------------------------- */

export function StopPartyPlay({ ctx, actions }: { ctx: PartyCtx; actions: PartyActions }) {
  if (ctx.room.phase === "reveal") return <StopReveal ctx={ctx} actions={actions} />;
  return <StopBoard ctx={ctx} actions={actions} />;
}

function StopBoard({ ctx, actions }: { ctx: PartyCtx; actions: PartyActions }) {
  const stop = ctx.state.stop;
  const categories = useMemo(() => stop?.categories ?? [], [stop?.categories]);
  const round = ctx.room.round_number;
  const phase = ctx.room.phase;
  const now = useNow(250);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const [values, setValues] = useState<Record<string, string>>({});
  const latest = useRef<Record<string, string>>({});
  const edited = useRef(new Set<string>());
  const doneRef = useRef(false);
  const [done, setDone] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [sending, setSending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const actionsBar = useRef<HTMLDivElement | null>(null);

  // A new round starts with empty answers.
  const roundKey = useRef(round);
  useEffect(() => {
    if (roundKey.current === round) return;
    roundKey.current = round;
    latest.current = {};
    edited.current = new Set();
    doneRef.current = false;
    setDone(false);
    setValues({});
    setSaveError(false);
  }, [round]);

  // Restore saved answers after a reload without overwriting anything typed meanwhile.
  const saved = ctx.view?.mine?.answers;
  const savedDone = ctx.view?.mine?.done === true;
  useEffect(() => {
    if (!saved) return;
    const merged = { ...latest.current };
    for (const [category, value] of Object.entries(saved)) if (!edited.current.has(category)) merged[category] = value;
    latest.current = merged;
    setValues(merged);
    if (savedDone) { doneRef.current = true; setDone(true); }
  }, [saved, savedDone]);

  const startsAt = stop ? Date.parse(stop.startsAt) : 0;
  const starting = now < startsAt;
  const startCount = Math.max(1, Math.ceil((startsAt - now) / 1000));
  const endsAt = ctx.room.phase_ends_at ? Date.parse(ctx.room.phase_ends_at) : null;
  const secondsLeft = endsAt !== null ? Math.max(0, Math.ceil((endsAt - Math.max(now, startsAt)) / 1000)) : null;
  const eligible = (ctx.state.eligible ?? []).includes(ctx.me.id);
  const evaluating = phase === "evaluating";
  const locked = evaluating || !eligible || starting || (endsAt !== null && now >= endsAt);
  const stopBy = stop?.stopBy;
  const stopCountdown = stopBy && endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null;
  const filled = categories.filter((c) => (values[c] ?? "").trim()).length;
  const complete = stopAnswersComplete(values, categories);

  function save(next: Record<string, string>, finished: boolean) {
    const task = queue.current.then(async () => {
      const ok = await actionsRef.current.stopSave(next, finished);
      setSaveError(!ok);
      return ok;
    });
    queue.current = task.catch(() => false);
    return task;
  }

  function flush(finished = doneRef.current) {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    return save(latest.current, finished);
  }

  function setValue(category: string, value: string) {
    if (locked) return;
    const next = { ...latest.current, [category]: value };
    edited.current.add(category);
    latest.current = next;
    setValues(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void save(latest.current, doneRef.current); }, 500);
  }

  // Someone shouted STOP or time is nearly up: push the latest answers right away.
  const flushedFor = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== "write" || !eligible || !endsAt) return;
    const key = `${round}:${stopBy ?? "time"}`;
    const urgent = Boolean(stopBy) || endsAt - now < 1_500;
    if (!urgent || flushedFor.current === key) return;
    flushedFor.current = key;
    void flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, eligible, endsAt, now, stopBy, round]);

  // Deadline: any player may ask the server to close the round; the server re-checks time and version.
  const fired = useRef<{ key: string; at: number } | null>(null);
  useEffect(() => {
    if (!endsAt || now < endsAt + 400) return;
    const key = `${round}:${phase}:${ctx.room.phase_ends_at}`;
    const last = fired.current;
    if (last && last.key === key && now - last.at < 5_000) return;
    fired.current = { key, at: now };
    void actionsRef.current.advance(false);
  }, [now, endsAt, round, phase, ctx.room.phase_ends_at]);

  // Focus the first answer as the round goes live.
  const focusedRound = useRef<number | null>(null);
  useEffect(() => {
    if (starting || locked || focusedRound.current === round) return;
    focusedRound.current = round;
    inputs.current[0]?.focus({ preventScroll: true });
  }, [starting, locked, round]);

  async function finish() {
    if (sending || locked) return;
    vibrate(15);
    setSending(true);
    doneRef.current = true;
    setDone(true);
    const ok = await flush(true);
    if (!ok) { doneRef.current = false; setDone(false); }
    setSending(false);
  }

  async function shoutStop() {
    if (sending || locked || !complete) return;
    vibrate(40);
    setSending(true);
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    await queue.current;
    await actionsRef.current.stopNow(latest.current);
    setSending(false);
  }

  if (!stop) return null;
  const submitted = new Set(ctx.state.submitted ?? []);
  const failed = ctx.state.ai?.status === "failed";

  return (
    <div className="dock-clearance space-y-4" data-game="stop">
      <div className="round-hud sticky top-0 z-20 -mx-4 flex items-center gap-3 border-b border-border/70 pb-3 pl-4 pr-[calc(var(--top-actions-space)+0.5rem)] pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-md">
        <div className="letter-tile flex size-14 shrink-0 items-center justify-center rounded-xl" aria-label={`Letra ${starting ? "a ser revelada" : stop.letter}`}>
          <span className="font-display text-4xl leading-none">{starting ? "?" : stop.letter}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="section-label">Rodada <span className="tabular-nums text-foreground">{round}</span> de {ctx.settings.rounds}</p>
          <p className="truncate text-xs font-semibold text-muted-foreground">{STOP_SCORING_LABELS[ctx.settings.scoring].name} · IA {STOP_INTENSITY_LABELS[ctx.settings.aiIntensity].name}</p>
        </div>
        {secondsLeft !== null && !evaluating && (
          <p role="timer" aria-label={`${secondsLeft} segundos restantes`} data-state={secondsLeft <= 10 ? "critical" : secondsLeft <= 30 ? "low" : "normal"} className="round-timer text-3xl">
            {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </p>
        )}
      </div>

      {starting && (
        <div className="pointer-events-none fixed inset-y-0 left-1/2 z-30 grid w-full max-w-md -translate-x-1/2 place-items-center bg-background/70 backdrop-blur-sm" role="status" aria-live="assertive" aria-label={`Começa em ${startCount}`}>
          <span key={startCount} className="evaluation-phrase font-display text-7xl text-primary">{startCount}</span>
        </div>
      )}

      {stopBy && !evaluating && stopCountdown !== null && (
        <div className="animate-scale-in rounded-2xl border border-destructive/70 bg-destructive/12 p-4 text-center" role="status" aria-live="assertive">
          <ShieldAlert className="mx-auto size-7 text-destructive" aria-hidden="true" />
          <p className="mt-1 font-display text-2xl text-destructive">✋ @{nick(ctx.players, stopBy)} gritou STOP!</p>
          <p className="text-sm font-bold">Respostas travam em <span className="tabular-nums">{stopCountdown}</span>s</p>
        </div>
      )}

      {!eligible && <p className="party-panel text-center text-sm text-muted-foreground">Você entrou no meio desta rodada. Acompanhe e jogue na próxima.</p>}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3" aria-hidden="true">
          <span className="section-label">Respostas</span>
          <span className="text-sm font-bold tabular-nums">{filled}<span className="text-muted-foreground">/{categories.length} preenchidas</span></span>
        </div>
        <progress aria-label="Progresso das respostas" className="answer-progress h-1.5 w-full" value={filled} max={categories.length || 1} />
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Quem já terminou">
        {(ctx.state.eligible ?? []).filter((id) => ctx.players.some((p) => p.id === id)).map((id) => (
          <span key={id} className={cn("game-chip flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium", submitted.has(id) ? "border-success/40 bg-success/12 text-success" : "border-border bg-card text-muted-foreground")}>
            {submitted.has(id) && <Check className="size-3.5" aria-hidden="true" />}{nick(ctx.players, id)}
          </span>
        ))}
      </div>

      {eligible && (
        <div className="space-y-2.5">
          {categories.map((category, index) => (
            <div key={category} className="game-field" data-filled={(values[category] ?? "").trim() ? "true" : "false"}>
              <label htmlFor={`stop-party-${index}`} className="flex items-center gap-2.5 text-sm font-bold"><span className="field-index" aria-hidden="true">{(values[category] ?? "").trim() ? <Check className="size-3.5" /> : String(index + 1).padStart(2, "0")}</span><span className="text-balance-safe">{category}</span></label>
              <Input
                id={`stop-party-${index}`}
                ref={(input) => { inputs.current[index] = input; }}
                value={values[category] ?? ""}
                disabled={locked}
                maxLength={STOP_ANSWER_MAX}
                onChange={(e) => setValue(category, e.target.value)}
                placeholder={starting ? "Prepare-se…" : `Com ${stop.letter}...`}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="sentences"
                spellCheck={false}
                inputMode="text"
                enterKeyHint={index < categories.length - 1 ? "next" : "done"}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  const next = inputs.current[index + 1];
                  if (next) { next.focus({ preventScroll: true }); next.scrollIntoView({ behavior: "smooth", block: "center" }); }
                  else { event.currentTarget.blur(); window.setTimeout(() => actionsBar.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 120); }
                }}
                name={`stop-party-answer-${index}`}
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore="true"
                className="mt-2.5 h-12 rounded-lg text-base font-semibold"
              />
            </div>
          ))}
        </div>
      )}

      {saveError && !evaluating && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/70 bg-destructive/10 p-3 text-sm">
          <p>Suas respostas continuam aqui, mas ainda não foram salvas.</p>
          <Button variant="outline" disabled={locked} onClick={() => void flush()}>Tentar salvar</Button>
        </div>
      )}

      <div ref={actionsBar} className="round-actions mt-6 flex w-full flex-wrap gap-3 border-t border-border/70 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {evaluating ? (
          failed ? (
            <div role="alert" className="w-full space-y-3 text-center">
              <p className="font-bold">A IA não conseguiu avaliar a rodada.</p>
              {ctx.state.ai?.text && <p className="text-sm text-muted-foreground">{ctx.state.ai.text}</p>}
              {ctx.isHost ? (
                <Button className="h-14 w-full text-base font-bold" disabled={ctx.busy !== null} aria-busy={ctx.busy === "advance"} onClick={() => void actions.advance(true)}>
                  {ctx.busy === "advance" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Avaliar de novo
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Esperando o mestre tentar de novo…</p>
              )}
            </div>
          ) : (
            <EvaluationLoading />
          )
        ) : eligible ? (
          <>
            <Button variant="secondary" disabled={sending || locked} onClick={() => void finish()} aria-busy={sending} className={cn("h-16 flex-1 rounded-xl text-base font-bold", done && "border-success/50 text-success")}>
              {done ? <Check /> : null}Terminei
            </Button>
            <Button onClick={() => void shoutStop()} disabled={sending || locked || !complete || Boolean(stopBy)} aria-busy={sending} className="stop-button h-16 flex-[1.4] rounded-xl text-3xl">
              {sending ? <Loader2 className="animate-spin" /> : "STOP!"}
            </Button>
            {!complete && !locked && <p className="w-full text-center text-xs text-muted-foreground">Preencha todas as categorias para gritar STOP!</p>}
          </>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------- Reveal --------------------------------- */

function StopScoreboard({ ctx }: { ctx: PartyCtx }) {
  const deltas = ctx.state.deltas ?? {};
  const scores = ctx.state.scores ?? {};
  const rows = ctx.players.map((p) => ({ ...p, score: scores[p.id] ?? 0, delta: deltas[p.id] ?? 0 })).sort((a, b) => b.score - a.score);
  return (
    <section className="party-panel space-y-2" aria-label="Placar da sala">
      <p className="section-label">Placar da sala</p>
      <ul className="space-y-1.5">
        {rows.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-semibold">{p.nickname}{p.id === ctx.me.id && <span className="text-muted-foreground"> (você)</span>}</span>
            <span className="flex shrink-0 items-center gap-2 tabular-nums">
              {p.delta > 0 && <span className="points-badge rounded-md bg-success/15 px-1.5 text-sm font-bold text-success">+{p.delta}</span>}
              <span className="font-display text-xl">{p.score}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StopReveal({ ctx, actions }: { ctx: PartyCtx; actions: PartyActions }) {
  const stop = ctx.state.stop;
  const categories = stop?.categories ?? [];
  const results = useMemo(() => ctx.state.results?.stop ?? [], [ctx.state.results?.stop]);
  const [index, setIndex] = useState(0);
  const round = ctx.room.round_number;
  useEffect(() => { setIndex(0); }, [round]);
  const category = categories[Math.min(index, Math.max(0, categories.length - 1))] ?? "";
  const cards = useMemo<AnswerCardData[]>(() => results
    .filter((r) => r.categoria === category)
    .sort((a, b) => b.pontos - a.pontos)
    .map((r) => ({ roundId: `${ctx.room.id}-${round}`, category, playerId: r.jogador_id, playerName: nick(ctx.players, r.jogador_id), response: r.resposta, points: r.pontos, comment: r.comentario })), [results, category, ctx.room.id, round, ctx.players]);
  const last = round >= ctx.settings.rounds;
  const lastCategory = index >= categories.length - 1;

  return (
    <div className="dock-clearance space-y-4" data-game="stop">
      <div className="flex items-center gap-3 pt-2">
        <div className="letter-tile flex size-12 shrink-0 items-center justify-center rounded-xl" aria-label={`Letra ${stop?.letter ?? ""}`}><span className="font-display text-3xl leading-none">{stop?.letter}</span></div>
        <div className="min-w-0">
          <p className="section-label">Rodada {round} de {ctx.settings.rounds}</p>
          <h2 className="text-2xl leading-tight">Resultado da rodada</h2>
          <p className="text-xs font-semibold text-muted-foreground">{STOP_SCORING_LABELS[ctx.settings.scoring].name} · IA {STOP_INTENSITY_LABELS[ctx.settings.aiIntensity].name}</p>
        </div>
      </div>

      <section className="space-y-3" aria-live="polite" aria-labelledby="stop-category-title">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="icon" aria-label="Categoria anterior" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}><ChevronLeft /></Button>
          <div className="min-w-0 text-center">
            <p className="section-label">Categoria <span className="tabular-nums text-foreground">{index + 1}</span> de {categories.length}</p>
            <h3 id="stop-category-title" className="text-balance-safe text-xl font-bold">{category}</h3>
          </div>
          <Button variant="ghost" size="icon" aria-label="Próxima categoria" disabled={lastCategory} onClick={() => setIndex((i) => Math.min(categories.length - 1, i + 1))}><ChevronRight /></Button>
        </div>
        <ul className="space-y-2">
          {cards.map((card) => <li key={card.playerId}><AnswerCard data={card} /></li>)}
        </ul>
        {!lastCategory && (
          <Button variant="secondary" className="h-12 w-full font-semibold" onClick={() => { setIndex((i) => i + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            Próxima categoria <ChevronRight />
          </Button>
        )}
      </section>

      <StopScoreboard ctx={ctx} />

      <div className="mobile-bottom-bar fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
        {ctx.isHost ? (
          <Button className="party-accent-button h-14 w-full text-lg font-bold shadow-none" disabled={ctx.busy !== null} aria-busy={ctx.busy === "next"} onClick={() => void actions.next()}>
            {ctx.busy === "next" ? <><Loader2 className="animate-spin" /> Preparando…</> : last ? "Ver resultado final" : "Próxima rodada"}
          </Button>
        ) : (
          <p role="status" className="flex h-14 items-center justify-center text-sm text-muted-foreground">Esperando o mestre seguir…</p>
        )}
      </div>
    </div>
  );
}
