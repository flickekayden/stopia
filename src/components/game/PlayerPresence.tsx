import { memo, useEffect, useState } from "react";

import type { Player } from "@/hooks/use-room";

const OFFLINE_AFTER_MS = 20_000;

export function isPlayerOnline(player: Player, now = Date.now()) {
  return player.is_online && now - new Date(player.last_seen).getTime() <= OFFLINE_AFTER_MS;
}

export const PlayerPresence = memo(function PlayerPresence({ player, showOnlineText = false }: { player: Player; showOnlineText?: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (!player.is_online) return;
    const remaining = new Date(player.last_seen).getTime() + OFFLINE_AFTER_MS - Date.now();
    if (remaining < 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), remaining + 1);
    return () => window.clearTimeout(timer);
  }, [player.is_online, player.last_seen]);

  const online = isPlayerOnline(player, now);

  return (
    <span className={`inline-flex shrink-0 items-center gap-1 text-xs ${online ? "text-success" : "text-muted-foreground"}`}>
      <span className={`size-2 rounded-full ${online ? "bg-success" : "bg-muted-foreground"}`} aria-hidden="true" />
      <span>{online ? (showOnlineText ? "Online" : "") : "Ausente"}</span>
      <span className="sr-only">{online ? "Online" : "Ausente"}</span>
    </span>
  );
});