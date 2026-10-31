import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Clock, Dices, Loader2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";

import { CreditBadge } from "@/components/credits/CreditBadge";
import { DevUnlock } from "@/components/DevUnlock";
import { InstallApp } from "@/components/InstallApp";
import { PartyIcon } from "@/components/party/PartyIcon";
import { GameRulesDialog } from "@/components/party/RulesList";
import { useSound } from "@/components/SoundProvider";
import { ThemePicker } from "@/components/ThemePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { vibrate } from "@/lib/haptics";
import { randomNickname } from "@/lib/nicknames";
import { createPartyRoom, joinPartyRoom } from "@/lib/party.functions";
import { LOBBY_GAMES, type LobbyGameId } from "@/lib/party-games";
import { getLastNickname, getOrCreateSessionId, savePlayer } from "@/lib/session";
import { friendlyError } from "@/lib/friendly-error";
import { useMyCredits } from "@/hooks/use-credits";
import { creditCredentials, setGuestToken } from "@/lib/account-client";
import { HOME_SHARE_IMAGE } from "@/lib/share-images";

const HOME_OG_IMAGE = HOME_SHARE_IMAGE;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Central de Jogos do Stopia — jogos para jogar com os amigos" },
      { name: "description", content: "Crie uma sala da galera e escolham juntos: Stop, Tribunal dos Amigos, Quem Escreveu Essa Desgraça?, Infiltrado, Debate Impossível ou Roleta do Caos." },
      { property: "og:title", content: "Central de Jogos do Stopia" },
      { property: "og:description", content: "Uma sala para a galera e seis jogos para escolher, direto no celular e sem cadastro." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: HOME_OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: HOME_OG_IMAGE },
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
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [rulesFor, setRulesFor] = useState<LobbyGameId | null>(null);
  const [nicknameError, setNicknameError] = useState(false);
  const credits = useMyCredits();

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

  async function handleCreate() {
    if (!requireNickname() || busy) return;
    setBusy("create");
    try {
      const sessionId = getOrCreateSessionId();
      const res = await create({ data: { nickname: nickname.trim(), sessionId, ...(await creditCredentials()) } });
      if (res.newGuestToken) setGuestToken(res.newGuestToken);
      if (res.freeDenied) toast.info("As solicitações grátis deste aparelho/rede já foram usadas hoje. Crie uma conta ou compre um pacote para jogar com IA.");
      play("create");
      savePlayer(res.code, res.playerId, nickname.trim(), sessionId);
      navigate({ to: "/festa/$code", params: { code: res.code } });
    } catch (error) {
      play("error");
      toast.error(friendlyError(error, "Não foi possível criar a sala. Tente de novo."));
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
      savePlayer(res.code, res.playerId, nickname.trim(), sessionId);
      navigate({ to: "/festa/$code", params: { code: res.code } });
    } catch (error) {
      play("error");
      toast.error(friendlyError(error, "Não foi possível entrar na sala. Confira o código e o apelido (até 20 letras)."));
    } finally {
      setBusy(null);
    }
  }


  return (
    <main className="game-screen mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-6 px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <header className="space-y-3 top-actions-clear pt-2">
        <h1 className="font-display text-5xl leading-none text-primary"><DevUnlock>Central de Jogos</DevUnlock></h1>
        <p className="text-base text-muted-foreground">Reúna a galera numa sala só e escolham juntos o que jogar. No celular e sem cadastro obrigatório.</p>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" className="h-11 px-4">
            <Link to={credits.signedIn ? "/perfil" : "/entrar"}><UserRound /> {credits.signedIn ? "Meu Stopia" : "Entrar"}</Link>
          </Button>
          {!credits.signedIn && <Button asChild variant="ghost" className="h-11 px-3 text-sm"><Link to="/perfil">Meu saldo</Link></Button>}
        </div>
      </header>

      <CreditBadge status={credits.status} summary={credits.summary} onRetry={() => void credits.refresh()} />

      <section className="party-panel space-y-4" aria-labelledby="hub-entrada">
        <h2 id="hub-entrada" className="sr-only">Entrar na brincadeira</h2>
        <div className="space-y-2">
          <label htmlFor="hub-apelido" className="section-label block">Seu apelido</label>
          <div className="flex gap-2">
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
            <Button type="button" variant="secondary" size="icon" className="size-14 shrink-0" aria-label="Sortear apelido engraçado" title="Sortear apelido" onClick={() => { setNickname((current) => randomNickname(Math.random, current)); setNicknameError(false); vibrate(10); }}>
              <Dices className="size-6" />
            </Button>
          </div>
        </div>
        <Button className="h-14 w-full text-lg font-bold" disabled={busy !== null} aria-busy={busy === "create"} onClick={() => void handleCreate()}>
          {busy === "create" ? <Loader2 className="animate-spin" /> : <Users />}
          {busy === "create" ? "Criando sala…" : "Criar Sala da Galera"}
        </Button>
        <form onSubmit={handleJoin} className="space-y-2" aria-labelledby="hub-join-title">
          <p id="hub-join-title" className="section-label">Entrar com código</p>
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
            <Button type="submit" variant="secondary" className="h-14 px-5" disabled={busy !== null} aria-busy={busy === "join"}>
              {busy === "join" ? <Loader2 className="animate-spin" /> : <ArrowRight />} Entrar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Todos os jogos, incluindo o Stop, acontecem nesta sala. Só quem cria a sala gasta solicitações de IA.</p>
        </form>
        <p className="text-xs text-muted-foreground">Ao criar ou entrar numa sala você aceita os <Link to="/termos" className="underline">Termos e regras de convivência</Link> e a <Link to="/privacidade" className="underline">Política de privacidade</Link>.</p>
      </section>

      <ThemePicker />

      <section className="space-y-3" aria-labelledby="hub-vitrine">
        <h2 id="hub-vitrine" className="section-label">Jogos da sala</h2>
        {LOBBY_GAMES.map((game, index) => (
          <article key={game.id} data-game={game.id} className="party-card p-4" style={{ "--enter-index": index } as React.CSSProperties}>
            <div className="flex items-start gap-3">
              <span className="party-icon size-12"><PartyIcon name={game.icon} className="size-6" /></span>
              <div className="min-w-0 flex-1">
                <h3 className="text-balance-safe text-lg font-bold leading-tight">{game.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{game.short}</p>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden="true" /> {game.minPlayers}+ jogadores</span>
                  <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden="true" /> {game.duration}</span>
                </p>
              </div>
            </div>
            <Button variant="secondary" className="mt-4 h-12 w-full" onClick={() => setRulesFor(game.id)} aria-label={`Como jogar ${game.name}`}><BookOpen /> Regras</Button>
          </article>
        ))}
      </section>

      <GameRulesDialog game={rulesFor} onClose={() => setRulesFor(null)} />

      <InstallApp />
    </main>

  );
}
