import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { getPartyPrivateView } from "@/lib/party.functions";

export type PartyRoom = Tables<"party_rooms">;
export type PartyPlayer = Tables<"party_players">;
export type PartyPrivateView = Awaited<ReturnType<typeof getPartyPrivateView>>;

/** Public room rows over realtime; per-player secrets only through the session-validated server view. */
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

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      queued.current = true;
      return inFlight.current;
    }
    const task = (async () => {
      const { data: roomRow, error: roomError } = await supabase.from("party_rooms").select("*").eq("code", code.toUpperCase()).maybeSingle();
      if (roomError) {
        setError("Conexão instável. Tentando de novo…");
        return;
      }
      if (!roomRow) {
        setMissing(true);
        setLoading(false);
        return;
      }
      const { data: playerRows } = await supabase.from("party_players").select("*").eq("room_id", roomRow.id).order("created_at");
      setRoom(roomRow);
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
      .channel(`party-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "party_rooms", filter: `id=eq.${roomId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "party_players", filter: `room_id=eq.${roomId}` }, () => void refresh())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refresh();
      });
    // Safety net when realtime drops: a light poll keeps every screen on the right step.
    const poll = window.setInterval(() => void refresh(), 8_000);
    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [roomId, refresh]);

  const privateKey = room ? `${room.id}:${room.round_number}:${room.phase}:${room.status}` : null;
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
      .then((view) => { if (!cancelled) setPrivateView(view); })
      .catch(() => { if (!cancelled) setPrivateView(null); });
    return () => { cancelled = true; };
  }, [privateKey, roomId, playerId, sessionId, isMember, fetchPrivate]);

  return { room, players, privateView, loading, missing, error, refresh };
}
