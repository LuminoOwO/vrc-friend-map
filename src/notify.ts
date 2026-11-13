// New-friend announcements: a short synthesized sound (no audio files needed)
// and a "fresh" mark that the map and cards animate for a few seconds.
import { getState, setState } from "./store";

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

/** Browsers start audio suspended until the first click or key; resume it then so later notification sounds play. */
export function unlockAudioOnInput() {
  const unlock = () => {
    const ac = ctx();
    if (ac && ac.state === "running") {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    }
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
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

export const SOUNDS: { value: string; label: string }[] = [
  { value: "chime", label: "Chime" },
  { value: "sparkle", label: "Sparkle" },
  { value: "pop", label: "Pop" },
  { value: "bell", label: "Bell" },
  { value: "rise", label: "Rise" },
  { value: "fall", label: "Fall" },
  { value: "soft-fall", label: "Soft fall" },
  { value: "knock", label: "Knock" },
  { value: "door", label: "Door" },
  { value: "blip", label: "Blip" },
];

/** Plays a built-in sound starting at `t`; returns its length in seconds. */
function builtIn(ac: AudioContext, out: AudioNode, kind: string, t: number): number {
  switch (kind) {
    case "pop":
      tone(ac, out, 380, t, 0.18, "sine", 0.6, 900);
      tone(ac, out, 760, t + 0.09, 0.16, "sine", 0.3, 1400);
      return 0.3;
    case "bell":
      [523.25, 1046.5, 1568].forEach((f, i) => tone(ac, out, f, t, 1.4 - i * 0.3, "sine", 0.35 / (i + 1)));
      tone(ac, out, 659.25, t + 0.25, 1.2, "sine", 0.25);
      return 0.9;
    case "sparkle":
      [1318.5, 1568, 2093, 2637].forEach((f, i) => tone(ac, out, f, t + i * 0.07, 0.35, "triangle", 0.22));
      return 0.55;
    case "rise":
      tone(ac, out, 523.25, t, 0.22, "sine", 0.45);
      tone(ac, out, 783.99, t + 0.11, 0.35, "sine", 0.42);
      return 0.42;
    case "fall":
      tone(ac, out, 587.33, t, 0.25, "triangle", 0.4);
      tone(ac, out, 440, t + 0.14, 0.3, "triangle", 0.38);
      tone(ac, out, 349.23, t + 0.28, 0.45, "triangle", 0.34);
      return 0.65;
    case "soft-fall":
      tone(ac, out, 659.25, t, 0.25, "sine", 0.3);
      tone(ac, out, 493.88, t + 0.13, 0.4, "sine", 0.26);
      return 0.45;
    case "knock":
      tone(ac, out, 220, t, 0.09, "sine", 0.7, 140);
      tone(ac, out, 220, t + 0.13, 0.09, "sine", 0.6, 140);
      tone(ac, out, 880, t + 0.27, 0.3, "sine", 0.25);
      return 0.5;
    case "door":
      tone(ac, out, 880, t, 0.2, "sine", 0.25);
      tone(ac, out, 220, t + 0.12, 0.12, "sine", 0.6, 120);
      return 0.35;
    case "blip":
      tone(ac, out, 1046.5, t, 0.08, "square", 0.12);
      return 0.12;
    default:
      // chime: two soft notes going up
      tone(ac, out, 659.25, t, 0.5, "sine", 0.45);
      tone(ac, out, 987.77, t + 0.14, 0.75, "sine", 0.4);
      tone(ac, out, 1975.5, t + 0.14, 0.4, "sine", 0.06);
      return 0.6;
  }
}

/** A small deterministic random generator from a string (FNV-1a + xorshift). */
function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let x = h >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

const SCALES = [
  [0, 2, 4, 7, 9, 12, 14], // major pentatonic
  [0, 3, 5, 7, 10, 12, 15], // minor pentatonic
  [0, 2, 4, 5, 7, 9, 11, 12], // major
  [0, 2, 3, 5, 7, 8, 10, 12], // minor
];
const RHYTHMS = [
  [0.14, 0.14, 0.28],
  [0.1, 0.1, 0.1, 0.24],
  [0.2, 0.12, 0.3],
  [0.12, 0.24, 0.12, 0.24],
  [0.16, 0.16, 0.16, 0.3],
];

/** Someone's own little tune, always the same for the same name. */
export function tuneOf(name: string) {
  const r = rng(name.trim().toLowerCase());
  const scale = SCALES[Math.floor(r() * SCALES.length)];
  const root = 392 * Math.pow(2, Math.floor(r() * 9) / 12); // G4 … E5
  const rhythm = RHYTHMS[Math.floor(r() * RHYTHMS.length)];
  const wave: OscillatorType = (["sine", "triangle", "sine", "square"] as const)[Math.floor(r() * 4)];
  let step = Math.floor(r() * 3);
  const notes = rhythm.map((len) => {
    step = Math.max(0, Math.min(scale.length - 1, step + Math.floor(r() * 5) - 2));
    return { freq: root * Math.pow(2, scale[step] / 12), len };
  });
  return { notes, wave };
}

function playTune(ac: AudioContext, out: AudioNode, name: string, t: number): number {
  const { notes, wave } = tuneOf(name);
  const peak = wave === "square" ? 0.1 : 0.35;
  let at = t;
  for (const n of notes) {
    tone(ac, out, n.freq, at, n.len * 1.6, wave, peak);
    at += n.len;
  }
  return at - t + 0.15;
}

/** Custom sound files, decoded once. */
const decoded = new Map<string, Promise<AudioBuffer | null>>();
function decode(ac: AudioContext, data: string): Promise<AudioBuffer | null> {
  let p = decoded.get(data);
  if (!p) {
    p = fetch(data)
      .then((r) => r.arrayBuffer())
      .then((b) => ac.decodeAudioData(b))
      .catch(() => null);
    decoded.set(data, p);
  }
  return p;
}

export type SoundPart = { sound: string } | { tune: string } | { data: string };

/** Plays the parts one after another (action sound, then the person's tune). Resolves when done. */
export async function playParts(parts: SoundPart[], volume: number): Promise<void> {
  const ac = ctx();
  if (!ac || volume <= 0 || !parts.length) return;
  const out = ac.createGain();
  out.gain.value = Math.min(1, volume);
  out.connect(ac.destination);
  let t = ac.currentTime + 0.03;
  for (const p of parts) {
    if ("sound" in p) {
      if (p.sound !== "none") t += builtIn(ac, out, p.sound, t) + 0.08;
    } else if ("tune" in p) {
      t += playTune(ac, out, p.tune, t) + 0.05;
    } else {
      const buf = await decode(ac, p.data);
      if (!buf) continue;
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.connect(out);
      t = Math.max(t, ac.currentTime + 0.02);
      src.start(t, 0, Math.min(buf.duration, 6));
      t += Math.min(buf.duration, 6) + 0.08;
    }
  }
  await new Promise((r) => setTimeout(r, Math.max(0, (t - ac.currentTime) * 1000)));
}

export function playSound(kind: string, volume: number) {
  void playParts([{ sound: kind }], volume);
}

/** Mark people as just added (for the animation) and play the sound once. */
export function celebrateNewFriends(ids: string[]) {
  if (!ids.length) return;
  const now = Date.now();
  const fresh = { ...getState().fresh };
  for (const [id, t] of Object.entries(fresh)) if (now - t > FRESH_MS) delete fresh[id];
  for (const id of ids) fresh[id] = now;
  setState({ fresh });
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
