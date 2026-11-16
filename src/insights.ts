// Things worked out from your friend graph (mutual friends), the friend
// change log and the game logs: clusters, bridges, paths, comparisons,
// drifting apart, the friend list over time, the map at an earlier date and
// friendiversaries. All pure functions over the store's data.
import { louvain } from "./groups";
import type { Cache, FriendLogEntry, PersonTime } from "./types";

export type Graph = Map<string, Set<string>>;

/** Friend graph from mutuals: an edge where either side lists the other. */
export function friendGraph(cache: Pick<Cache, "friends" | "mutuals">): Graph {
  const g: Graph = new Map();
  const ids = Object.keys(cache.friends);
  for (const id of ids) g.set(id, new Set());
  for (const id of ids) {
    for (const m of cache.mutuals[id]?.ids ?? []) {
      if (!g.has(m) || m === id) continue;
      g.get(id)!.add(m);
      g.get(m)!.add(id);
    }
  }
  return g;
}

/** Friend groups in the graph (Louvain), biggest first, at least `minSize` people. */
export function clusters(g: Graph, resolution = 1, minSize = 3): string[][] {
  const ids = [...g.keys()].filter((id) => g.get(id)!.size > 0).sort();
  const index = new Map(ids.map((id, i) => [id, i]));
  const edges: [number, number, number][] = [];
  for (const a of ids) for (const b of g.get(a)!) if (a < b && index.has(b)) edges.push([index.get(a)!, index.get(b)!, 1]);
  if (!edges.length) return [];
  const comm = louvain(ids.length, edges, resolution);
  const groups = new Map<number, string[]>();
  ids.forEach((id, i) => groups.set(comm[i], [...(groups.get(comm[i]) ?? []), id]));
  return [...groups.values()].filter((m) => m.length >= minSize).sort((a, b) => b.length - a.length);
}

export interface Bridge {
  id: string;
  /** Indexes into the clusters list, with how many friends they have in each. */
  groups: { index: number; links: number }[];
  score: number;
}

/** People who connect two or more friend groups (at least 2 friends in each). */
export function bridges(g: Graph, groups: string[][]): Bridge[] {
  const of = new Map<string, number>();
  groups.forEach((m, i) => m.forEach((id) => of.set(id, i)));
  const out: Bridge[] = [];
  for (const [id, nb] of g) {
    const counts = new Map<number, number>();
    for (const n of nb) {
      const c = of.get(n);
      if (c !== undefined) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const strong = [...counts].filter(([, n]) => n >= 2).map(([index, links]) => ({ index, links }));
    if (strong.length < 2) continue;
    strong.sort((a, b) => b.links - a.links);
    // Weaker side counts: someone deep in two groups bridges more than one with a single tie.
    const score = strong.slice(1).reduce((a, s) => a + s.links, 0);
    out.push({ id, groups: strong, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Shortest chain of friends from a to b (both ends included), or null. */
export function shortestPath(g: Graph, a: string, b: string, maxLen = 8): string[] | null {
  if (a === b) return [a];
  if (!g.has(a) || !g.has(b)) return null;
  const prev = new Map<string, string>([[a, a]]);
  let frontier = [a];
  for (let d = 0; d < maxLen && frontier.length; d++) {
    const next: string[] = [];
    for (const x of frontier) {
      for (const y of g.get(x) ?? []) {
        if (prev.has(y)) continue;
        prev.set(y, x);
        if (y === b) {
          const path = [b];
          let cur = b;
          while (cur !== a) path.push((cur = prev.get(cur)!));
          return path.reverse();
        }
        next.push(y);
      }
    }
    frontier = next;
  }
  return null;
}

/** Shared and non-shared friends of two people. */
export function compare(g: Graph, a: string, b: string): { both: string[]; onlyA: string[]; onlyB: string[] } {
  const na = g.get(a) ?? new Set<string>();
  const nb = g.get(b) ?? new Set<string>();
  const both = [...na].filter((x) => nb.has(x) && x !== a && x !== b);
  const onlyA = [...na].filter((x) => !nb.has(x) && x !== b);
  const onlyB = [...nb].filter((x) => !na.has(x) && x !== a);
  return { both, onlyA, onlyB };
}

/** Friend introducers: your friends who are friends with someone you aren't friends with. */
export function introducers(mutualsOfThem: string[], myFriends: Set<string>): string[] {
  return mutualsOfThem.filter((id) => myFriends.has(id));
}

export interface Drift {
  id: string;
  /** Hours together in total, and when you were last together (ms). */
  hours: number;
  last: number;
}

/** People you spent a lot of time with but haven't been with for a while. */
export function driftingApart(people: PersonTime[], now = Date.now(), opts = { minHours: 5, quietDays: 45 }): Drift[] {
  return people
    .map((p) => ({ id: p.id, hours: p.secs / 3600, last: naiveMs(p.last) }))
    .filter((p) => p.hours >= opts.minHours && now - p.last > opts.quietDays * 864e5)
    .sort((a, b) => b.hours - a.hours);
}

/** Game-log times are wall-clock seconds read as UTC; turn into local ms. */
export function naiveMs(secs: number): number {
  const d = new Date(secs * 1000);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()).getTime();
}

/** Who was a friend at time t, from the current list and the change log. */
export function friendsAt(current: string[], log: FriendLogEntry[], t: number): Set<string> {
  const set = new Set(current);
  // Walk back from now: undo changes made after t.
  for (const e of [...log].sort((a, b) => b.t - a.t)) {
    if (e.t <= t) break;
    if (e.type === "added") set.delete(e.id);
    else set.add(e.id);
  }
  return set;
}

export interface MonthCount {
  month: string;
  size: number;
  added: number;
  removed: number;
}

/** Friend list size, adds and removes per month, from the change log. */
export function listOverTime(current: string[], log: FriendLogEntry[], since: number, now = Date.now()): MonthCount[] {
  if (!since) return [];
  const out: MonthCount[] = [];
  const start = new Date(since);
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur.getTime() <= now) {
    const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const inMonth = log.filter((e) => e.t >= cur.getTime() && e.t < next.getTime());
    out.push({
      month: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`,
      size: friendsAt(current, log, Math.min(next.getTime() - 1, now)).size,
      added: inMonth.filter((e) => e.type === "added").length,
      removed: inMonth.filter((e) => e.type === "removed").length,
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

/** When you became friends (the latest "added" in the log), or null when it's from before the log. */
export function friendsSince(id: string, log: FriendLogEntry[]): number | null {
  let t: number | null = null;
  for (const e of log) if (e.id === id && e.type === "added") t = e.t;
  // Removed after the last add: not friends now.
  if (t !== null && log.some((e) => e.id === id && e.type === "removed" && e.t > t!)) return null;
  return t;
}

export interface Anniversary {
  id: string;
  /** "1 year", "6 months", "100 days" */
  label: string;
  key: string;
}

/** Friendiversaries today: every full year, 1, 6 and 100-day marks. */
export function anniversariesOn(day: Date, current: string[], log: FriendLogEntry[]): Anniversary[] {
  const out: Anniversary[] = [];
  const dayKey = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
  for (const id of current) {
    const t = friendsSince(id, log);
    if (t === null) continue;
    const s = new Date(t);
    const days = Math.round((new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() - new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime()) / 864e5);
    if (days <= 0) continue;
    const sameDay = s.getDate() === day.getDate();
    const months = (day.getFullYear() - s.getFullYear()) * 12 + day.getMonth() - s.getMonth();
    let label: string | null = null;
    if (sameDay && s.getMonth() === day.getMonth() && months >= 12) label = `${months / 12} year${months === 12 ? "" : "s"}`;
    else if (sameDay && (months === 1 || months === 6)) label = `${months} month${months === 1 ? "" : "s"}`;
    else if (days === 100) label = "100 days";
    if (label) out.push({ id, label, key: `${id}|${dayKey}` });
  }
  return out;
}

/** Instances with at least `min` of the given people in them (location → ids). */
export function gatherings(locations: Record<string, string>, who: Set<string>, min: number): Map<string, string[]> {
  const by = new Map<string, string[]>();
  for (const [id, loc] of Object.entries(locations)) {
    if (!who.has(id) || !loc || !loc.includes(":") || loc === "offline" || loc === "private" || loc === "traveling") continue;
    by.set(loc, [...(by.get(loc) ?? []), id]);
  }
  for (const [k, v] of by) if (v.length < min) by.delete(k);
  return by;
}
