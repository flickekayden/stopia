import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, ExternalLink, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { getDevToken } from "@/lib/dev-settings";
import { deletePartyRoomAdmin, listPartyRoomsAdmin } from "@/lib/party.functions";
import { PARTY_GAMES, isPartyGame } from "@/lib/party-games";

type AdminRoom = Awaited<ReturnType<typeof listPartyRoomsAdmin>>[number];

const STATUS_LABELS: Record<string, string> = { lobby: "No lobby", playing: "Jogando", ended: "Terminou" };

function gameLabel(game: string) {
  if (isPartyGame(game)) return PARTY_GAMES[game].name;
  return game === "stop" ? "Stop" : "Escolhendo jogo";
}

function since(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `há ${hours} h` : `há ${Math.round(hours / 24)} d`;
}

/** Developer list of group rooms: copy/open the link or delete a room for everyone. */
export function PartyRoomsAdmin() {
  const list = useServerFn(listPartyRoomsAdmin);
  const remove = useServerFn(deletePartyRoomAdmin);
  const [rooms, setRooms] = useState<AdminRoom[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<AdminRoom | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRooms(await list({ data: { token: getDevToken() } }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar as salas.");
      setRooms((current) => current ?? []);
    } finally {
      setLoading(false);
    }
  }, [list]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function copyLink(code: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/festa/${code}`);
      toast.success("Link copiado!", { duration: 1_500 });
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  }

  async function confirmDelete() {
    if (!target) return;
    setDeleting(true);
    try {
      await remove({ data: { token: getDevToken(), roomId: target.id } });
      setRooms((current) => current?.filter((room) => room.id !== target.id) ?? null);
      toast.success(`Sala ${target.code} apagada`);
      setTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível apagar a sala.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="salas-globais-title">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="min-w-0">
          <h3 id="salas-globais-title" className="font-semibold">Salas da galera</h3>
          <p className="text-xs text-muted-foreground">Apagar tira todo mundo da sala na hora.</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Atualizar lista de salas" disabled={loading} onClick={() => void refresh()}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </Button>
      </div>

      {rooms === null ? (
        <div className="flex min-h-24 items-center justify-center" role="status" aria-label="Carregando salas"><Loader2 className="size-6 animate-spin text-primary" /></div>
      ) : rooms.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Nenhuma sala da galera aberta.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {rooms.map((room) => (
            <li key={room.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate font-display text-xl tracking-wider">{room.code}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {gameLabel(room.game)} · {STATUS_LABELS[room.status] ?? room.status} · {room.playerCount} {room.playerCount === 1 ? "jogador" : "jogadores"} · {since(room.updatedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <Button variant="ghost" size="icon" aria-label={`Copiar link da sala ${room.code}`} onClick={() => void copyLink(room.code)}><Copy /></Button>
                <Button asChild variant="ghost" size="icon"><Link to="/festa/$code" params={{ code: room.code }} aria-label={`Abrir sala ${room.code}`}><ExternalLink /></Link></Button>
                <Button variant="ghost" size="icon" className="text-destructive" aria-label={`Apagar sala ${room.code}`} onClick={() => setTarget(room)}><Trash2 /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={target !== null} onOpenChange={(open) => { if (!open && !deleting) setTarget(null); }}>
        <AlertDialogContent className="w-[calc(100%_-_2rem)] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar a sala {target?.code}?</AlertDialogTitle>
            <AlertDialogDescription>Os {target?.playerCount ?? 0} jogadores saem da sala e o progresso é perdido. Não dá para desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={(event) => { event.preventDefault(); void confirmDelete(); }}>
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />} Apagar sala
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
