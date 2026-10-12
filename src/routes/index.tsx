import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronDown, DoorOpen, Loader2, LockKeyhole, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useSound } from "@/components/SoundProvider";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InstallApp } from "@/components/InstallApp";
import { createRoom, joinRoom } from "@/lib/game.functions";
import { devText, setDevKey, setDevToken, useEffectiveDevSettings } from "@/lib/dev-settings";
import { deleteRoom, listRooms, unlockDeveloper } from "@/lib/room-admin.functions";
import { getLastNickname, getOrCreateSessionId, savePlayer } from "@/lib/session";

export const Route = createFileRoute("/")({
  loader: () => listRooms(),
  head: () => ({
    meta: [
      { title: "STOP! Adedonha online com os amigos" },
      {
        name: "description",
        content:
          "Crie uma sala, chame a galera e jogue Stop (Adedonha) no celular. A IA avalia as respostas e ainda tira sarro de todo mundo.",
      },
      { property: "og:title", content: "STOP! Adedonha online com os amigos" },
      {
        property: "og:description",
        content: "Crie uma sala em segundos e jogue Adedonha no celular com avaliação por IA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { play } = useSound();
  const router = useRouter();
  const { rooms, developerUnlocked } = Route.useLoaderData();
  const create = useServerFn(createRoom);
  const join = useServerFn(joinRoom);
  const unlock = useServerFn(unlockDeveloper);
  const removeRoom = useServerFn(deleteRoom);
  const [nickname, setNickname] = useState("");
  const [entryMode, setEntryMode] = useState<"create" | "join">("create");
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState<"create" | "join" | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<{ id: string; code: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getOrCreateSessionId();
    setNickname(getLastNickname());
  }, []);
  useEffect(() => {
    if (developerUnlocked) setDevKey(true);
  }, [developerUnlocked]);
  const devSettings = useEffectiveDevSettings();

  async function handleCreate() {
    if (!nickname.trim()) {
      play("error");
      toast.error("Coloca um apelido primeiro");
      return;
    }
    setLoading("create");
    try {
      const sessionId = getOrCreateSessionId();
      const res = await create({ data: { nickname: nickname.trim(), sessionId } });
      play("create");
      savePlayer(res.code, res.playerId, nickname.trim(), sessionId);
      navigate({ to: "/sala/$code", params: { code: res.code } });
    } catch (e) {
      play("error");
      toast.error(e instanceof Error ? e.message : "Deu ruim ao criar a sala");
    } finally {
      setLoading(null);
    }
  }

  async function handleJoin() {
    if (!nickname.trim()) {
      play("error");
      toast.error("Coloca um apelido primeiro");
      return;
    }
    if (code.trim().length < 4) {
      play("error");
      toast.error("Digite o código da sala");
      return;
    }
    setLoading("join");
    try {
      const sessionId = getOrCreateSessionId();
      const res = await join({ data: { code: code.trim(), nickname: nickname.trim(), sessionId } });
      savePlayer(res.code, res.playerId, nickname.trim(), sessionId);
      navigate({ to: "/sala/$code", params: { code: res.code } });
    } catch (e) {
      play("error");
      toast.error(e instanceof Error ? e.message : "Não consegui entrar na sala");
    } finally {
      setLoading(null);
    }
  }

  async function handleUnlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUnlocking(true);
    try {
      const result = await unlock({ data: { password } });
      if (!result.ok) {
        play("error");
        toast.error("Senha incorreta");
        return;
      }
      setPassword("");
      setPasswordOpen(false);
      if (result.token) setDevToken(result.token);
      setDevKey(true);
      await router.invalidate();
      toast.success("Modo desenvolvedor liberado");
    } catch (error) {
      play("error");
      toast.error(error instanceof Error ? error.message : "Não foi possível validar a senha");
    } finally {
      setUnlocking(false);
    }
  }

  async function handleDeleteRoom() {
    if (!roomToDelete) return;
    setDeleting(true);
    try {
      await removeRoom({ data: { roomId: roomToDelete.id } });
      toast.success(`Sala ${roomToDelete.code} apagada`);
      setRoomToDelete(null);
      await router.invalidate();
    } catch (error) {
      play("error");
      toast.error(error instanceof Error ? error.message : "Não foi possível apagar a sala");
    } finally {
      setDeleting(false);
    }
  }

  function chooseRoom(roomCode: string) {
    setEntryMode("join");
    setCode(roomCode);
    window.requestAnimationFrame(() => document.getElementById("codigo")?.focus());
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-7 px-5 pt-[calc(2rem+env(safe-area-inset-top))] pb-44">
      <header className="text-left">
        <div className="brand-stamp inline-block -rotate-2 rounded-xl bg-primary px-5 py-2">
          <h1 className="text-balance-safe font-display text-6xl text-primary-foreground">{devText(devSettings.texts.appTitle, "STOP!")}</h1>
        </div>
        <p className="mt-6 max-w-80 text-base leading-relaxed text-muted-foreground">
          Adedonha online com os amigos. Sem cadastro, só apelido e vergonha na cara.
        </p>
      </header>

      <section className="space-y-3">
        <label className="block text-sm font-semibold text-foreground" htmlFor="apelido">
          Seu apelido
        </label>
        <Input
          id="apelido"
          value={nickname}
          maxLength={20}
          placeholder="Ex.: Juninho"
          autoComplete="nickname"
          enterKeyHint={entryMode === "create" ? "go" : "next"}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && !loading) { if (entryMode === "create") void handleCreate(); else document.getElementById("codigo")?.focus(); } }}
          onChange={(e) => setNickname(e.target.value)}
          className="h-14 text-lg"
        />
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-border p-1" role="group" aria-label="Entrada na sala">
          <Button variant={entryMode === "create" ? "selected" : "segment"} aria-pressed={entryMode === "create"} onClick={() => setEntryMode("create")}><Plus /> Criar nova sala</Button>
          <Button variant={entryMode === "join" ? "selected" : "segment"} aria-pressed={entryMode === "join"} onClick={() => setEntryMode("join")}><DoorOpen /> Entrar com código</Button>
        </div>
      </section>

      {entryMode === "join" && <section className="space-y-3">
        <label className="text-sm font-semibold text-muted-foreground" htmlFor="codigo">
          Entrar com código
        </label>
        <Input
          id="codigo"
          value={code}
          maxLength={4}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && !loading) void handleJoin(); }}
          placeholder="ABCD"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="h-16 text-center font-display text-3xl"
        />
      </section>}

      <section className="game-section space-y-3" aria-labelledby="salas-title">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Button variant="ghost" onClick={() => setRoomsOpen((v) => !v)} aria-expanded={roomsOpen} className="justify-start px-0"><h2 id="salas-title" className="text-lg font-bold">Salas criadas</h2><ChevronDown className={`transition-transform ${roomsOpen ? "rotate-180" : ""}`} /></Button>
            <p className="text-sm text-muted-foreground">
              {rooms.length === 0 ? "Nenhuma sala por aqui." : `${rooms.length} sala${rooms.length === 1 ? "" : "s"}`}
            </p>
          </div>
          {!developerUnlocked && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Acesso de desenvolvedor"
              title="Acesso de desenvolvedor"
              onClick={() => setPasswordOpen(true)}
            >
              <LockKeyhole />
            </Button>
          )}
        </div>

        {roomsOpen && <div className="space-y-2">
          {rooms.map((room) => {
            const waiting = room.status === "lobby";
            const finished = room.status === "ended" || room.status === "finished";
            return (
              <article key={room.id} className="flex min-h-20 items-center gap-3 rounded-lg border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <strong className="font-display text-xl">{room.code}</strong>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                      {waiting ? "Aguardando" : finished ? "Encerrada" : `Rodada ${room.currentRound}/${room.totalRounds}`}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                    <Users className="size-4" aria-hidden="true" />
                    {room.playerCount} jogador{room.playerCount === 1 ? "" : "es"}
                  </div>
                </div>
                {waiting && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label={`Usar código da sala ${room.code}`}
                    title="Entrar nesta sala"
                    onClick={() => chooseRoom(room.code)}
                  >
                    <DoorOpen />
                  </Button>
                )}
                {developerUnlocked && (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    aria-label={`Apagar sala ${room.code}`}
                    title="Apagar sala"
                    onClick={() => setRoomToDelete({ id: room.id, code: room.code })}
                  >
                    <Trash2 />
                  </Button>
                )}
              </article>
            );
          })}
        </div>}
      </section>

      <div className="mobile-bottom-bar fixed inset-x-0 bottom-[var(--keyboard-inset,0px)] mx-auto w-full max-w-md space-y-3 border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur">
        <Button onClick={entryMode === "create" ? handleCreate : handleJoin} disabled={loading !== null} aria-busy={loading !== null} className="h-14 w-full text-lg font-bold">
          {loading ? <Loader2 className="animate-spin" /> : entryMode === "create" ? <Plus /> : <ArrowRight />}
          {loading === "create" ? "Criando..." : loading === "join" ? "Entrando..." : entryMode === "create" ? "Criar sala" : "Entrar na sala"}
        </Button>
        <InstallApp />
      </div>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="w-[calc(100%_-_2rem)] rounded-2xl">
          <form onSubmit={handleUnlock} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Acesso de desenvolvedor</DialogTitle>
              <DialogDescription>Digite a senha para liberar a exclusão de salas.</DialogDescription>
            </DialogHeader>
            <Input
              type="password"
              value={password}
              autoComplete="current-password"
              autoFocus
              placeholder="Senha"
              aria-label="Senha de desenvolvedor"
              onChange={(event) => setPassword(event.target.value)}
            />
            <DialogFooter>
              <Button type="submit" disabled={unlocking || !password}>
                {unlocking ? "Validando..." : "Entrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={roomToDelete !== null} onOpenChange={(open) => !open && setRoomToDelete(null)}>
        <AlertDialogContent className="w-[calc(100%_-_2rem)] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar sala {roomToDelete?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Jogadores, respostas e todas as rodadas dessa sala serão apagados definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteRoom();
              }}
            >
              {deleting ? "Apagando..." : "Apagar sala"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
