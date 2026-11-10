import { describe, expect, it } from "vitest";
import { parseLocation } from "../components/DetailPanel";
import { statusKey } from "../model";
import { combineStats } from "../together";
import type { Friend } from "../types";

describe("locations", () => {
  it("reads instance number, type and region", () => {
    expect(parseLocation("wrld_abc:58693~hidden(usr_x)~region(us)")).toMatchObject({ world: "wrld_abc", instance: "58693", type: "Friends+", flag: "🇺🇸" });
    expect(parseLocation("wrld_abc:1~private(usr_x)~canRequestInvite~region(eu)")).toMatchObject({ type: "Invite+", region: "eu" });
    expect(parseLocation("wrld_abc:2~group(grp_x)~groupAccessType(plus)~region(jp)")).toMatchObject({ type: "Group+", flag: "🇯🇵" });
    expect(parseLocation("wrld_abc:3")).toMatchObject({ type: "Public", region: "us" });
  });
});

describe("status filter keys", () => {
  const f = (status: string) => ({ status } as unknown as Friend);
  it("maps presence and status", () => {
    expect(statusKey(f("busy"), "online")).toBe("busy");
    expect(statusKey(f("busy"), "offline")).toBe("offline");
    expect(statusKey(f("join me"), "web")).toBe("web");
  });
});

describe("combining game-log and live-location time", () => {
  it("adds pairs from both sources", () => {
    const logs = { people: [], pairs: [{ a: "a", b: "b", secs: 600, weighted: 300, visits: 1, days: 1, last: 5 }], visits: 1, play_secs: 600, first: 0, last: 5 };
    const live = [
      { a: "b", b: "a", secs: 1200, weighted: 1200, visits: 2, days: 2, last: 9 },
      { a: "c", b: "d", secs: 60, weighted: 60, visits: 0, days: 0, last: 1 },
    ];
    const c = combineStats(logs, live)!;
    const ab = c.pairs.find((p) => [p.a, p.b].sort().join() === "a,b")!;
    expect(ab.secs).toBe(1800);
    expect(ab.days).toBe(2);
    expect(ab.last).toBe(9);
    expect(c.pairs).toHaveLength(2);
    expect(combineStats(null, live)!.pairs).toHaveLength(2);
    expect(combineStats(logs, null)).toBe(logs);
  });
});
