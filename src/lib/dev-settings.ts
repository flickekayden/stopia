import { useSyncExternalStore } from "react";

export const DEV_KEY_STORAGE = "stop-dev-key";
export const DEV_KEY = "stop-dev-unlocked-v1";
const SETTINGS_KEY = "stop-dev-settings";

export const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"] as const;
export type GeminiModel = (typeof GEMINI_MODELS)[number];
export const SOUND_PACKS = ["padrao", "suave", "agudo", "grave", "mudo"] as const;
export type SoundPack = (typeof SOUND_PACKS)[number];

export type DevSettings = {
  buttonLayout: "default" | "reversed" | "stacked";
  colors: { primary: string; secondary: string; background: string; foreground: string };
  texts: { appTitle: string; startButton: string; stopButton: string; finishButton: string };
  scoringMode: "fixed" | "free";
  soundPack: SoundPack;
  keyboard: { autocomplete: boolean; autocorrect: boolean; spellcheck: boolean; mode?: "native" | "app" };
  quickMessages?: string[];
  ai: { prompt: string; model: GeminiModel; sarcasm: number; persona: string };
};

export const DEFAULT_QUICK_MESSAGES = ["❌ Discordo", "😂 KKKK", "⏳ Corre!", "👏 Boa"];

export const DEFAULT_DEV_SETTINGS: DevSettings = {
  buttonLayout: "default",
  colors: { primary: "", secondary: "", background: "", foreground: "" },
  texts: { appTitle: "", startButton: "", stopButton: "", finishButton: "" },
  scoringMode: "fixed",
  soundPack: "padrao",
  keyboard: { autocomplete: false, autocorrect: false, spellcheck: false, mode: "native" },
  quickMessages: DEFAULT_QUICK_MESSAGES,
  ai: { prompt: "", model: "gemini-3.6-flash", sarcasm: 8, persona: "" },
};

let devKey = false;
let settings: DevSettings = DEFAULT_DEV_SETTINGS;
let loaded = false;
const listeners = new Set<() => void>();
let snapshot = { isDev: false, settings };

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  devKey = window.localStorage.getItem(DEV_KEY_STORAGE) === DEV_KEY;
  try {
    const raw = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<DevSettings>;
    settings = {
      ...DEFAULT_DEV_SETTINGS,
      ...raw,
      colors: { ...DEFAULT_DEV_SETTINGS.colors, ...raw.colors },
      texts: { ...DEFAULT_DEV_SETTINGS.texts, ...raw.texts },
      keyboard: { ...DEFAULT_DEV_SETTINGS.keyboard, ...raw.keyboard },
      ai: { ...DEFAULT_DEV_SETTINGS.ai, ...raw.ai },
    };
  } catch {
    settings = DEFAULT_DEV_SETTINGS;
  }
  snapshot = { isDev: devKey, settings };
}

function emit() {
  snapshot = { isDev: devKey, settings };
  listeners.forEach((l) => l());
}

const SERVER_SNAPSHOT = { isDev: false, settings: DEFAULT_DEV_SETTINGS };

export function useDevSettings() {
  return useSyncExternalStore(
    subscribeDev,
    getDevSnapshot,
    getServerDevSnapshot,
  );
}

function subscribeDev(listener: () => void) {
  load();
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function getDevSnapshot() { return snapshot; }
function getServerDevSnapshot() { return SERVER_SNAPSHOT; }

/* Configurações globais salvas pelo desenvolvedor (valem para todos os aparelhos). */
export type GlobalSettings = Partial<Pick<DevSettings, "buttonLayout" | "colors" | "texts" | "scoringMode" | "keyboard" | "quickMessages">>;
let globalSettings: DevSettings = DEFAULT_DEV_SETTINGS;
const globalListeners = new Set<() => void>();
export function setGlobalSettings(g: GlobalSettings) {
  const next = {
    ...DEFAULT_DEV_SETTINGS,
    ...g,
    colors: { ...DEFAULT_DEV_SETTINGS.colors, ...g.colors },
    texts: { ...DEFAULT_DEV_SETTINGS.texts, ...g.texts },
    keyboard: { ...DEFAULT_DEV_SETTINGS.keyboard, ...g.keyboard },
    ai: DEFAULT_DEV_SETTINGS.ai,
  };
  if (JSON.stringify(next) === JSON.stringify(globalSettings)) return;
  globalSettings = next;
  globalListeners.forEach((l) => l());
}
export function useGlobalSettings() {
  return useSyncExternalStore(
    subscribeGlobal,
    getGlobalSnapshot,
    getServerGlobalSnapshot,
  );
}
function subscribeGlobal(listener: () => void) {
  globalListeners.add(listener);
  return () => globalListeners.delete(listener);
}
function getGlobalSnapshot() { return globalSettings; }
function getServerGlobalSnapshot() { return DEFAULT_DEV_SETTINGS; }

/** Configurações efetivas: as locais do desenvolvedor, ou as globais salvas para todos. */
export function useEffectiveDevSettings() {
  const { isDev, settings: s } = useDevSettings();
  const g = useGlobalSettings();
  return isDev ? s : g;
}

export function getDevSettings() {
  load();
  return devKey ? settings : globalSettings;
}

export function isDevActive() {
  load();
  return devKey;
}

export function updateDevSettings(patch: (prev: DevSettings) => DevSettings) {
  load();
  settings = patch(settings);
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  emit();
}

export function resetDevSettings() {
  updateDevSettings(() => DEFAULT_DEV_SETTINGS);
}

const TOKEN_KEY = "stop-dev-token";
export function setDevToken(token: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(TOKEN_KEY, token);
}
function devToken() {
  return typeof window === "undefined" ? undefined : window.localStorage.getItem(TOKEN_KEY) ?? undefined;
}

export function setDevKey(on: boolean) {
  if (typeof window === "undefined") return;
  load();
  if (on) window.localStorage.setItem(DEV_KEY_STORAGE, DEV_KEY);
  else window.localStorage.removeItem(DEV_KEY_STORAGE);
  devKey = on;
  emit();
}

/** Overrides de IA enviados ao servidor (só aceitos com sessão de desenvolvedor). */
export function devAiOverrides() {
  if (!isDevActive()) return undefined;
  const s = settings;
  return { prompt: s.ai.prompt || undefined, model: s.ai.model, sarcasm: s.ai.sarcasm, persona: s.ai.persona || undefined, scoringMode: s.scoringMode, token: devToken() };
}

export function devText(value: string, fallback: string) {
  return value.trim() || fallback;
}

export const AI_PRESETS = [
  { id: "max", label: "😈 Humilhação Máxima", sarcasm: 10, persona: "" },
  {
    id: "rigid",
    label: "🧐 Professor Rígido",
    sarcasm: 4,
    persona: "Professor de português rígido e seco. Seja purista: aceite só respostas literalmente corretas, com grafia certa. Comentários formais, secos e exigentes, sem gíria.",
  },
  {
    id: "friendly",
    label: "😄 Zoeira Amigável",
    sarcasm: 3,
    persona: "Amigo engraçado e carinhoso. Faça piadas leves e bem-humoradas, sem humilhar ninguém. Adequado para família e crianças.",
  },
] as const;

/* Rodada atual exposta ao painel dev (para "Refazer validação"). */
let devRoundId: string | null = null;
const roundListeners = new Set<() => void>();
export function setDevRound(id: string | null) {
  if (devRoundId === id) return;
  devRoundId = id;
  roundListeners.forEach((l) => l());
}
export function useDevRound() {
  return useSyncExternalStore(
    (l) => {
      roundListeners.add(l);
      return () => roundListeners.delete(l);
    },
    () => devRoundId,
    () => null,
  );
}

/* Which game the developer panel should configure right now (set by the group room screen). */
export type DevGameContext = "global" | "stop" | "tribunal" | "autor" | "infiltrado" | "debate" | "roleta";
let devGameContext: DevGameContext = "global";
const contextListeners = new Set<() => void>();
export function setDevGameContext(value: DevGameContext) {
  if (devGameContext === value) return;
  devGameContext = value;
  contextListeners.forEach((l) => l());
}
export function useDevGameContext() {
  return useSyncExternalStore(
    (l) => {
      contextListeners.add(l);
      return () => contextListeners.delete(l);
    },
    () => devGameContext,
    () => "global" as DevGameContext,
  );
}

export function getDevToken() {
  return devToken();
}
