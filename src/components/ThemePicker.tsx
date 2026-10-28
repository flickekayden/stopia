import { useSyncExternalStore, type KeyboardEvent } from "react";
import { Check, Palette } from "lucide-react";

import { useSound } from "@/components/SoundProvider";
import { DEFAULT_THEME, THEMES, readTheme, setTheme, subscribeTheme, type ThemeId } from "@/lib/themes";

export function useAppTheme(): ThemeId {
  return useSyncExternalStore(subscribeTheme, readTheme, () => DEFAULT_THEME);
}

export function ThemePicker() {
  const active = useAppTheme();
  const { play } = useSound();

  function choose(id: ThemeId) {
    if (id === active) return;
    setTheme(id);
    play("tap");
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const index = THEMES.findIndex((theme) => theme.id === active);
    const next = THEMES[(index + step + THEMES.length) % THEMES.length];
    choose(next.id);
    (event.currentTarget.querySelector(`[data-theme-id="${next.id}"]`) as HTMLButtonElement | null)?.focus();
  }

  return (
    <section className="space-y-3" aria-labelledby="hub-tema">
      <h2 id="hub-tema" className="section-label flex items-center gap-1.5"><Palette className="size-3.5" aria-hidden="true" /> Tema do jogo</h2>
      <div role="radiogroup" aria-labelledby="hub-tema" className="grid grid-cols-3 gap-2" onKeyDown={onKeyDown}>
        {THEMES.map((theme) => {
          const checked = theme.id === active;
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              data-theme-id={theme.id}
              title={theme.description}
              className="theme-option"
              onClick={() => choose(theme.id)}
            >
              <span className="theme-swatch" aria-hidden="true">
                {theme.swatches.map((color, index) => <span key={index} style={{ background: color }} />)}
              </span>
              <span className="flex items-center justify-between gap-1 text-sm font-bold leading-tight">
                {theme.name}
                {checked && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Vale só para este aparelho. Cada jogador escolhe o seu.</p>
    </section>
  );
}
