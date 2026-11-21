// The logbook: everything from your game logs, day by day. Visits with who
// was there and when, video links, pictures you took (tagged with the world
// and the people there at that minute), avatars people switched to, your own
// diary notes, rankings and a year in review. All on this device.
import { language } from "./i18n";
import { convertFileSrc } from "@tauri-apps/api/core";
import { backend, isTauri } from "./backend";
import { naiveToDate, nowNaive } from "./logs";

export interface TimelineStint {
  id: string;
  name: string;
  from: number;
  to: number;
}
export interface VideoEvent {
  t: number;
  url: string;
  by?: string;
}
export interface ShotEvent {
  t: number;
  path: string;
}
export interface AvatarEvent {
  t: number;
  id?: string;
  name: string;
  avatar: string;
}
export interface TimelineVisit {
  world: string;
  world_name: string;
  access: string;
  start: number;
  end: number;
  players: TimelineStint[];
  videos: VideoEvent[];
  shots: ShotEvent[];
  avatars: AvatarEvent[];
}
export interface Picture {
  path: string;
  name: string;
  t: number;
  size: number;
  width?: number;
  height?: number;
}

/** Days start at 06:00, like the stats (a late night counts as one evening). */
export const DAY_OFFSET = 6 * 3600;

/** "2026-11-08" for a naive time (with the 06:00 day start). */
export function dayKey(naive: number): string {
  const d = new Date((naive - DAY_OFFSET) * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Naive start of a day key. */
export function dayStart(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 1000 + DAY_OFFSET;
}

export function todayKey(): string {
  return dayKey(nowNaive());
}

export function shiftDay(key: string, days: number): string {
  return dayKey(dayStart(key) + days * 86400 + 1);
}

let all: { at: number; visits: TimelineVisit[] } | null = null;

/** All visits (cached for a minute). */
export async function allVisits(force = false): Promise<TimelineVisit[]> {
  if (!isTauri) return demoVisits();
  if (!force && all && Date.now() - all.at < 60e3) return all.visits;
  const visits = await backend.logsTimeline(0, nowNaive() + 86400);
  all = { at: Date.now(), visits };
  return visits;
}

export function visitsOnDay(visits: TimelineVisit[], key: string): TimelineVisit[] {
  const from = dayStart(key);
  const to = from + 86400;
  return visits.filter((v) => v.end > from && v.start < to);
}

export interface Session {
  start: number;
  end: number;
  visits: TimelineVisit[];
}

/** Play sessions: visits with less than 15 minutes between them. */
export function sessions(visits: TimelineVisit[]): Session[] {
  const out: Session[] = [];
  for (const v of [...visits].sort((a, b) => a.start - b.start)) {
    const cur = out[out.length - 1];
    if (cur && v.start - cur.end < 15 * 60) {
      cur.end = Math.max(cur.end, v.end);
      cur.visits.push(v);
    } else out.push({ start: v.start, end: v.end, visits: [v] });
  }
  return out;
}

export interface Rankings {
  totalSecs: number;
  days: number;
  worlds: { world: string; name: string; secs: number; visits: number }[];
  people: { id: string; name: string; secs: number; days: number; first: number }[];
  longest: Session[];
  /** Longest run of days in a row with play time, and the current one. */
  streak: { best: number; current: number };
  /** Seconds played per hour of the week (0 = Sunday 00). */
  heat: number[];
  busiestDay: { key: string; secs: number } | null;
  videos: number;
  shots: number;
  /** World → people most often with you there. */
  worldPeople: Map<string, { id: string; name: string; secs: number }[]>;
}

const overlapSecs = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function rankings(visits: TimelineVisit[], from = 0, to = Infinity, nowDay = todayKey()): Rankings {
  const vs = visits.filter((v) => v.end > from && v.start < to);
  const worlds = new Map<string, { world: string; name: string; secs: number; visits: number }>();
  const people = new Map<string, { id: string; name: string; secs: number; days: Set<string>; first: number }>();
  const byDay = new Map<string, number>();
  const heat = new Array(168).fill(0);
  const wp = new Map<string, Map<string, { id: string; name: string; secs: number }>>();
  let total = 0;
  let videos = 0;
  let shots = 0;
  for (const v of vs) {
    const secs = Math.max(0, Math.min(v.end, to) - Math.max(v.start, from));
    total += secs;
    videos += v.videos.length;
    shots += v.shots.length;
    const w = worlds.get(v.world) ?? { world: v.world, name: v.world_name || v.world, secs: 0, visits: 0 };
    w.secs += secs;
    w.visits++;
    if (v.world_name) w.name = v.world_name;
    worlds.set(v.world, w);
    const k = dayKey(v.start);
    byDay.set(k, (byDay.get(k) ?? 0) + secs);
    for (let t = Math.max(v.start, from); t < Math.min(v.end, to); t += 600) {
      const d = new Date(t * 1000);
      heat[d.getUTCDay() * 24 + d.getUTCHours()] += Math.min(600, Math.min(v.end, to) - t);
    }
    const wpm = wp.get(v.world) ?? new Map();
    for (const p of v.players) {
      const s = overlapSecs(p.from, p.to, from, to);
      if (!s) continue;
      const e = people.get(p.id) ?? { id: p.id, name: p.name, secs: 0, days: new Set<string>(), first: p.from };
      e.secs += s;
      e.days.add(dayKey(p.from));
      e.first = Math.min(e.first, p.from);
      if (p.name) e.name = p.name;
      people.set(p.id, e);
      const x = wpm.get(p.id) ?? { id: p.id, name: p.name, secs: 0 };
      x.secs += s;
      wpm.set(p.id, x);
    }
    wp.set(v.world, wpm);
  }
  // Streaks over day keys.
  const keys = [...byDay.keys()].filter((k) => (byDay.get(k) ?? 0) >= 300).sort();
  let best = 0;
  let run = 0;
  let prev = "";
  for (const k of keys) {
    run = prev && shiftDay(prev, 1) === k ? run + 1 : 1;
    best = Math.max(best, run);
    prev = k;
  }
  let current = 0;
  for (let k = nowDay; byDay.has(k) && (byDay.get(k) ?? 0) >= 300; k = shiftDay(k, -1)) current++;
  if (!current) for (let k = shiftDay(nowDay, -1); byDay.has(k) && (byDay.get(k) ?? 0) >= 300; k = shiftDay(k, -1)) current++;
  const busiest = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    totalSecs: total,
    days: byDay.size,
    worlds: [...worlds.values()].sort((a, b) => b.secs - a.secs),
    people: [...people.values()].map((p) => ({ id: p.id, name: p.name, secs: p.secs, days: p.days.size, first: p.first })).sort((a, b) => b.secs - a.secs),
    longest: sessions(vs)
      .sort((a, b) => b.end - b.start - (a.end - a.start))
      .slice(0, 5),
    streak: { best, current },
    heat,
    busiestDay: busiest ? { key: busiest[0], secs: busiest[1] } : null,
    videos,
    shots,
    worldPeople: new Map([...wp.entries()].map(([w, m]) => [w, [...m.values()].sort((a, b) => b.secs - a.secs).slice(0, 5)])),
  };
}

/** Who was in the instance at time t. */
export function presentAt(v: TimelineVisit, t: number): TimelineStint[] {
  return v.players.filter((p) => p.from <= t && p.to > t);
}

/** The avatar someone had at time t in a visit (last switch before t). */
export function avatarAt(v: TimelineVisit, p: TimelineStint, t: number): string | null {
  let out: string | null = null;
  for (const a of v.avatars) {
    if (a.t > t) break;
    if (a.id === p.id || (!a.id && a.name === p.name)) out = a.avatar;
  }
  return out;
}

/** Avatars a person was seen in (newest first, from the game logs). */
export function avatarHistory(visits: TimelineVisit[], id: string, name?: string): { avatar: string; t: number; world: string }[] {
  const out: { avatar: string; t: number; world: string }[] = [];
  for (const v of visits) for (const a of v.avatars) if (a.id === id || (!a.id && name && a.name === name)) out.push({ avatar: a.avatar, t: a.t, world: v.world_name });
  out.sort((a, b) => b.t - a.t);
  // Keep the first (newest) time each avatar was seen.
  const seen = new Set<string>();
  return out.filter((a) => (seen.has(a.avatar) ? false : (seen.add(a.avatar), true))).slice(0, 40);
}

export interface TaggedPicture extends Picture {
  world?: string;
  worldName?: string;
  people: TimelineStint[];
}

/** Tag pictures with the world and the people there at that minute (from the visits). */
export function tagPictures(pics: Picture[], visits: TimelineVisit[]): TaggedPicture[] {
  const sorted = [...visits].sort((a, b) => a.start - b.start);
  return pics.map((p) => {
    // Pictures the camera logged: match by file name.
    let v = sorted.find((x) => x.shots.some((s) => s.path.endsWith(p.name)));
    if (!v) v = sorted.find((x) => x.start <= p.t && x.end >= p.t);
    if (!v) return { ...p, people: [] };
    return { ...p, world: v.world, worldName: v.world_name, people: presentAt(v, p.t) };
  });
}

/** vrcpic:// URL for a local picture (served only from the picture folders). */
export function pictureSrc(path: string): string {
  return isTauri ? convertFileSrc(path, "vrcpic") : "";
}

export interface VideoRow extends VideoEvent {
  world: string;
  worldName: string;
}

export function allVideos(visits: TimelineVisit[]): VideoRow[] {
  return visits
    .flatMap((v) => v.videos.map((x) => ({ ...x, world: v.world, worldName: v.world_name })))
    .sort((a, b) => b.t - a.t);
}

export function fmtDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (h >= 100) return `${h} h`;
  return h ? `${h} h ${m} min` : `${m} min`;
}

export function fmtClock(naive: number): string {
  return naiveToDate(naive).toLocaleTimeString(language(), { hour: "2-digit", minute: "2-digit" });
}

// ---------- demo ----------

function demoVisits(): TimelineVisit[] {
  const now = nowNaive();
  const out: TimelineVisit[] = [];
  const worlds = [
    ["wrld_demo1", "The Black Cat"],
    ["wrld_demo2", "Movie Night"],
    ["wrld_demo3", "Midnight Rooftop"],
    ["wrld_demo4", "Just B Club"],
  ];
  const ppl = ["usr_demo_a", "usr_demo_b", "usr_demo_c", "usr_demo_d", "usr_demo_e"];
  for (let d = 0; d < 21; d++) {
    if (d % 4 === 3) continue;
    let t = now - d * 86400 - 5 * 3600;
    for (let i = 0; i < 3; i++) {
      const [w, name] = worlds[(d + i) % worlds.length];
      const len = (40 + ((d * 7 + i * 13) % 80)) * 60;
      out.push({
        world: w,
        world_name: name,
        access: i % 2 ? "friends+" : "public",
        start: t,
        end: t + len,
        players: ppl.slice(0, 2 + ((d + i) % 4)).map((id, k) => ({ id, name: `Demo friend ${k + 1}`, from: t + k * 120, to: t + len - k * 60 })),
        videos: name === "Movie Night" ? [{ t: t + 600, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", by: "Demo friend 1" }] : [],
        shots: [],
        avatars: [{ t: t + 60, id: ppl[0], name: "Demo friend 1", avatar: ["Fox Girl", "Protogen", "Cat Boy"][d % 3] }],
      });
      t += len + 300;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
