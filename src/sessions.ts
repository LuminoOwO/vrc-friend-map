// Exact online sessions: when each friend came online and went offline (from the live
// connection), and when this app was watching at all, so "offline" and "nobody was watching"
// can be told apart. Kept on this device for SESSION_DAYS days (file "sessions"). Your server's
// logger can fill in the times this device was off (src/components/TimesView.tsx asks it).
import { backend, isTauri } from "./backend";
import { getState, subscribeState } from "./store";

export type Span = [number, number]; // ms
export interface SessionsData {
  /** Per friend: online from–to (ms). The last one may still be growing. */
  sessions: Record<string, Span[]>;
  /** When this app was connected and watching. */
  coverage: Span[];
}

const FILE = "sessions";
export const SESSION_DAYS = 45;
const TICK_MS = 60_000;
/** Two observations closer than this belong to the same span (a tick or two can be missed). */
const JOIN_MS = 3 * 60_000;

let data: SessionsData = { sessions: {}, coverage: [] };
let loaded = false;
let version = 0;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function sessionsData(): SessionsData {
  return data;
}
export function sessionsVersion(): number {
  return version;
}
export function onSessions(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

function changed() {
  version++;
  listeners.forEach((f) => f());
  if (!loaded || !isTauri || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void backend.storeWrite(FILE, JSON.stringify(data)).catch(() => {});
  }, 30_000);
}

/** Extend the last span to `t`, or start a new one if it ended too long ago. */
export function extend(list: Span[], t: number, join = JOIN_MS) {
  const last = list[list.length - 1];
  if (last && t >= last[0] && t - last[1] <= join) last[1] = Math.max(last[1], t);
  else list.push([t, t]);
}

/** Close the last span at `t` (they went offline). */
function close(list: Span[] | undefined, t: number) {
  const last = list?.[list.length - 1];
  if (last && t - last[1] <= JOIN_MS) last[1] = Math.max(last[1], t);
}

function prune(now: number) {
  const cut = now - SESSION_DAYS * 864e5;
  data.coverage = data.coverage.filter((s) => s[1] >= cut);
  for (const [id, l] of Object.entries(data.sessions)) {
    const k = l.filter((s) => s[1] >= cut);
    if (k.length) data.sessions[id] = k;
    else delete data.sessions[id];
  }
}

function readSpans(v: unknown): Span[] {
  return Array.isArray(v) ? v.filter((s): s is Span => Array.isArray(s) && typeof s[0] === "number" && typeof s[1] === "number" && s[1] >= s[0]) : [];
}

let lastPresence: Record<string, string> = {};
let watching = false;

function watchingNow(): boolean {
  const s = getState();
  return s.mode === "app" && !s.demo && Object.keys(s.cache.friends).length > 0;
}

function tick(now = Date.now()) {
  watching = watchingNow();
  if (!watching) return;
  extend(data.coverage, now);
  const presence = getState().cache.presence;
  for (const [id, p] of Object.entries(presence)) if (p === "online") extend((data.sessions[id] ??= []), now);
  // You: in VRChat per the live game log (computers), or your own presence (phones).
  const s = getState();
  const me = (!!s.here?.active && !s.here.closed && !!s.here.location) || s.cache.presence[s.cache.me?.id ?? ""] === "online";
  if (me) extend((data.sessions[ME] ??= []), now);
  changed();
}

/** Your own sessions are kept under this id (in VRChat per the live game log). */
export const ME = "__me__";

let seenPresence: unknown = null;

/** Presence changes as they happen: exact start and end times. */
function onState() {
  const s = getState();
  const presence = s.cache.presence;
  if (presence === seenPresence) return;
  seenPresence = presence;
  if (!watchingNow()) {
    lastPresence = { ...presence };
    return;
  }
  const now = Date.now();
  let any = false;
  for (const [id, p] of Object.entries(presence)) {
    const was = lastPresence[id] === "online";
    const is = p === "online";
    if (is && !was) {
      extend((data.sessions[id] ??= []), now, watching ? JOIN_MS : 0);
      any = true;
    } else if (!is && was) {
      close(data.sessions[id], now);
      any = true;
    }
  }
  lastPresence = { ...presence };
  if (any) changed();
}

export async function startSessions() {
  if (loaded) return;
  try {
    const raw = isTauri ? await backend.storeRead(FILE) : null;
    const r = raw ? (JSON.parse(raw) as Partial<SessionsData>) : {};
    const sessions: Record<string, Span[]> = {};
    for (const [k, v] of Object.entries(r.sessions ?? {})) sessions[k] = readSpans(v);
    data = { sessions, coverage: readSpans(r.coverage) };
  } catch {
    data = { sessions: {}, coverage: [] };
  }
  loaded = true;
  prune(Date.now());
  lastPresence = { ...getState().cache.presence };
  subscribeState(onState);
  tick();
  setInterval(() => tick(), TICK_MS);
  setInterval(() => prune(Date.now()), 6 * 3600e3);
  if (typeof window !== "undefined") window.addEventListener("beforeunload", () => void backend.storeWrite(FILE, JSON.stringify(data)).catch(() => {}));
}
