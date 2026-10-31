import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Award, BookOpen, Bot, Check, Clock, Copy, Crown, EyeOff, Eye, Gavel, LayoutGrid, Loader2, LogOut, RefreshCw, Share2, SkipForward, Sparkles, Swords, Trophy, Users } from "lucide-react";
import { toast } from "sonner";

import { CrowdReactions } from "@/components/party/CrowdReactions";
import { PartyIcon } from "@/components/party/PartyIcon";
import { GameRulesDialog, RulesList } from "@/components/party/RulesList";
import { StopLobbySettings, StopRules } from "@/components/party/StopParty";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { PartyPlayer, PartyPrivateView, PartyRoom } from "@/hooks/use-party-room";
import { activePlayers, isActivePlayer } from "@/lib/party-presence";
import { nightKingId, rankPlayers } from "@/lib/ranking";
import { useDevSettings } from "@/lib/dev-settings";
import { MAX_BOTS } from "@/lib/party-bots";
import {
  AUTOR_SECONDS_OPTIONS,
  DEBATE_SECONDS_OPTIONS,
  INFILTRADO_THEMES,
  effectiveJudgeFor,
  isPartyGame,
  LOBBY_GAMES,
  lobbyGameMeta,
  missingPlayers,
  PARTY_GAMES,
  PARTY_ROUND_OPTIONS,
  PARTY_SKIP_OPTIONS,
  PARTY_TEXT_MAX,
  PHASE_LABELS,
  ROLETA_SECONDS_OPTIONS,
  TRIBUNAL_SECONDS_OPTIONS,
  textMaxFor,
  type LobbyGameId,
  type LobbyGameMeta,
  type PartyEntry,
  type PartyGameId,
  type PartyPhaseId,
  type PartyPublicState,
  type PartySettings,
} from "@/lib/party-games";
import { vibrate } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export type PartyCtx = {
  room: PartyRoom;
  players: PartyPlayer[];
  me: PartyPlayer;
  isHost: boolean;
  game: LobbyGameId;
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
  select: (game: LobbyGameId) => Promise<boolean>;
  replay: () => Promise<boolean>;
  toLobby: () => Promise<boolean>;
  /** Stop: silently saves answers (draft or "Terminei"); false when the save failed. */
  stopSave: (answers: Record<string, string>, done: boolean) => Promise<boolean>;
  /** Stop: shouts STOP! with the player's complete answers. */
  stopNow: (answers: Record<string, string>) => Promise<boolean>;
  /** Stop "Recorrer ao Juiz": contest one of your zeros, vote on someone else's, close it after the deadline. */
  appeal: (category: string) => Promise<boolean>;
  appealVote: (vote: "aceitar" | "manter") => Promise<boolean>;
  appealResolve: () => Promise<void>;
  /** Developer: add or remove training bots in this room. */
  devBots: (action: "addBot" | "removeBots") => Promise<boolean>;
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

/** Group lobby: nothing about a specific game is required until the host picks one. */
export type LobbyCtx = {
  room: PartyRoom;
  players: PartyPlayer[];
  me: PartyPlayer;
  isHost: boolean;
  selected: LobbyGameId | null;
  settings: PartySettings;
  busy: string | null;
};

/** "Rei da Noite": points from every finished match in this room (party_players.score). */
const nightLeaderId = nightKingId;

/** Visible crown at the top of the room for tonight's leader across every game. */
export function NightCrownBanner({ players, me }: { players: PartyPlayer[]; me: PartyPlayer }) {
  const king = players.find((p) => p.id === nightKingId(players));
  if (!king) return null;
  return (
    <section className="night-crown flex items-center gap-3 rounded-2xl px-4 py-3" aria-label="Rei da Noite">
      <span className="text-3xl leading-none motion-safe:animate-bounce" aria-hidden="true">👑</span>
      <div className="min-w-0 flex-1">
        <p className="section-label text-primary">Rei da Noite</p>
        <p className="truncate font-display text-xl">{king.nickname}{king.id === me.id ? " (você!)" : ""}</p>
      </div>
      <span className="shrink-0 text-right font-display text-2xl tabular-nums">{king.score}<span className="block font-sans text-[0.625rem] font-semibold text-muted-foreground">pts na noite</span></span>
    </section>
  );
}

/** Developer-only: add training bots right from the lobby (they never count as people). */
function TrainingBots({ players, actions, busy }: { players: PartyPlayer[]; actions: PartyActions; busy: boolean }) {
  const { isDev } = useDevSettings();
  if (!isDev) return null;
  const bots = players.filter((p) => p.is_bot).length;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
      <p className="w-full text-xs font-semibold text-muted-foreground">🤖 Treino com robôs (só desenvolvedor) · {bots}/{MAX_BOTS}</p>
      <Button variant="secondary" size="sm" disabled={busy || bots >= MAX_BOTS} onClick={() => void actions.devBots("addBot")}><Bot /> Adicionar robô</Button>
      {bots > 0 && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void actions.devBots("removeBots")}>Remover robôs</Button>}
    </div>
  );
}

function PlayersPanel({ players, me, actions, busy }: { players: PartyPlayer[]; me: PartyPlayer; actions: PartyActions; busy: boolean }) {
  const king = nightLeaderId(players);
  // A slow clock so "Ausente" labels appear without new data.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const anyNight = players.some((p) => p.score > 0);
  return (
    <section className="party-panel" aria-labelledby="lobby-players">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="lobby-players" className="text-lg font-bold">Galera na sala</h2>
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm font-bold tabular-nums" aria-label={`${players.length} jogadores na sala`}>{players.length}</span>
      </div>
      <ul className="space-y-1">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-3 border-b border-border/50 py-2.5 last:border-0">
            <span className="party-icon size-10 font-display text-lg" aria-hidden="true">{p.nickname.charAt(0).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-balance-safe">{p.nickname}{p.id === me.id && <span className="text-muted-foreground"> (você)</span>}</span>
              <span className="flex flex-wrap gap-x-2">
                {p.is_host && <span className="inline-flex items-center gap-1 text-xs font-bold party-accent"><Crown className="size-3.5" aria-hidden="true" /> Mestre da sala</span>}
                {p.id === king && <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">👑 Rei da Noite</span>}
                {p.is_bot && <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground"><Bot className="size-3.5" aria-hidden="true" /> Robô de treino</span>}
                {!p.is_bot && p.id !== me.id && !isActivePlayer(p, now) && <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground"><span className="size-2 rounded-full border border-muted-foreground" aria-hidden="true" /> Ausente · não conta para começar</span>}
              </span>
            </span>
            {anyNight && <span className="shrink-0 text-right font-display text-lg tabular-nums" aria-label={`${p.score} pontos na noite`}>{p.score}<span className="block font-sans text-[0.625rem] font-semibold text-muted-foreground">na noite</span></span>}
          </li>
        ))}
      </ul>
      <TrainingBots players={players} actions={actions} busy={busy} />
    </section>
  );
}

function GameMetaLine({ game }: { game: LobbyGameMeta }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground">
      <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden="true" /> {game.duration}</span>
      <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden="true" /> {game.minPlayers}+ jogadores</span>
    </span>
  );
}

function GamePicker({ ctx, actions, onRules }: { ctx: LobbyCtx; actions: PartyActions; onRules: (game: LobbyGameId) => void }) {
  return (
    <section className="space-y-3" aria-labelledby="lobby-pick">
      <h2 id="lobby-pick" className="text-lg font-bold">Escolha o jogo</h2>
      <div className="grid grid-cols-2 gap-2">
        {LOBBY_GAMES.map((game, index) => {
          const active = ctx.selected === game.id;
          return (
            <div key={game.id} data-game={game.id} className="flex flex-col gap-1.5">
            <button
              type="button"
              aria-pressed={active}
              disabled={ctx.busy !== null}
              onClick={() => { if (!active) void actions.select(game.id); }}
              className={cn(
                "party-card flex min-h-36 flex-1 flex-col items-start gap-2 p-3 text-left transition-transform active:scale-[0.98] disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active && "ring-2 ring-[var(--game-accent)]",
              )}
              style={{ "--enter-index": index } as CSSProperties}
            >
              <span className="party-icon size-10"><PartyIcon name={game.icon} className="size-5" /></span>
              <span className="text-balance-safe font-bold leading-tight">{game.name}</span>
              <span className="text-xs font-semibold leading-snug party-accent">{game.tagline}</span>
              <span className="mt-auto"><GameMetaLine game={game} /></span>
              {active && <span className="inline-flex items-center gap-1 text-xs font-bold party-accent"><Check className="size-3.5" aria-hidden="true" /> Escolhido</span>}
            </button>
            <Button type="button" variant="ghost" className="h-11 w-full text-sm font-semibold" onClick={() => onRules(game.id)} aria-label={`Regras de ${game.name}`}>
              <BookOpen /> Regras
            </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const JUDGE_LABELS = { ia: "Juiz de IA", voto: "Votação da galera" } as const;

type JudgedGame = "tribunal" | "debate" | "roleta";

const SECONDS_KEY = { tribunal: "tribunalSeconds", debate: "debateSeconds", roleta: "roletaSeconds" } as const;
const JUDGE_KEY = { tribunal: "tribunalJudge", debate: "debateJudge", roleta: "roletaJudge" } as const;
const SECONDS_OPTIONS = { tribunal: TRIBUNAL_SECONDS_OPTIONS, debate: DEBATE_SECONDS_OPTIONS, roleta: ROLETA_SECONDS_OPTIONS } as const;
const SECONDS_TITLE = { tribunal: "Tempo de defesa e acusação", debate: "Tempo de argumentação", roleta: "Tempo por desafio" } as const;

function secondsLabel(n: number) {
  return n >= 60 && n % 60 === 0 ? `${n / 60} min` : n > 60 ? `${Math.floor(n / 60)}m${n % 60}s` : `${n}s`;
}

function judgeHint(game: JudgedGame, duo: boolean, judge: "ia" | "voto") {
  if (game === "tribunal") {
    if (duo) return "Em dupla: Juiz de IA obrigatório. Um é o Réu, o outro é o Promotor.";
    return judge === "ia" ? "A IA lê a defesa e as acusações e decreta o veredito." : "Todos menos o réu votam: culpado ou inocente.";
  }
  if (duo && judge === "ia") return game === "debate" ? "Em 2 jogadores, a IA atua como juiz para desempatar o duelo!" : "Em 2 jogadores, a IA dá a nota de cada resposta.";
  if (duo) return "Atenção: em 2 jogadores a votação tende a empatar.";
  return judge === "ia" ? "A IA lê tudo e decide os pontos." : "Todos votam na melhor (não vale a própria).";
}

/** Tribunal/Debate/Roleta: writing time and who judges, chosen by the host and shown to everyone. */
function JudgeSettings({ ctx, actions, game }: { ctx: LobbyCtx; actions: PartyActions; game: JudgedGame }) {
  const { settings } = ctx;
  const option = (active: boolean) => (active ? "selected" : "secondary") as "selected" | "secondary";
  const seconds = settings[SECONDS_KEY[game]];
  const secondOptions = SECONDS_OPTIONS[game];
  const judge = effectiveJudgeFor(game, settings, ctx.players.length) ?? "voto";
  const duo = ctx.players.length <= 2;
  const locked = game === "tribunal" && duo;
  const setSeconds = (n: number) => actions.updateSettings({ [SECONDS_KEY[game]]: n });
  const setJudge = (value: "ia" | "voto") => actions.updateSettings({ [JUDGE_KEY[game]]: value });
  return (
    <>
      <div>
        <p className="mb-2 text-sm font-semibold text-muted-foreground">{SECONDS_TITLE[game]}</p>
        <div className={cn("grid gap-2", secondOptions.length > 4 ? "grid-cols-5" : secondOptions.length > 3 ? "grid-cols-4" : "grid-cols-3")}>
          {secondOptions.map((n) => (
            <Button key={n} variant={option(seconds === n)} aria-label={`${n} segundos`} aria-pressed={seconds === n} disabled={ctx.busy !== null} className={secondOptions.length > 4 ? "px-1 text-sm" : "px-2"} onClick={() => void setSeconds(n)}>{secondsLabel(n)}</Button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-muted-foreground">{game === "roleta" ? "Quem avalia" : game === "tribunal" ? "Quem dá o veredito" : "Quem julga"}</p>
        <div className="grid grid-cols-2 gap-2">
          {(["ia", "voto"] as const).map((value) => (
            <Button key={value} variant={option(judge === value)} aria-pressed={judge === value} disabled={ctx.busy !== null || (locked && value === "voto")} className="h-auto min-h-11 whitespace-normal py-2" onClick={() => void setJudge(value)}>
              {value === "ia" ? <Sparkles /> : <Users />} {game === "tribunal" && value === "voto" ? "Júri da galera" : JUDGE_LABELS[value]}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{judgeHint(game, duo, judge)}</p>
      </div>
    </>
  );
}

function judgeSummary(game: PartyGameId, settings: PartySettings, players: number) {
  const judge = effectiveJudgeFor(game, settings, players);
  if (!judge) return "";
  const seconds = game === "tribunal" ? settings.tribunalSeconds : game === "debate" ? settings.debateSeconds : settings.roletaSeconds;
  const label = game === "tribunal" && judge === "voto" ? "Júri da galera" : JUDGE_LABELS[judge];
  return ` · ${secondsLabel(seconds)} · ${label}`;
}

function PartySettingsPanel({ ctx, actions, game }: { ctx: LobbyCtx; actions: PartyActions; game: PartyGameId }) {
  const { settings } = ctx;
  const option = (active: boolean) => (active ? "selected" : "secondary") as "selected" | "secondary";
  if (!ctx.isHost) {
    return (
      <p className="party-panel text-center text-sm text-muted-foreground" aria-live="polite">
        {settings.rounds} rodadas · IA {settings.ai && game !== "infiltrado" ? "ligada" : "desligada"}
        {judgeSummary(game, settings, ctx.players.length)}
        {game === "autor" ? ` · ${secondsLabel(settings.autorSeconds)} para escrever` : ""}
        {game === "infiltrado" ? ` · tema: ${settings.infiltradoTheme === "todas" ? "tudo misturado" : settings.infiltradoTheme}` : ""}
        {game === "roleta" ? ` · intensidade ${settings.intensity === "media" ? "média" : settings.intensity === "caotica" ? "caótica" : "leve"} · ${settings.skips} pulo(s)` : ""}
      </p>
    );
  }
  return (
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
          <p className="text-sm text-muted-foreground">{game === "infiltrado" ? "O Infiltrado usa só a lista do jogo." : game === "debate" ? "Cria temas novos, comenta e entrega troféus no fim. Sem IA, usa a lista do jogo (o juiz é escolhido abaixo)." : game === "tribunal" || game === "roleta" ? "Cria casos novos e comenta os resultados. Sem IA, usa a lista do jogo (o juiz é escolhido abaixo)." : "Gera conteúdos novos e comenta os resultados. Sem IA, usa a lista do jogo."}</p>
        </div>
        <Switch aria-label="IA no jogo" checked={settings.ai} disabled={ctx.busy !== null || game === "infiltrado"} onCheckedChange={(ai) => void actions.updateSettings({ ai })} />
      </div>
      {(game === "tribunal" || game === "debate" || game === "roleta") && <JudgeSettings ctx={ctx} actions={actions} game={game} />}
      {game === "autor" && (
        <div>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">Tempo para escrever</p>
          <div className="grid grid-cols-4 gap-2">
            {AUTOR_SECONDS_OPTIONS.map((n) => (
              <Button key={n} variant={option(settings.autorSeconds === n)} aria-label={`${n} segundos`} aria-pressed={settings.autorSeconds === n} disabled={ctx.busy !== null} className="px-2" onClick={() => void actions.updateSettings({ autorSeconds: n })}>{secondsLabel(n)}</Button>
            ))}
          </div>
        </div>
      )}
      {game === "infiltrado" && (
        <div>
          <p className="mb-2 text-sm font-semibold text-muted-foreground">Tema das palavras</p>
          <div className="flex flex-wrap gap-2">
            {INFILTRADO_THEMES.map((theme) => (
              <Button key={theme} size="sm" variant={option(settings.infiltradoTheme === theme)} aria-pressed={settings.infiltradoTheme === theme} disabled={ctx.busy !== null} onClick={() => void actions.updateSettings({ infiltradoTheme: theme })}>{theme === "todas" ? "Tudo misturado" : theme}</Button>
            ))}
          </div>
        </div>
      )}
      {game === "roleta" && (
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
  );
}

function SelectedGame({ ctx, actions, selected }: { ctx: LobbyCtx; actions: PartyActions; selected: LobbyGameId }) {
  const meta = lobbyGameMeta(selected);
  return (
    <div data-game={selected} className="space-y-4">
      <section className="party-prompt space-y-3" aria-live="polite">
        <div className="flex items-start gap-3">
          <span className="party-icon size-12"><PartyIcon name={meta.icon} className="size-6" /></span>
          <div className="min-w-0">
            <p className="section-label party-accent">Jogo escolhido</p>
            <h2 className="text-balance-safe text-xl font-bold leading-tight">{meta.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{selected === "stop" ? meta.short : PARTY_GAMES[selected].description}</p>
          </div>
        </div>
        {selected === "stop" ? <StopRules /> : <RulesList game={selected} />}
      </section>
      {selected === "stop" ? <StopLobbySettings ctx={ctx} actions={actions} /> : <PartySettingsPanel ctx={ctx} actions={actions} game={selected} />}
    </div>
  );
}

/** Every game with a rules button, so any player in the room can read how each one works. */
function RulesShelf({ onRules }: { onRules: (game: LobbyGameId) => void }) {
  return (
    <ul className="grid grid-cols-2 gap-2 text-left">
      {LOBBY_GAMES.map((game) => (
        <li key={game.id} data-game={game.id}>
          <button
            type="button"
            onClick={() => onRules(game.id)}
            className="flex min-h-14 w-full items-center gap-2 rounded-lg bg-secondary/60 p-2 text-left text-sm font-semibold transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Regras de ${game.name}`}
          >
            <PartyIcon name={game.icon} className="size-4 shrink-0 party-accent" />
            <span className="min-w-0 flex-1 text-balance-safe leading-tight">{game.name}</span>
            <BookOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Big room code with the full invite link: copy it or open the phone's share sheet. */
function RoomShareCard({ code }: { code: string }) {
  const [url, setUrl] = useState(`/festa/${code}`);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    setUrl(`${window.location.origin}/festa/${code}`);
    setCanShare(typeof navigator.share === "function");
  }, [code]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      vibrate(15);
      setCopied(true);
      toast.success("Link da sala copiado!", { duration: 1_500 });
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Sala da Galera", text: `Bora jogar! Entra na sala ${code}:`, url });
      vibrate(15);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) void copy();
    }
  }

  return (
    <section className="room-ticket px-5 pb-5 pt-6 text-center" aria-label="Link da sala da galera">
      <p className="section-label">Código da sala</p>
      <p className="lobby-code mt-2 text-primary">{code}</p>
      <p className="mt-1 text-sm text-muted-foreground">Mande o link: quem abrir já cai nesta sala</p>
      <button type="button" onClick={() => void copy()} className="mt-4 w-full truncate rounded-lg border border-dashed border-border bg-background/60 px-3 py-3 font-mono text-sm text-foreground" aria-label={`Copiar link ${url}`}>
        {url.replace(/^https?:\/\//, "")}
      </button>
      <div className={cn("mt-3 grid gap-2", canShare ? "grid-cols-2" : "grid-cols-1")}>
        <Button onClick={() => void copy()} variant={copied ? "selected" : "outline"} className="h-12 font-semibold">
          {copied ? <Check className="size-5" /> : <Copy className="size-5" />} {copied ? "Copiado" : "Copiar link"}
        </Button>
        {canShare && (
          <Button onClick={() => void share()} variant="outline" className="h-12 font-semibold">
            <Share2 className="size-5" /> Compartilhar
          </Button>
        )}
      </div>
    </section>
  );
}

export function PartyLobby({ ctx, actions }: { ctx: LobbyCtx; actions: PartyActions }) {
  const selected = ctx.selected;
  const meta = selected ? lobbyGameMeta(selected) : null;
  const connected = activePlayers(ctx.players).length;
  const missing = selected ? missingPlayers(selected, connected) : 0;
  const [rulesFor, setRulesFor] = useState<LobbyGameId | null>(null);

  return (
    <div className="dock-clearance space-y-4">
      <NightCrownBanner players={ctx.players} me={ctx.me} />
      <RoomShareCard code={ctx.room.code} />
      <PlayersPanel players={ctx.players} me={ctx.me} actions={actions} busy={ctx.busy !== null} />

      {ctx.isHost ? (
        <GamePicker ctx={ctx} actions={actions} onRules={setRulesFor} />
      ) : !selected ? (
        <section className="party-prompt space-y-4 text-center" role="status">
          <span className="party-icon mx-auto size-14 motion-safe:animate-pulse"><Sparkles className="size-7" aria-hidden="true" /></span>
          <div className="space-y-1">
            <h2 className="text-xl font-bold">Aguardando o Mestre escolher o jogo...</h2>
            <p className="text-sm text-muted-foreground">Enquanto isso, toque num jogo para ler as regras:</p>
          </div>
          <RulesShelf onRules={setRulesFor} />
        </section>
      ) : null}

      {selected && <SelectedGame ctx={ctx} actions={actions} selected={selected} />}

      {!ctx.isHost && selected && (
        <section className="space-y-3" aria-labelledby="lobby-all-rules">
          <h2 id="lobby-all-rules" className="section-label">Regras dos jogos</h2>
          <RulesShelf onRules={setRulesFor} />
        </section>
      )}

      <GameRulesDialog game={rulesFor} onClose={() => setRulesFor(null)} />

      <div data-game={selected ?? undefined} className="mobile-bottom-bar fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {ctx.isHost ? (
          <div className="space-y-2">
            {selected && missing > 0 && <p role="status" className="text-center text-sm text-muted-foreground">Necessário mínimo de {meta!.minPlayers} jogadores conectados{connected < ctx.players.length ? ` (${ctx.players.length - connected} ausente${ctx.players.length - connected > 1 ? "s" : ""})` : ""}. Compartilhe o código!</p>}
            <Button className="party-accent-button h-14 w-full text-lg font-bold shadow-none" disabled={!selected || missing > 0 || ctx.busy !== null} aria-busy={ctx.busy === "start"} onClick={() => void actions.start()}>
              {ctx.busy === "start" ? <><Loader2 className="animate-spin" /> Preparando…</> : !selected ? "Escolha um jogo" : `Iniciar ${meta!.name}`}
            </Button>
          </div>
        ) : (
          <p role="status" className="flex h-14 items-center justify-center gap-2 text-sm text-muted-foreground"><span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" /> {selected ? "Esperando o mestre começar…" : "Aguardando o Mestre escolher o jogo..."}</p>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- Round ---------------------------------- */

/** Only this header ticks every half second, so the rest of the round screen never repaints for the clock. */
function PhaseHeader({ ctx }: { ctx: PartyCtx }) {
  const now = useNow(Boolean(ctx.room.phase_ends_at));
  const phase = ctx.room.phase as PartyPhaseId;
  const endsAt = ctx.room.phase_ends_at ? new Date(ctx.room.phase_ends_at).getTime() : null;
  const seconds = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null;
  return (
    <div className="round-hud sticky top-0 z-20 -mx-4 flex items-center gap-3 border-b border-border/70 pb-3 pl-4 pr-[calc(var(--top-actions-space)+0.5rem)] pt-[calc(0.75rem+env(safe-area-inset-top))]">
      {/* On narrow phones the icon steps aside so the fixed top-right controls never squeeze the phase name. */}
      <span className="party-icon size-11 shrink-0 max-[420px]:hidden"><PartyIcon name={lobbyGameMeta(ctx.game).icon} className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="section-label truncate">Rodada <span className="tabular-nums text-foreground">{ctx.room.round_number}</span>/{ctx.settings.rounds}</p>
        <p className="truncate font-bold leading-tight">{PHASE_LABELS[phase]}</p>
      </div>
      {seconds !== null && phase !== "evaluating" && (
        <p role="timer" aria-label={`${seconds} segundos restantes`} data-state={seconds <= 10 ? "critical" : seconds <= 20 ? "low" : "normal"} className="round-timer text-3xl">
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
        </p>
      )}
    </div>
  );
}

/** Debate: the topic up top, the player's own side as an unmistakable mission, the other side as contrast. */
function DebatePrompt({ ctx }: { ctx: PartyCtx }) {
  const prompt = ctx.state.prompt!;
  const mySide = ctx.state.sides?.[ctx.me.id];
  const arguing = ctx.room.phase === "argue";
  const sideText = (side: "A" | "B") => (side === "A" ? prompt.sideA : prompt.sideB);
  const other = mySide === "A" ? "B" : "A";
  const opponents = Object.values(ctx.state.sides ?? {}).filter((side) => side === other).length;
  return (
    <section className="party-prompt space-y-3" aria-label="Tema do debate">
      <div className="flex flex-wrap items-center gap-2">
        <p className="section-label party-accent">Tema</p>
        {prompt.source === "ai" && <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[0.6875rem] font-bold text-muted-foreground"><Sparkles className="size-3" aria-hidden="true" /> criado pela IA</span>}
      </div>
      <h2 className="text-balance-safe text-2xl font-bold leading-tight">{prompt.title}</h2>
      {arguing && mySide ? (
        <>
          <div className="rounded-xl border-2 border-[var(--game-accent)] bg-background p-4" role="note" aria-label={`Sua missão: defender o lado ${mySide}`}>
            <p className="section-label inline-flex items-center gap-1.5 party-accent"><Swords className="size-3.5" aria-hidden="true" /> Sua missão</p>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">Defenda com garra o</p>
            <p className="text-balance-safe font-display text-3xl leading-tight party-accent">Lado {mySide}</p>
            <p className="text-balance-safe mt-1 text-xl font-bold leading-snug">{sideText(mySide)}</p>
          </div>
          <p className="rounded-xl border border-border/60 px-3 py-2 text-sm text-muted-foreground">
            {opponents > 1 ? "Seus adversários defendem" : "Seu adversário defende"}: <strong className="text-foreground">Lado {other} · {sideText(other)}</strong>
          </p>
          <p className="text-sm text-muted-foreground">{prompt.text}</p>
        </>
      ) : (
        <div className="grid gap-2">
          {(["A", "B"] as const).map((side) => (
            <div key={side} className={cn("rounded-xl border p-3 text-sm", mySide === side ? "border-[var(--game-accent)] bg-background" : "border-border/60")}>
              <span className="font-display text-base party-accent">Lado {side}</span>{mySide === side && <span className="ml-2 text-xs font-bold">← o seu</span>}
              <p className="mt-0.5 font-semibold">{sideText(side)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PromptCard({ ctx }: { ctx: PartyCtx }) {
  const prompt = ctx.state.prompt;
  if (!prompt) return null;
  if (ctx.game === "debate" && prompt.sideA && prompt.sideB) return <DebatePrompt ctx={ctx} />;
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

/** Tribunal: who you are in this case and who decides, so nobody has to guess their job. */
function TribunalRole({ ctx, isDefendant, duel }: { ctx: PartyCtx; isDefendant: boolean; duel: boolean }) {
  const byAi = duel || effectiveJudgeFor("tribunal", ctx.settings, (ctx.state.eligible ?? []).length) === "ia";
  const role = isDefendant ? "RÉU" : duel ? "PROMOTOR" : "ACUSADOR";
  const mission = isDefendant
    ? "Convença o juiz da sua inocência."
    : `Convença o juiz de que @${nick(ctx.players, ctx.state.defendantId)} é culpado.`;
  return (
    <div className="rounded-xl border-2 border-[var(--game-accent)] bg-background p-4" role="note" aria-label={`Seu papel: ${role}`}>
      <p className="section-label inline-flex items-center gap-1.5 party-accent"><Gavel className="size-3.5" aria-hidden="true" /> Seu papel</p>
      <p className="font-display text-3xl leading-tight party-accent">{role}</p>
      <p className="mt-1 font-semibold">{mission}</p>
      <p className="mt-1 text-xs text-muted-foreground">{byAi ? "Quem decide: o Juiz de IA, lendo os dois lados." : "Quem decide: o júri da galera, votando culpado ou inocente."}</p>
    </div>
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
  const max = isPartyGame(ctx.game) ? textMaxFor(ctx.game) : PARTY_TEXT_MAX;
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
        maxLength={max}
        rows={max > PARTY_TEXT_MAX ? 6 : 3}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => { setText(event.target.value); setTouched(true); }}
        className={cn("rounded-xl text-base", max > PARTY_TEXT_MAX ? "min-h-40" : "min-h-24")}
      />
      <div className="flex items-center justify-between gap-3">
        <span className={cn("text-xs tabular-nums", text.length >= max ? "font-bold party-accent" : "text-muted-foreground")} aria-live="polite">{text.length} / {max}</span>
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

/** Deadline: any player may ask the server to close the step; the server re-checks time and versions. */
function DeadlineWatcher({ round, phase, endsAtIso, actions }: { round: number; phase: string; endsAtIso: string | null; actions: PartyActions }) {
  const endsAt = endsAtIso ? new Date(endsAtIso).getTime() : null;
  const fired = useRef<{ key: string; at: number } | null>(null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => {
    if (!endsAt) return;
    const key = `${round}:${phase}:${endsAtIso}`;
    const check = () => {
      const now = Date.now();
      if (now < endsAt + 400) return;
      const last = fired.current;
      if (last && last.key === key && now - last.at < 5_000) return;
      fired.current = { key, at: now };
      void actionsRef.current.advance(false);
    };
    check();
    const id = window.setInterval(check, 500);
    return () => window.clearInterval(id);
  }, [round, phase, endsAt, endsAtIso]);
  return null;
}

export function PartyPlay({ ctx, actions }: { ctx: PartyCtx; actions: PartyActions }) {
  const phase = ctx.room.phase as PartyPhaseId;
  const eligible = (ctx.state.eligible ?? []).includes(ctx.me.id);

  if (phase === "reveal") return <PartyReveal ctx={ctx} actions={actions} />;

  const defendant = ctx.state.defendantId;
  const isDefendant = defendant === ctx.me.id;
  const accusedName = nick(ctx.players, ctx.state.accusedId);

  let body: React.ReactNode = null;
  if (phase === "evaluating") {
    body = (
      <div className="space-y-3">
        <section className="party-panel flex items-center gap-3" role="status" aria-live="polite">
          <Loader2 className="size-5 shrink-0 animate-spin party-accent" aria-hidden="true" />
          <p className="font-semibold">{ctx.game === "tribunal" ? "O Juiz de IA está lendo a defesa e a acusação para dar o veredito…" : ctx.game === "debate" ? "O juiz de IA está lendo os argumentos e decidindo o vencedor…" : "O juiz de IA está dando as notas…"}</p>
        </section>
        <EntryList ctx={ctx} entries={ctx.state.entries ?? []} showAuthor />
      </div>
    );
  } else if (!eligible && phase !== "vote") {
    body = <p className="party-panel text-center text-sm text-muted-foreground">{phase === "last_guess" ? `@${accusedName} foi o mais votado e é mesmo o infiltrado! Esperando o palpite da palavra…` : "Você entrou no meio desta etapa. Acompanhe e participe na próxima."}</p>;
  } else if (phase === "defense") {
    const duel = (ctx.state.eligible ?? []).length <= 2;
    body = (
      <div className="space-y-3">
        <TribunalRole ctx={ctx} isDefendant={isDefendant} duel={duel} />
        <TextSubmit ctx={ctx} actions={actions} label={isDefendant ? "Sua defesa" : duel ? `Sua acusação contra @${nick(ctx.players, defendant)}` : `Acuse ou testemunhe contra @${nick(ctx.players, defendant)}`} placeholder={isDefendant ? "Excelência, eu posso explicar…" : "Excelência, as provas são claras…"} />
      </div>
    );
  } else if (phase === "write") {
    body = <TextSubmit ctx={ctx} actions={actions} label="Sua resposta (ninguém vai saber que foi você… até a revelação)" placeholder="Capricha na desgraça" />;
  } else if (phase === "clues") {
    body = <TextSubmit ctx={ctx} actions={actions} label="Sua pista (curta, sem dizer a palavra)" placeholder="Uma palavra ou frase curta" />;
  } else if (phase === "argue") {
    const side = ctx.state.sides?.[ctx.me.id];
    body = <TextSubmit ctx={ctx} actions={actions} label={side ? `Sua defesa do Lado ${side}` : "Seu argumento"} placeholder="Escreva aqui sua defesa irrefutável..." />;
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
      <DeadlineWatcher round={ctx.room.round_number} phase={phase} endsAtIso={ctx.room.phase_ends_at} actions={actions} />
      <PhaseHeader ctx={ctx} />
      <PromptCard ctx={ctx} />
      {phase === "vote" && ctx.state.ai?.status === "failed" && ctx.state.ai.text && <p role="status" className="party-panel text-sm text-muted-foreground">{ctx.state.ai.text}</p>}
      {(phase === "clues" || phase === "vote" || phase === "last_guess") && <SecretCard ctx={ctx} />}
      {body}
      <Progress ctx={ctx} />
      {ctx.isHost && phase !== "evaluating" && (
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
  const king = nightKingId(ctx.players);
  return (
    <section className="party-panel space-y-2" aria-label="Placar">
      <p className="section-label">Placar</p>
      <ul className="space-y-1.5">
        {rows.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-semibold">{p.id === king && <span title="Rei da Noite" aria-label="Rei da Noite">👑 </span>}{p.nickname}{p.id === ctx.me.id && <span className="text-muted-foreground"> (você)</span>}</span>
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
    const judge = results.judge;
    const byAi = judge?.by === "ia";
    return (
      <div className="space-y-3">
        {notice && <p className="party-panel text-sm text-muted-foreground">{notice}</p>}
        {verdict && (
          <section className="party-prompt space-y-2 text-center">
            <span className="party-icon mx-auto size-12"><Gavel className="size-6" aria-hidden="true" /></span>
            <p className="section-label">Veredito para @{nick(ctx.players, ctx.state.defendantId)}</p>
            <p className={cn("font-display text-5xl", verdict === "culpado" ? "text-destructive" : "text-success")}>{verdict === "culpado" ? "CULPADO" : "INOCENTE"}</p>
            {byAi ? (
              <>
                {judge?.sentence && (
                  <p className="text-balance-safe rounded-xl border border-border/60 bg-background px-3 py-2 text-base font-semibold">
                    <span className="section-label block party-accent">{verdict === "culpado" ? "Pena" : "Absolvição"}</span>
                    {judge.sentence}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">Decisão do Juiz de IA{judge?.bonus ? ` · bônus +${judge.bonus}` : ""}</p>
              </>
            ) : (
              <p className="text-sm tabular-nums text-muted-foreground">{String(results.guilty ?? 0)} culpado · {String(results.innocent ?? 0)} inocente{verdict === "inocente" && Number(results.guilty) === Number(results.innocent) ? " · empate absolve" : ""}</p>
            )}
          </section>
        )}
        <AiCard ctx={ctx} title={byAi ? "Por que o juiz decidiu assim" : "Sentença do juiz"} />
        <ul className="space-y-2">
          {(ctx.state.entries ?? []).map((entry, index) => {
            const id = entry.playerId ?? "";
            const isDefendant = id === ctx.state.defendantId;
            const best = byAi && id === judge?.bestId;
            return (
              <li key={entry.id} className={cn("party-panel answer-card", best && "ring-2 ring-[var(--game-accent)]")} style={{ "--enter-index": index } as CSSProperties}>
                <p className="text-xs font-semibold text-muted-foreground">
                  {best && <Trophy className="mr-1 inline size-3.5 party-accent" aria-label="Melhor acusação" />}
                  {nick(ctx.players, id)}{id === ctx.me.id ? " (você)" : ""} · {isDefendant ? "Defesa" : (ctx.state.eligible ?? []).length <= 2 ? "Promotor" : "Acusação"}
                </p>
                <p className="text-balance-safe mt-0.5 font-semibold">“{entry.text}”</p>
              </li>
            );
          })}
        </ul>
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
              {entry.bluff && <p className="text-xs font-bold party-accent">🎭 Blefe perfeito: +2 de bônus</p>}
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

  const judge = results.judge;
  const bestId = judge?.bestId ?? null;
  const entries = [...(ctx.state.entries ?? [])].sort((a, b) =>
    (b.playerId === bestId ? 1 : 0) - (a.playerId === bestId ? 1 : 0) || (counts[b.playerId ?? ""] ?? 0) - (counts[a.playerId ?? ""] ?? 0));
  const multiplier = Number(results.multiplier ?? 1);
  const sideTotals = results.sideTotals;
  const debateJudged = ctx.game === "debate" && judge?.by === "ia";
  return (
    <div className="space-y-3">
      {notice && <p className="party-panel text-sm text-muted-foreground">{notice}</p>}
      {debateJudged && (
        <section className="party-prompt space-y-1 text-center">
          <span className="party-icon mx-auto size-12"><Trophy className="size-6" aria-hidden="true" /></span>
          <p className="font-display text-3xl party-accent">{results.winnerSide ? `Lado ${String(results.winnerSide)} venceu!` : "Sem vencedor nesta rodada"}</p>
          {bestId && <p className="text-sm">Melhor argumento: <strong>{nick(ctx.players, bestId)}</strong>{bestId === ctx.me.id ? " (você)" : ""}</p>}
          <p className="text-xs text-muted-foreground">Decisão do juiz de IA</p>
        </section>
      )}
      {ctx.game === "debate" && !debateJudged && sideTotals && (
        <section className="party-prompt text-center">
          <p className="font-display text-3xl party-accent">{results.winnerSide ? `Lado ${String(results.winnerSide)} venceu!` : "Empate entre os lados!"}</p>
          <p className="text-sm tabular-nums text-muted-foreground">Lado A: {sideTotals.A} voto(s) · Lado B: {sideTotals.B} voto(s)</p>
        </section>
      )}
      {ctx.game === "roleta" && multiplier > 1 && <p className="party-prompt text-center font-display text-2xl party-accent">Pontos ×{multiplier} nesta rodada!</p>}
      <AiCard ctx={ctx} title={judge?.by === "ia" ? (ctx.game === "debate" ? "Veredito do juiz de IA" : "Avaliação do juiz de IA") : "Comentário da IA"} />
      <ul className="space-y-2">
        {entries.map((entry, index) => {
          const id = entry.playerId ?? "";
          const note = judge?.notes?.[id];
          return (
            <li key={entry.id} className={cn("party-panel answer-card flex items-start justify-between gap-3", id === bestId && "ring-2 ring-[var(--game-accent)]")} style={{ "--enter-index": index } as CSSProperties}>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">{id === bestId && <Trophy className="mr-1 inline size-3.5 party-accent" aria-label="Vencedor" />}{nick(ctx.players, entry.playerId)}{id && ctx.state.sides?.[id] ? ` · Lado ${ctx.state.sides[id]}` : ""}</p>
                <p className="text-balance-safe font-semibold">“{entry.text}”</p>
                {note && <p className="mt-1 text-xs italic text-muted-foreground">IA: {note}</p>}
              </div>
              {!debateJudged && (
                <span className="shrink-0 rounded-lg bg-secondary px-2 py-1 text-center font-display text-lg tabular-nums" aria-label={judge?.by === "ia" ? `${counts[id] ?? 0} de 3 pontos da IA` : `${counts[id] ?? 0} votos`}>
                  {counts[id] ?? 0}{judge?.by === "ia" && <span className="block text-[0.625rem] font-sans text-muted-foreground">/3</span>}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PartyReveal({ ctx, actions }: { ctx: PartyCtx; actions: PartyActions }) {
  const last = ctx.room.round_number >= ctx.settings.rounds;
  return (
    <div className="dock-clearance space-y-4">
      <div className="flex items-center gap-3 pt-2">
        <span className="party-icon size-12"><PartyIcon name={lobbyGameMeta(ctx.game).icon} className="size-6" /></span>
        <div className="min-w-0">
          <p className="section-label">Rodada {ctx.room.round_number} de {ctx.settings.rounds}</p>
          <h2 className="text-2xl leading-tight">Resultado da rodada</h2>
        </div>
      </div>
      <PromptCard ctx={ctx} />
      <RevealBody ctx={ctx} />
      <CrowdReactions roomId={ctx.room.id} />
      <Deltas ctx={ctx} />
      <div className="mobile-bottom-bar fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
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

/** Debate podium: the AI's comic awards for the match; never blocks the ranking. */
function FinalCommentaryCard({ ctx }: { ctx: PartyCtx }) {
  const commentary = ctx.state.finalCommentary;
  if (!commentary) return null;
  const tribunal = ctx.game === "tribunal";
  return (
    <section className="party-prompt space-y-3" aria-live="polite" aria-label="Sentença final da IA">
      <p className="section-label inline-flex items-center gap-1.5 party-accent"><Sparkles className="size-3.5" aria-hidden="true" /> {commentary.title ?? (tribunal ? "Veredito da História" : "Sentença Final da Corte")}</p>
      {commentary.status === "pending" && <p className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden="true" /> A IA está escolhendo os troféus da partida…</p>}
      {commentary.status === "failed" && <p className="text-sm text-muted-foreground">A IA não conseguiu entregar os troféus desta vez. O placar vale normalmente.</p>}
      {commentary.status === "ready" && (
        <>
          {(commentary.highlights ?? []).length > 0 && (
            <ul className="grid gap-2">
              {(commentary.highlights ?? []).map((h) => (
                <li key={h.title} className="rounded-xl border border-border/60 bg-background p-3">
                  <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide party-accent"><Award className="size-3.5" aria-hidden="true" /> {h.title}</p>
                  <p className="font-bold">{nick(ctx.players, h.playerId)}{h.playerId === ctx.me.id ? " (você)" : ""}</p>
                  <p className="text-balance-safe text-sm text-muted-foreground">{h.text}</p>
                </li>
              ))}
            </ul>
          )}
          {commentary.summary && (
            <div>
              <p className="section-label mb-1">{tribunal ? "Ficha criminal da galera" : "Palavra final da corte"}</p>
              <p className="text-balance-safe text-base font-semibold italic">“{commentary.summary}”</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Room-wide tally across every game played tonight; the leader is the "Rei da Noite". */
export function NightBoard({ players, me }: { players: PartyPlayer[]; me: PartyPlayer }) {
  if (!players.some((p) => p.score > 0)) return null;
  const king = nightLeaderId(players);
  const rows = [...players].sort((a, b) => b.score - a.score);
  return (
    <section className="party-panel space-y-2" aria-label="Placar da noite">
      <p className="section-label">👑 Rei da Noite · todos os jogos da sala</p>
      <ul className="space-y-1">
        {rows.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold">{p.id === king ? "👑 " : ""}{p.nickname}{p.id === me.id && <span className="text-muted-foreground"> (você)</span>}</span>
            <span className="font-display text-lg tabular-nums">{p.score}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Boletim da Vergonha": the podium and AI awards as an image for the group's WhatsApp. */
function ShareBulletin({ ctx, ranked }: { ctx: PartyCtx; ranked: { player: PartyPlayer & { score: number }; place: number }[] }) {
  const [busy, setBusy] = useState(false);
  async function share() {
    setBusy(true);
    try {
      const { drawShareCard, shareImage } = await import("@/lib/share-card");
      const commentary = ctx.state.finalCommentary?.status === "ready" ? ctx.state.finalCommentary : null;
      const nick = (id: string) => ctx.players.find((p) => p.id === id)?.nickname ?? "Alguém";
      const king = ctx.players.find((p) => p.id === nightKingId(ctx.players))?.nickname ?? null;
      const blob = await drawShareCard({
        gameName: lobbyGameMeta(ctx.game).name,
        code: ctx.room.code,
        ranked: ranked.map((r) => ({ nickname: r.player.nickname, score: r.player.score, place: r.place })),
        highlights: (commentary?.highlights ?? []).map((h) => ({ name: nick(h.playerId), title: h.title, text: h.text })),
        summary: commentary?.summary,
        king,
      });
      const result = await shareImage(blob, `boletim-${ctx.room.code}.png`, `Boletim da Vergonha · ${lobbyGameMeta(ctx.game).name} na sala ${ctx.room.code}`);
      vibrate(15);
      if (result === "downloaded") toast.success("Imagem salva! Agora é só mandar no grupo.");
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) toast.error(err instanceof Error ? err.message : "Não foi possível gerar o boletim.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" className="h-14 w-full text-base font-bold" disabled={busy} aria-busy={busy} onClick={() => void share()}>
      {busy ? <Loader2 className="animate-spin" /> : <Share2 />} Boletim da Vergonha
    </Button>
  );
}

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
        <p className="text-muted-foreground">{winners.length > 1 ? `Empate no topo: ${winners.map((w) => w.player.nickname).join(", ")}` : `${winners[0]?.player.nickname ?? "Ninguém"} venceu ${lobbyGameMeta(ctx.game).name}!`}</p>
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
      <FinalCommentaryCard ctx={ctx} />
      <ShareBulletin ctx={ctx} ranked={ranked} />
      <NightBoard players={ctx.players} me={ctx.me} />
      <ol className="space-y-2" aria-label="Classificação final">
        {ranked.map((row, index) => (
          <li key={row.player.id} className="ranking-row flex items-center gap-3 p-3" data-first={row.place === 1} style={{ "--enter-index": index } as CSSProperties}>
            <span className="rank-badge" data-place={row.place}>{row.place}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{row.player.nickname}{row.player.id === ctx.me.id && <span className="text-primary"> (você)</span>}</span>
            <span className="font-display text-2xl tabular-nums">{row.player.score}</span>
          </li>
        ))}
      </ol>
      <div className="mobile-bottom-bar fixed inset-x-0 bottom-0 mx-auto w-full max-w-md space-y-2 border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {ctx.isHost ? (
          <div className="grid grid-cols-2 gap-2">
            <Button className="party-accent-button h-14 text-base font-bold shadow-none" disabled={ctx.busy !== null} aria-busy={ctx.busy === "replay"} onClick={() => void actions.replay()}>
              {ctx.busy === "replay" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Jogar Novamente
            </Button>
            <Button variant="secondary" className="h-14 text-base font-bold" disabled={ctx.busy !== null} aria-busy={ctx.busy === "lobby"} onClick={() => void actions.toLobby()}>
              {ctx.busy === "lobby" ? <Loader2 className="animate-spin" /> : <LayoutGrid />} Trocar de Jogo
            </Button>
          </div>
        ) : (
          <p role="status" className="flex min-h-12 items-center justify-center gap-2 text-sm text-muted-foreground"><span className="size-2 rounded-full bg-primary motion-safe:animate-pulse" aria-hidden="true" /> Aguardando decisão do Mestre...</p>
        )}
        <Button variant="ghost" className="h-12 w-full" onClick={onHub}><LogOut /> Sair da sala</Button>
      </div>
    </div>
  );
}
