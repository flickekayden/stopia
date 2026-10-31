import { useServerFn } from "@tanstack/react-start";
import { Bot, Crown, Loader2, LogOut, RotateCcw, SkipForward, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getDevToken, useDevRoom } from "@/lib/dev-settings";
import { MAX_BOTS } from "@/lib/party-bots";
import { PHASE_LABELS, isPartyGame, lobbyGameMeta, type PartyPhaseId } from "@/lib/party-games";
import { devRoomAction } from "@/lib/party.functions";

type Action = "addBot" | "removeBots" | "kick" | "forceAdvance" | "toLobby";

/** Developer controls for the group room on screen: training bots, skip a stuck step, kick, reset. */
export function DevRoomControls() {
  const room = useDevRoom();
  const run = useServerFn(devRoomAction);
  const [busy, setBusy] = useState<string | null>(null);
  if (!room) return null;
  const current = room;

  async function act(action: Action, targetId?: string, done?: string) {
    setBusy(targetId ? `${action}:${targetId}` : action);
    try {
      await run({ data: { roomId: current.roomId, playerId: current.playerId, sessionId: current.sessionId, token: getDevToken(), action, ...(targetId ? { targetId } : {}) } });
      if (done) toast.success(done, { duration: 1_500 });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível fazer isso.");
    } finally {
      setBusy(null);
    }
  }

  const bots = room.players.filter((p) => p.isBot).length;
  const playing = room.status === "playing";
  const gameName = room.game === "lobby" ? "Escolhendo jogo" : room.game === "stop" || isPartyGame(room.game) ? lobbyGameMeta(room.game).name : room.game;
  const phase = PHASE_LABELS[room.phase as PartyPhaseId] ?? room.phase;

  return (
    <section className="space-y-3 rounded-2xl border border-border p-3" aria-labelledby="dev-room-title">
      <div>
        <h3 id="dev-room-title" className="font-semibold">Sala {room.code}</h3>
        <p className="text-xs text-muted-foreground">{gameName} · {playing ? phase : room.status === "ended" ? "Fim de jogo" : "No lobby"} · {room.players.length} na sala</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">🤖 Treino com robôs <span className="tabular-nums text-muted-foreground">({bots}/{MAX_BOTS})</span></p>
        <p className="text-xs text-muted-foreground">Os robôs jogam todos os jogos: escrevem, votam e às vezes gritam STOP. Adicione antes de começar a partida.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={busy !== null || playing || bots >= MAX_BOTS} onClick={() => void act("addBot", undefined, "Robô entrou na sala")}>
            {busy === "addBot" ? <Loader2 className="animate-spin" /> : <Bot />} Adicionar robô
          </Button>
          <Button variant="outline" disabled={busy !== null || bots === 0} onClick={() => void act("removeBots", undefined, "Robôs removidos")}>
            {busy === "removeBots" ? <Loader2 className="animate-spin" /> : <Trash2 />} Remover robôs
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Controle da partida</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={busy !== null || !playing} onClick={() => void act("forceAdvance", undefined, "Etapa encerrada")}>
            {busy === "forceAdvance" ? <Loader2 className="animate-spin" /> : <SkipForward />} Pular etapa
          </Button>
          <Button variant="outline" disabled={busy !== null || (room.game === "lobby" && room.status === "lobby")} onClick={() => void act("toLobby", undefined, "Todos de volta ao lobby")}>
            {busy === "toLobby" ? <Loader2 className="animate-spin" /> : <RotateCcw />} Voltar ao lobby
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">“Pular etapa” fecha o tempo agora (útil quando alguém travou). Com o juiz de IA preso, tenta de novo.</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-semibold">Jogadores</p>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {room.players.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-sm">
                {p.isHost && <Crown className="mr-1 inline size-3.5 text-primary" aria-label="mestre" />}
                {p.isBot && <Bot className="mr-1 inline size-3.5 text-muted-foreground" aria-label="robô" />}
                {p.nickname}{p.id === room.playerId ? " (você)" : ""}
              </span>
              {p.id !== room.playerId && (
                <Button variant="ghost" size="icon" className="text-destructive" aria-label={`Tirar ${p.nickname} da sala`} disabled={busy !== null} onClick={() => void act("kick", p.id, `${p.nickname} saiu da sala`)}>
                  {busy === `kick:${p.id}` ? <Loader2 className="animate-spin" /> : <LogOut />}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
