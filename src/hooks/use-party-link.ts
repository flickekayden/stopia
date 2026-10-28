import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { readPublicState, readRoomGame } from "@/lib/party-games";
import { getPartyLink, getPlayer } from "@/lib/session";

type PartyRoomRow = Tables<"party_rooms">;

/**
 * For a Stop room opened from a group room: follows that group room over realtime so the
 * Stop screen knows who the group host is and when the host sends everyone back to the lobby.
 * Reads only public rows; every action still goes through session-validated server functions.
 */
export function usePartyLink(stopCode: string) {
  const [partyCode, setPartyCode] = useState<string | null>(null);
  const [room, setRoom] = useState<PartyRoomRow | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [identity, setIdentity] = useState<{ playerId: string; sessionId: string } | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const link = getPartyLink(stopCode);
    setPartyCode(link);
    const stored = link ? getPlayer(link) : null;
    setIdentity(stored?.sessionId ? { playerId: stored.playerId, sessionId: stored.sessionId } : null);
  }, [stopCode]);

  const refresh = useCallback(async () => {
    if (!partyCode) return;
    const { data, error } = await supabase.from("party_rooms").select("*").eq("code", partyCode).maybeSingle();
    if (error) return;
    if (!data) {
      setGone(true);
      setRoom(null);
      return;
    }
    setRoom(data);
    if (identity) {
      const { data: player } = await supabase.from("party_players").select("is_host").eq("id", identity.playerId).eq("room_id", data.id).maybeSingle();
      setIsHost(Boolean(player?.is_host));
    }
  }, [identity, partyCode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const roomId = room?.id;
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`party-link-${roomId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "party_rooms", filter: `id=eq.${roomId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "party_players", filter: `room_id=eq.${roomId}` }, () => void refresh())
      .subscribe();
    const poll = window.setInterval(() => void refresh(), 10_000);
    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [roomId, refresh]);

  const linked = Boolean(room && readRoomGame(room.game) === "stop" && room.status === "playing" && readPublicState(room.public_state).stopCode === stopCode.toUpperCase());

  return { partyCode, room, identity, isHost, linked, gone };
}
