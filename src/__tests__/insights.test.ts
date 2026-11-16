import { describe, expect, it } from "vitest";
import { anniversariesOn, bridges, clusters, compare, driftingApart, friendGraph, friendsAt, friendsSince, gatherings, listOverTime, shortestPath } from "../insights";
import { describeHours, normalizeHistory, weekHour } from "../history";
import { inQuietHours } from "../notifications";
import type { FriendLogEntry } from "../types";

const f = (id: string) => ({ id, displayName: id }) as never;
const cache = (edges: [string, string][], ids: string[]) => ({
  friends: Object.fromEntries(ids.map((id) => [id, f(id)])),
  mutuals: Object.fromEntries(ids.map((id) => [id, { ids: edges.filter((e) => e.includes(id)).map((e) => (e[0] === id ? e[1] : e[0])), count: 0, hidden: false, fetchedAt: 0 }])),
});

describe("graph insights", () => {
  // two triangles joined by "x"
  const ids = ["a1", "a2", "a3", "b1", "b2", "b3", "x"];
  const edges: [string, string][] = [["a1", "a2"], ["a2", "a3"], ["a1", "a3"], ["b1", "b2"], ["b2", "b3"], ["b1", "b3"], ["x", "a1"], ["x", "a2"], ["x", "b1"], ["x", "b2"]];
  const g = friendGraph(cache(edges, ids));
  it("finds clusters and the bridge between them", () => {
    const cs = clusters(g);
    expect(cs.length).toBe(2);
    const br = bridges(g, cs);
    expect(br[0].id).toBe("x");
  });
  it("shortest path and compare", () => {
    expect(shortestPath(g, "a3", "b3")).toEqual(["a3", "a1", "x", "b1", "b3"]);
    expect(shortestPath(g, "a3", "nobody")).toBeNull();
    const c = compare(g, "a1", "x");
    expect(c.both.sort()).toEqual(["a2"]);
  });
});

describe("friend log", () => {
  const log: FriendLogEntry[] = [
    { t: Date.UTC(2026, 0, 10), id: "b", name: "b", type: "added" },
    { t: Date.UTC(2026, 1, 5), id: "c", name: "c", type: "removed" },
    { t: Date.UTC(2026, 2, 1), id: "d", name: "d", type: "added" },
  ];
  it("friends at an earlier time", () => {
    expect([...friendsAt(["a", "b", "d"], log, Date.UTC(2026, 0, 1))].sort()).toEqual(["a", "c"]);
    expect([...friendsAt(["a", "b", "d"], log, Date.UTC(2026, 1, 1))].sort()).toEqual(["a", "b", "c"]);
  });
  it("list over time", () => {
    const m = listOverTime(["a", "b", "d"], log, Date.UTC(2026, 0, 2), Date.UTC(2026, 2, 15));
    expect(m.map((x) => x.size)).toEqual([3, 2, 3]);
    expect(m[0].added).toBe(1);
  });
  it("friends since and anniversaries", () => {
    expect(friendsSince("b", log)).toBe(Date.UTC(2026, 0, 10));
    expect(friendsSince("c", log)).toBeNull();
    const s = new Date(2025, 10, 16).getTime();
    const l2: FriendLogEntry[] = [{ t: s, id: "z", name: "z", type: "added" }];
    expect(anniversariesOn(new Date(2026, 10, 16), ["z"], l2)[0].label).toBe("1 year");
    expect(anniversariesOn(new Date(2026, 4, 16), ["z"], l2)[0].label).toBe("6 months");
    expect(anniversariesOn(new Date(2026, 4, 17), ["z"], l2)).toEqual([]);
  });
});

describe("other insights", () => {
  it("drifting apart", () => {
    const now = Date.UTC(2026, 5, 1);
    const old = Date.UTC(2026, 0, 1) / 1000;
    const d = driftingApart([{ id: "a", secs: 20 * 3600, weighted: 0, visits: 3, days: 3, last: old, worlds: [] }], now);
    expect(d[0].id).toBe("a");
  });
  it("gatherings", () => {
    const g = gatherings({ a: "wrld_1:1", b: "wrld_1:1", c: "wrld_1:1", d: "private" }, new Set(["a", "b", "c", "d"]), 3);
    expect([...g.values()][0].length).toBe(3);
  });
  it("quiet hours over midnight", () => {
    const q = { enabled: true, from: "23:00", to: "08:00", days: [0, 1, 2, 3, 4, 5, 6], allowStarred: true, allowCircleIds: [] };
    expect(inQuietHours(q, new Date(2026, 10, 16, 23, 30))).toBe(true);
    expect(inQuietHours(q, new Date(2026, 10, 16, 7, 59))).toBe(true);
    expect(inQuietHours(q, new Date(2026, 10, 16, 12, 0))).toBe(false);
    expect(inQuietHours({ ...q, enabled: false }, new Date(2026, 10, 16, 23, 30))).toBe(false);
  });
  it("history helpers", () => {
    expect(weekHour(new Date(2026, 10, 16, 20).getTime())).toBe(1 * 24 + 20);
    expect(describeHours([1 * 24 + 20, 1 * 24 + 21, 2 * 24 + 20, 2 * 24 + 21, 3 * 24 + 20, 3 * 24 + 21, 4 * 24 + 20, 4 * 24 + 21, 5 * 24 + 20, 5 * 24 + 21])).toBe("weekdays 20–22");
    expect(normalizeHistory({ seen: { a: { last: 5, hours: [1] } } }).seen.a.hours.length).toBe(168);
  });
});
