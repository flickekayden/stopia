import { lazy, Suspense, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getGlobalSettings } from "@/lib/game.functions";
import { setGlobalSettings, useDevSettings, useEffectiveDevSettings, type GlobalSettings } from "@/lib/dev-settings";
import { useDockLayout } from "@/hooks/use-dock-layout";
import { useAppTheme } from "@/components/ThemePicker";
import { DEFAULT_THEME, applyTheme } from "@/lib/themes";

const DevPanel = lazy(() => import("@/components/DevPanel").then((module) => ({ default: module.DevPanel })));

export function SettingsRuntime() {
  useDockLayout();
  const { isDev } = useDevSettings();
  const effective = useEffectiveDevSettings();
  const fetchGlobal = useServerFn(getGlobalSettings);
  const theme = useAppTheme();
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => document.documentElement.style.setProperty("--keyboard-inset", `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => { viewport.removeEventListener("resize", update); viewport.removeEventListener("scroll", update); document.documentElement.style.removeProperty("--keyboard-inset"); };
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    applyTheme(theme);
    // Admin colour overrides only tint the default scheme; a player-chosen theme keeps its own palette.
    const useOverrides = theme === DEFAULT_THEME;
    for (const key of ["primary", "secondary", "background", "foreground"] as const) {
      const value = useOverrides ? effective.colors[key] : "";
      if (value) root.style.setProperty(`--${key}`, value);
      else root.style.removeProperty(`--${key}`);
    }
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      const probe = document.createElement("span");
      probe.style.color = "var(--background)";
      root.appendChild(probe);
      themeMeta.setAttribute("content", getComputedStyle(probe).color);
      probe.remove();
    }
  }, [effective.colors, theme]);
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