import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";

import { PartyFinal, PartyLobby, PartyPlay, type PartyActions, type PartyCtx } from "@/components/party/PartyStage";
import { useSound } from "@/components/SoundProvider";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePartyRoom } from "@/hooks/use-party-room";
import { vibrate } from "@/lib/haptics";
import {
  advancePartyPhase,
  joinPartyRoom,
  leavePartyRoom,
  nextPartyRound,
  restartPartyRoom,
  skipRoletaChallenge,
  startPartyGame,
  submitPartyAction,
  updatePartySettings,
} from "@/lib/party.functions";
import { PARTY_GAMES, PARTY_GAME_IDS, readPartySettings, readPublicState, type PartyGameId } from "@/lib/party-games";
import { getLastNickname, getOrCreateSessionId, getPlayer, removePlayer, savePlayer } from "@/lib/session";

export const Route = createFileRoute("/festa/$code")({
  head: () => ({
    meta: [
      { title: "Sala da Central de Jogos — Stopia" },
      { name: "description", content: "Entre na sala e jogue Tribunal dos Amigos, Quem Escreveu Essa Desgraça?, Infiltrado, Debate Impossível ou Roleta do Caos." },
      { property: "og:title", content: "Bora jogar? Sala da Central de Jogos do Stopia" },
      { property: "og:description", content: "Entre com o código e jogue com a galera pelo celular." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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

  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    const stored = getPlayer(code);
    setNickname(stored?.nickname ?? getLastNickname());
    if (stored && (!stored.sessionId || stored.sessionId === sessionId)) setIdentity({ playerId: stored.playerId, sessionId });
  }, [code]);

  const me = identity ? players.find((p) => p.id === identity.playerId) ?? null : null;
  const game: PartyGameId = room && (PARTY_GAME_IDS as readonly string[]).includes(room.game) ? (room.game as PartyGameId) : "tribunal";

  const run = useCallback(async (key: string, task: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await task();
      await refresh();
      return true;
    } catch (err) {
      play("error");
      toast.error(err instanceof Error ? err.message : "Algo deu errado. Tente de novo.");
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
    };
  }, [room, identity, run, submitFn, advanceFn, nextFn, skipFn, startFn, restartFn, settingsFn, refresh, play]);

  // Phase-change feedback without new game states.
  const lastPhase = useRef<string | null>(null);
  useEffect(() => {
    if (!room) return;
    const key = `${room.round_number}:${room.phase}`;
    if (lastPhase.current && lastPhase.current !== key) {
      vibrate(20);
      play(room.phase === "reveal" || room.phase === "final" ? "allReady" : "click");
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
      if (res.kind === "stop") {
        navigate({ to: "/sala/$code", params: { code: res.code } });
        return;
      }
      savePlayer(res.code, res.playerId, nickname.trim(), sessionId);
      setIdentity({ playerId: res.playerId, sessionId });
      play("playerJoin");
      await refresh();
    } catch (err) {
      play("error");
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar");
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

  const meta = PARTY_GAMES[game];

  if (!me || !identity || !actions) {
    return (
      <main data-game={game} className="game-screen mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-4 px-5">
        <p className="section-label party-accent">{meta.name}</p>
        <h1 className="font-display text-4xl">Sala {room.code}</h1>
        <p className="text-muted-foreground">{meta.short}</p>
        <form onSubmit={handleJoin} className="space-y-3">
          <label htmlFor="party-apelido" className="section-label block">Seu apelido</label>
          <Input id="party-apelido" value={nickname} maxLength={20} autoComplete="nickname" placeholder="Ex.: Juninho" onChange={(e) => setNickname(e.target.value)} className="h-14 text-lg" />
          <Button type="submit" className="party-accent-button h-14 w-full text-lg font-bold shadow-none" disabled={busy !== null} aria-busy={busy === "join"}>
            {busy === "join" ? <Loader2 className="animate-spin" /> : null} Entrar na sala
          </Button>
        </form>
        <Button asChild variant="ghost"><Link to="/"><ArrowLeft /> Central de Jogos</Link></Button>
      </main>
    );
  }

  const ctx: PartyCtx = {
    room,
    players,
    me,
    isHost: me.is_host,
    game,
    state: readPublicState(room.public_state),
    settings: readPartySettings(room.settings),
    view: privateView,
    busy,
  };

  return (
    <main data-game={game} className="game-screen mx-auto w-full max-w-md px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      {error && <p role="alert" className="mb-3 rounded-lg border border-destructive/60 p-3 text-sm">{error}</p>}
      {room.status !== "playing" || room.phase === "reveal" ? (
        <header className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 pb-3 pr-16">
          <div className="min-w-0">
            <p className="section-label party-accent truncate">{meta.name}</p>
            <Button variant="ghost" className="justify-start gap-1.5 px-0 font-display text-2xl" aria-label={`Copiar link da sala ${room.code}`} onClick={async () => {
              try {
                const url = `${window.location.origin}/festa/${room.code}`;
                if (navigator.share) await navigator.share({ title: meta.name, text: `Bora jogar ${meta.name}! Sala ${room.code}`, url });
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
        <PartyLobby ctx={ctx} actions={actions} />
      ) : room.status === "ended" ? (
        <PartyFinal ctx={ctx} actions={actions} onHub={() => setLeaveOpen(true)} />
      ) : (
        <PartyPlay ctx={ctx} actions={actions} />
      )}

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent className="w-[calc(100%_-_2rem)] rounded-2xl border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Sair da sala {room.code}?</AlertDialogTitle>
            <AlertDialogDescription>Você sai da partida e volta para a Central de Jogos. Se for o mestre, outra pessoa assume.</AlertDialogDescription>
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
