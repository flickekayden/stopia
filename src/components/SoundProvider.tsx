import { Volume2, VolumeX } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { soundManager, type SoundName } from "@/lib/sound-manager";

const STORAGE_KEY = "stop-sound-enabled";

type SoundContextValue = {
  enabled: boolean;
  play: (name: SoundName) => void;
};

const SoundContext = createContext<SoundContextValue>({ enabled: true, play: () => undefined });

export function useSound() {
  return useContext(SoundContext);
}

export function SoundProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const next = stored !== "false";
    setEnabled(next);
    soundManager.configure(next);
  }, []);

  useEffect(() => {
    soundManager.configure(enabled);
  }, [enabled]);

  const play = useCallback((name: SoundName) => soundManager.play(name), []);
  const value = useMemo(() => ({ enabled, play }), [enabled, play]);

  function toggle() {
    soundManager.unlock();
    const next = !enabled;
    setEnabled(next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
    soundManager.configure(next);
    if (next) window.setTimeout(() => soundManager.play("click"), 0);
  }

  function handleInteraction(event: ReactPointerEvent<HTMLDivElement>) {
    soundManager.unlock();
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("button:not([disabled]), [role='button']:not([aria-disabled='true'])")) {
      soundManager.play("click");
    }
  }

  return (
    <SoundContext.Provider value={value}>
      <div onPointerDownCapture={handleInteraction}>{children}</div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggle}
        aria-label={enabled ? "Desativar sons" : "Ativar sons"}
        title={enabled ? "Desativar sons" : "Ativar sons"}
        className="fixed right-[max(0.75rem,calc((100vw-28rem)/2+0.75rem))] top-[calc(0.75rem+env(safe-area-inset-top))] z-40 size-12 rounded-lg bg-background/95 text-muted-foreground"
      >
        {enabled ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
      </Button>
    </SoundContext.Provider>
  );
}