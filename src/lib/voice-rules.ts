/** When live voice is silenced for everyone in a group room (players must not talk), with the on-screen reason. */
export function voiceLockReason(game: string | null | undefined, status: string | null | undefined, phase: string | null | undefined): string | null {
  if (status !== "playing") return null;
  if (game === "stop" && phase === "write") return "Respostas do Stop abertas: microfones silenciados para ninguém passar cola.";
  if (game === "infiltrado" && phase === "clues") return "Hora das pistas: microfones silenciados para ninguém entregar a palavra.";
  if (game === "autor" && phase === "guess") return "Palpites anônimos: microfones silenciados para ninguém se entregar.";
  return null;
}
