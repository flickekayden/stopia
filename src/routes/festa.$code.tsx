import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, Dices, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";

import { PartyFinal, PartyLobby, PartyPlay, type LobbyCtx, type PartyActions, type PartyCtx } from "@/components/party/PartyStage";
import { PartyChat } from "@/components/party/PartyChat";
import { StopPartyPlay } from "@/components/party/StopParty";
import { VoiceControl } from "@/components/party/VoiceControl";
import { useSound } from "@/components/SoundProvider";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePartyRoom } from "@/hooks/use-party-room";
import { vibrate } from "@/lib/haptics";
import { randomNickname } from "@/lib/nicknames";
import { getDevToken, setDevGameContext, setDevRoom } from "@/lib/dev-settings";
import { soundManager } from "@/lib/sound-manager";
import { voiceLockReason } from "@/lib/voice-rules";
import {
  advancePartyPhase,
  devRoomAction,
  joinPartyRoom,
  openStopAppeal,
  resolveStopAppeal,
  tickPartyBots,
  voteStopAppeal,
  leavePartyRoom,
  nextPartyRound,
  replayPartyGame,
  restartPartyRoom,
  returnPartyToLobby,
  selectPartyGame,
  skipRoletaChallenge,
  startPartyGame,
  stopPartyRound,
  submitPartyAction,
  updatePartySettings,
  touchPartyPresence,
  getRoomCredits,
} from "@/lib/party.functions";
import { HEARTBEAT_MS } from "@/lib/party-presence";
import { isPartyGame, lobbyGameMeta, readPartySettings, readPublicState, readRoomGame } from "@/lib/party-games";
import { getLastNickname, getOrCreateSessionId, getPlayer, removePlayer, savePlayer } from "@/lib/session";
import { friendlyError } from "@/lib/friendly-error";
import { getRoomPreview } from "@/lib/room-preview.functions";
import { shareImageFor } from "@/lib/share-images";

export const Route = createFileRoute("/festa/$code")({
  loader: async ({ params }) => ({ preview: await getRoomPreview({ data: { code: params.code } }).catch(() => null) }),
  head: ({ params, loaderData }) => {
    const preview = loaderData?.preview ?? null;
    const code = params.code.toUpperCase();
    const roomGame = readRoomGame(preview?.game);
    const gameName = roomGame === "lobby" ? "Sala da Galera" : lobbyGameMeta(roomGame).name;
    const title = preview ? `Sala ${code} · ${gameName} — Stopia` : "Sala da Galera — Central de Jogos do Stopia";
    const description = preview
      ? preview.status === "ended"
        ? `A partida de ${gameName} na sala ${code} terminou. Entre para a revanche com a galera.`
        : `Bora jogar ${gameName}? Toque para entrar na sala ${code} pelo celular${preview.players > 0 ? ` — ${preview.players} na sala` : ""}.`
      : "Entre com o código e jogue com a galera pelo celular: Stop, Tribunal dos Amigos, Infiltrado e mais.";
    const image = shareImageFor(preview?.game);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: preview ? `Bora jogar ${gameName}? Sala ${code}` : "Bora jogar? Sala da Central de Jogos do Stopia" },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:image", content: image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: image },
      ],
    };
  },
  component: PartyRoomPage,
});

function PartyRoomPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const { play } = useSound();
  const [identity, setIdentity] = useState<{ playerId: string; sessionId: string } | null>(null);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const { room, players, privateView, loading, missing, error, refresh } = usePartyRoom(code, identity);

  const submitFn = useServerFn(submitPartyAction);
  const advanceFn = useServerFn(advancePartyPhase);
  const nextFn = useServerFn(nextPartyRound);
  const skipFn = useServerFn(skipRoletaChallenge);
  const startFn = useServerFn(startPartyGame);
  const restartFn = useServerFn(restartPartyRoom);
  const settingsFn = useServerFn(updatePartySettings);
  const joinFn = useServerFn(joinPartyRoom);
  const leaveFn = useServerFn(leavePartyRoom);
  const selectFn = useServerFn(selectPartyGame);
  const replayFn = useServerFn(replayPartyGame);
  const lobbyFn = useServerFn(returnPartyToLobby);
  const stopFn = useServerFn(stopPartyRound);
  const appealFn = useServerFn(openStopAppeal);
  const appealVoteFn = useServerFn(voteStopAppeal);
  const appealResolveFn = useServerFn(resolveStopAppeal);
  const tickFn = useServerFn(tickPartyBots);
  const devFn = useServerFn(devRoomAction);
  const touchFn = useServerFn(touchPartyPresence);
  const creditsFn = useServerFn(getRoomCredits);
  const [hostCredits, setHostCredits] = useState<{ balance: number; billed: boolean } | null>(null);

  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    const stored = getPlayer(code);
    setNickname(stored?.nickname ?? getLastNickname());
    if (stored && (!stored.sessionId || stored.sessionId === sessionId)) setIdentity({ playerId: stored.playerId, sessionId });
  }, [code]);

  const me = identity ? players.find((p) => p.id === identity.playerId) ?? null : null;
  const game = readRoomGame(room?.game);

  // The developer panel only offers settings for the game this room is on.
  useEffect(() => {
    setDevGameContext(game === "lobby" ? "global" : game);
    return () => setDevGameContext("global");
  }, [game]);

  const run = useCallback(async (key: string, task: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await task();
      await refresh();
      return true;
    } catch (err) {
      play("error");
      toast.error(friendlyError(err, "Algo deu errado. A partida continua salva — tente de novo."));
      await refresh();
      return false;
    } finally {
      setBusy(null);
    }
  }, [play, refresh]);

  const actions = useMemo<PartyActions | null>(() => {
    if (!room || !identity) return null;
    const base = { roomId: room.id, playerId: identity.playerId, sessionId: identity.sessionId };
    return {
      submit: (payload) => run("submit", async () => { await submitFn({ data: { ...base, round: room.round_number, phase: room.phase, payload } }); vibrate(15); play("ready"); }),
      advance: async (manual) => {
        if (manual) return run("advance", () => advanceFn({ data: { ...base, round: room.round_number, phase: room.phase } }));
        try { await advanceFn({ data: { ...base, round: room.round_number, phase: room.phase } }); } catch { /* another player already closed the step */ }
        await refresh();
        return true;
      },
      next: () => run("next", () => nextFn({ data: { ...base, round: room.round_number } })),
      skip: () => run("skip", () => skipFn({ data: { ...base, round: room.round_number } })),
      start: () => run("start", () => startFn({ data: base })),
      restart: () => run("restart", () => restartFn({ data: base })),
      updateSettings: (settings) => run("settings", () => settingsFn({ data: { ...base, settings } })),
      select: (choice) => run("select", async () => { await selectFn({ data: { ...base, game: choice } }); vibrate(10); }),
      replay: () => run("replay", () => replayFn({ data: base })),
      toLobby: () => run("lobby", () => lobbyFn({ data: base })),
      stopSave: async (answers, done) => {
        try {
          await submitFn({ data: { ...base, round: room.round_number, phase: "write", payload: { answers, done } } });
          if (done) { vibrate(15); play("ready"); }
          return true;
        } catch {
          return false;
        }
      },
      stopNow: (answers) => run("stop", async () => { await stopFn({ data: { ...base, round: room.round_number, answers } }); vibrate(40); }),
      appeal: (category) => run("appeal", () => appealFn({ data: { ...base, round: room.round_number, category } })),
      appealVote: (vote) => run("appealVote", () => appealVoteFn({ data: { ...base, round: room.round_number, vote } })),
      appealResolve: async () => {
        try { await appealResolveFn({ data: { ...base, round: room.round_number } }); } catch { /* someone else closed it */ }
        await refresh();
      },
      devBots: (action) => run("bots", async () => { await devFn({ data: { ...base, token: getDevToken(), action } }); vibrate(10); }),
    };
  }, [room, identity, run, submitFn, advanceFn, nextFn, skipFn, startFn, restartFn, settingsFn, selectFn, replayFn, lobbyFn, stopFn, appealFn, appealVoteFn, appealResolveFn, devFn, refresh, play]);

  // Presence heartbeat while the room is on screen, plus an immediate check-in when the tab
  // comes back or the network returns, so others can see who is still around.
  const presenceRoomId = room?.id;
  useEffect(() => {
    if (!presenceRoomId || !identity) return;
    let inFlight = false;
    const beat = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try { await touchFn({ data: { roomId: presenceRoomId, ...identity } }); } catch { /* the next beat retries */ }
      finally { inFlight = false; }
    };
    const onVisible = () => { if (!document.hidden) void beat(); };
    void beat();
    const id = window.setInterval(() => void beat(), HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [presenceRoomId, identity, touchFn]);

  // Training bots act only when the host's device asks: a light heartbeat while a match with bots is on.
  const hasBots = players.some((p) => p.is_bot);
  const isHost = Boolean(me?.is_host);
  const playing = room?.status === "playing";
  const roomId = room?.id;
  useEffect(() => {
    if (!hasBots || !isHost || !playing || !roomId || !identity) return;
    let inFlight = false;
    const tick = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const res = await tickFn({ data: { roomId, ...identity } });
        if (res.acted > 0) await refresh();
      } catch { /* the next heartbeat retries */ }
      finally { inFlight = false; }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2_000);
    return () => window.clearInterval(id);
  }, [hasBots, isHost, playing, roomId, identity, tickFn, refresh]);

  // Host: the room creator's AI balance, refreshed whenever the room returns to the lobby or a match ends.
  const roomStatus = room?.status;
  const roomGame = room?.game;
  useEffect(() => {
    if (!isHost || !roomId || !identity || roomStatus === "playing") return;
    let alive = true;
    creditsFn({ data: { roomId, ...identity } })
      .then((res) => { if (alive) setHostCredits(res); })
      .catch(() => { if (alive) setHostCredits(null); });
    return () => { alive = false; };
  }, [isHost, roomId, identity, roomStatus, roomGame, creditsFn]);

  // The developer panel's room controls work on the room on screen.
  useEffect(() => {
    if (!room || !identity) { setDevRoom(null); return; }
    setDevRoom({
      roomId: room.id,
      code: room.code,
      playerId: identity.playerId,
      sessionId: identity.sessionId,
      game: room.game,
      status: room.status,
      phase: room.phase,
      players: players.map((p) => ({ id: p.id, nickname: p.nickname, isBot: p.is_bot, isHost: p.is_host })),
    });
  }, [room, identity, players]);
  useEffect(() => () => setDevRoom(null), []);

  // Phase-change feedback without new game states.
  const lastPhase = useRef<string | null>(null);
  useEffect(() => {
    if (!room) return;
    const key = `${room.round_number}:${room.phase}`;
    if (lastPhase.current && lastPhase.current !== key) {
      vibrate(20);
      // The Tribunal's verdict lands with the judge's gavel.
      if (room.game === "tribunal" && room.phase === "reveal") soundManager.playGavel();
      else play(room.phase === "reveal" || room.phase === "final" ? "allReady" : "click");
    }
    lastPhase.current = key;
  }, [room, play]);

  async function handleJoin(event: React.FormEvent) {
    event.preventDefault();
    if (!nickname.trim()) {
      play("error");
      toast.error("Coloca um apelido primeiro");
      return;
    }
    setBusy("join");
    try {
      const sessionId = getOrCreateSessionId();
      const res = await joinFn({ data: { code, nickname: nickname.trim(), sessionId } });
      savePlayer(res.code, res.playerId, nickname.trim(), sessionId);
      setIdentity({ playerId: res.playerId, sessionId });
      play("playerJoin");
      await refresh();
    } catch (err) {
      play("error");
      toast.error(friendlyError(err, "Não foi possível entrar. Tente de novo."));
    } finally {
      setBusy(null);
    }
  }

  async function handleLeave() {
    if (!room || !identity) return;
    setBusy("leave");
    try {
      await leaveFn({ data: { roomId: room.id, ...identity } });
    } catch {
      // Leaving locally is still safe; the session is cleared below.
    } finally {
      removePlayer(code);
      setBusy(null);
      navigate({ to: "/" });
    }
  }

  if (loading) {
    return <main className="mx-auto flex min-h-[100dvh] w-full max-w-md items-center justify-center" role="status" aria-label="Carregando sala"><Loader2 className="size-8 animate-spin text-primary" /></main>;
  }

  if (missing || !room) {
    return (
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
        <h1 className="font-display text-3xl">Sala não encontrada</h1>
        <p className="text-muted-foreground">Confira o código ou crie uma sala nova na Central de Jogos.</p>
        <Button asChild><Link to="/">Ir para a Central de Jogos</Link></Button>
      </main>
    );
  }

  const label = game === "lobby" ? "Sala da Galera" : lobbyGameMeta(game).name;
  const dataGame = game === "lobby" ? undefined : game;

  if (!me || !identity || !actions) {
    return (
      <main data-game={dataGame} className="game-screen mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-4 px-5">
        <p className="section-label party-accent">{label}</p>
        <h1 className="font-display text-4xl">Sala {room.code}</h1>
        <p className="text-muted-foreground">Entre e jogue com a galera: o mestre escolhe o jogo e todo mundo começa junto.</p>
        <form onSubmit={handleJoin} className="space-y-3">
          <label htmlFor="party-apelido" className="section-label block">Seu apelido</label>
          <div className="flex gap-2">
            <Input id="party-apelido" value={nickname} maxLength={20} autoComplete="nickname" placeholder="Ex.: Juninho" onChange={(e) => setNickname(e.target.value)} className="h-14 text-lg" />
            <Button type="button" variant="secondary" size="icon" className="size-14 shrink-0" aria-label="Sortear apelido engraçado" title="Sortear apelido" onClick={() => { setNickname((current) => randomNickname(Math.random, current)); vibrate(10); }}>
              <Dices className="size-6" />
            </Button>
          </div>
          <Button type="submit" className="party-accent-button h-14 w-full text-lg font-bold shadow-none" disabled={busy !== null} aria-busy={busy === "join"}>
            {busy === "join" ? <Loader2 className="animate-spin" /> : null} Entrar na sala
          </Button>
        </form>
        <Button asChild variant="ghost"><Link to="/"><ArrowLeft /> Central de Jogos</Link></Button>
      </main>
    );
  }

  const settings = readPartySettings(room.settings);
  const ctx: PartyCtx | null = isPartyGame(game) || game === "stop"
    ? { room, players, me, isHost: me.is_host, game, state: readPublicState(room.public_state), settings, view: privateView, busy }
    : null;
  const lobbyCtx: LobbyCtx = { room, players, me, isHost: me.is_host, selected: game === "lobby" ? null : game, settings, busy, credits: me.is_host ? hostCredits : null };

  return (
    <main data-game={dataGame} className="game-screen mx-auto w-full max-w-md px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      {error && <p role="alert" className="mb-3 rounded-lg border border-destructive/60 p-3 text-sm">{error}</p>}
      {room.status !== "playing" || room.phase === "reveal" ? (
        <header className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 pb-3 top-actions-clear">
          <div className="min-w-0">
            <p className="section-label party-accent truncate">{label}</p>
            <Button variant="ghost" className="justify-start gap-1.5 px-0 font-display text-2xl" aria-label={`Copiar link da sala ${room.code}`} onClick={async () => {
              try {
                const url = `${window.location.origin}/festa/${room.code}`;
                if (navigator.share) await navigator.share({ title: label, text: `Bora jogar na Central de Jogos! Sala ${room.code}`, url });
                else { await navigator.clipboard.writeText(url); toast.success("Link copiado!", { duration: 1_500 }); }
                vibrate(15);
              } catch (err) {
                if (!(err instanceof DOMException && err.name === "AbortError")) toast.error("Não foi possível compartilhar o link.");
              }
            }}>Sala {room.code} <Copy className="size-4" /></Button>
          </div>
          <Button variant="ghost" size="icon" aria-label="Sair da sala" title="Sair da sala" onClick={() => setLeaveOpen(true)} disabled={busy !== null}><LogOut className="size-5" /></Button>
        </header>
      ) : null}

      {room.status === "lobby" ? (
        <PartyLobby ctx={lobbyCtx} actions={actions} />
      ) : !ctx ? null : room.status === "ended" ? (
        <PartyFinal ctx={ctx} actions={actions} onHub={() => setLeaveOpen(true)} />
      ) : ctx.game === "stop" ? (
        <StopPartyPlay ctx={ctx} actions={actions} />
      ) : (
        <PartyPlay ctx={ctx} actions={actions} />
      )}

      <PartyChat roomId={room.id} playerId={identity.playerId} sessionId={identity.sessionId} players={players} quickOnly={game === "stop" && room.status === "playing" && room.phase === "write"} />
      <VoiceControl roomId={room.id} playerId={identity.playerId} players={players} lockReason={voiceLockReason(room.game, room.status, room.phase)} />

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent className="w-[calc(100%_-_2rem)] rounded-2xl border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Sair da sala {room.code}?</AlertDialogTitle>
            <AlertDialogDescription>Você sai da sala da galera e volta para a Central de Jogos. Se for o mestre, outra pessoa assume.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "leave"}>Ficar</AlertDialogCancel>
            <AlertDialogAction disabled={busy === "leave"} onClick={(event) => { event.preventDefault(); void handleLeave(); }}>Sair</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
