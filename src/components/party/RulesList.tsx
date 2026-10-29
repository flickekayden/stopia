import { PARTY_GAMES, STOP_RULES, type PartyGameId } from "@/lib/party-games";

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
