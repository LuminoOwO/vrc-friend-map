// Friend-to-friend time together, seen through VRChat's live friend
// locations. While the app runs (on any device), every minute it looks at
// where each friend is; friends in the same instance get that minute added
// to their pair, whether or not you are there. Private/invite-only
// locations are hidden by VRChat, so those don't count. Stored in
// store/observed.json.
import { backend } from "./backend";
import { getState, setState } from "./store";
import type { PairTime, PresenceStats } from "./types";

const TICK_MS = 60_000;
/** Longer gaps (computer asleep, app closed) aren't counted. */
const MAX_GAP_MS = 3 * 60_000;
const DAY_OFFSET_MS = 6 * 3600_000;
const DAY_MIN_SECS = 600;
const VERSION = 1;

interface PairAcc {
  /** seconds together */
  s: number;
  /** crowd-weighted seconds (1/√(friends there − 1)) */
  w: number;
  /** last time together (ms) */
  l: number;
  /** days with 10+ minutes together */
  dc: number;
  /** current day key and seconds on it */
  cd: number;
  cs: number;
}

interface Observed {
  version: number;
  since: number;
  pairs: Record<string, PairAcc>;
  /** world id -> seconds friends spent there together */
  worlds: Record<string, number>;
  [k: string]: unknown;
}

let data: Observed | null = null;
let lastTick = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let dirty = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const dayOf = (t: number) => Math.floor((t - new Date(t).getTimezoneOffset() * 60000 - DAY_OFFSET_MS) / 86400000);

export async function startObserving() {
  if (timer) return;
  if (!data) {
    try {
      const raw = await backend.storeRead("observed");
      const parsed = raw ? JSON.parse(raw) : null;
      data = parsed && typeof parsed === "object" && parsed.pairs ? { worlds: {}, ...parsed } : null;
    } catch {
      data = null;
    }
    data ??= { version: VERSION, since: Date.now(), pairs: {}, worlds: {} };
  }
  lastTick = Date.now();
  timer = setInterval(tick, TICK_MS);
  publish();
}

export function stopObserving() {
  if (timer) clearInterval(timer);
  timer = null;
  flush();
}

function tick() {
  const s = getState();
  const now = Date.now();
  const gap = now - lastTick;
  lastTick = now;
  if (!data || s.demo || s.mode !== "app" || !s.settings.groups.useLive || gap > MAX_GAP_MS) return;
  const dt = gap / 1000;
  // Group friends by exact instance.
  const byLocation = new Map<string, string[]>();
  for (const f of Object.values(s.cache.friends)) {
    if (!f.location?.startsWith("wrld_") || s.cache.presence[f.id] === "offline") continue;
    if (!byLocation.has(f.location)) byLocation.set(f.location, []);
    byLocation.get(f.location)!.push(f.id);
  }
  const day = dayOf(now);
  for (const [loc, ids] of byLocation) {
    if (ids.length < 2) continue;
    const weight = 1 / Math.sqrt(ids.length - 1);
    const world = loc.split(":")[0];
    data.worlds[world] = (data.worlds[world] ?? 0) + dt * (ids.length - 1);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const k = key(ids[i], ids[j]);
        const p = (data.pairs[k] ??= { s: 0, w: 0, l: 0, dc: 0, cd: day, cs: 0 });
        if (p.cd !== day) {
          p.cd = day;
          p.cs = 0;
        }
        const before = p.cs;
        p.s += dt;
        p.w += dt * weight;
        p.cs += dt;
        p.l = now;
        if (before < DAY_MIN_SECS && p.cs >= DAY_MIN_SECS) p.dc++;
        dirty = true;
      }
    }
  }
  if (dirty) {
    publish();
    scheduleSave();
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flush();
  }, 5 * 60_000);
}

function flush() {
  if (!data || !dirty || getState().demo) return;
  dirty = false;
  backend.storeWrite("observed", JSON.stringify(data)).catch(() => {
    dirty = true;
  });
}

/** Share the current numbers with the UI (as pair stats like the game logs give). */
function publish() {
  if (!data) return;
  const pairs: PairTime[] = Object.entries(data.pairs).map(([k, p]) => {
    const [a, b] = k.split("|");
    return { a, b, secs: p.s, weighted: p.w, visits: p.dc, days: p.dc, last: Math.floor((p.l - new Date(p.l).getTimezoneOffset() * 60000) / 1000) };
  });
  setState({ observed: { pairs, since: data.since } });
}

export async function forgetObserved() {
  data = { version: VERSION, since: Date.now(), pairs: {}, worlds: {} };
  dirty = true;
  flush();
  publish();
}

/** Add live-location pairs to game-log stats (either may be missing). */
export function combineStats(logs: PresenceStats | null, live: PairTime[] | null): PresenceStats | null {
  if (!live?.length) return logs;
  const merged = new Map<string, PairTime>();
  for (const p of logs?.pairs ?? []) merged.set(key(p.a, p.b), { ...p });
  for (const p of live) {
    const k = key(p.a, p.b);
    const m = merged.get(k);
    if (m) {
      m.secs += p.secs;
      m.weighted += p.weighted;
      m.days = Math.max(m.days, p.days);
      m.visits += p.visits;
      m.last = Math.max(m.last, p.last);
    } else merged.set(k, { ...p });
  }
  return {
    people: logs?.people ?? [],
    pairs: [...merged.values()].sort((x, y) => y.weighted - x.weighted),
    visits: logs?.visits ?? 0,
    play_secs: logs?.play_secs ?? 0,
    first: logs?.first ?? 0,
    last: logs?.last ?? 0,
  };
}
