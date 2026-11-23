// Online times for everyone at once (the "Online times" view): when each friend is usually
// online, hour by hour for a day of the week (or the whole week), how that overlaps with you,
// and how many friends are usually on at each hour. From the app's own observations
// (src/history.ts: minutes seen online per hour of the week).
import type { SeenInfo } from "./history";

/** Usually online at an hour: at least this share of their busiest hour. */
export const USUAL = 0.35;
/** Minutes observed before someone's pattern counts. */
export const ENOUGH_MIN = 60;

export type Day = number | "week"; // 0 = Sunday

/** Share (0–1, of their busiest hour) for each of the 24 hours of `day`; null without enough data. */
export function dayShares(info: SeenInfo | undefined, day: Day): number[] | null {
  if (!info || info.total < ENOUGH_MIN || info.hours.length < 168) return null;
  let hours: number[];
  if (day === "week") {
    hours = Array.from({ length: 24 }, (_, h) => {
      let sum = 0;
      for (let d = 0; d < 7; d++) sum += info.hours[d * 24 + h];
      return sum;
    });
  } else hours = info.hours.slice(day * 24, day * 24 + 24);
  const max = day === "week" ? Math.max(...hours) : Math.max(...info.hours);
  return max > 0 ? hours.map((v) => v / max) : null;
}

/** Hours of the week when both are usually on (each at least USUAL of their busiest hour). */
export function weeklyOverlap(me: SeenInfo | undefined, them: SeenInfo | undefined): number {
  if (!me || !them || me.total < ENOUGH_MIN || them.total < ENOUGH_MIN) return 0;
  const ma = Math.max(...me.hours);
  const mb = Math.max(...them.hours);
  if (!ma || !mb) return 0;
  let n = 0;
  for (let i = 0; i < 168; i++) if (me.hours[i] / ma >= USUAL && them.hours[i] / mb >= USUAL) n++;
  return n;
}

/** How many of these people are usually on at each of the 24 hours. */
export function usualCounts(shares: (number[] | null)[]): number[] {
  const out = new Array(24).fill(0);
  for (const s of shares) if (s) for (let h = 0; h < 24; h++) if (s[h] >= USUAL) out[h]++;
  return out;
}

/** A believable made-up week for demo mode (the same for the same id). */
export function demoSeen(id: string): SeenInfo {
  let x = 0;
  for (const c of id) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => ((x = (x * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const start = 15 + Math.floor(rnd() * 7); // evening start 15–21
  const len = 3 + Math.floor(rnd() * 5);
  const weekendEarly = Math.floor(rnd() * 5);
  const hours = new Array(168).fill(0);
  for (let d = 0; d < 7; d++) {
    const weekend = d === 0 || d === 6;
    const s = weekend ? start - weekendEarly : start;
    for (let k = -1; k <= len; k++) {
      const h = (s + k + 24) % 24;
      const edge = k < 0 || k === len ? 0.35 : 1;
      hours[d * 24 + h] += Math.round(60 * edge * (0.5 + rnd() * 0.5) * (rnd() < 0.85 ? 1 : 0.2));
    }
  }
  return { last: Date.now(), hours, total: hours.reduce((a, b) => a + b, 0) };
}

// ---------- exact sessions (src/sessions.ts, plus your server's logger) ----------

export type Span = [number, number];

/** Spans joined into a sorted list without overlaps. */
export function unionSpans(...lists: Span[][]): Span[] {
  const all = lists.flat().filter((s) => s[1] >= s[0]).sort((a, b) => a[0] - b[0]);
  const out: Span[] = [];
  for (const s of all) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else out.push([s[0], s[1]]);
  }
  return out;
}

/** Short disconnects (a crash, a dropped connection, a game restart) aren't really going
 *  offline: gaps up to `gapMs` are joined. Returns the joined spans and how many gaps it closed. */
export function joinShortGaps(spans: Span[], gapMs: number): { spans: Span[]; joined: number[] } {
  const out: Span[] = [];
  const joined: number[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && gapMs > 0 && s[0] - last[1] <= gapMs) {
      joined.push(last[1]);
      last[1] = Math.max(last[1], s[1]);
    } else out.push([s[0], s[1]]);
  }
  return { spans: out, joined };
}

/** Only the part between `from` and `to`. */
export function clipSpans(spans: Span[], from: number, to: number): Span[] {
  return spans.filter((s) => s[1] > from && s[0] < to).map((s) => [Math.max(s[0], from), Math.min(s[1], to)] as Span);
}

/** Total time in the spans (ms). */
export function totalMs(spans: Span[]): number {
  return spans.reduce((a, s) => a + s[1] - s[0], 0);
}

/** Time both were online (ms); both lists sorted, without overlaps. */
export function overlapMs(a: Span[], b: Span[]): number {
  let i = 0;
  let j = 0;
  let sum = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i][0], b[j][0]);
    const e = Math.min(a[i][1], b[j][1]);
    if (e > s) sum += e - s;
    if (a[i][1] < b[j][1]) i++;
    else j++;
  }
  return sum;
}

/** Parts of `from`–`to` nobody was watching (neither this device nor your server). */
export function gapsIn(coverage: Span[], from: number, to: number): Span[] {
  const out: Span[] = [];
  let t = from;
  for (const c of unionSpans(coverage)) {
    if (c[1] <= t) continue;
    if (c[0] >= to) break;
    if (c[0] > t) out.push([t, c[0]]);
    t = Math.max(t, c[1]);
  }
  if (t < to) out.push([t, to]);
  return out;
}

/** Demo mode: two weeks of made-up sessions (from the same patterns as demoSeen), with short
 *  disconnects, and a night the app was off. */
export function demoSessions(ids: string[], now = Date.now()): { sessions: Record<string, Span[]>; coverage: Span[] } {
  const day = 864e5;
  const start = now - 14 * day;
  const sessions: Record<string, Span[]> = {};
  for (const id of ids) {
    const seen = demoSeen(id);
    let x = 0;
    for (const c of id) x = (x * 33 + c.charCodeAt(0)) >>> 0;
    const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const list: Span[] = [];
    let cur: Span | null = null;
    for (let t = start - (start % 3600e3); t < now; t += 3600e3) {
      const d = new Date(t);
      const v = seen.hours[d.getDay() * 24 + d.getHours()] / 60;
      if (rnd() < v * 0.9) {
        // Online this hour: carry on from the last hour, or start somewhere in it.
        if (cur && cur[1] >= t) cur[1] = Math.min(now, t + 3600e3);
        else {
          cur = [t + rnd() * 40 * 60e3, Math.min(now, t + 3600e3)];
          list.push(cur);
        }
      } else if (cur && cur[1] >= t) {
        cur[1] = t + rnd() * 30 * 60e3; // went off somewhere in this hour
        cur = null;
      }
    }
    // Now and then a crash: a few minutes away in the middle of a long session.
    for (const s of [...list]) {
      if (s[1] - s[0] > 90 * 60e3 && rnd() < 0.15) {
        const at = s[0] + (s[1] - s[0]) * (0.3 + rnd() * 0.4);
        const back = at + (1 + rnd() * 3) * 60e3;
        list.push([back, s[1]]);
        s[1] = at;
      }
    }
    sessions[id] = unionSpans(list);
  }
  const gapStart = now - 3 * day - (now % day) + 2 * 3600e3;
  const coverage: Span[] = [
    [start, gapStart],
    [gapStart + 9 * 3600e3, now],
  ];
  for (const id of ids) sessions[id] = sessions[id].flatMap((s) => clipSpans([s], coverage[0][0], coverage[0][1]).concat(clipSpans([s], coverage[1][0], coverage[1][1])));
  return { sessions, coverage };
}
