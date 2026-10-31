import { lazy, Suspense, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getGlobalSettings } from "@/lib/game.functions";
import { setGlobalSettings, useDevSettings, type GlobalSettings } from "@/lib/dev-settings";
import { useDockLayout } from "@/hooks/use-dock-layout";
import { useAppTheme } from "@/components/ThemePicker";
import { applyTheme } from "@/lib/themes";

const DevPanel = lazy(() => import("@/components/DevPanel").then((module) => ({ default: module.DevPanel })));

export function SettingsRuntime() {
  useDockLayout();
  const { isDev } = useDevSettings();
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
    // Colours come only from the player's theme; old admin colour overrides are cleared and no longer applied.
    for (const key of ["primary", "secondary", "background", "foreground"] as const) root.style.removeProperty(`--${key}`);
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      const probe = document.createElement("span");
      probe.style.color = "var(--background)";
      root.appendChild(probe);
      themeMeta.setAttribute("content", getComputedStyle(probe).color);
      probe.remove();
    }
  }, [theme]);
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
  useEffect(() => {
    if (!isDev) return;
    let active = true;
    let running = false;
    const check = async (forceRenew = false) => {
      if (running || document.hidden) return;
      running = true;
      try {
        const { ensureDevAccess } = await import("@/lib/dev-access");
        const result = await ensureDevAccess({ forceRenew });
        if (!active) return;
        if (result === "signed_out") toast.info("Modo desenvolvedor desligado: entre com a conta de administrador e toque 5 vezes no título para ligar de novo.");
        if (result === "not_admin") toast.info("Modo desenvolvedor desligado: a conta conectada não é administradora.");
      } finally {
        running = false;
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 10 * 60_000);
    const onVisible = () => { if (!document.hidden) void check(); };
    document.addEventListener("visibilitychange", onVisible);
    let unsubscribe: (() => void) | undefined;
    void import("@/lib/account-client").then(({ onAccountChange }) => {
      if (!active) return;
      const off = onAccountChange(() => void check(true));
      unsubscribe = () => { off(); };
    });
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe?.();
    };
  }, [isDev]);
  return isDev ? <Suspense fallback={null}><DevPanel /></Suspense> : null;
}