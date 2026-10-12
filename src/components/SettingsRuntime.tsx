import { lazy, Suspense, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getGlobalSettings } from "@/lib/game.functions";
import { setGlobalSettings, useDevSettings, useEffectiveDevSettings, type GlobalSettings } from "@/lib/dev-settings";

const DevPanel = lazy(() => import("@/components/DevPanel").then((module) => ({ default: module.DevPanel })));

export function SettingsRuntime() {
  const { isDev } = useDevSettings();
  const effective = useEffectiveDevSettings();
  const fetchGlobal = useServerFn(getGlobalSettings);
  useEffect(() => {
    const root = document.documentElement;
    for (const key of ["primary", "secondary", "background", "foreground"] as const) {
      const value = effective.colors[key];
      if (value) root.style.setProperty(`--${key}`, value);
      else root.style.removeProperty(`--${key}`);
    }
  }, [effective.colors]);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const pull = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const settings = await fetchGlobal();
        if (active) setGlobalSettings(settings as GlobalSettings);
      } catch { /* Keep the last confirmed settings during transient failures. */ }
      finally { inFlight = false; }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 30_000);
    window.addEventListener("focus", pull);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", pull); };
  }, [fetchGlobal]);
  return isDev ? <Suspense fallback={null}><DevPanel /></Suspense> : null;
}