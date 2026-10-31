import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

type RealtimeChannel = ReturnType<typeof supabase.channel>;
type Presence = { inVoice: boolean; muted: boolean };
type Signal = { from: string; to: string; kind: "offer" | "answer" | "ice"; data: unknown };

const ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
const SPEAKING_LEVEL = 0.035;

type Peer = { pc: RTCPeerConnection; audio: HTMLAudioElement; pendingIce: RTCIceCandidateInit[]; stream: MediaStream | null };

/**
 * Live group voice for one room: a WebRTC mesh between the players who joined, signalled over a realtime
 * broadcast channel (no media server). Audio goes directly between phones. `locked` silences every
 * microphone (e.g. while Stop answers are open). Everything starts only after the player taps "join".
 */
export function useVoiceRoom(roomId: string, playerId: string, locked: boolean) {
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [listenOnly, setListenOnly] = useState(false);
  const [participants, setParticipants] = useState<Record<string, Presence>>({});
  const [speaking, setSpeaking] = useState<string[]>([]);
  const [connected, setConnected] = useState<string[]>([]);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const peers = useRef(new Map<string, Peer>());
  const joinedRef = useRef(false);
  const audioCtx = useRef<AudioContext | null>(null);
  const analysers = useRef(new Map<string, AnalyserNode>());
  const deafenedRef = useRef(deafened);
  deafenedRef.current = deafened;
  const effectiveMuted = muted || locked;
  const effectiveMutedRef = useRef(effectiveMuted);
  effectiveMutedRef.current = effectiveMuted;

  const send = useCallback((signal: Omit<Signal, "from">) => {
    void channelRef.current?.send({ type: "broadcast", event: "signal", payload: { ...signal, from: playerId } });
  }, [playerId]);

  const watchLevel = useCallback((id: string, stream: MediaStream) => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      audioCtx.current ??= new Ctx();
      const source = audioCtx.current.createMediaStreamSource(stream);
      const analyser = audioCtx.current.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analysers.current.set(id, analyser);
    } catch { /* speaking indicators are optional */ }
  }, []);

  const closePeer = useCallback((id: string) => {
    const peer = peers.current.get(id);
    if (!peer) return;
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    peer.audio.srcObject = null;
    peer.audio.remove();
    peers.current.delete(id);
    analysers.current.delete(id);
    setConnected((list) => list.filter((x) => x !== id));
  }, []);

  const createPeer = useCallback((id: string, initiator: boolean) => {
    const existing = peers.current.get(id);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("playsinline", "true");
    audio.muted = deafenedRef.current;
    audio.hidden = true;
    document.body.appendChild(audio);
    const peer: Peer = { pc, audio, pendingIce: [], stream: null };
    peers.current.set(id, peer);
    const local = localRef.current;
    if (local) for (const track of local.getAudioTracks()) pc.addTrack(track, local);
    else pc.addTransceiver("audio", { direction: "recvonly" });
    pc.onicecandidate = (event) => { if (event.candidate) send({ to: id, kind: "ice", data: event.candidate.toJSON() }); };
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      peer.stream = stream;
      audio.srcObject = stream;
      void audio.play().catch(() => undefined);
      watchLevel(id, stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setConnected((list) => (list.includes(id) ? list : [...list, id]));
      if (pc.connectionState === "failed" || pc.connectionState === "closed") closePeer(id);
    };
    if (initiator) {
      void (async () => {
        try {
          await pc.setLocalDescription(await pc.createOffer());
          send({ to: id, kind: "offer", data: pc.localDescription?.toJSON() });
        } catch { closePeer(id); }
      })();
    }
    return peer;
  }, [send, watchLevel, closePeer]);

  // The room's voice channel: presence says who is in the conversation; broadcasts carry WebRTC signals.
  useEffect(() => {
    const channel = supabase.channel(`party-voice-${roomId}`, { config: { broadcast: { self: false }, presence: { key: playerId } } });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<Presence>();
        const next: Record<string, Presence> = {};
        for (const [key, metas] of Object.entries(state)) {
          const meta = metas[metas.length - 1];
          if (meta) next[key] = { inVoice: Boolean(meta.inVoice), muted: Boolean(meta.muted) };
        }
        setParticipants(next);
      })
      .on("broadcast", { event: "signal" }, async ({ payload }) => {
        const signal = payload as Signal;
        if (!joinedRef.current || signal.to !== playerId || signal.from === playerId) return;
        try {
          if (signal.kind === "offer") {
            const peer = createPeer(signal.from, false);
            await peer.pc.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
            for (const ice of peer.pendingIce.splice(0)) await peer.pc.addIceCandidate(ice).catch(() => undefined);
            await peer.pc.setLocalDescription(await peer.pc.createAnswer());
            send({ to: signal.from, kind: "answer", data: peer.pc.localDescription?.toJSON() });
          } else if (signal.kind === "answer") {
            const peer = peers.current.get(signal.from);
            if (peer && peer.pc.signalingState === "have-local-offer") {
              await peer.pc.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
              for (const ice of peer.pendingIce.splice(0)) await peer.pc.addIceCandidate(ice).catch(() => undefined);
            }
          } else {
            const peer = peers.current.get(signal.from);
            if (!peer) return;
            if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(signal.data as RTCIceCandidateInit).catch(() => undefined);
            else peer.pendingIce.push(signal.data as RTCIceCandidateInit);
          }
        } catch { closePeer(signal.from); }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ inVoice: joinedRef.current, muted: effectiveMutedRef.current });
      });
    channelRef.current = channel;
    const peerMap = peers.current;
    return () => {
      channelRef.current = null;
      for (const id of [...peerMap.keys()]) closePeer(id);
      void supabase.removeChannel(channel);
    };
  }, [roomId, playerId, createPeer, closePeer, send]);

  // Connect to everyone in the conversation; the lower id calls, so two phones never call each other at once.
  useEffect(() => {
    if (!joined) return;
    const inVoice = Object.entries(participants).filter(([id, p]) => p.inVoice && id !== playerId).map(([id]) => id);
    for (const id of inVoice) if (!peers.current.has(id) && playerId < id) createPeer(id, true);
    for (const id of [...peers.current.keys()]) if (!inVoice.includes(id)) closePeer(id);
  }, [joined, participants, playerId, createPeer, closePeer]);

  // Mute / auto-silence: the microphone track is switched off and everyone sees the muted state.
  useEffect(() => {
    for (const track of localRef.current?.getAudioTracks() ?? []) track.enabled = !effectiveMuted;
    if (joinedRef.current) void channelRef.current?.track({ inVoice: true, muted: effectiveMuted });
  }, [effectiveMuted]);

  useEffect(() => {
    for (const peer of peers.current.values()) peer.audio.muted = deafened;
  }, [deafened]);

  // Speaking indicators from audio levels (local and remote), five times per second.
  useEffect(() => {
    if (!joined) return;
    const buffer = new Uint8Array(512);
    const id = window.setInterval(() => {
      const now: string[] = [];
      for (const [key, analyser] of analysers.current) {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (const value of buffer) { const v = (value - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buffer.length);
        if (rms > SPEAKING_LEVEL && !(key === playerId && effectiveMutedRef.current)) now.push(key);
      }
      setSpeaking((prev) => (prev.length === now.length && prev.every((x) => now.includes(x)) ? prev : now));
    }, 200);
    return () => window.clearInterval(id);
  }, [joined, playerId]);

  const join = useCallback(async () => {
    if (joinedRef.current || joining) return { listenOnly: false };
    setJoining(true);
    let onlyListen = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      localRef.current = stream;
      for (const track of stream.getAudioTracks()) track.enabled = !effectiveMutedRef.current;
      watchLevel(playerId, stream);
    } catch {
      onlyListen = true;
    }
    try { await audioCtx.current?.resume(); } catch { /* optional */ }
    setListenOnly(onlyListen);
    joinedRef.current = true;
    setJoined(true);
    setJoining(false);
    void channelRef.current?.track({ inVoice: true, muted: onlyListen || effectiveMutedRef.current });
    return { listenOnly: onlyListen };
  }, [joining, playerId, watchLevel]);

  const leave = useCallback(() => {
    joinedRef.current = false;
    setJoined(false);
    for (const id of [...peers.current.keys()]) closePeer(id);
    for (const track of localRef.current?.getTracks() ?? []) track.stop();
    localRef.current = null;
    analysers.current.delete(playerId);
    setListenOnly(false);
    setSpeaking([]);
    void channelRef.current?.track({ inVoice: false, muted: false });
  }, [closePeer, playerId]);

  // Leaving the room screen releases the microphone.
  useEffect(() => () => {
    for (const track of localRef.current?.getTracks() ?? []) track.stop();
    localRef.current = null;
    void audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
  }, []);

  return {
    joined,
    joining,
    muted,
    effectiveMuted: effectiveMuted || listenOnly,
    listenOnly,
    deafened,
    participants,
    speaking,
    connected,
    join,
    leave,
    toggleMute: () => setMuted((m) => !m),
    toggleDeafen: () => setDeafened((d) => !d),
  };
}
