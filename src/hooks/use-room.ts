import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Room = Tables<"rooms">;
export type Player = Tables<"players">;
export type Round = Tables<"rounds">;
export type Answer = Tables<"answers">;

const RETRY_DELAYS_MS = [0, 500, 1_200] as const;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useRoom(code: string, presenceKey: string | null) {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [channelVersion, setChannelVersion] = useState(0);
  const requestVersion = useRef(0);
  const refreshInFlight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const version = ++requestVersion.current;
    const normalizedCode = code.trim().toUpperCase();

    const task = (async () => {
      let lastError: string | null = null;
      let confirmedMissing = false;

      for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
        const delay = RETRY_DELAYS_MS[attempt] ?? 0;
        if (delay > 0) await wait(delay);

        const { data: roomRow, error: roomError } = await supabase
          .from("rooms")
          .select("*")
          .eq("code", normalizedCode)
          .maybeSingle();

        if (version !== requestVersion.current) return;
        if (roomError) {
          lastError = roomError.message;
          continue;
        }
        if (!roomRow) {
          confirmedMissing = true;
          continue;
        }

        const [{ data: p, error: playersError }, { data: r, error: roundsError }] = await Promise.all([
          supabase.from("players").select("*").eq("room_id", roomRow.id).order("created_at"),
          supabase.from("rounds").select("*").eq("room_id", roomRow.id).order("number"),
        ]);
        if (version !== requestVersion.current) return;
        if (playersError || roundsError) {
          lastError = playersError?.message ?? roundsError?.message ?? "Falha ao atualizar a sala";
          continue;
        }

        const nextRounds = r ?? [];
        const current = nextRounds[nextRounds.length - 1];
        let nextAnswers: Answer[] = [];
        if (current) {
          const { data: a, error: answersError } = await supabase
            .from("answers")
            .select("*")
            .eq("round_id", current.id);
          if (answersError) {
            lastError = answersError.message;
            continue;
          }
          nextAnswers = a ?? [];
        }

        if (version !== requestVersion.current) return;
        setRoom(roomRow);
        setPlayers(p ?? []);
        setRounds(nextRounds);
        setAnswers(nextAnswers);
        setMissing(false);
        setConnectionError(null);
        setLoading(false);
        return;
      }

      if (version !== requestVersion.current) return;
      if (confirmedMissing && !lastError) {
        setRoom(null);
        setMissing(true);
        setConnectionError(null);
      } else {
        setConnectionError("A conexão com a sala oscilou. Tente reconectar.");
      }
      setLoading(false);
    })().catch(() => {
      if (version === requestVersion.current) {
        setConnectionError("A conexão com a sala oscilou. Tente reconectar.");
        setLoading(false);
      }
    }).finally(() => {
      refreshInFlight.current = null;
    });

    refreshInFlight.current = task;
    return task;
  }, [code]);

  const reconnect = useCallback(() => {
    setConnectionError(null);
    setChannelVersion((value) => value + 1);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refresh();
    return () => {
      requestVersion.current += 1;
      refreshInFlight.current = null;
    };
  }, [refresh]);

  useEffect(() => {
    if (!room) return;
    let active = true;
    let retryTimer: number | undefined;
    const channel = supabase
      .channel(`room-${room.id}-${presenceKey ?? "viewer"}-${channelVersion}`, {
        config: { presence: { key: presenceKey ?? `viewer-${channelVersion}` } },
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${room.id}` }, () =>
        void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players", filter: `room_id=eq.${room.id}` },
        () => void refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${room.id}` },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === "SUBSCRIBED" && presenceKey) {
          void channel.track({ device_id: presenceKey, online_at: new Date().toISOString() });
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(() => {
            if (active) reconnect();
          }, 1_000);
        }
      });

    return () => {
      active = false;
      window.clearTimeout(retryTimer);
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [channelVersion, presenceKey, reconnect, refresh, room?.id]);

  const currentRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;

  useEffect(() => {
    if (!currentRound) return;
    const channel = supabase
      .channel(`answers-${currentRound.id}-${channelVersion}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "answers", filter: `round_id=eq.${currentRound.id}` },
        () => void refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelVersion, currentRound?.id, refresh]);

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === "visible" && navigator.onLine) reconnect();
    };
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [reconnect]);

  return { room, players, rounds, currentRound, answers, loading, missing, connectionError, refresh, reconnect };
}
