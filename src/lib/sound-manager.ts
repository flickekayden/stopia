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