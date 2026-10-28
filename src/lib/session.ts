const KEY = "stop-player";
const SESSION_KEY = "stop-session-id";

type Stored = Record<string, { playerId: string; nickname: string; sessionId?: string }>;

function read(): Stored {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Stored;
  } catch {
    return {};
  }
}

export function getOrCreateSessionId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) {
    return existing;
  }
  const sessionId = window.crypto.randomUUID();
  window.localStorage.setItem(SESSION_KEY, sessionId);
  return sessionId;
}

export function savePlayer(code: string, playerId: string, nickname: string, sessionId = getOrCreateSessionId()) {
  if (typeof window === "undefined") return;
  const all = read();
  all[code.toUpperCase()] = { playerId, nickname, sessionId };
  window.localStorage.setItem(KEY, JSON.stringify(all));
}

export function getPlayer(code: string) {
  return read()[code.toUpperCase()] ?? null;
}

export function removePlayer(code: string) {
  if (typeof window === "undefined") return;
  const all = read();
  delete all[code.toUpperCase()];
  window.localStorage.setItem(KEY, JSON.stringify(all));
}

export function getLastNickname() {
  const all = Object.values(read());
  return all.at(-1)?.nickname ?? "";
}

/* Stop rooms opened from a group room remember their group so players can return together. */
const LINK_KEY = "stop-party-links";

function readLinks(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(LINK_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function savePartyLink(stopCode: string, partyCode: string) {
  if (typeof window === "undefined") return;
  const all = readLinks();
  all[stopCode.toUpperCase()] = partyCode.toUpperCase();
  window.localStorage.setItem(LINK_KEY, JSON.stringify(all));
}

export function getPartyLink(stopCode: string) {
  return readLinks()[stopCode.toUpperCase()] ?? null;
}

export function removePartyLink(stopCode: string) {
  if (typeof window === "undefined") return;
  const all = readLinks();
  delete all[stopCode.toUpperCase()];
  window.localStorage.setItem(LINK_KEY, JSON.stringify(all));
}
