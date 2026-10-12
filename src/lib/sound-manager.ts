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
  private enabled = true;
  private unlocked = false;

  configure(enabled: boolean) {
    this.enabled = enabled;
  }

  unlock() {
    this.unlocked = true;
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