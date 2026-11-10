import { describe, expect, it } from "vitest";
import { compareVersions, normalizeLocal, normalizeSettings } from "../store";

describe("loading data from other versions", () => {
  it("migrates 0.2.0 settings (flat lineColors) and keeps unknown keys", () => {
    const s = normalizeSettings({ contact: "me", lineColors: "plain", intervalMs: 500, futureThing: { a: 1 } });
    expect(s.map.lines).toBe("plain");
    expect(s.intervalMs).toBe(1000); // clamped to the 1 s minimum
    expect((s as unknown as Record<string, unknown>).lineColors).toBeUndefined();
    expect((s as unknown as Record<string, unknown>).futureThing).toEqual({ a: 1 });
    expect(s.groups.minDays).toBe(2);
  });

  it("fills new nested settings without dropping fields a newer version added", () => {
    const s = normalizeSettings({ map: { nodeStyle: "fullcard", newerOption: true }, groups: { auto: true } });
    expect(s.map.nodeStyle).toBe("fullcard");
    expect((s.map as unknown as Record<string, unknown>).newerOption).toBe(true);
    expect(s.map.nodeScale).toBe(1);
    expect(s.groups.auto).toBe(true);
    expect(s.groups.minSize).toBe(3);
  });

  it("rejects bad values instead of crashing", () => {
    const s = normalizeSettings({ map: { nodeStyle: "hologram", nodeScale: "big" }, logs: { dirs: [1, "/x"] } });
    expect(s.map.nodeStyle).toBe("icon");
    expect(s.map.nodeScale).toBe(1);
    expect(s.logs.dirs).toEqual(["/x"]);
  });

  it("migrates 0.1.x local data and keeps circle fields from newer versions", () => {
    const l = normalizeLocal({
      firstSeen: { a: 5, b: 0 },
      trackingSince: 7,
      circles: [{ id: "c1", name: "X", color: "#fff", members: ["a"], sparkle: true }, { nope: 1 }],
    });
    expect(l.lastFriendIds).toEqual(["a"]);
    expect(l.logSince).toBe(7);
    expect(l.circles).toHaveLength(1);
    expect((l.circles[0] as unknown as Record<string, unknown>).sparkle).toBe(true);
    expect(l.dismissedGroups).toEqual([]);
  });

  it("compares versions numerically", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("0.3.0", "0.3.0")).toBe(0);
    expect(compareVersions("0.2.0", "0.3.0")).toBe(-1);
  });
});
