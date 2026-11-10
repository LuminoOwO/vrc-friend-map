import { describe, expect, it } from "vitest";
import { makeDemo } from "../demo";
import { detectGroups, jaccard, louvain, toSuggestions } from "../groups";
import { defaultGroupSettings } from "../store";
import type { PresenceStats } from "../types";

describe("louvain", () => {
  it("splits two cliques joined by one weak edge", () => {
    const edges: [number, number, number][] = [];
    for (const [lo, hi] of [
      [0, 5],
      [5, 10],
    ]) {
      for (let i = lo; i < hi; i++) for (let j = i + 1; j < hi; j++) edges.push([i, j, 5]);
    }
    edges.push([4, 5, 0.5]);
    const c = louvain(10, edges);
    expect(new Set(c.slice(0, 5)).size).toBe(1);
    expect(new Set(c.slice(5)).size).toBe(1);
    expect(c[0]).not.toBe(c[5]);
  });

  it("is deterministic", () => {
    const edges: [number, number, number][] = [
      [0, 1, 1],
      [1, 2, 1],
      [2, 0, 1],
      [3, 4, 1],
      [4, 5, 1],
      [5, 3, 1],
      [2, 3, 0.2],
    ];
    expect(louvain(6, edges)).toEqual(louvain(6, edges));
  });
});

describe("detectGroups on demo data", () => {
  const demo = makeDemo();
  const friendIds = new Set(Object.keys(demo.cache.friends));
  const groups = detectGroups(demo.presence, friendIds, new Set(), defaultGroupSettings());

  it("finds several groups of plausible size", () => {
    expect(groups.length).toBeGreaterThanOrEqual(6);
    for (const g of groups) {
      expect(g.members.length).toBeGreaterThanOrEqual(3);
      expect(g.cohesion).toBeGreaterThan(0.5);
    }
  });

  it("recovers a planted hangout group exactly, without hangers-on", () => {
    const ids = Object.keys(demo.cache.friends);
    const planted = ids.slice(0, 7).sort();
    expect(groups.some((g) => [...g.members].sort().join() === planted.join())).toBe(true);
  });

  it("ignores pairs below the minimum days", () => {
    const stats: PresenceStats = {
      ...demo.presence,
      pairs: demo.presence.pairs.map((p) => ({ ...p, days: 1 })),
    };
    expect(detectGroups(stats, friendIds, new Set(), defaultGroupSettings())).toEqual([]);
  });

  it("hides suggestions already covered by a circle, and dismissed ones", () => {
    const g = groups[0];
    const circle = { id: "c", name: "x", color: "#fff", members: [...g.members, ...g.extra] };
    expect(toSuggestions([g], [circle], []).length).toBe(0);
    const partial = { ...circle, members: [...g.members, ...g.extra].slice(0, -1) };
    const s = toSuggestions([g], [partial], []);
    expect(s[0].match?.add.length).toBe(1);
    expect(toSuggestions([g], [], [[...g.members, ...g.extra]]).length).toBe(0);
  });

  it("jaccard", () => {
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
    expect(jaccard([], [])).toBe(0);
  });
});
