import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { getPartyPrivateView } from "@/lib/party.functions";
import type { PartyPrivateViewData } from "@/lib/party-games";

export type PartyRoom = Tables<"party_rooms">;
export type PartyPlayer = Tables<"party_players">;
export type PartyPrivateView = PartyPrivateViewData;

/** Safety-net poll for dropped realtime connections; skipped while realtime is delivering or the tab is hidden. */
const POLL_MS = 10_000;

function byJoinOrder(a: PartyPlayer, b: PartyPlayer) {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

/**
 * Public room rows over realtime; per-player secrets only through the session-validated server view.
 * Realtime payloads are applied directly (version-guarded for the room) so a phase change costs no
 * extra request; a single embedded query re-syncs on connect, on return to the tab and as a fallback.
 */
export function usePartyRoom(code: string, identity: { playerId: string; sessionId: string } | null) {
  const [room, setRoom] = useState<PartyRoom | null>(null);
  const [players, setPlayers] = useState<PartyPlayer[]>([]);
  const [privateView, setPrivateView] = useState<PartyPrivateView | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchPrivate = useServerFn(getPartyPrivateView);
  const inFlight = useRef<Promise<void> | null>(null);
  const queued = useRef(false);
  const lastEvent = useRef(0);

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      queued.current = true;
      return inFlight.current;
    }
    const task = (async () => {
      const { data, error: roomError } = await supabase
        .from("party_rooms")
        .select("*, party_players(*)")
        .eq("code", code.toUpperCase())
        .order("created_at", { referencedTable: "party_players" })
        .maybeSingle();
      if (roomError) {
        setError("Conexão instável. Tentando de novo…");
        return;
      }
      if (!data) {
        setMissing(true);
        setLoading(false);
        return;
      }
      const { party_players: playerRows, ...roomRow } = data;
      // A realtime event may have landed while this read was in flight: keep the newer version.
      setRoom((current) => (current && current.id === roomRow.id && current.version > roomRow.version ? current : roomRow));
      setPlayers(playerRows ?? []);
      setMissing(false);
      setError(null);
      setLoading(false);
    })();
    inFlight.current = task;
    try {
      await task;
    } finally {
      inFlight.current = null;
      if (queued.current) {
        queued.current = false;
        void refresh();
      }
    }
  }, [code]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const roomId = room?.id;
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`party-${roomId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "party_rooms", filter: `id=eq.${roomId}` }, (payload) => {
        lastEvent.current = Date.now();
        if (payload.eventType === "DELETE") {
          setMissing(true);
          return;
        }
        const next = payload.new as PartyRoom;
        // Out-of-order deliveries never roll the room back to an older version.
        setRoom((current) => (current && current.id === next.id && current.version > next.version ? current : next));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "party_players", filter: `room_id=eq.${roomId}` }, (payload) => {
        lastEvent.current = Date.now();
        if (payload.eventType === "DELETE") {
          const goneId = (payload.old as Partial<PartyPlayer>).id;
          if (goneId) setPlayers((list) => list.filter((p) => p.id !== goneId));
          else void refresh();
          return;
        }
        const row = payload.new as PartyPlayer;
        setPlayers((list) => [...list.filter((p) => p.id !== row.id), row].sort(byJoinOrder));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refresh();
      });
    const poll = window.setInterval(() => {
      if (document.hidden || Date.now() - lastEvent.current < POLL_MS) return;
      void refresh();
    }, POLL_MS);
    // Phones suspend background tabs: re-sync as soon as the player comes back or the network returns.
    const resync = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("online", resync);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("online", resync);
      void supabase.removeChannel(channel);
    };
  }, [roomId, refresh]);

  // phase_started_at also changes when Roleta swaps the challenge within the same phase.
  const privateKey = room ? `${room.id}:${room.round_number}:${room.phase}:${room.status}:${room.phase_started_at ?? ""}` : null;
  const playerId = identity?.playerId;
  const sessionId = identity?.sessionId;
  const isMember = Boolean(playerId && players.some((p) => p.id === playerId));
  useEffect(() => {
    if (!privateKey || !roomId || !playerId || !sessionId || !isMember) {
      setPrivateView(null);
      return;
    }
    let cancelled = false;
    fetchPrivate({ data: { roomId, playerId, sessionId } })
      .then((view) => { if (!cancelled) setPrivateView(view as PartyPrivateViewData); })
      .catch(() => { if (!cancelled) setPrivateView(null); });
    return () => { cancelled = true; };
  }, [privateKey, roomId, playerId, sessionId, isMember, fetchPrivate]);

  return { room, players, privateView, loading, missing, error, refresh };
}
