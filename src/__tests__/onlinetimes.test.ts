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
