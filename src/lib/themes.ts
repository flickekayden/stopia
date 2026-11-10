// Device-local colour schemes every player can pick on the home screen.
// Token values live in src/styles.css under :root[data-theme="…"]; this module only names them.

export type ThemeId = "ceu" | "premium" | "neon" | "brasa" | "floresta" | "festa" | "caderno";

export interface AppTheme {
  id: ThemeId;
  name: string;
  description: string;
  /** Preview swatches: background, card, accent. */
  swatches: [string, string, string];
}

export const DEFAULT_THEME: ThemeId = "ceu";
export const THEME_STORAGE_KEY = "stopia-theme";

export const THEMES: readonly AppTheme[] = [
  { id: "ceu", name: "Céu", description: "Azul claro com vidro jateado", swatches: ["#E3F0FB", "#FFFFFF", "#2563EB"] },
  { id: "premium", name: "Clássico", description: "Grafite e amarelo elétrico", swatches: ["#101114", "#1C1E23", "#FFD429"] },
  { id: "neon", name: "Neon", description: "Azul-noite e ciano", swatches: ["#0B1022", "#151C36", "#3FE0E8"] },
  { id: "brasa", name: "Brasa", description: "Carvão quente e laranja", swatches: ["#160F0C", "#241914", "#FF7A2F"] },
  { id: "floresta", name: "Floresta", description: "Verde profundo e lima", swatches: ["#0C1511", "#14231C", "#B6F03C"] },
  { id: "festa", name: "Festa", description: "Ameixa e rosa choque", swatches: ["#170C17", "#251526", "#FF5FA8"] },
  { id: "caderno", name: "Caderno", description: "Papel claro e tinta azul", swatches: ["#F6F3EA", "#FFFFFF", "#2F5BD3"] },
];

export function sanitizeTheme(value: unknown): ThemeId {
  return THEMES.some((theme) => theme.id === value) ? (value as ThemeId) : DEFAULT_THEME;
}

/** Inline script for <head>: applies the saved theme before first paint to avoid a colour flash. */
// "premium" uses the plain :root tokens; every other scheme (including the default) is set on <html data-theme>.
export const THEME_BOOT_SCRIPT = `(function(){var t=${JSON.stringify(DEFAULT_THEME)};try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${JSON.stringify(THEMES.map((theme) => theme.id))}.indexOf(s)>=0)t=s}catch(e){}document.documentElement.setAttribute("data-theme",t)})()`;

type Listener = () => void;
const listeners = new Set<Listener>();
let current: ThemeId | null = null;

export function readTheme(): ThemeId {
  if (current) return current;
  if (typeof window === "undefined") return DEFAULT_THEME;
  try { current = sanitizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY)); }
  catch { current = DEFAULT_THEME; }
  return current;
}

export function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  root.setAttribute("data-theme", id);
}

export function setTheme(id: ThemeId) {
  const next = sanitizeTheme(id);
  current = next;
  try { window.localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* Private mode: keep it for this visit only. */ }
  applyTheme(next);
  listeners.forEach((listener) => listener());
}

export function subscribeTheme(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
