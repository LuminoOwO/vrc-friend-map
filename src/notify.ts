// New-friend announcements: a short synthesized sound (no audio files needed)
// and a "fresh" mark that the map and cards animate for a few seconds.
import { getState, setState } from "./store";
import type { SoundSettings } from "./types";

export const FRESH_MS = 8000;

let audio: AudioContext | null = null;

function ctx(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    audio ??= new AC();
    if (audio.state === "suspended") audio.resume().catch(() => {});
    return audio;
  } catch {
    return null;
  }
}

function tone(ac: AudioContext, out: AudioNode, freq: number, start: number, len: number, type: OscillatorType, peak: number, glideTo?: number) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, start + len * 0.6);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + len);
  o.connect(g).connect(out);
  o.start(start);
  o.stop(start + len + 0.05);
}

export const SOUNDS: { value: SoundSettings["sound"]; label: string }[] = [
  { value: "chime", label: "Chime" },
  { value: "sparkle", label: "Sparkle" },
  { value: "pop", label: "Pop" },
  { value: "bell", label: "Bell" },
];

export function playSound(kind: SoundSettings["sound"], volume: number) {
  const ac = ctx();
  if (!ac || volume <= 0) return;
  const out = ac.createGain();
  out.gain.value = Math.min(1, volume);
  out.connect(ac.destination);
  const t = ac.currentTime + 0.02;
  switch (kind) {
    case "pop":
      tone(ac, out, 380, t, 0.18, "sine", 0.6, 900);
      tone(ac, out, 760, t + 0.09, 0.16, "sine", 0.3, 1400);
      break;
    case "bell":
      [523.25, 1046.5, 1568].forEach((f, i) => tone(ac, out, f, t, 1.4 - i * 0.3, "sine", 0.35 / (i + 1)));
      tone(ac, out, 659.25, t + 0.25, 1.2, "sine", 0.25);
      break;
    case "sparkle":
      [1318.5, 1568, 2093, 2637].forEach((f, i) => tone(ac, out, f, t + i * 0.07, 0.35, "triangle", 0.22));
      break;
    default:
      // chime: two soft notes going up
      tone(ac, out, 659.25, t, 0.5, "sine", 0.45);
      tone(ac, out, 987.77, t + 0.14, 0.75, "sine", 0.4);
      tone(ac, out, 1975.5, t + 0.14, 0.4, "sine", 0.06);
  }
}

/** Mark people as just added (for the animation) and play the sound once. */
export function celebrateNewFriends(ids: string[]) {
  if (!ids.length) return;
  const now = Date.now();
  const fresh = { ...getState().fresh };
  for (const [id, t] of Object.entries(fresh)) if (now - t > FRESH_MS) delete fresh[id];
  for (const id of ids) fresh[id] = now;
  setState({ fresh });
  const s = getState().settings.sounds;
  if (s.newFriend) playSound(s.sound, s.volume);
  setTimeout(() => {
    const cur = { ...getState().fresh };
    let changed = false;
    for (const [id, t] of Object.entries(cur)) {
      if (Date.now() - t > FRESH_MS) {
        delete cur[id];
        changed = true;
      }
    }
    if (changed) setState({ fresh: cur });
  }, FRESH_MS + 100);
}
