export type SoundName = "click" | "create" | "playerJoin" | "error" | "allReady" | "victory" | "defeat" | "message" | "ready";

const SOURCES: Record<SoundName, string> = {
  click: "/sounds/click.wav",
  create: "/sounds/create.wav",
  playerJoin: "/sounds/player-join.wav",
  error: "/sounds/error.wav",
  allReady: "/sounds/all-ready.wav",
  victory: "/sounds/victory.wav",
  defeat: "/sounds/defeat.wav",
  message: "/sounds/message.wav",
  ready: "/sounds/ready.wav",
};

const VOLUMES: Record<SoundName, number> = {
  click: 0.35,
  create: 0.55,
  playerJoin: 0.5,
  error: 0.5,
  allReady: 0.6,
  victory: 0.65,
  defeat: 0.55,
  message: 0.45,
  ready: 0.5,
};

class SoundManager {
  private sounds = new Map<SoundName, HTMLAudioElement>();
  private context: AudioContext | null = null;
  private enabled = true;
  private unlocked = false;

  configure(enabled: boolean) {
    this.enabled = enabled;
  }

  unlock() {
    this.unlocked = true;
    // Resume (or create) the synth context inside the user gesture so the STOP siren can play later.
    try {
      const Ctx = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
      if (!Ctx) return;
      this.context ??= new Ctx();
      if (this.context.state === "suspended") void this.context.resume().catch(() => undefined);
    } catch {
      this.context = null;
    }
  }

  /** Arcade "STOP!" alarm: two quick siren sweeps plus a buzzer hit, synthesized for low latency (no file to load). */
  playStopAlarm() {
    if (!this.enabled || !this.unlocked || !this.context) return;
    const ctx = this.context;
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    const t = ctx.currentTime + 0.01;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, t);
    master.gain.exponentialRampToValueAtTime(0.32, t + 0.02);
    master.gain.setValueAtTime(0.32, t + 0.78);
    master.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    master.connect(ctx.destination);
    const siren = ctx.createOscillator();
    siren.type = "sawtooth";
    for (let i = 0; i < 2; i += 1) {
      const start = t + i * 0.32;
      siren.frequency.setValueAtTime(520, start);
      siren.frequency.exponentialRampToValueAtTime(1180, start + 0.16);
      siren.frequency.exponentialRampToValueAtTime(520, start + 0.32);
    }
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0.55;
    siren.connect(sirenGain).connect(master);
    const buzz = ctx.createOscillator();
    buzz.type = "square";
    buzz.frequency.setValueAtTime(110, t + 0.64);
    const buzzGain = ctx.createGain();
    buzzGain.gain.setValueAtTime(0.0001, t);
    buzzGain.gain.setValueAtTime(0.7, t + 0.64);
    buzzGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    buzz.connect(buzzGain).connect(master);
    siren.start(t);
    buzz.start(t + 0.64);
    siren.stop(t + 0.96);
    buzz.stop(t + 0.96);
  }

  private ctx() {
    if (!this.enabled || !this.unlocked || !this.context) return null;
    if (this.context.state === "suspended") void this.context.resume().catch(() => undefined);
    return this.context;
  }

  private noise(ctx: AudioContext, seconds: number) {
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    return source;
  }

  /** Stop: clock tick for each of the last 10 seconds (higher in the final 3). */
  playTick(urgent = false) {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(urgent ? 1400 : 950, t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(urgent ? 0.16 : 0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  /** Tribunal: two judge's gavel hits ("bang, bang"). */
  playGavel() {
    const ctx = this.ctx();
    if (!ctx) return;
    for (const offset of [0, 0.28]) {
      const t = ctx.currentTime + 0.01 + offset;
      const body = ctx.createOscillator();
      body.type = "sine";
      body.frequency.setValueAtTime(180, t);
      body.frequency.exponentialRampToValueAtTime(60, t + 0.18);
      const bodyGain = ctx.createGain();
      bodyGain.gain.setValueAtTime(0.55, t);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      body.connect(bodyGain).connect(ctx.destination);
      body.start(t);
      body.stop(t + 0.24);
      const click = this.noise(ctx, 0.05);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 2200;
      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.35, t);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      click.connect(filter).connect(clickGain).connect(ctx.destination);
      click.start(t);
    }
  }

  /** Crowd reactions: 👏 applause, 🍅 boo, 😂 boing, 🔥 whoosh. */
  playCrowd(emoji: string) {
    const ctx = this.ctx();
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    if (emoji === "👏") {
      for (let i = 0; i < 9; i += 1) {
        const start = t + i * 0.07 + Math.random() * 0.04;
        const clap = this.noise(ctx, 0.04);
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = 1200 + Math.random() * 900;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.22, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.04);
        clap.connect(filter).connect(gain).connect(ctx.destination);
        clap.start(start);
      }
      return;
    }
    if (emoji === "🍅") {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(230, t);
      osc.frequency.exponentialRampToValueAtTime(130, t + 0.8);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 700;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.9);
      return;
    }
    if (emoji === "😂") {
      for (let i = 0; i < 3; i += 1) {
        const start = t + i * 0.13;
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(520 - i * 60, start);
        osc.frequency.exponentialRampToValueAtTime(820 - i * 80, start + 0.06);
        osc.frequency.exponentialRampToValueAtTime(420 - i * 60, start + 0.11);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.14, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.13);
      }
      return;
    }
    if (emoji === "🔥") {
      const whoosh = this.noise(ctx, 0.5);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.exponentialRampToValueAtTime(3000, t + 0.45);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.2, t + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      whoosh.connect(filter).connect(gain).connect(ctx.destination);
      whoosh.start(t);
    }
  }

  play(name: SoundName) {
    if (!this.enabled || !this.unlocked) return;
    if (typeof Audio === "undefined") return;
    let audio = this.sounds.get(name);
    if (!audio) {
      audio = new Audio(SOURCES[name]);
      audio.preload = "none";
      this.sounds.set(name, audio);
    }
    audio.currentTime = 0;
    audio.volume = VOLUMES[name];
    void audio.play().catch(() => undefined);
  }
}

export const soundManager = new SoundManager();