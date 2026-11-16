// History kept on this device (store/history.json), never shared:
// - when friends are online (minutes per hour of the week, slowly fading so
//   old habits don't stick), and when they were last seen online;
// - your own online hours, for "best time to catch someone";
// - display names people used before;
// - notifications, so missed and dismissed ones can be looked at again;
// - when you last had the app open ("since you were last here").
import { useSyncExternalStore } from "react";
import { backend } from "./backend";
import { getState, subscribeState } from "./store";
import type { NotifyEvent } from "./types";

export interface SeenInfo {
  /** Last time seen online (ms). */
  last: number;
  /** Minutes online per hour of the week (0 = Sunday 00:00 local time), fading. */
  hours: number[];
  /** Total minutes observed (for "is there enough data"). */
  total: number;
}

export interface NameChange {
  name: string;
  /** First and last time we saw this name. */
  from: number;
  to: number;
}

export interface Missed {
  t: number;
  event: NotifyEvent;
  userId: string;
  name: string;
  text: string;
  /** Why it didn't make a sound: muted or quiet hours. Undefined: it was shown. */
  why?: "muted" | "quiet";
  read?: boolean;
}

export interface HistoryData {
  seen: Record<string, SeenInfo>;
  me: SeenInfo;
  names: Record<string, NameChange[]>;
  missed: Missed[];
  /** When the app was last open (ms) and what the friend list looked like then. */
  lastOpen: { t: number; friends: string[]; names: Record<string, string> } | null;
  /** Anniversaries already announced ("id|yyyy-mm-dd"). */
  announced: string[];
}

const FILE = "history";
const HOURS = 168;
const SAMPLE_MIN = 5;
/** Every week, older observations count this much less (half after ~13 weeks). */
const WEEKLY_FADE = 0.95;

const empty = (): HistoryData => ({ seen: {}, me: newSeen(), names: {}, missed: [], lastOpen: null, announced: [] });
const newSeen = (): SeenInfo => ({ last: 0, hours: new Array(HOURS).fill(0), total: 0 });

let data: HistoryData = empty();
let loaded = false;
const listeners = new Set<() => void>();
let version = 0;

function changed() {
  version++;
  listeners.forEach((l) => l());
  scheduleSave();
}

export function useHistory<T>(pick: (h: HistoryData) => T): T {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return pick(data);
}

export function history(): HistoryData {
  return data;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (!loaded || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void backend.storeWrite(FILE, JSON.stringify(data)).catch(() => {});
  }, 3000);
}

export async function flushHistory() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (loaded) await backend.storeWrite(FILE, JSON.stringify(data)).catch(() => {});
}

function fixSeen(v: unknown): SeenInfo {
  const o = (v && typeof v === "object" ? v : {}) as Partial<SeenInfo>;
  const hours = Array.isArray(o.hours) && o.hours.length === HOURS ? o.hours.map((x) => (typeof x === "number" && x >= 0 ? x : 0)) : new Array(HOURS).fill(0);
  return { last: typeof o.last === "number" ? o.last : 0, hours, total: typeof o.total === "number" ? o.total : 0 };
}

export function normalizeHistory(raw: unknown): HistoryData {
  const d = empty();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<HistoryData>;
  const seen: Record<string, SeenInfo> = {};
  for (const [k, v] of Object.entries(r.seen ?? {})) seen[k] = fixSeen(v);
  return {
    seen,
    me: fixSeen(r.me),
    names: (r.names && typeof r.names === "object" ? r.names : {}) as HistoryData["names"],
    missed: Array.isArray(r.missed) ? r.missed.filter((m) => m && typeof m.t === "number").slice(-500) : [],
    lastOpen: r.lastOpen && typeof r.lastOpen.t === "number" ? r.lastOpen : null,
    announced: Array.isArray(r.announced) ? r.announced.slice(-2000) : [],
  };
}

export async function loadHistory() {
  if (loaded) return;
  try {
    const raw = await backend.storeRead(FILE);
    data = normalizeHistory(raw ? JSON.parse(raw) : null);
  } catch {
    data = empty();
  }
  loaded = true;
  changed();
}

/** Hour of the week (0–167) for a time, in this device's time zone. */
export function weekHour(t: number): number {
  const d = new Date(t);
  return d.getDay() * 24 + d.getHours();
}

function addMinutes(info: SeenInfo, t: number, minutes: number) {
  info.hours[weekHour(t)] += minutes;
  info.total += minutes;
  info.last = Math.max(info.last, t);
}

/** One observation round: who is online right now. Called every few minutes. */
export function sample(now = Date.now()) {
  const s = getState();
  if (s.demo || s.mode !== "app") return;
  let any = false;
  for (const [id, p] of Object.entries(s.cache.presence)) {
    if (p !== "online") continue;
    const info = (data.seen[id] ??= newSeen());
    addMinutes(info, now, SAMPLE_MIN);
    any = true;
  }
  // You: in game per the live game log, or (phones, no logs) your own presence.
  const meOnline = (!!s.here?.active && !s.here.closed && !!s.here.location) || s.cache.presence[s.cache.me?.id ?? ""] === "online";
  if (meOnline) addMinutes(data.me, now, SAMPLE_MIN);
  if (any || meOnline) changed();
}

/** Note when someone went offline (from live events), so "last seen" is exact. */
export function sawOnline(id: string, t = Date.now()) {
  const info = (data.seen[id] ??= newSeen());
  if (t > info.last) {
    info.last = t;
    changed();
  }
}

let fadedAt = 0;
function fadeWeekly(now: number) {
  const key = Math.floor(now / (7 * 864e5));
  if (fadedAt === key) return;
  const last = (data as HistoryData & { fadeWeek?: number }).fadeWeek ?? key;
  const weeks = key - last;
  fadedAt = key;
  (data as HistoryData & { fadeWeek?: number }).fadeWeek = key;
  if (weeks <= 0) return;
  const f = Math.pow(WEEKLY_FADE, weeks);
  for (const info of [...Object.values(data.seen), data.me]) info.hours = info.hours.map((h) => h * f);
  changed();
}

// ---------- names ----------

/** Keep track of display names (called after each friends sync). */
export function noteNames(now = Date.now()) {
  const s = getState();
  let dirty = false;
  const people = { ...(s.cache.others ?? {}), ...s.cache.friends };
  for (const [id, f] of Object.entries(people)) {
    const name = f.displayName;
    if (!name) continue;
    const list = (data.names[id] ??= []);
    const cur = list[list.length - 1];
    if (cur && cur.name === name) {
      if (now - cur.to > 36e5) {
        cur.to = now;
        dirty = true;
      }
      continue;
    }
    list.push({ name, from: now, to: now });
    if (list.length > 30) list.splice(0, list.length - 30);
    dirty = true;
  }
  if (dirty) changed();
}

/** Earlier names (newest first), not the current one. */
export function earlierNames(id: string): NameChange[] {
  const list = data.names[id] ?? [];
  return list.slice(0, -1).reverse();
}

// ---------- missed notifications ----------

export function recordMissed(m: Missed) {
  data.missed.push(m);
  if (data.missed.length > 500) data.missed.splice(0, data.missed.length - 500);
  changed();
}

export function unreadCount(): number {
  return data.missed.filter((m) => !m.read && m.why).length;
}

export function markAllRead() {
  for (const m of data.missed) m.read = true;
  changed();
}

export function clearMissed() {
  data.missed = [];
  changed();
}

// ---------- since you were last here ----------

export interface SinceLast {
  since: number;
  cameOnline: string[];
  renamed: { id: string; from: string; to: string }[];
  added: string[];
  removed: { id: string; name: string }[];
}

/** What changed since the app was last open (null: first time, or under an hour ago). */
export function sinceLastHere(): SinceLast | null {
  const lo = data.lastOpen;
  const s = getState();
  if (!lo || Date.now() - lo.t < 36e5) return null;
  const before = new Set(lo.friends);
  const now = Object.keys(s.cache.friends);
  const nowSet = new Set(now);
  const added = now.filter((id) => !before.has(id));
  const removed = lo.friends.filter((id) => !nowSet.has(id)).map((id) => ({ id, name: lo.names[id] ?? id }));
  const renamed = now
    .filter((id) => lo.names[id] && s.cache.friends[id]?.displayName && lo.names[id] !== s.cache.friends[id].displayName)
    .map((id) => ({ id, from: lo.names[id], to: s.cache.friends[id].displayName }));
  const cameOnline = Object.entries(data.seen)
    .filter(([id, v]) => v.last > lo.t && nowSet.has(id))
    .sort((a, b) => b[1].last - a[1].last)
    .map(([id]) => id);
  if (!added.length && !removed.length && !renamed.length && !cameOnline.length) return null;
  return { since: lo.t, cameOnline, renamed, added, removed };
}

/** Remember this visit (called every few minutes while open, and on close). */
export function noteOpen(now = Date.now()) {
  const s = getState();
  if (s.demo || s.mode !== "app" || !Object.keys(s.cache.friends).length) return;
  data.lastOpen = {
    t: now,
    friends: Object.keys(s.cache.friends),
    names: Object.fromEntries(Object.entries(s.cache.friends).map(([id, f]) => [id, f.displayName])),
  };
  changed();
}

/** The previous visit, captured once at start (before noteOpen overwrites it). */
let previous: SinceLast | null | undefined;
export function previousVisit(): SinceLast | null {
  if (previous === undefined) previous = sinceLastHere();
  return previous;
}
export function dismissPreviousVisit() {
  previous = null;
  changed();
}

// ---------- the sampler ----------

let timer: ReturnType<typeof setInterval> | null = null;
let openTimer: ReturnType<typeof setInterval> | null = null;

export function startHistory() {
  void loadHistory().then(() => {
    // Work out the summary from the stored visit once friends are loaded.
    const unsub = subscribeState(() => {
      if (previous === undefined && Object.keys(getState().cache.friends).length && getState().sync.message) {
        previousVisit();
        noteOpen();
        unsub();
        changed();
      }
    });
  });
  if (timer) return;
  timer = setInterval(() => {
    const now = Date.now();
    fadeWeekly(now);
    sample(now);
  }, SAMPLE_MIN * 60e3);
  openTimer = setInterval(() => {
    if (previous !== undefined) noteOpen();
  }, 10 * 60e3);
  if (typeof window !== "undefined")
    window.addEventListener("beforeunload", () => {
      if (previous !== undefined) noteOpen();
      void flushHistory();
    });
}

export function stopHistory() {
  if (timer) clearInterval(timer);
  if (openTimer) clearInterval(openTimer);
  timer = openTimer = null;
}

// ---------- reading it ----------

/** Last seen online: the app's own observation or VRChat's last activity. */
export function lastSeen(id: string): number {
  const s = getState();
  const f = s.cache.friends[id];
  const vrc = Math.max(Date.parse(f?.last_activity ?? "") || 0, Date.parse(f?.last_login ?? "") || 0);
  return Math.max(data.seen[id]?.last ?? 0, vrc);
}

/** 168 shares (0–1) of how often someone is online at each hour of the week. */
export function onlineShare(info: SeenInfo | undefined): number[] | null {
  if (!info || info.total < 60) return null;
  const max = Math.max(...info.hours);
  return max > 0 ? info.hours.map((h) => h / max) : null;
}

/** Hours of the week when both you and they are usually online (share ≥ 0.35 each). */
export function overlap(id: string): { hour: number; score: number }[] | null {
  const a = onlineShare(data.me);
  const b = onlineShare(data.seen[id]);
  if (!a || !b) return null;
  return a.map((x, hour) => ({ hour, score: Math.min(x, b[hour]) })).filter((h) => h.score >= 0.35);
}

const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** "weekdays 20–23, Saturdays 14–18" from hours of the week. */
export function describeHours(hours: number[]): string {
  if (!hours.length) return "";
  const byDay = new Map<number, number[]>();
  for (const h of hours) {
    const d = Math.floor(h / 24);
    byDay.set(d, [...(byDay.get(d) ?? []), h % 24]);
  }
  const ranges = (hs: number[]) => {
    const sorted = [...new Set(hs)].sort((a, b) => a - b);
    const out: string[] = [];
    let start = sorted[0];
    let prev = sorted[0];
    for (const h of [...sorted.slice(1), -99]) {
      if (h === prev + 1) {
        prev = h;
        continue;
      }
      out.push(`${start}–${prev + 1}`);
      start = prev = h;
    }
    return out.join(", ");
  };
  const keyOf = (d: number) => ranges(byDay.get(d) ?? []);
  const weekdays = [1, 2, 3, 4, 5];
  const parts: string[] = [];
  const wk = weekdays.map(keyOf);
  if (wk.every((k) => k && k === wk[0])) {
    parts.push(`weekdays ${wk[0]}`);
    for (const d of [6, 0]) if (byDay.has(d)) parts.push(`${DAYS[d]} ${keyOf(d)}`);
  } else {
    for (const d of [1, 2, 3, 4, 5, 6, 0]) if (byDay.has(d)) parts.push(`${DAYS[d]} ${keyOf(d)}`);
  }
  return parts.join("; ");
}
