// Sound effects for the TV/board view, driven off the game's major log events.
// Self-contained WebAudio (no assets). Best-effort; silently no-op where the
// API is unavailable. Muting is a per-device preference (default on).

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = (window.AudioContext || (window as any).webkitAudioContext) as
        | typeof AudioContext
        | undefined;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

type Wave = OscillatorType;
function tone(freq: number, durMs: number, when: number, type: Wave = "sine", vol = 0.16): void {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + when;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.02);
}

const KEY = "catan_tv_sound";
export function tvSoundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}
export function setTvSound(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

// Map a major log line to a sound. Returns true if it played something.
export function playForLog(text: string): void {
  if (!tvSoundEnabled()) return;
  if (/wins the game/.test(text)) {
    // Fanfare.
    tone(523, 160, 0, "triangle");
    tone(659, 160, 0.16, "triangle");
    tone(784, 160, 0.32, "triangle");
    tone(1047, 320, 0.48, "triangle");
    return;
  }
  if (/Longest Road|Largest Army/.test(text)) {
    tone(440, 120, 0, "triangle");
    tone(660, 200, 0.12, "triangle");
    return;
  }
  if (/built a settlement|upgraded to a city/.test(text)) {
    tone(587, 90, 0, "square", 0.1);
    tone(784, 120, 0.09, "square", 0.1);
    return;
  }
  if (/stole a card/.test(text)) {
    tone(330, 90, 0, "sawtooth", 0.12);
    tone(247, 140, 0.09, "sawtooth", 0.12);
    return;
  }
  if (/moved the robber|must move the robber/.test(text)) {
    tone(196, 220, 0, "sawtooth", 0.12);
    return;
  }
  if (/Knight|Year of Plenty|Monopoly|Road Building/.test(text)) {
    tone(523, 110, 0, "triangle", 0.12);
    tone(698, 130, 0.1, "triangle", 0.12);
    return;
  }
}

// A dice-roll rattle, played when the dice change.
export function playDice(): void {
  if (!tvSoundEnabled()) return;
  for (let i = 0; i < 4; i++) tone(140 + Math.random() * 120, 45, i * 0.06, "square", 0.08);
}
