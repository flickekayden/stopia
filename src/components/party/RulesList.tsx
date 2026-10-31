import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PARTY_GAMES, STOP_LOBBY_META, STOP_RULES, type LobbyGameId, type PartyGameId } from "@/lib/party-games";

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
      <div>
        <p className="section-label mb-2">Dupla ou grupo</p>
        <p>{meta.players}</p>
      </div>
      <p className="text-xs text-muted-foreground">Mínimo de {meta.minPlayers} jogadores · tudo é escrito no app.</p>
    </div>
  );
}

/** Stop's rules; kept here (not in StopParty) so the home page never loads the Stop round code. */
export function StopRules() {
  return (
    <ul className="space-y-1.5 text-sm text-muted-foreground">
      {STOP_RULES.map((rule) => <li key={rule} className="flex gap-2"><span className="party-accent" aria-hidden="true">•</span><span>{rule}</span></li>)}
    </ul>
  );
}

/** Read-only rules window for any game, shared by the home page and the group room so both read the same. */
export function GameRulesDialog({ game, onClose }: { game: LobbyGameId | null; onClose: () => void }) {
  const rules = game && game !== "stop" ? PARTY_GAMES[game] : null;
  return (
    <Dialog open={game !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] w-[calc(100%_-_2rem)] overflow-y-auto rounded-2xl border-border bg-card" data-game={game ?? undefined}>
        {game === "stop" ? (
          <>
            <DialogHeader>
              <DialogTitle className="party-accent">{STOP_LOBBY_META.name}</DialogTitle>
              <DialogDescription>{STOP_LOBBY_META.short} Jogado dentro da sala da galera: o mestre escolhe pontuação, intensidade da IA, rodadas, tempo e categorias.</DialogDescription>
            </DialogHeader>
            <StopRules />
            <p className="text-xs text-muted-foreground">Mínimo de {STOP_LOBBY_META.minPlayers} jogadores · tudo é escrito no app.</p>
          </>
        ) : rules && (
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
  );
}
