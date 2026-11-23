import { describe, expect, it } from "vitest";
import { dayShares, usualCounts, weeklyOverlap } from "../onlinetimes";
import type { SeenInfo } from "../history";

/** Online `mins` per hour at these hours, every day. */
function seen(hours: number[], mins = 60): SeenInfo {
  const h = new Array(168).fill(0);
  for (let d = 0; d < 7; d++) for (const x of hours) h[d * 24 + x] = mins;
  return { last: 0, hours: h, total: h.reduce((a, b) => a + b, 0) };
}

describe("online times", () => {
  it("shares for a day and for the whole week", () => {
    const s = dayShares(seen([20, 21]), 3)!;
    expect(s).toHaveLength(24);
    expect(s[20]).toBe(1);
    expect(s[10]).toBe(0);
    expect(dayShares(seen([20]), "week")![20]).toBe(1);
  });
  it("needs enough data", () => {
    expect(dayShares({ last: 0, hours: new Array(168).fill(0), total: 10 }, 1)).toBeNull();
    expect(dayShares(undefined, 1)).toBeNull();
  });
  it("counts weekly overlap hours", () => {
    expect(weeklyOverlap(seen([19, 20, 21]), seen([21, 22]))).toBe(7);
    expect(weeklyOverlap(seen([8]), seen([20]))).toBe(0);
  });
  it("counts who is usually on per hour", () => {
    const c = usualCounts([dayShares(seen([20, 21]), 2), dayShares(seen([21]), 2), null]);
    expect(c[20]).toBe(1);
    expect(c[21]).toBe(2);
    expect(c[3]).toBe(0);
  });
});

import { clipSpans, gapsIn, joinShortGaps, overlapMs, totalMs, unionSpans } from "../onlinetimes";

describe("exact sessions", () => {
  const m = 60_000;
  it("joins this device's and the server's spans", () => {
    expect(unionSpans([[0, 10], [30, 40]], [[5, 20], [50, 60]])).toEqual([[0, 20], [30, 40], [50, 60]]);
  });
  it("closes short disconnects only", () => {
    const r = joinShortGaps([[0, 10 * m], [12 * m, 30 * m], [60 * m, 90 * m]], 5 * m);
    expect(r.spans).toEqual([[0, 30 * m], [60 * m, 90 * m]]);
    expect(r.joined).toEqual([10 * m]);
    expect(joinShortGaps([[0, 10], [12, 20]], 0).spans).toHaveLength(2);
  });
  it("clips, totals and overlaps", () => {
    expect(clipSpans([[0, 100], [200, 300]], 50, 250)).toEqual([[50, 100], [200, 250]]);
    expect(totalMs([[0, 10], [20, 25]])).toBe(15);
    expect(overlapMs([[0, 100], [200, 300]], [[50, 250]])).toBe(100);
  });
  it("finds the times nobody was watching", () => {
    expect(gapsIn([[10, 20], [15, 30], [50, 60]], 0, 100)).toEqual([[0, 10], [30, 50], [60, 100]]);
    expect(gapsIn([[0, 100]], 0, 100)).toEqual([]);
  });
});
