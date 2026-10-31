import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { vibrate } from "@/lib/haptics";
import { soundManager } from "@/lib/sound-manager";
import { CROWD_REACTIONS } from "@/lib/party-games";

type Float = { id: number; emoji: string; left: number };
type RealtimeChannel = ReturnType<typeof supabase.channel>;

/**
 * Result-screen crowd reactions (👏 🍅 😂 🔥): ephemeral realtime broadcasts, never stored, that float up
 * on every phone in the room. Each device sends at most one reaction every 350 ms.
 */
export function CrowdReactions({ roomId }: { roomId: string }) {
  const [floats, setFloats] = useState<Float[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSent = useRef(0);
  const nextId = useRef(0);
  const lastSound = useRef(0);

  useEffect(() => {
    const show = (emoji: string) => {
      if (!(CROWD_REACTIONS as readonly string[]).includes(emoji)) return;
      // Each reaction has its own sound; at most one every 250 ms so a burst never turns into noise.
      const now = Date.now();
      if (now - lastSound.current > 250) { lastSound.current = now; soundManager.playCrowd(emoji); }
      const id = nextId.current++;
      const left = 10 + Math.random() * 80;
      setFloats((list) => [...list.slice(-14), { id, emoji, left }]);
      window.setTimeout(() => setFloats((list) => list.filter((f) => f.id !== id)), 1_900);
    };
    const channel = supabase
      .channel(`party-crowd-${roomId}`, { config: { broadcast: { self: true } } })
      .on("broadcast", { event: "react" }, ({ payload }) => show(String((payload as { emoji?: unknown })?.emoji ?? "")))
      .subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [roomId]);

  function react(emoji: string) {
    const now = Date.now();
    if (now - lastSent.current < 350) return;
    lastSent.current = now;
    vibrate(8);
    void channelRef.current?.send({ type: "broadcast", event: "react", payload: { emoji } });
  }

  return (
    <section className="party-panel space-y-2" aria-label="Reações da galera">
      <p className="section-label">Reaja ao resultado</p>
      <div className="grid grid-cols-4 gap-2">
        {CROWD_REACTIONS.map((emoji) => (
          <Button key={emoji} type="button" variant="secondary" className="h-12 text-2xl" aria-label={`Reagir com ${emoji}`} onClick={() => react(emoji)}>{emoji}</Button>
        ))}
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto h-0 w-full max-w-md" aria-hidden="true">
        {floats.map((f) => <span key={f.id} className="crowd-float" style={{ left: `${f.left}%` }}>{f.emoji}</span>)}
      </div>
    </section>
  );
}
