/**
 * Turns any thrown value into a message a player can act on. Messages written for
 * players by the server pass through; technical ones (validation dumps, network
 * failures, database or stack details) become plain guidance instead.
 */
export const OFFLINE_MESSAGE = "Sem conexão com o jogo. Verifique a internet e tente de novo — nada do que já foi salvo se perdeu.";

const TECHNICAL = /(fetch|network|load failed|timeout|timed out|abort|ECONN|status code|unexpected token|JSON|undefined|null|TypeError|ReferenceError|Error:|violates|constraint|relation |column |permission denied|PGRST|SQL|stack|\bat\s+\S+\s+\()/i;

export function friendlyError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const message = raw.trim();
  if (!message) return fallback;
  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message)) return OFFLINE_MESSAGE;
  // Validation errors arrive as JSON arrays/objects (e.g. a nickname that is too long).
  if (message.startsWith("[") || message.startsWith("{")) return fallback;
  if (message.length > 180 || TECHNICAL.test(message)) return fallback;
  return message;
}
