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
