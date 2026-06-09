// Small, dependency-free haptic + sound cues for the phone. Vibration uses the
// Web Vibration API (Android Chrome); sound uses a short WebAudio blip. Both are
// best-effort and silently no-op where unsupported (e.g. iOS Safari vibration).

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AC = (window.AudioContext || (window as any).webkitAudioContext) as
        | typeof AudioContext
        | undefined;
      if (!AC) return null;
      audioCtx = new AC();
    }
    // Resume if a prior gesture suspended it.
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

function blip(freq: number, durationMs: number, when = 0): void {
  const ac = ctx();
  if (!ac) return;
  const t0 = ac.currentTime + when;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.14, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.02);
}

function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported — ignore */
  }
}

// Sound preference: persisted, default on.
const SOUND_KEY = "catan_sound";
export function soundEnabled(): boolean {
  return localStorage.getItem(SOUND_KEY) !== "off";
}
export function setSoundEnabled(on: boolean): void {
  localStorage.setItem(SOUND_KEY, on ? "on" : "off");
}

function play(freqs: [number, number, number?], vib: number | number[]): void {
  vibrate(vib);
  if (!soundEnabled()) return;
  blip(freqs[0], 120, 0);
  if (freqs[1]) blip(freqs[1], 140, 0.12);
  if (freqs[2]) blip(freqs[2], 160, 0.26);
}

// Your turn just began — a friendly rising chime + double buzz.
export function cueYourTurn(): void {
  play([523, 659, 784], [40, 60, 40]);
}

// A 7 was rolled (robber!) — a low warning buzz.
export function cueSeven(): void {
  play([300, 220], [120, 60, 120]);
}

// Someone is offering you a trade — a soft two-note nudge.
export function cueTrade(): void {
  play([494, 587], 60);
}

// You must discard cards — an urgent triple buzz.
export function cueDiscard(): void {
  play([330, 247], [80, 50, 80, 50, 80]);
}
