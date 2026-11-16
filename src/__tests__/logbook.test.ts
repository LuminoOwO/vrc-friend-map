import { describe, expect, it } from "vitest";
import { avatarAt, avatarHistory, dayKey, dayStart, presentAt, rankings, sessions, shiftDay, tagPictures, type TimelineVisit } from "../logbook";

const T = Date.UTC(2026, 10, 8, 20, 0) / 1000; // naive 2026-11-08 20:00
const v = (start: number, len: number, world: string, players: [string, number, number][] = []): TimelineVisit => ({
  world,
  world_name: world.toUpperCase(),
  access: "public",
  start,
  end: start + len,
  players: players.map(([id, a, b]) => ({ id, name: id, from: start + a, to: start + b })),
  videos: [],
  shots: [],
  avatars: [],
});

describe("logbook", () => {
  it("day keys start at 06:00", () => {
    expect(dayKey(T)).toBe("2026-11-08");
    expect(dayKey(Date.UTC(2026, 10, 9, 3, 0) / 1000)).toBe("2026-11-08");
    expect(dayKey(dayStart("2026-11-08"))).toBe("2026-11-08");
    expect(shiftDay("2026-11-08", 1)).toBe("2026-11-09");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("sessions and rankings", () => {
    const vs = [v(T, 3600, "wrld_a", [["usr_x", 0, 3600]]), v(T + 3700, 1800, "wrld_b", [["usr_x", 0, 600], ["usr_y", 0, 1800]]), v(T + 86400, 600, "wrld_a")];
    expect(sessions(vs).length).toBe(2);
    const r = rankings(vs, 0, Infinity, "2026-11-09");
    expect(r.worlds[0].world).toBe("wrld_a");
    expect(r.people[0].id).toBe("usr_x");
    expect(r.people[0].secs).toBe(4200);
    expect(r.streak.best).toBe(2);
    expect(r.streak.current).toBe(2);
  });
  it("present at, avatars and pictures", () => {
    const x = v(T, 3600, "wrld_a", [["usr_x", 0, 1800], ["usr_y", 600, 3600]]);
    x.avatars = [{ t: T + 100, id: "usr_x", name: "usr_x", avatar: "Fox" }, { t: T + 1000, id: "usr_x", name: "usr_x", avatar: "Cat" }];
    expect(presentAt(x, T + 700).map((p) => p.id)).toEqual(["usr_x", "usr_y"]);
    expect(avatarAt(x, x.players[0], T + 500)).toBe("Fox");
    expect(avatarAt(x, x.players[0], T + 1500)).toBe("Cat");
    expect(avatarHistory([x], "usr_x").map((a) => a.avatar)).toEqual(["Cat", "Fox"]);
    const tagged = tagPictures([{ path: "/p/VRChat_a.png", name: "VRChat_a.png", t: T + 2000, size: 1 }], [x]);
    expect(tagged[0].worldName).toBe("WRLD_A");
    expect(tagged[0].people.map((p) => p.id)).toEqual(["usr_y"]);
  });
});
