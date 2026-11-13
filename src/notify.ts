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

type Ctx = BaseAudioContext;

/** One note. `voice` picks the timbre; all are soft (no square waves). */
function tone(ac: Ctx, out: AudioNode, freq: number, start: number, len: number, type: OscillatorType, peak: number, glideTo?: number) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, start + len * 0.6);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + len);
  o.connect(g).connect(out);
  o.start(start);
  o.stop(start + len + 0.05);
}

export type Voice = "bell" | "glass" | "pluck" | "flute";
/** A note with a little character: a few partials over the fundamental. */
function note(ac: Ctx, out: AudioNode, freq: number, start: number, len: number, voice: Voice, peak: number) {
  switch (voice) {
    case "bell": // warm mallet: fundamental, soft octave, a hint of the 3rd partial
      tone(ac, out, freq, start, len + 0.35, "sine", peak);
      tone(ac, out, freq * 2, start, len * 0.6 + 0.1, "sine", peak * 0.28);
      tone(ac, out, freq * 3, start, len * 0.3 + 0.05, "sine", peak * 0.08);
      break;
    case "glass": // bright and short, like a glass harmonica tap
      tone(ac, out, freq, start, len + 0.25, "sine", peak * 0.9);
      tone(ac, out, freq * 4, start, 0.12, "sine", peak * 0.1);
      break;
    case "pluck": // music box / kalimba
      tone(ac, out, freq, start, len * 0.8 + 0.2, "triangle", peak * 0.9);
      tone(ac, out, freq * 2, start, 0.09, "sine", peak * 0.3);
      break;
    case "flute": // soft and round
      tone(ac, out, freq, start, len + 0.18, "triangle", peak * 0.8);
      tone(ac, out, freq * 1.003, start, len + 0.18, "sine", peak * 0.35);
      break;
  }
}

export const SOUNDS: { value: string; label: string }[] = [
  { value: "chime", label: "Chime" },
  { value: "sparkle", label: "Sparkle" },
  { value: "pop", label: "Pop" },
  { value: "bell", label: "Bell" },
  { value: "heartbreak", label: "Heartbreak" },
  { value: "fall", label: "Fall" },
  { value: "soft-fall", label: "Soft fall" },
  { value: "knock", label: "Knock" },
  { value: "door", label: "Door" },
  { value: "blip", label: "Blip" },
  { value: "doorbell", label: "Doorbell" },
  { value: "harp", label: "Harp" },
  { value: "marimba", label: "Marimba" },
  { value: "coin", label: "Coin" },
  { value: "bubble", label: "Bubble" },
  { value: "twinkle", label: "Twinkle" },
  { value: "fanfare", label: "Fanfare" },
  { value: "hello", label: "Hello" },
  { value: "drop", label: "Drop" },
  { value: "sigh", label: "Sigh" },
];

// Everything is in C major, so an event sound and the person's tune always fit together.
const C5 = 523.25;
const st = (semis: number) => C5 * Math.pow(2, semis / 12);

/** Plays a built-in sound starting at `t`. Returns when the next part may start:
 *  right as its last note lands, not after it rings out, so there's no pause. */
function builtIn(ac: Ctx, out: AudioNode, kind: string, t: number): number {
  switch (kind) {
    case "pop":
      tone(ac, out, 380, t, 0.16, "sine", 0.5, 900);
      tone(ac, out, 760, t + 0.07, 0.14, "sine", 0.25, 1400);
      return 0.16;
    case "bell":
      note(ac, out, st(0), t, 0.5, "bell", 0.4);
      note(ac, out, st(7), t + 0.09, 0.5, "bell", 0.25);
      return 0.2;
    case "sparkle":
      [4, 7, 12, 16].forEach((x, i) => note(ac, out, st(x + 12), t + i * 0.045, 0.15, "glass", 0.16));
      return 0.2;
    case "heartbreak": {
      // removed you: falling minor line, then a low chord that sags and fades
      note(ac, out, st(4), t, 0.14, "flute", 0.3);
      note(ac, out, st(0), t + 0.15, 0.14, "flute", 0.3);
      note(ac, out, st(-4), t + 0.3, 0.16, "flute", 0.3);
      const c = t + 0.46;
      for (const [x, p] of [[-15, 0.26], [-12, 0.2], [-8, 0.16], [-3, 0.12]] as const) {
        const f = st(x);
        tone(ac, out, f, c, 1.0, "triangle", p, f * 0.96);
        tone(ac, out, f * 1.006, c, 1.0, "sine", p * 0.5, f * 0.96);
      }
      return 0.8;
    }
    case "fall": // removed you: gently down
      note(ac, out, st(9), t, 0.1, "flute", 0.32);
      note(ac, out, st(5), t + 0.1, 0.1, "flute", 0.3);
      note(ac, out, st(2), t + 0.2, 0.18, "flute", 0.28);
      return 0.3;
    case "soft-fall": // went offline
      note(ac, out, st(7), t, 0.1, "bell", 0.28);
      note(ac, out, st(4), t + 0.09, 0.14, "bell", 0.24);
      return 0.18;
    case "knock": // joined your world: two knocks
      tone(ac, out, 230, t, 0.07, "sine", 0.6, 150);
      tone(ac, out, 230, t + 0.1, 0.07, "sine", 0.5, 150);
      return 0.19;
    case "door": // left your world
      tone(ac, out, 200, t, 0.1, "sine", 0.5, 120);
      note(ac, out, st(-5), t + 0.06, 0.12, "flute", 0.2);
      return 0.16;
    case "blip":
      note(ac, out, st(12), t, 0.06, "glass", 0.2);
      return 0.07;
    case "doorbell": // ding-dong
      note(ac, out, st(4), t, 0.2, "bell", 0.35);
      note(ac, out, st(0), t + 0.2, 0.25, "bell", 0.32);
      return 0.3;
    case "harp": // quick run up
      [0, 4, 7, 11, 12].forEach((x, i) => note(ac, out, st(x), t + i * 0.035, 0.2, "pluck", 0.22));
      return 0.2;
    case "marimba":
      note(ac, out, st(-5), t, 0.08, "pluck", 0.35);
      note(ac, out, st(0), t + 0.08, 0.08, "pluck", 0.35);
      note(ac, out, st(4), t + 0.16, 0.12, "pluck", 0.35);
      return 0.24;
    case "coin":
      note(ac, out, st(19), t, 0.05, "glass", 0.18);
      note(ac, out, st(24), t + 0.06, 0.18, "glass", 0.2);
      return 0.14;
    case "bubble":
      tone(ac, out, 500, t, 0.09, "sine", 0.4, 1100);
      tone(ac, out, 650, t + 0.08, 0.09, "sine", 0.32, 1400);
      return 0.15;
    case "twinkle":
      [16, 19, 24, 19, 24].forEach((x, i) => note(ac, out, st(x), t + i * 0.05, 0.12, "glass", 0.13));
      return 0.24;
    case "fanfare": // tiny ta-ta-taa
      note(ac, out, st(7), t, 0.06, "flute", 0.3);
      note(ac, out, st(7), t + 0.08, 0.06, "flute", 0.3);
      note(ac, out, st(12), t + 0.16, 0.2, "flute", 0.34);
      note(ac, out, st(4), t + 0.16, 0.2, "flute", 0.18);
      return 0.26;
    case "hello": // two notes like "hel-lo"
      note(ac, out, st(7), t, 0.09, "flute", 0.32);
      note(ac, out, st(9), t + 0.11, 0.16, "flute", 0.32);
      return 0.2;
    case "drop": // soft drop down
      tone(ac, out, 1200, t, 0.14, "sine", 0.3, 500);
      return 0.12;
    case "sigh": // goodbye, without sounding sad
      note(ac, out, st(4), t, 0.12, "flute", 0.26);
      note(ac, out, st(0), t + 0.12, 0.18, "flute", 0.22);
      return 0.22;
    default:
      // chime: two soft notes going up
      note(ac, out, st(4), t, 0.12, "bell", 0.35);
      note(ac, out, st(11), t + 0.1, 0.25, "bell", 0.3);
      return 0.19;
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

// Short, happy melodies in C major (semitones above C5). They lean on the notes of the
// C and F/A-minor chords, mostly go up, and end on a restful note (C, E, G or A).
const MELODIES = [
  [0, 4, 7, 12],
  [7, 4, 7, 12],
  [4, 7, 12, 16],
  [0, 7, 4, 12],
  [0, 2, 4, 7],
  [4, 7, 9, 12],
  [12, 9, 7, 12],
  [7, 9, 12, 16],
  [0, 4, 9, 7],
  [4, 2, 4, 7],
  [7, 12, 11, 12],
  [0, 5, 9, 12],
  [9, 7, 12, 16],
  [2, 4, 7, 9],
  [7, 4, 9, 12],
  [12, 7, 9, 16],
  [0, 4, 2, 7],
  [5, 9, 7, 12],
  [4, 0, 7, 12],
  [12, 11, 12, 16],
];
// Seconds per note; the last one rings. Three-note rhythms skip the melody's second note.
const RHYTHMS = [
  [0.08, 0.08, 0.08, 0.18],
  [0.06, 0.06, 0.12, 0.18],
  [0.11, 0.055, 0.11, 0.18],
  [0.055, 0.055, 0.055, 0.2],
  [0.09, 0.09, 0.2],
  [0.07, 0.14, 0.2],
];
const VOICES: Voice[] = ["bell", "glass", "pluck", "flute"];

/** Someone's own little tune, always the same for the same name. */
export function tuneOf(name: string) {
  const r = rng(name.trim().toLowerCase());
  let melody = MELODIES[Math.floor(r() * MELODIES.length)];
  const rhythm = RHYTHMS[Math.floor(r() * RHYTHMS.length)];
  const voice = VOICES[Math.floor(r() * VOICES.length)];
  // Most tunes sit around C5-E6; some an octave lower (warmer), never higher (shrill).
  const octave = r() < 0.3 ? -12 : 0;
  if (rhythm.length === 3) melody = [melody[0], melody[2], melody[3]];
  const notes = rhythm.map((len, i) => ({ freq: st(melody[i] + octave), len }));
  return { notes, voice };
}

function playTune(ac: Ctx, out: AudioNode, name: string, t: number): number {
  const { notes, voice } = tuneOf(name);
  let at = t;
  notes.forEach((n, i) => {
    const last = i === notes.length - 1;
    note(ac, out, n.freq, at, last ? n.len + 0.1 : n.len, voice, last ? 0.32 : 0.27);
    at += n.len;
  });
  return at - t;
}

/** Custom sound files, decoded once. */
const decoded = new Map<string, Promise<AudioBuffer | null>>();
function decode(ac: Ctx, data: string): Promise<AudioBuffer | null> {
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

/** Seconds between the event sound and the person's tune. */
const PAUSE = 0.1;

/** Schedules the parts one after another on `ac` (action sound, then the person's tune).
 *  Returns when the last note starts ringing out (seconds, in the context's time). */
export async function scheduleParts(ac: Ctx, parts: SoundPart[], volume: number, start: number): Promise<number> {
  const out = ac.createGain();
  out.gain.value = Math.min(1, volume);
  // A touch of echo makes the synth notes sound less dry.
  const echo = ac.createDelay(0.5);
  echo.delayTime.value = 0.11;
  const fb = ac.createGain();
  fb.gain.value = 0.22;
  const wet = ac.createGain();
  wet.gain.value = 0.18;
  out.connect(ac.destination);
  out.connect(echo).connect(fb).connect(echo);
  echo.connect(wet).connect(ac.destination);
  let t = start;
  for (const [i, p] of parts.entries()) {
    if ("sound" in p) {
      // A tiny pause before the person's tune, so the two read as separate sounds.
      if (p.sound !== "none") t += builtIn(ac, out, p.sound, t) + (i < parts.length - 1 ? PAUSE : 0);
    } else if ("tune" in p) {
      t += playTune(ac, out, p.tune, t);
    } else {
      const buf = await decode(ac, p.data);
      if (!buf) continue;
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.connect(out);
      if (ac instanceof AudioContext) t = Math.max(t, ac.currentTime + 0.02);
      src.start(t, 0, Math.min(buf.duration, 6));
      t += Math.min(buf.duration, 6) + 0.03;
    }
  }
  return t;
}

/** Plays the parts one after another. Resolves when done. */
export async function playParts(parts: SoundPart[], volume: number): Promise<void> {
  const ac = ctx();
  if (!ac || volume <= 0 || !parts.length) return;
  const end = await scheduleParts(ac, parts, volume, ac.currentTime + 0.03);
  // The next queued notification may start while this one rings out.
  await new Promise((r) => setTimeout(r, Math.max(0, (end + 0.25 - ac.currentTime) * 1000)));
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
