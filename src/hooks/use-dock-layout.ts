import { useEffect } from "react";

/** Keep scroll clearance and floating controls aligned with the active game dock. */
export function useDockLayout() {
  useEffect(() => {
    const root = document.documentElement;
    const frame = document.querySelector(".mobile-app-frame");
    if (!frame) return;
    let dock: HTMLElement | null = null;
    const measure = () => {
      const height = dock && getComputedStyle(dock).position === "fixed" ? dock.getBoundingClientRect().height : 0;
      root.style.setProperty("--active-dock-height", `${Math.ceil(height)}px`);
    };
    const resize = new ResizeObserver(measure);
    const observe = () => {
      const next = frame.querySelector<HTMLElement>(".mobile-bottom-bar");
      if (next === dock) return;
      resize.disconnect();
      dock = next;
      if (dock) resize.observe(dock);
      measure();
    };
    const mutations = new MutationObserver(observe);
    mutations.observe(frame, { childList: true, subtree: true });
    observe();
    window.addEventListener("resize", measure);
    return () => {
      mutations.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--active-dock-height");
    };
  }, []);
}