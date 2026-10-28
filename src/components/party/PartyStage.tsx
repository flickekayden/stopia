import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, Crown, EyeOff, Eye, Gavel, Loader2, RefreshCw, SkipForward, Sparkles, Trophy, Users } from "lucide-react";

import { PartyIcon } from "@/components/party/PartyIcon";
import { RulesList } from "@/components/party/RulesList";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { PartyPlayer, PartyPrivateView, PartyRoom } from "@/hooks/use-party-room";
import { rankPlayers } from "@/lib/ranking";
import {
  PARTY_GAMES,
  PARTY_ROUND_OPTIONS,
  PARTY_SKIP_OPTIONS,
  PARTY_TEXT_MAX,
  PHASE_LABELS,
  type PartyEntry,
  type PartyGameId,
  type PartyPhaseId,
  type PartyPublicState,
  type PartySettings,
} from "@/lib/party-games";
import { cn } from "@/lib/utils";

export type PartyCtx = {
  room: PartyRoom;
  players: PartyPlayer[];
  me: PartyPlayer;
  isHost: boolean;
  game: PartyGameId;
  state: PartyPublicState;
  settings: PartySettings;
  view: PartyPrivateView | null;
  busy: string | null;
};

export type PartyActions = {
  submit: (payload: Record<string, unknown>) => Promise<boolean>;
  advance: (manual: boolean) => Promise<boolean>;
  next: () => Promise<boolean>;
  skip: () => Promise<boolean>;
  start: () => Promise<boolean>;
  restart: () => Promise<boolean>;
  updateSettings: (settings: Partial<PartySettings>) => Promise<boolean>;
};

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function nick(players: PartyPlayer[], id: string | undefined) {
  return players.find((p) => p.id === id)?.nickname ?? "Alguém que saiu";
}

/* --------------------------------- Lobby ---------------------------------- */

export function PartyLobby({ ctx, actions }: { ctx: PartyCtx; actions: PartyActions }) {
  const meta = PARTY_GAMES[ctx.game];
  const enough = ctx.players.length >= meta.minPlayers;
  const { settings } = ctx;
  const option = (active: boolean) => (active ? "selected" : "secondary") as "selected" | "secondary";

  return (
    <div className="dock-clearance space-y-4">
      <section className="party-prompt space-y-3">
        <div className="flex items-start gap-3">
          <span className="party-icon size-12"><PartyIcon name={meta.icon} className="size-6" /></span>
          <div className="min-w-0">
            <h2 className="text-balance-safe text-xl font-bold leading-tight">{meta.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{meta.description}</p>
          </div>
        </div>
        <RulesList game={ctx.game} />
      </section>

      <section className="party-panel">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Jogadores</h2>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm font-bold tabular-nums">{ctx.players.length}</span>
        </div>
        <ul className="space-y-1">
          {ctx.players.map((p) => (
            <li key={p.id} className="flex items-center gap-3 border-b border-border/50 py-2.5 last:border-0">
              <span className="party-icon size-10 font-display text-lg" aria-hidden="true">{p.nickname.charAt(0).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-balance-safe">{p.nickname}{p.id === ctx.me.id && <span className="text-muted-foreground"> (você)</span>}</span>
                {p.is_host && <span className="inline-flex items-center gap-1 text-xs font-bold party-accent"><Crown className="size-3.5" aria-hidden="true" /> Mestre da sala</span>}
              </span>
            </li>
          ))}
        </ul>
        {!enough && <p className="mt-3 text-sm text-muted-foreground">Faltam {meta.minPlayers - ctx.players.length} jogador(es) para começar. Compartilhe o código!</p>}
      </section>

      {ctx.isHost ? (
        <section className="party-panel space-y-5">
          <h2 className="text-lg font-bold">Configuração</h2>
          <div>
            <p className="mb-2 text-sm font-semibold text-muted-foreground">Rodadas</p>
            <div className="grid grid-cols-3 gap-2">
              {PARTY_ROUND_OPTIONS.map((n) => (
                <Button key={n} variant={option(settings.rounds === n)} aria-label={`${n} rodadas`} aria-pressed={settings.rounds === n} disabled={ctx.busy !== null} onClick={() => void actions.updateSettings({ rounds: n })}>{n}</Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <div className="min-w-0">
              <p className="font-semibold">IA no jogo</p>
              <p className="text-sm text-muted-foreground">{ctx.game === "infiltrado" ? "O Infiltrado usa só a lista do jogo." : "Gera conteúdos novos e comenta os resultados. Sem IA, usa a lista do jogo."}</p>
            </div>
            <Switch aria-label="IA no jogo" checked={settings.ai} disabled={ctx.busy !== null || ctx.game === "infiltrado"} onCheckedChange={(ai) => void actions.updateSettings({ ai })} />
          </div>
          {ctx.game === "roleta" && (
            <>
              <div>
                <p className="mb-2 text-sm font-semibold text-muted-foreground">Intensidade</p>
                <div className="grid grid-cols-3 gap-2">
                  {(["leve", "media", "caotica"] as const).map((value) => (
                    <Button key={value} variant={option(settings.intensity === value)} aria-pressed={settings.intensity === value} disabled={ctx.busy !== null} onClick={() => void actions.updateSettings({ intensity: value })}>
                      {value === "leve" ? "Leve" : value === "media" ? "Média" : "Caótica"}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-muted-foreground">Pulos de desafio por partida</p>
                <div className="grid grid-cols-3 gap-2">
                  {PARTY_SKIP_OPTIONS.map((n) => (
                    <Button key={n} variant={option(settings.skips === n)} aria-label={`${n} pulos`} aria-pressed={settings.skips === n} disabled={ctx.busy !== null} onClick={() => void actions.updateSettings({ skips: n })}>{n}</Button>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      ) : (
        <p className="party-panel text-center text-sm text-muted-foreground">
          {settings.rounds} rodadas · IA {settings.ai && ctx.game !== "infiltrado" ? "ligada" : "desligada"}
          {ctx.game === "roleta" ? ` · intensidade ${settings.intensity === "media" ? "média" : settings.intensity === "caotica" ? "caótica" : "leve"} · ${settings.skips} pulo(s)` : ""}
        </p>
      )}

      <div className="mobile-bottom-bar fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
        {ctx.isHost ? (
          <Button className="party-accent-button h-14 w-full text-lg font-bold shadow-none" disabled={!enough || ctx.busy !== null} aria-busy={ctx.busy === "start"} onClick={() => void actions.start()}>
            {ctx.busy === "start" ? <><Loader2 className="animate-spin" /> Preparando a rodada…</> : enough ? "Começar partida" : `Mínimo de ${meta.minPlayers} jogadores`}
          </Button>
        ) : (
          <p role="status" className="flex h-14 items-center justify-center gap-2 text-sm text-muted-foreground"><span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" /> Esperando o mestre começar…</p>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- Round ---------------------------------- */

function PhaseHeader({ ctx, now }: { ctx: PartyCtx; now: number }) {
  const phase = ctx.room.phase as PartyPhaseId;
  const endsAt = ctx.room.phase_ends_at ? new Date(ctx.room.phase_ends_at).getTime() : null;
  const seconds = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null;
  return (
    <div className="round-hud sticky top-0 z-20 -mx-4 flex items-center gap-3 border-b border-border/70 pb-3 pl-4 pr-[4.5rem] pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur-md">
      <span className="party-icon size-11"><PartyIcon name={PARTY_GAMES[ctx.game].icon} className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="section-label">Rodada <span className="tabular-nums text-foreground">{ctx.room.round_number}</span> de {ctx.settings.rounds}</p>
        <p className="text-balance-safe font-bold leading-tight">{PHASE_LABELS[phase]}</p>
      </div>
      {seconds !== null && (
        <p role="timer" aria-label={`${seconds} segundos restantes`} data-state={seconds <= 10 ? "critical" : seconds <= 20 ? "low" : "normal"} className="round-timer text-3xl">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </p>
      )}
    </div>
  );
}

function PromptCard({ ctx }: { ctx: PartyCtx }) {
  const prompt = ctx.state.prompt;
  if (!prompt) return null;
  const mySide = ctx.state.sides?.[ctx.me.id];
  return (
    <section className="party-prompt space-y-2" aria-label="Desafio da rodada">
      <div className="flex flex-wrap items-center gap-2">
        <p className="section-label party-accent">{prompt.title}</p>
        {prompt.source === "ai" && <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[0.6875rem] font-bold text-muted-foreground"><Sparkles className="size-3" aria-hidden="true" /> criado pela IA</span>}
        {prompt.event && <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-bold", prompt.event.multiplier > 1 ? "party-accent-button" : "bg-secondary text-muted-foreground")}>{prompt.event.label}{prompt.event.multiplier > 1 ? ` ×${prompt.event.multiplier}` : ""}</span>}
      </div>
      <p className="text-balance-safe text-xl font-bold leading-snug">{prompt.text}</p>
      {prompt.sideA && prompt.sideB && (
        <div className="grid gap-2 pt-1">
          {(["A", "B"] as const).map((side) => (
            <div key={side} className={cn("rounded-xl border p-3 text-sm", mySide === side ? "border-[var(--game-accent)] bg-background" : "border-border/60")}>
              <span className="font-display text-base party-accent">Lado {side}</span>{mySide === side && <span className="ml-2 text-xs font-bold">← o seu</span>}
              <p className="mt-0.5 font-semibold">{side === "A" ? prompt.sideA : prompt.sideB}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Progress({ ctx }: { ctx: PartyCtx }) {
  const eligible = (ctx.state.eligible ?? []).filter((id) => ctx.players.some((p) => p.id === id));
  const submitted = new Set(ctx.state.submitted ?? []);
  if (eligible.length === 0) return null;
  return (
    <section aria-label="Quem já enviou" className="space-y-2">
      <p className="text-sm font-bold tabular-nums">{eligible.filter((id) => submitted.has(id)).length}<span className="text-muted-foreground">/{eligible.length} enviaram</span></p>
      <div className="flex flex-wrap gap-2">
        {eligible.map((id) => (
          <span key={id} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm", submitted.has(id) ? "border-success/40 bg-success/12 text-success" : "border-border bg-card text-muted-foreground")}>
            {submitted.has(id) && <Check className="size-3.5" aria-hidden="true" />}{nick(ctx.players, id)}
          </span>
        ))}
      </div>
    </section>
  );
}

function SecretCard({ ctx }: { ctx: PartyCtx }) {
  const [shown, setShown] = useState(false);
  const role = ctx.view?.role;
  if (ctx.game !== "infiltrado" || !role) return null;
  return (
    <section className="secret-card space-y-2 p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <p className="section-label">Sua informação secreta</p>
        <Button variant="ghost" size="sm" onClick={() => setShown((v) => !v)} aria-pressed={shown}>{shown ? <EyeOff /> : <Eye />}{shown ? "Esconder" : "Mostrar"}</Button>
      </div>
      {shown ? (
        role === "infiltrado" ? (
          <p className="text-lg font-bold"><span className="font-display text-2xl party-accent">Você é o INFILTRADO.</span><br />Você não sabe a palavra. Blefe com uma pista que combine com a categoria.</p>
        ) : role === "cidadao" ? (
          <p className="text-lg font-bold">A palavra secreta é <span className="font-display text-3xl party-accent">{ctx.view?.word}</span></p>
        ) : (
          <p className="text-sm text-muted-foreground">Você entrou no meio da rodada. Na próxima você recebe um papel.</p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">Toque em “Mostrar” sem ninguém olhando sua tela.</p>
      )}
    </section>
  );
}

function TextSubmit({ ctx, actions, label, placeholder }: { ctx: PartyCtx; actions: PartyActions; label: string; placeholder: string }) {
  const phaseKey = `${ctx.room.round_number}:${ctx.room.phase}`;
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const [sentText, setSentText] = useState<string | null>(null);
  const keyRef = useRef(phaseKey);
  useEffect(() => {
    if (keyRef.current !== phaseKey) {
      keyRef.current = phaseKey;
      setText("");
      setTouched(false);
      setSentText(null);
    }
  }, [phaseKey]);
  const saved = ctx.view?.mine?.text ?? null;
  useEffect(() => {
    if (saved && !touched) {
      setText(saved);
      setSentText(saved);
    }
  }, [saved, touched]);
  const sending = ctx.busy === "submit";
  const dirty = text.trim() !== (sentText ?? "");
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const value = text.trim();
        if (!value) return;
        void actions.submit({ text: value }).then((ok) => { if (ok) setSentText(value); });
      }}
    >
      <label htmlFor="party-text" className="text-sm font-bold">{label}</label>
      <Textarea
        id="party-text"
        value={text}
        maxLength={PARTY_TEXT_MAX}
        rows={3}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => { setText(event.target.value); setTouched(true); }}
        className="min-h-24 rounded-xl text-base"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs tabular-nums text-muted-foreground">{text.length}/{PARTY_TEXT_MAX}</span>
        {sentText && !dirty && <span className="inline-flex items-center gap-1 text-sm font-semibold text-success"><Check className="size-4" aria-hidden="true" /> Enviado</span>}
      </div>
      <Button type="submit" className="party-accent-button h-14 w-full text-base font-bold shadow-none" disabled={!text.trim() || sending || (!!sentText && !dirty)} aria-busy={sending}>
        {sending ? <Loader2 className="animate-spin" /> : null}
        {sentText ? (dirty ? "Atualizar resposta" : "Resposta enviada") : "Enviar"}
      </Button>
      {sentText && <p className="text-center text-xs text-muted-foreground">Você pode ajustar até todo mundo enviar ou o tempo acabar.</p>}
    </form>
  );
}

function EntryList({ ctx, entries, onPick, selected, showAuthor }: { ctx: PartyCtx; entries: PartyEntry[]; onPick?: (entry: PartyEntry) => void; selected?: string | null; showAuthor: boolean }) {
  if (entries.length === 0) return <p className="party-panel text-center text-sm text-muted-foreground">Ninguém enviou nada nesta etapa.</p>;
  return (
    <ul className="space-y-2">
      {entries.map((entry, index) => {
        const own = entry.playerId === ctx.me.id;
        const side = entry.playerId ? ctx.state.sides?.[entry.playerId] : undefined;
        const content = (
          <>
            {showAuthor && <p className="text-xs font-semibold text-muted-foreground">{nick(ctx.players, entry.playerId)}{own ? " (você)" : ""}{side ? ` · Lado ${side}` : ""}{entry.playerId === ctx.state.defendantId ? " · RÉU" : ""}</p>}
            <p className="text-balance-safe mt-0.5 text-base font-semibold">“{entry.text}”</p>
          </>
        );
        return (
          <li key={entry.id} style={{ "--enter-index": index } as CSSProperties} className="answer-card rounded-xl">
            {onPick ? (
              <button type="button" disabled={own || ctx.busy === "submit"} data-selected={selected === entry.playerId} onClick={() => onPick(entry)} className="party-choice block min-h-14 w-full p-3 text-left" aria-pressed={selected === entry.playerId}>
                {content}
                {own && <p className="mt-1 text-xs text-muted-foreground">Não vale votar em si mesmo.</p>}
              </button>
            ) : (
              <div className="party-choice p-3">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function VoteTarget({ ctx, actions, entries, showAuthor }: { ctx: PartyCtx; actions: PartyActions; entries: PartyEntry[]; showAuthor: boolean }) {
  const saved = ctx.view?.mine?.target ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const current = picked ?? saved;
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">Toque no seu favorito. Dá para trocar até o fim da votação.</p>
      <EntryList ctx={ctx} entries={entries} showAuthor={showAuthor} selected={current} onPick={(entry) => {
        if (!entry.playerId) return;
        const target = entry.playerId;
        void actions.submit({ target }).then((ok) => { if (ok) setPicked(target); });
      }} />
    </div>
  );
}

function InfiltradoVote({ ctx, actions }: { ctx: PartyCtx; actions: PartyActions }) {
  const saved = ctx.view?.mine?.target ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const current = picked ?? saved;
  const candidates = (ctx.state.eligible ?? []).filter((id) => ctx.players.some((p) => p.id === id));
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="section-label">Pistas</p>
        <EntryList ctx={ctx} entries={ctx.state.entries ?? []} showAuthor />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-bold">Quem é o infiltrado?</p>
        <div className="grid grid-cols-2 gap-2">
          {candidates.map((id) => (
            <button key={id} type="button" disabled={id === ctx.me.id || ctx.busy === "submit"} data-selected={current === id} aria-pressed={current === id}
              onClick={() => void actions.submit({ target: id }).then((ok) => { if (ok) setPicked(id); })}
              className="party-choice min-h-14 p-3 text-left font-semibold">
              {nick(ctx.players, id)}{id === ctx.me.id ? " (você)" : ""}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TribunalVote({ ctx, actions }: { ctx: PartyCtx; actions: PartyActions }) {
  const saved = ctx.view?.mine?.verdict;
  const [picked, setPicked] = useState<string | null>(null);
  const current = picked ?? saved ?? null;
  const voting = (ctx.state.eligible ?? []).includes(ctx.me.id);
  return (
    <div className="space-y-4">
      <EntryList ctx={ctx} entries={ctx.state.entries ?? []} showAuthor />
      {voting ? (
        <div className="grid grid-cols-2 gap-2">
          {(["culpado", "inocente"] as const).map((verdict) => (
            <button key={verdict} type="button" disabled={ctx.busy === "submit"} data-selected={current === verdict} aria-pressed={current === verdict}
              onClick={() => void actions.submit({ verdict }).then((ok) => { if (ok) setPicked(verdict); })}
              className={cn("party-choice min-h-16 p-3 font-display text-2xl", verdict === "culpado" ? "text-destructive" : "text-success")}>
              {verdict === "culpado" ? "CULPADO" : "INOCENTE"}
            </button>
          ))}
        </div>
      ) : (
        <p className="party-panel text-center text-sm text-muted-foreground"><Gavel className="mx-auto mb-1 size-5" aria-hidden="true" /> Você é o réu. O júri está decidindo seu destino…</p>
      )}
    </div>
  );
}

function AutorGuess({ ctx, actions }: { ctx: PartyCtx; actions: PartyActions }) {
  const saved = ctx.view?.mine?.guesses ?? null;
  const [guesses, setGuesses] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (saved && !touched) setGuesses(saved); }, [saved, touched]);
  const options = ctx.players.filter((p) => p.id !== ctx.me.id);
  const myEntryId = ctx.view?.myEntryId;
  const sending = ctx.busy === "submit";
  return (
    <div className="space-y-3">
      <p className="text-sm font-bold">Para cada resposta, escolha quem você acha que escreveu.</p>
      <ul className="space-y-3">
        {(ctx.state.entries ?? []).map((entry, index) => (
          <li key={entry.id} className="party-panel answer-card space-y-2" style={{ "--enter-index": index } as CSSProperties}>
            <p className="text-balance-safe text-lg font-bold">“{entry.text}”</p>
            {entry.id === myEntryId ? (
              <p className="text-sm font-semibold party-accent">Esta é a sua. Faça cara de paisagem.</p>
            ) : (
              <div className="flex flex-wrap gap-2" role="group" aria-label={`Autor de: ${entry.text}`}>
                {options.map((p) => (
                  <button key={p.id} type="button" data-selected={guesses[entry.id] === p.id} aria-pressed={guesses[entry.id] === p.id}
                    onClick={() => { setTouched(true); setGuesses((g) => ({ ...g, [entry.id]: p.id })); }}
                    className="party-choice min-h-12 rounded-full px-4 text-sm font-semibold">
                    {p.nickname}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      <Button className="party-accent-button h-14 w-full text-base font-bold shadow-none" disabled={sending || Object.keys(guesses).length === 0} aria-busy={sending}
        onClick={() => void actions.submit({ guesses }).then((ok) => { if (ok) setTouched(false); })}>
        {sending ? <Loader2 className="animate-spin" /> : null}{saved && !touched ? "Palpites enviados" : "Enviar palpites"}
      </Button>
    </div>
  );
}

export function PartyPlay({ ctx, actions }: { ctx: PartyCtx; actions: PartyActions }) {
  const phase = ctx.room.phase as PartyPhaseId;
  const now = useNow(Boolean(ctx.room.phase_ends_at));
  const eligible = (ctx.state.eligible ?? []).includes(ctx.me.id);
  const fired = useRef<{ key: string; at: number } | null>(null);
  const phaseKey = `${ctx.room.round_number}:${phase}:${ctx.room.phase_ends_at ?? ""}`;

  // Deadline: any player may ask the server to close the step; the server re-checks time and versions.
  useEffect(() => {
    const endsAt = ctx.room.phase_ends_at ? new Date(ctx.room.phase_ends_at).getTime() : null;
    if (!endsAt || now < endsAt + 400) return;
    const last = fired.current;
    if (last && last.key === phaseKey && now - last.at < 5_000) return;
    fired.current = { key: phaseKey, at: now };
    void actions.advance(false);
  }, [now, phaseKey, ctx.room.phase_ends_at, actions]);

  if (phase === "reveal") return <PartyReveal ctx={ctx} actions={actions} />;

  const defendant = ctx.state.defendantId;
  const isDefendant = defendant === ctx.me.id;
  const accusedName = nick(ctx.players, ctx.state.accusedId);

  let body: React.ReactNode = null;
  if (!eligible && phase !== "vote") {
    body = <p className="party-panel text-center text-sm text-muted-foreground">{phase === "last_guess" ? `@${accusedName} foi o mais votado e é mesmo o infiltrado! Esperando o palpite da palavra…` : "Você entrou no meio desta etapa. Acompanhe e participe na próxima."}</p>;
  } else if (phase === "defense") {
    body = <TextSubmit ctx={ctx} actions={actions} label={isDefendant ? "Você é o réu! Escreva sua defesa." : `Acuse ou testemunhe contra @${nick(ctx.players, defendant)}.`} placeholder={isDefendant ? "Excelência, eu posso explicar…" : "Eu vi tudo, excelência…"} />;
  } else if (phase === "write") {
    body = <TextSubmit ctx={ctx} actions={actions} label="Sua resposta (ninguém vai saber que foi você… até a revelação)" placeholder="Capricha na desgraça" />;
  } else if (phase === "clues") {
    body = <TextSubmit ctx={ctx} actions={actions} label="Sua pista (curta, sem dizer a palavra)" placeholder="Uma palavra ou frase curta" />;
  } else if (phase === "argue") {
    const side = ctx.state.sides?.[ctx.me.id];
    body = <TextSubmit ctx={ctx} actions={actions} label={side ? `Seu argumento a favor do lado ${side}` : "Seu argumento"} placeholder="Convença a galera do impossível" />;
  } else if (phase === "respond") {
    body = <TextSubmit ctx={ctx} actions={actions} label="Sua resposta ao desafio" placeholder="Solta o caos" />;
  } else if (phase === "last_guess") {
    body = (
      <div className="space-y-3">
        <p className="party-prompt font-bold">Você foi pego! Última chance: adivinhe a palavra secreta para roubar a vitória.</p>
        <TextSubmit ctx={ctx} actions={actions} label="Qual é a palavra?" placeholder="Digite a palavra" />
      </div>
    );
  } else if (phase === "vote" && ctx.game === "tribunal") {
    body = <TribunalVote ctx={ctx} actions={actions} />;
  } else if (phase === "vote" && ctx.game === "infiltrado") {
    body = eligible ? <InfiltradoVote ctx={ctx} actions={actions} /> : <EntryList ctx={ctx} entries={ctx.state.entries ?? []} showAuthor />;
  } else if (phase === "vote") {
    body = eligible ? <VoteTarget ctx={ctx} actions={actions} entries={ctx.state.entries ?? []} showAuthor /> : <EntryList ctx={ctx} entries={ctx.state.entries ?? []} showAuthor />;
  } else if (phase === "guess") {
    body = eligible ? <AutorGuess ctx={ctx} actions={actions} /> : <p className="party-panel text-center text-sm text-muted-foreground">Acompanhe os palpites da galera.</p>;
  }

  return (
    <div className="dock-clearance space-y-4 pb-10">
      <PhaseHeader ctx={ctx} now={now} />
      <PromptCard ctx={ctx} />
      {(phase === "clues" || phase === "vote" || phase === "last_guess") && <SecretCard ctx={ctx} />}
      {body}
      <Progress ctx={ctx} />
      {ctx.isHost && (
        <div className="flex flex-wrap gap-2 border-t border-border/70 pt-4">
          {ctx.game === "roleta" && phase === "respond" && (
            <Button variant="secondary" className="flex-1" disabled={ctx.busy !== null || (ctx.state.skipsLeft ?? 0) <= 0} onClick={() => void actions.skip()}>
              {ctx.busy === "skip" ? <Loader2 className="animate-spin" /> : <SkipForward />} Pular desafio ({ctx.state.skipsLeft ?? 0})
            </Button>
          )}
          <Button variant="outline" className="flex-1" disabled={ctx.busy !== null} onClick={() => void actions.advance(true)}>
            {ctx.busy === "advance" ? <Loader2 className="animate-spin" /> : null} Encerrar etapa agora
          </Button>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Reveal --------------------------------- */

function AiCard({ ctx, title }: { ctx: PartyCtx; title: string }) {
  const ai = ctx.state.ai;
  if (!ai || ai.status === "off") return null;
  return (
    <section className="party-prompt space-y-1" aria-live="polite">
      <p className="section-label inline-flex items-center gap-1 party-accent"><Sparkles className="size-3.5" aria-hidden="true" /> {title}</p>
      {ai.status === "pending" && <p className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> A IA está preparando o comentário…</p>}
      {ai.status === "failed" && <p className="text-sm text-muted-foreground">A IA não respondeu nesta rodada. Os pontos já valem normalmente.</p>}
      {ai.status === "done" && <p className="text-balance-safe text-base font-semibold italic">“{ai.text}”</p>}
    </section>
  );
}

function Deltas({ ctx }: { ctx: PartyCtx }) {
  const deltas = ctx.state.deltas ?? {};
  const scores = ctx.state.scores ?? {};
  const rows = ctx.players.map((p) => ({ ...p, score: scores[p.id] ?? 0, delta: deltas[p.id] ?? 0 })).sort((a, b) => b.score - a.score);
  return (
    <section className="party-panel space-y-2" aria-label="Placar">
      <p className="section-label">Placar</p>
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

function RevealBody({ ctx }: { ctx: PartyCtx }) {
  const results = ctx.state.results ?? {};
  const counts = results.counts ?? {};
  const notice = results.notice ?? null;

  if (ctx.game === "tribunal") {
    const verdict = results.verdict;
    return (
      <div className="space-y-3">
        <section className="party-prompt text-center">
          <p className="section-label">Veredito para @{nick(ctx.players, ctx.state.defendantId)}</p>
          <p className={cn("font-display text-5xl", verdict === "culpado" ? "text-destructive" : "text-success")}>{verdict === "culpado" ? "CULPADO" : "INOCENTE"}</p>
          <p className="text-sm tabular-nums text-muted-foreground">{String(results.guilty ?? 0)} culpado · {String(results.innocent ?? 0)} inocente{verdict === "inocente" && Number(results.guilty) === Number(results.innocent) ? " · empate absolve" : ""}</p>
        </section>
        <AiCard ctx={ctx} title="Sentença do juiz" />
        <EntryList ctx={ctx} entries={ctx.state.entries ?? []} showAuthor />
      </div>
    );
  }

  if (ctx.game === "autor") {
    const entries = results.entries ?? [];
    return (
      <div className="space-y-3">
        {notice && <p className="party-panel text-sm text-muted-foreground">{notice}</p>}
        <AiCard ctx={ctx} title="Comentário da IA" />
        <ul className="space-y-2">
          {entries.map((entry, index) => (
            <li key={entry.id} className="party-panel answer-card space-y-1" style={{ "--enter-index": index } as CSSProperties}>
              <p className="text-balance-safe text-lg font-bold">“{entry.text}”</p>
              <p className="text-sm">Escrita por <strong className="party-accent">{nick(ctx.players, entry.authorId)}</strong></p>
              <p className="text-xs text-muted-foreground">{entry.correct.length > 0 ? `Acertaram: ${entry.correct.map((id) => nick(ctx.players, id)).join(", ")}` : "Ninguém acertou"} · enganou {entry.fooled}</p>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (ctx.game === "infiltrado") {
    const outcome = results.outcome;
    const headline = outcome === "escapou" ? "O infiltrado escapou!" : outcome === "adivinhou" ? "Pego, mas adivinhou a palavra!" : "O grupo pegou o infiltrado!";
    return (
      <div className="space-y-3">
        <section className="party-prompt space-y-1 text-center">
          <p className="font-display text-3xl party-accent">{headline}</p>
          <p>O infiltrado era <strong>{nick(ctx.players, results.infiltradoId)}</strong>.</p>
          <p>A palavra era <strong className="font-display text-2xl">{String(results.word ?? "")}</strong> ({String(results.category ?? "")}).</p>
          {typeof results.guess === "string" && results.guess && <p className="text-sm text-muted-foreground">Palpite do infiltrado: “{results.guess}” {results.guessCorrect ? "✓" : "✗"}</p>}
        </section>
        <section className="party-panel space-y-1.5">
          <p className="section-label">Votos</p>
          {Object.keys(counts).length === 0 ? <p className="text-sm text-muted-foreground">Ninguém votou.</p> : Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id, count]) => (
            <p key={id} className="flex justify-between text-sm"><span>{nick(ctx.players, id)}</span><span className="tabular-nums font-bold">{count} voto(s)</span></p>
          ))}
        </section>
        <EntryList ctx={ctx} entries={ctx.state.entries ?? []} showAuthor />
      </div>
    );
  }

  const entries = [...(ctx.state.entries ?? [])].sort((a, b) => (counts[b.playerId ?? ""] ?? 0) - (counts[a.playerId ?? ""] ?? 0));
  const multiplier = Number(results.multiplier ?? 1);
  const sideTotals = results.sideTotals;
  return (
    <div className="space-y-3">
      {notice && <p className="party-panel text-sm text-muted-foreground">{notice}</p>}
      {ctx.game === "debate" && sideTotals && (
        <section className="party-prompt text-center">
          <p className="font-display text-3xl party-accent">{results.winnerSide ? `Lado ${String(results.winnerSide)} venceu!` : "Empate entre os lados!"}</p>
          <p className="text-sm tabular-nums text-muted-foreground">Lado A: {sideTotals.A} voto(s) · Lado B: {sideTotals.B} voto(s)</p>
        </section>
      )}
      {ctx.game === "roleta" && multiplier > 1 && <p className="party-prompt text-center font-display text-2xl party-accent">Pontos ×{multiplier} nesta rodada!</p>}
      <AiCard ctx={ctx} title="Comentário da IA" />
      <ul className="space-y-2">
        {entries.map((entry, index) => (
          <li key={entry.id} className="party-panel answer-card flex items-start justify-between gap-3" style={{ "--enter-index": index } as CSSProperties}>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground">{nick(ctx.players, entry.playerId)}{entry.playerId && ctx.state.sides?.[entry.playerId] ? ` · Lado ${ctx.state.sides[entry.playerId]}` : ""}</p>
              <p className="text-balance-safe font-semibold">“{entry.text}”</p>
            </div>
            <span className="shrink-0 rounded-lg bg-secondary px-2 py-1 font-display text-lg tabular-nums">{counts[entry.playerId ?? ""] ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PartyReveal({ ctx, actions }: { ctx: PartyCtx; actions: PartyActions }) {
  const last = ctx.room.round_number >= ctx.settings.rounds;
  return (
    <div className="dock-clearance space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <span className="party-icon size-12"><PartyIcon name={PARTY_GAMES[ctx.game].icon} className="size-6" /></span>
        <div className="min-w-0">
          <p className="section-label">Rodada {ctx.room.round_number} de {ctx.settings.rounds}</p>
          <h2 className="text-2xl leading-tight">Resultado da rodada</h2>
        </div>
      </div>
      <PromptCard ctx={ctx} />
      <RevealBody ctx={ctx} />
      <Deltas ctx={ctx} />
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

/* ---------------------------------- Final --------------------------------- */

export function PartyFinal({ ctx, actions, onHub }: { ctx: PartyCtx; actions: PartyActions; onHub: () => void }) {
  const scores = ctx.state.scores ?? {};
  const ranked = useMemo(() => rankPlayers(ctx.players.map((p) => ({ ...p, score: scores[p.id] ?? 0 }))), [ctx.players, scores]);
  const winners = ranked.filter((r) => r.place === 1);
  const podium = [ranked[1], ranked[0], ranked[2]].filter(Boolean) as typeof ranked;
  return (
    <div className="dock-clearance space-y-5">
      <header className="stage-glow space-y-2 pt-2 text-center">
        <span className="party-icon mx-auto size-16"><Trophy className="size-8" aria-hidden="true" /></span>
        <h2 className="font-display text-4xl">Fim de jogo!</h2>
        <p className="text-muted-foreground">{winners.length > 1 ? `Empate no topo: ${winners.map((w) => w.player.nickname).join(", ")}` : `${winners[0]?.player.nickname ?? "Ninguém"} venceu ${PARTY_GAMES[ctx.game].name}!`}</p>
      </header>
      {winners.length === 1 && ranked.length >= 2 && (
        <div className="grid grid-cols-3 items-end gap-2" aria-hidden="true">
          {podium.map((row) => (
            <div key={row.player.id} className="text-center">
              <p className="truncate text-sm font-bold">{row.player.nickname}</p>
              <div className={cn("podium-step mt-1 grid place-items-center", row.place === 1 ? "h-32" : row.place === 2 ? "h-24" : "h-16")} data-place={row.place}>
                <span className="font-display text-2xl">{row.place}º</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <ol className="space-y-2" aria-label="Classificação final">
        {ranked.map((row, index) => (
          <li key={row.player.id} className="ranking-row flex items-center gap-3 p-3" data-first={row.place === 1} style={{ "--enter-index": index } as CSSProperties}>
            <span className="rank-badge" data-place={row.place}>{row.place}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{row.player.nickname}{row.player.id === ctx.me.id && <span className="text-primary"> (você)</span>}</span>
            <span className="font-display text-2xl tabular-nums">{row.player.score}</span>
          </li>
        ))}
      </ol>
      <div className="mobile-bottom-bar fixed inset-x-0 bottom-0 mx-auto w-full max-w-md space-y-2 border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
        {ctx.isHost && (
          <Button className="party-accent-button h-14 w-full text-lg font-bold shadow-none" disabled={ctx.busy !== null} aria-busy={ctx.busy === "restart"} onClick={() => void actions.restart()}>
            {ctx.busy === "restart" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Jogar de novo
          </Button>
        )}
        <Button variant="secondary" className="h-12 w-full" onClick={onHub}><Users /> Central de Jogos</Button>
      </div>
    </div>
  );
}
