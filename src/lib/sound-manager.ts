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
    if (typeof Audio === "undefined") return;
    for (const name of Object.keys(SOURCES) as SoundName[]) {
      if (this.sounds.has(name)) continue;
      const audio = new Audio(SOURCES[name]);
      audio.preload = "auto";
      audio.volume = VOLUMES[name];
      this.sounds.set(name, audio);
    }
  }

  unlock() {
    this.unlocked = true;
  }

  play(name: SoundName) {
    if (!this.enabled || !this.unlocked) return;
    const source = this.sounds.get(name);
    if (!source) return;
    const audio = source.cloneNode(true) as HTMLAudioElement;
    audio.volume = VOLUMES[name];
    void audio.play().catch(() => undefined);
  }
}

export const soundManager = new SoundManager();