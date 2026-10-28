import { PARTY_GAMES, type PartyGameId } from "@/lib/party-games";

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
