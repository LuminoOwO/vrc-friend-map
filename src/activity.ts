// The activity log: who joined or left your instance, your world changes,
// VRChat starting and closing (from the game log, src-tauri/src/livelog.rs),
// and friends coming online, going offline, being added or removed (from the
// live connection). Kept on this device for a few days.
import { backend, isTauri } from "./backend";
import { naiveToDate } from "./logs";
import { getState, setState } from "./store";

export type ActivityKind =
  | "world" // you joined an instance
  | "join" // someone joined your instance
  | "leave" // someone left your instance
  | "left" // you left the instance
  | "quit" // VRChat closed
  | "crash" // VRChat went away without closing properly
  | "online" // a friend came online
  | "offline" // a friend went offline
  | "location" // a friend changed worlds
  | "friend-add"
  | "friend-remove";

export interface ActivityEntry {
  key: string;
  t: number; // ms since 1970
  kind: ActivityKind;
  userId?: string;
  name?: string;
  worldId?: string;
  worldName?: string;
  location?: string;
  /** Already in the instance when you arrived. */
  initial?: boolean;
}

/** From livelog.rs. */
export interface LiveEvent {
  seq: number;
  ts: number;
  kind: "world" | "join" | "leave" | "left" | "quit" | "crash";
  id: string;
  name: string;
  worldId: string;
  worldName: string;
  location: string;
  initial: boolean;
}

const FILE = "activity";
const KEEP_DAYS = 4;
const KEEP_MAX = 6000;

let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function trim(list: ActivityEntry[]): ActivityEntry[] {
  const cutoff = Date.now() - KEEP_DAYS * 86400_000;
  const kept = list.filter((e) => e.t >= cutoff);
  return kept.length > KEEP_MAX ? kept.slice(kept.length - KEEP_MAX) : kept;
}

function save() {
  if (!isTauri || getState().demo) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    backend.storeWrite(FILE, JSON.stringify({ entries: getState().activity })).catch(() => {});
  }, 2000);
}

/** Add entries, skipping ones already there (same key). */
export function addActivity(entries: ActivityEntry[]) {
  if (!entries.length) return;
  const cur = getState().activity;
  const seen = new Set(cur.map((e) => e.key));
  const fresh = entries.filter((e) => !seen.has(e.key) && (seen.add(e.key), true));
  if (!fresh.length) return;
  const next = trim([...cur, ...fresh].sort((a, b) => a.t - b.t));
  setState({ activity: next });
  save();
}

export function fromLive(e: LiveEvent): ActivityEntry {
  return {
    key: `log|${e.ts}|${e.kind}|${e.id}|${e.location}`,
    t: naiveToDate(e.ts).getTime(),
    kind: e.kind,
    userId: e.id || undefined,
    name: e.name || undefined,
    worldId: e.worldId || undefined,
    worldName: e.worldName || undefined,
    location: e.location || undefined,
    initial: e.initial || undefined,
  };
}

/** A friend event from the live connection (sync.ts). */
export function noteFriend(kind: ActivityKind, userId: string, name: string, extra: Partial<ActivityEntry> = {}) {
  const t = Date.now();
  addActivity([{ key: `api|${t}|${kind}|${userId}`, t, kind, userId, name, ...extra }]);
}

export async function loadActivity() {
  if (loaded || !isTauri) return;
  loaded = true;
  try {
    const raw = await backend.storeRead(FILE);
    const parsed = raw ? JSON.parse(raw) : null;
    const entries: ActivityEntry[] = Array.isArray(parsed?.entries) ? parsed.entries.filter((e: ActivityEntry) => e && typeof e.t === "number" && typeof e.key === "string") : [];
    const cur = getState().activity;
    setState({ activity: trim([...entries, ...cur.filter((c) => !entries.some((e) => e.key === c.key))].sort((a, b) => a.t - b.t)) });
  } catch {
    /* start empty */
  }
}

export function clearActivity() {
  setState({ activity: [] });
  save();
}

/** Demo: a made-up evening. */
export function demoActivity(names: Record<string, string>, friendIds: string[]): ActivityEntry[] {
  const now = Date.now();
  const n = (id: string) => names[id] ?? id;
  const at = (minAgo: number) => now - minAgo * 60_000;
  const [a, b, c, d] = friendIds;
  const out: ActivityEntry[] = [
    { key: "d1", t: at(190), kind: "online", userId: a, name: n(a) },
    { key: "d2", t: at(120), kind: "world", worldId: "wrld_demo-2", worldName: "Midnight Rooftop" },
    { key: "d3", t: at(119), kind: "join", userId: b, name: n(b), initial: true },
    { key: "d4", t: at(95), kind: "join", userId: "usr_demo-stranger-0001", name: "Moonlit Fox" },
    { key: "d5", t: at(70), kind: "left" },
    { key: "d6", t: at(62), kind: "world", worldId: "wrld_demo", worldName: "The Black Cat" },
    { key: "d7", t: at(61), kind: "join", userId: c, name: n(c), initial: true },
    { key: "d8", t: at(40), kind: "offline", userId: d, name: n(d) },
    { key: "d9", t: at(5), kind: "join", userId: "usr_demo-stranger-0002", name: "Pixel Bard" },
    { key: "d10", t: at(2), kind: "leave", userId: "usr_demo-stranger-0001", name: "Moonlit Fox" },
  ];
  return out;
}
