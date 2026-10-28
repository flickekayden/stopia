import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Loader2, Users } from "lucide-react";
import { toast } from "sonner";

import { PartyIcon } from "@/components/party/PartyIcon";
import { useSound } from "@/components/SoundProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createPartyRoom, joinPartyRoom } from "@/lib/party.functions";
import { PARTY_GAMES, PARTY_GAME_IDS, type PartyGameId } from "@/lib/party-games";
import { getLastNickname, getOrCreateSessionId, savePlayer } from "@/lib/session";

export const Route = createFileRoute("/jogos")({
  head: () => ({
    meta: [
      { title: "Central de Jogos do Stopia — jogos para jogar com os amigos" },
      { name: "description", content: "Stop, Tribunal dos Amigos, Quem Escreveu Essa Desgraça?, Infiltrado, Debate Impossível e Roleta do Caos: seis jogos em grupo no celular." },
      { property: "og:title", content: "Central de Jogos do Stopia" },
      { property: "og:description", content: "Seis jogos para grupos de amigos, direto no celular e sem cadastro." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GamesHub,
});

function GamesHub() {
  const navigate = useNavigate();
  const { play } = useSound();
  const create = useServerFn(createPartyRoom);
  const join = useServerFn(joinPartyRoom);
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<PartyGameId | "join" | null>(null);
  const [rulesFor, setRulesFor] = useState<PartyGameId | null>(null);
  const [nicknameError, setNicknameError] = useState(false);

  useEffect(() => {
    getOrCreateSessionId();
    setNickname(getLastNickname());
  }, []);

  function requireNickname() {
    if (nickname.trim()) return true;
    setNicknameError(true);
    play("error");
    toast.error("Coloca um apelido primeiro");
    document.getElementById("hub-apelido")?.focus();
    return false;
  }

  async function handleCreate(game: PartyGameId) {
    if (!requireNickname() || busy) return;
    setBusy(game);
    try {
      const sessionId = getOrCreateSessionId();
      const res = await create({ data: { game, nickname: nickname.trim(), sessionId } });
      play("create");
      savePlayer(res.code, res.playerId, nickname.trim(), sessionId);
      navigate({ to: "/festa/$code", params: { code: res.code } });
    } catch (error) {
      play("error");
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a sala");
    } finally {
      setBusy(null);
    }
  }

  async function handleJoin(event: React.FormEvent) {
    event.preventDefault();
    if (!requireNickname() || busy) return;
    if (code.trim().length !== 4) {
      play("error");
      toast.error("O código da sala tem 4 caracteres");
      return;
    }
    setBusy("join");
    try {
      const sessionId = getOrCreateSessionId();
      const res = await join({ data: { code: code.trim(), nickname: nickname.trim(), sessionId } });
      if (res.kind === "stop") {
        navigate({ to: "/sala/$code", params: { code: res.code } });
        return;
      }
      savePlayer(res.code, res.playerId, nickname.trim(), sessionId);
      navigate({ to: "/festa/$code", params: { code: res.code } });
    } catch (error) {
      play("error");
      toast.error(error instanceof Error ? error.message : "Não foi possível entrar na sala");
    } finally {
      setBusy(null);
    }
  }

  const rules = rulesFor ? PARTY_GAMES[rulesFor] : null;

  return (
    <main className="game-screen mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-6 px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <header className="space-y-3 pr-14">
        <Button asChild variant="ghost" className="-ml-3 px-3 text-muted-foreground">
          <Link to="/"><ArrowLeft /> Voltar ao Stop</Link>
        </Button>
        <h1 className="font-display text-5xl leading-none text-primary">Central de Jogos</h1>
        <p className="text-base text-muted-foreground">Seis jogos para a galera, no celular e sem cadastro. Escolha um e chame os amigos.</p>
      </header>

      <section className="space-y-2">
        <label htmlFor="hub-apelido" className="section-label block">Seu apelido</label>
        <Input
          id="hub-apelido"
          value={nickname}
          maxLength={20}
          autoComplete="nickname"
          placeholder="Ex.: Juninho"
          aria-invalid={nicknameError && !nickname.trim()}
          onChange={(event) => { setNickname(event.target.value); setNicknameError(false); }}
          className="h-14 text-lg"
        />
      </section>

      <section className="space-y-3" aria-label="Jogos disponíveis">
        <article data-game="stop" className="party-card p-4" style={{ "--enter-index": 0 } as React.CSSProperties}>
          <div className="flex items-start gap-3">
            <span className="party-icon size-12"><PartyIcon name="stop" className="size-6" /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold leading-tight">Stop</h2>
              <p className="mt-1 text-sm text-muted-foreground">O clássico Adedonha com o juiz de IA sarcástico de sempre.</p>
            </div>
          </div>
          <Button asChild className="mt-4 h-12 w-full"><Link to="/">Jogar Stop <ArrowRight /></Link></Button>
        </article>

        {PARTY_GAME_IDS.map((id, index) => {
          const game = PARTY_GAMES[id];
          return (
            <article key={id} data-game={id} className="party-card p-4" style={{ "--enter-index": index + 1 } as React.CSSProperties}>
              <div className="flex items-start gap-3">
                <span className="party-icon size-12"><PartyIcon name={game.icon} className="size-6" /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-balance-safe text-lg font-bold leading-tight">{game.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{game.short}</p>
                  <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground"><Users className="size-3.5" aria-hidden="true" /> {game.minPlayers}+ jogadores</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-2">
                <Button variant="secondary" onClick={() => setRulesFor(id)} aria-label={`Como jogar ${game.name}`}><BookOpen /> Regras</Button>
                <Button className="party-accent-button shadow-none" disabled={busy !== null} aria-busy={busy === id} onClick={() => void handleCreate(id)}>
                  {busy === id ? <Loader2 className="animate-spin" /> : null}
                  {busy === id ? "Criando sala…" : "Criar sala"}
                </Button>
              </div>
            </article>
          );
        })}
      </section>

      <form onSubmit={handleJoin} className="party-panel space-y-3" aria-labelledby="hub-join-title">
        <h2 id="hub-join-title" className="text-lg font-bold">Tem um código?</h2>
        <p className="text-sm text-muted-foreground">Funciona para qualquer jogo da central, inclusive o Stop.</p>
        <div className="flex gap-2">
          <Input
            value={code}
            maxLength={4}
            aria-label="Código da sala"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="ABCD"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            className="h-14 min-w-0 flex-1 text-center font-display text-2xl tracking-[0.3em]"
          />
          <Button type="submit" className="h-14 px-5" disabled={busy !== null} aria-busy={busy === "join"}>
            {busy === "join" ? <Loader2 className="animate-spin" /> : <ArrowRight />} Entrar
          </Button>
        </div>
      </form>

      <Dialog open={rules !== null} onOpenChange={(open) => !open && setRulesFor(null)}>
        <DialogContent className="max-h-[85dvh] w-[calc(100%_-_2rem)] overflow-y-auto rounded-2xl border-border bg-card" data-game={rules?.id}>
          {rules && (
            <>
              <DialogHeader>
                <DialogTitle className="party-accent">{rules.name}</DialogTitle>
                <DialogDescription>{rules.description}</DialogDescription>
              </DialogHeader>
              <RulesList game={rules.id} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}

export function RulesList({ game }: { game: PartyGameId }) {
  const meta = PARTY_GAMES[game];
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="section-label mb-2">Como jogar</p>
        <ol className="list-decimal space-y-1.5 pl-5">{meta.rules.map((rule) => <li key={rule}>{rule}</li>)}</ol>
      </div>
      <div>
        <p className="section-label mb-2">Pontuação</p>
        <ul className="list-disc space-y-1.5 pl-5">{meta.scoring.map((rule) => <li key={rule}>{rule}</li>)}</ul>
      </div>
      <p className="text-xs text-muted-foreground">Mínimo de {meta.minPlayers} jogadores · tudo é escrito no app.</p>
    </div>
  );
}
