import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getVoicePlayback, sendVoiceNote } from "@/lib/voice.functions";

type VoiceIdentity = { roomId: string; roundId: string; playerId: string; sessionId: string };
type VoiceClip = { id: string; nickname: string; audioUrl: string; duration: number };
const LIMIT = 7000;
const MUTE_KEY = "stop-voice-muted";

export function useVoiceWalkieTalkie(identity: VoiceIdentity) {
  const send = useServerFn(sendVoiceNote);
  const getPlayback = useServerFn(getVoicePlayback);
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const held = useRef(false);
  const alive = useRef(true);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const stopTimer = useRef<number | undefined>(undefined);
  const started = useRef(0);
  const discard = useRef(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const queue = useRef<VoiceClip[]>([]);
  const seen = useRef(new Set<string>());
  const muteRef = useRef(false);
  const busy = useRef(false);
  const audioContext = useRef<AudioContext | null>(null);
  const playbackWatchdog = useRef<number | undefined>(undefined);
  const playNextRef = useRef<() => void>(() => undefined);

  const playNext = useCallback(() => {
    if (!alive.current || muteRef.current || audio.current || !queue.current.length) return;
    const clip = queue.current.shift();
    if (!clip) return;
    const player = new Audio(clip.audioUrl);
    audio.current = player;
    setSpeaker(clip.nickname);
    const done = () => {
      window.clearTimeout(playbackWatchdog.current);
      if (audio.current !== player) return;
      player.pause();
      player.onended = null;
      player.onerror = null;
      player.removeAttribute("src");
      player.load();
      audio.current = null;
      setSpeaker(null);
      playNextRef.current();
    };
    player.onended = done;
    player.onerror = done;
    void player.play().then(() => {
      setBlocked(false);
      playbackWatchdog.current = window.setTimeout(done, clip.duration + 5000);
    }).catch(() => {
      if (audio.current !== player) return;
      audio.current = null;
      setSpeaker(null);
      queue.current.unshift(clip);
      player.onended = null;
      player.onerror = null;
      setBlocked(true);
    });
  }, []);
  playNextRef.current = playNext;

  const unlockPlayback = useCallback(() => {
    // Resume Web Audio synchronously within the user's gesture (important on iOS).
    try {
      const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass && !audioContext.current) audioContext.current = new AudioContextClass();
      void audioContext.current?.resume();
    } catch { /* Recording does not depend on the optional beep. */ }
    setBlocked(false);
    playNextRef.current();
  }, []);

  const finish = useCallback((cancel = false) => {
    held.current = false;
    discard.current = cancel;
    window.clearInterval(timer.current);
    window.clearTimeout(stopTimer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    setRecording(false);
  }, []);

  const begin = useCallback(async () => {
    if (busy.current || recorder.current?.state === "recording") return;
    held.current = true;
    discard.current = false;
    busy.current = true;
    setRequesting(true);
    unlockPlayback();
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("unsupported");
      const input = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      if (!held.current || !alive.current) { input.getTracks().forEach((track) => track.stop()); return; }
      stream.current = input;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/aac", "audio/ogg;codecs=opus", "audio/webm"].find((mime) => MediaRecorder.isTypeSupported(mime));
      const instance = new MediaRecorder(input, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 48000 });
      const chunks: Blob[] = [];
      instance.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      instance.onstop = () => {
        input.getTracks().forEach((track) => track.stop());
        stream.current = null;
        recorder.current = null;
        const duration = Math.min(LIMIT, Math.max(1, Date.now() - started.current));
        const blob = new Blob(chunks, { type: instance.mimeType || mimeType || "audio/webm" });
        if (discard.current || !alive.current || duration < 150 || !blob.size) { busy.current = false; return; }
        setSending(true);
        const form = new FormData();
        Object.entries(identity).forEach(([key, value]) => form.set(key, value));
        form.set("durationMs", String(duration));
        form.set("audio", blob, "reaction");
        void send({ data: form }).then(() => { if (alive.current) toast.success("Reação enviada"); }).catch((error: unknown) => {
          if (alive.current) toast.error(error instanceof Error ? error.message : "Não consegui enviar sua reação");
        }).finally(() => { busy.current = false; if (alive.current) setSending(false); });
      };
      instance.onerror = () => { finish(true); toast.error("Não consegui gravar. Tente novamente"); };
      recorder.current = instance;
      started.current = Date.now();
      instance.start(100);
      setElapsed(0);
      setRecording(true);
      const context = audioContext.current;
      if (context?.state === "running" && !muteRef.current) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        gain.gain.value = 0.025;
        oscillator.frequency.value = 660;
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(); oscillator.stop(context.currentTime + 0.07);
      }
      timer.current = window.setInterval(() => setElapsed(Math.min(LIMIT, Date.now() - started.current)), 50);
      stopTimer.current = window.setTimeout(() => finish(false), LIMIT);
    } catch (error) {
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      busy.current = false;
      held.current = false;
      if (alive.current) toast.error(error instanceof Error && error.message === "unsupported" ? "Este navegador não permite gravar áudio" : "Libere o microfone nas permissões do navegador para reagir por voz");
    } finally {
      if (!recorder.current) busy.current = false;
      if (alive.current) setRequesting(false);
    }
  }, [finish, identity.roomId, identity.roundId, identity.playerId, identity.sessionId, send, unlockPlayback]);

  const toggleMute = useCallback(() => {
    const next = !muteRef.current;
    muteRef.current = next;
    setMuted(next);
    try { localStorage.setItem(MUTE_KEY, String(next)); } catch { /* Storage may be unavailable. */ }
    if (next) {
      queue.current = [];
      window.clearTimeout(playbackWatchdog.current);
      if (audio.current) {
        audio.current.onended = null; audio.current.onerror = null;
        audio.current.pause(); audio.current.removeAttribute("src"); audio.current.load();
      }
      audio.current = null; setSpeaker(null); setBlocked(false);
    }
    else unlockPlayback();
  }, [unlockPlayback]);

  useEffect(() => {
    alive.current = true;
    try { muteRef.current = localStorage.getItem(MUTE_KEY) === "true"; setMuted(muteRef.current); } catch { /* Use default. */ }
    let active = true;
    const since = new Date().toISOString();
    // Resolve clips in arrival order so signing latency cannot reorder playback.
    let arrivals = Promise.resolve();
    const receive = (id: string) => {
      if (!active || seen.current.has(id)) return;
      seen.current.add(id);
      arrivals = arrivals.then(async () => {
        if (!active || muteRef.current) return;
        try {
          const clip = await getPlayback({ data: { ...identity, noteId: id } });
          if (!active || muteRef.current) return;
          if (queue.current.length < 20) queue.current.push(clip);
          playNextRef.current();
        } catch { /* A reaction may expire when the round advances. */ }
      });
    };
    let realtimeHealthy = false;
    let polling = false;
    let lastPoll = 0;
    const channel = supabase.channel(`voice-${identity.roomId}-${identity.playerId}-${identity.roundId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_voice_notes", filter: `room_id=eq.${identity.roomId}` }, (payload) => {
        if (payload.new['round_id'] === identity.roundId && typeof payload.new['id'] === "string") receive(payload.new['id']);
      }).subscribe((status) => { realtimeHealthy = status === "SUBSCRIBED"; });
    const poll = async () => {
      if (!active || polling || document.hidden || (realtimeHealthy && Date.now() - lastPoll < 15_000)) return;
      polling = true;
      lastPoll = Date.now();
      try {
        const { data } = await supabase.from("room_voice_notes").select("id").eq("room_id", identity.roomId).eq("round_id", identity.roundId).gt("created_at", since).order("created_at").limit(50);
        data?.forEach((note) => receive(note.id));
      } catch { /* Realtime continues during transient polling failures. */
      } finally { polling = false; }
    };
    const fallback = window.setInterval(() => void poll(), 3000);
    const cancelHidden = () => { if (document.hidden) finish(true); };
    document.addEventListener("visibilitychange", cancelHidden);
    return () => {
      active = false; alive.current = false; discard.current = true; held.current = false;
      window.clearInterval(timer.current); window.clearTimeout(stopTimer.current); window.clearInterval(fallback);
      window.clearTimeout(playbackWatchdog.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      if (audio.current) {
        audio.current.onended = null; audio.current.onerror = null;
        audio.current.pause(); audio.current.removeAttribute("src"); audio.current.load();
      }
      audio.current = null; queue.current = []; seen.current.clear();
      void audioContext.current?.close(); audioContext.current = null;
      document.removeEventListener("visibilitychange", cancelHidden);
      void supabase.removeChannel(channel);
    };
  }, [identity.roomId, identity.roundId, identity.playerId, identity.sessionId, getPlayback, finish]);

  return { recording, requesting, sending, elapsed, muted, speaker, blocked, begin, finish, toggleMute, unlockPlayback };
}