import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, LogOut, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Lobby } from "@/components/game/Lobby";
import { PlayerPresence } from "@/components/game/PlayerPresence";
import { RoundBoard } from "@/components/game/RoundBoard";
import { ChatDrawer } from "@/components/game/ChatDrawer";
import { answerCardId, type AnswerCardData } from "@/components/game/AnswerCard";
import { Button } from "@/components/ui/button";
import { useSound } from "@/components/SoundProvider";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useRoom } from "@/hooks/use-room";
import { supabase } from "@/integrations/supabase/client";
import {
  evaluateRound,
  finalizeStopRound,
  finalAnalysis,
  heartbeatPlayer,
  joinRoom,
  removeRoomPlayer,
  restartRoom,
  startNextRound,
  stopRound,
} from "@/lib/game.functions";
import { devAiOverrides, setDevRound } from "@/lib/dev-settings";
import { getLastNickname, getOrCreateSessionId, getPlayer, removePlayer as clearStoredPlayer, savePlayer } from "@/lib/session";

const FinalRanking = lazy(() => import("@/components/game/FinalRanking").then((module) => ({ default: module.FinalRanking })));
const RoundResults = lazy(() => import("@/components/game/RoundResults").then((module) => ({ default: module.RoundResults })));

export const Route = createFileRoute("/sala/$code")({
  head: () => ({
    meta: [
      { title: "Sala de STOP! — Adedonha online" },
      { name: "description", content: "Entre na sala e jogue Stop (Adedonha) com os amigos pelo celular." },
      { property: "og:title", content: "Sala de STOP! — Adedonha online" },
      { property: "og:description", content: "Entre com o código da sala e jogue Adedonha com a galera." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RoomPage,
});

function RoomPage() {
  const { play } = useSound();
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { room, players, currentRound, answers, loading, missing, refresh } = useRoom(code, sessionId);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<PlayerRemoval | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatQuote, setChatQuote] = useState<AnswerCardData | null>(null);
  const [highlightedAnswer, setHighlightedAnswer] = useState<string | null>(null);

  const join = useServerFn(joinRoom);
  const heartbeat = useServerFn(heartbeatPlayer);
  const start = useServerFn(startNextRound);
  const stop = useServerFn(stopRound);
  const evaluate = useServerFn(evaluateRound);
  const finalizeStop = useServerFn(finalizeStopRound);
  const analyse = useServerFn(finalAnalysis);
  const removePlayer = useServerFn(removeRoomPlayer);
  const restart = useServerFn(restartRoom);

  useEffect(() => {
    setSessionId(getOrCreateSessionId());
    const stored = getPlayer(code);
    setPlayerId(stored?.playerId ?? null);
    setNickname(getLastNickname());
  }, [code]);

  const restoredRoom = useRef<string | null>(null);
  useEffect(() => {
    if (!room || !sessionId || restoredRoom.current === room.id) return;
    const stored = getPlayer(code);
    if (!stored) return;
    restoredRoom.current = room.id;
    void join({ data: { roomId: room.id, nickname: stored.nickname, sessionId } })
      .then((result) => {
        savePlayer(result.code, result.playerId, stored.nickname, sessionId);
        setPlayerId(result.playerId);
        void refresh();
      })
      .catch(() => {
        clearStoredPlayer(code);
        setPlayerId(null);
      });
  }, [code, join, refresh, room, sessionId]);

  useEffect(() => {
    if (!room || !playerId || !sessionId) return;
    let inFlight = false;
    const beat = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try { await heartbeat({ data: { roomId: room.id, playerId, sessionId } }); }
      catch { /* Realtime and reconnection handle transient connection loss. */ }
      finally { inFlight = false; }
    };
    void beat();
    const timer = window.setInterval(() => void beat(), 5_000);
    return () => window.clearInterval(timer);
  }, [heartbeat, playerId, room?.id, sessionId]);

  const me = players.find((p) => p.id === playerId) ?? null;
  const isHost = !!room && !!me && room.host_player_id === me.id;
  const chatLocked = currentRound?.status === "answering";

  const handleQuote = useCallback((answer: AnswerCardData) => {
    setChatQuote(answer);
    setChatOpen(true);
  }, []);

  const handleNavigateQuote = useCallback((answer: AnswerCardData) => {
    const id = answerCardId(answer);
    setHighlightedAnswer(id);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    window.setTimeout(() => setHighlightedAnswer((current) => current === id ? null : current), 2400);
  }, []);
  const previousPlayerIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    const currentIds = new Set(players.map((player) => player.id));
    const previous = previousPlayerIds.current;
    if (previous) {
      for (const player of players) {
        if (!previous.has(player.id) && player.id !== playerId) {
          play("playerJoin");
          toast(`👋 @${player.nickname} entrou na sala.`, { duration: 2_500 });
        }
      }
    }
    previousPlayerIds.current = currentIds;
  }, [playerId, players, play]);

  useEffect(() => {
    if (!isHost || !currentRound?.stop_requested_at || currentRound.status !== "answering") return;
    const remaining = Math.max(0, 3_000 - (Date.now() - new Date(currentRound.stop_requested_at).getTime()));
    const timer = window.setTimeout(() => {
      void finalizeStop({ data: { roundId: currentRound.id } })
        .then(() => refresh())
        .catch(() => window.setTimeout(() => void refresh(), 500));
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [currentRound?.id, currentRound?.status, currentRound?.stop_requested_at, finalizeStop, isHost, refresh]);

  useEffect(() => {
    setDevRound(currentRound?.evaluation ? currentRound.id : null);
    return () => setDevRound(null);
  }, [currentRound?.id, currentRound?.evaluation]);

  const evaluating = useRef(false);
  const evaluationFailedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!isHost || !currentRound) return;
    if (currentRound.status !== "evaluating" || currentRound.evaluation) return;
    if (evaluating.current || evaluationFailedFor.current === currentRound.id) return;
    evaluating.current = true;
    void evaluate({ data: { roundId: currentRound.id, dev: devAiOverrides() } })
      .catch((e: unknown) => {
        evaluationFailedFor.current = currentRound.id;
        play("error");
        toast.error(e instanceof Error ? e.message : "Erro ao avaliar a rodada");
      })
      .finally(() => {
        evaluating.current = false;
        void refresh();
      });
  }, [isHost, currentRound, evaluate, refresh, play]);

  const analysing = useRef(false);
  const analysisFailed = useRef(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  useEffect(() => {
    if (!isHost || !room) return;
    if ((room.status !== "ended" && room.status !== "finished") || room.final_analysis) return;
    if (analysing.current || analysisFailed.current) return;
    analysing.current = true;
    void analyse({ data: { roomId: room.id } })
      .then(() => setAnalysisError(null))
      .catch((e: unknown) => {
        analysisFailed.current = true;
        const msg = e instanceof Error ? e.message : "Erro na análise final";
        setAnalysisError(msg);
        play("error");
        toast.error(msg);
      })
      .finally(() => {
        analysing.current = false;
        void refresh();
      });
  }, [isHost, room, analyse, refresh, play]);

  const handleStop = useCallback(
    async (reason: "stop" | "timer") => {
      if (!currentRound || !playerId) return;
      try {
        await stop({ data: { roundId: currentRound.id, playerId, reason } });
        await refresh();
      } catch (e) {
        play("error");
        toast.error(e instanceof Error ? e.message : "Erro ao encerrar a rodada");
        throw e;
      }
    },
    [currentRound, playerId, stop, refresh, play],
  );

  async function handleStart() {
    if (!room || !playerId) return;
    setBusy(true);
    try {
      await start({ data: { roomId: room.id, playerId } });
      await refresh();
    } catch (e) {
      play("error");
      toast.error(e instanceof Error ? e.message : "Erro ao iniciar a rodada");
    } finally {
      setBusy(false);
    }
  }

  async function handleNext(force = false) {
    if (!room || !currentRound || !playerId || !sessionId) return;
    setBusy(true);
    try {
      await start({ data: { roomId: room.id, playerId, sessionId, force, expectedRound: currentRound.number } });
      await refresh();
    } catch (e) {
      play("error");
      toast.error(e instanceof Error ? e.message : "Erro ao avançar");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!nickname.trim()) {
      play("error");
      toast.error("Coloca um apelido primeiro");
      return;
    }
    setBusy(true);
    try {
      const activeSessionId = sessionId ?? getOrCreateSessionId();
      const res = await join({ data: { code, nickname: nickname.trim(), sessionId: activeSessionId } });
      savePlayer(res.code, res.playerId, nickname.trim(), activeSessionId);
      setSessionId(activeSessionId);
      setPlayerId(res.playerId);
      await refresh();
    } catch (e) {
      play("error");
      toast.error(e instanceof Error ? e.message : "Não consegui entrar");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(targetId: string) {
    if (!room || !playerId) return;
    setBusy(true);
    try {
      await removePlayer({ data: { roomId: room.id, requesterId: playerId, playerId: targetId } });
      await refresh();
      setRemoveTarget(null);
    } catch (e) {
      play("error");
      toast.error(e instanceof Error ? e.message : "Não consegui remover o jogador");
    } finally {
      setBusy(false);
    }
  }

  async function handleExit() {
    if (!room || !playerId) return;
    setBusy(true);
    try {
      await removePlayer({ data: { roomId: room.id, requesterId: playerId, playerId } });
      clearStoredPlayer(code);
      window.close();
      if (!window.closed) await navigate({ to: "/" });
    } catch (e) {
      play("error");
      toast.error(e instanceof Error ? e.message : "Não consegui sair da sala");
      setBusy(false);
    }
  }

  async function handlePlayAgain() {
    if (!room || !playerId) return;
    setBusy(true);
    try {
      await restart({ data: { roomId: room.id, playerId } });
      analysisFailed.current = false;
      setAnalysisError(null);
      await refresh();
    } catch (e) {
      play("error");
      toast.error(e instanceof Error ? e.message : "Não consegui preparar outra partida");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main role="status" aria-label="Carregando sala" className="flex min-h-[100dvh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </main>
    );
  }

  if (missing || !room) {
    return (
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center gap-4 px-5 text-center">
        <h1 className="font-display text-3xl">Sala não encontrada</h1>
        <Button onClick={() => navigate({ to: "/" })} className="h-14 rounded-2xl px-8 text-lg font-bold">
          Voltar
        </Button>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-4 px-5">
        <h1 className="text-center font-display text-3xl">
          Entrar na sala <span className="text-primary">{room.code}</span>
        </h1>
        <label htmlFor="room-nickname" className="text-sm font-semibold">Seu apelido</label>
        <Input
          id="room-nickname"
          value={nickname}
          maxLength={20}
          placeholder="Seu apelido"
          autoComplete="nickname"
          enterKeyHint="go"
          onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && !busy) void handleJoin(); }}
          onChange={(e) => setNickname(e.target.value)}
          className="h-14 rounded-2xl border-2 text-lg"
        />
        <Button onClick={handleJoin} disabled={busy} className="h-14 rounded-2xl text-lg font-bold">
          {busy ? "Entrando..." : "Entrar"}
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <header className="mb-4 space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 pr-28">
          <div><h1 className="font-display text-2xl text-primary">STOP!</h1><p className="text-xs text-muted-foreground">Sala {room.code}</p></div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void handleExit()}
            disabled={busy}
            aria-label="Sair da sala"
            title="Sair da sala"
            className="size-12 text-muted-foreground"
          >
            <LogOut className="size-5" />
          </Button>
        </div>
        <div className="scoreboard flex items-center gap-2 overflow-x-auto pb-1 text-sm" aria-label="Jogadores e pontuação">
          {[...players]
            .sort((a, b) => b.score - a.score)
            .map((p) => (
              <span
                key={p.id}
                className={`flex shrink-0 items-center gap-2 rounded-lg py-1 pl-3 ${
                  p.id === me.id ? "bg-primary/10 text-primary ring-1 ring-primary/30" : "bg-secondary"
                } ${isHost && p.id !== me.id ? "pr-1" : "pr-3"}`}
              >
                {p.nickname} <strong>{p.score}</strong> <PlayerPresence player={p} />
                {isHost && p.id !== me.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setRemoveTarget({ id: p.id, nickname: p.nickname })}
                    disabled={busy}
                    aria-label={`Remover ${p.nickname}`}
                    title={`Remover ${p.nickname}`}
                    className="size-12 rounded-lg text-destructive"
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </span>
            ))}
        </div>
      </header>

      <Suspense fallback={<div className="flex min-h-64 items-center justify-center" role="status" aria-label="Carregando rodada"><Loader2 className="size-8 animate-spin text-primary" /></div>}>
      {room.status === "ended" || room.status === "finished" ? (
        <FinalRanking
          room={room}
          players={players}
          playerId={me.id}
          loadingAnalysis={!room.final_analysis && !analysisError}
          analysisError={analysisError}
          isHost={isHost}
          restarting={busy}
          onPlayAgain={handlePlayAgain}
        />
      ) : room.status === "lobby" || !currentRound ? (
        <Lobby room={room} players={players} isHost={isHost} starting={busy} onStart={handleStart} />
      ) : currentRound.status === "results" && currentRound.evaluation ? (
        <RoundResults
          key={currentRound.id}
          room={room}
          round={currentRound}
          players={players}
          playerId={me.id}
          sessionId={sessionId}
          isHost={isHost}
          advancing={busy}
          onNextRound={handleNext}
          onQuote={handleQuote}
          highlightedAnswer={highlightedAnswer}
        />
      ) : (
        <RoundBoard
          key={currentRound.id}
          room={room}
          round={currentRound}
          players={players}
          answers={answers}
          playerId={me.id}
          isHost={isHost}
          onStop={handleStop}
        />
      )}
      </Suspense>
      <ChatDrawer
        roomId={room.id}
        playerId={me.id}
        players={players}
        locked={chatLocked}
        voiceControls={currentRound?.status === "results" && room.status === "playing"}
        open={chatOpen}
        quote={chatQuote}
        onOpenChange={setChatOpen}
        onQuoteChange={setChatQuote}
        onNavigateQuote={handleNavigateQuote}
      />
      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remover {removeTarget?.nickname}?</AlertDialogTitle><AlertDialogDescription>Este jogador sairá da sala.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); if (removeTarget) void handleRemove(removeTarget.id); }}>Remover jogador</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

type PlayerRemoval = { id: string; nickname: string };
