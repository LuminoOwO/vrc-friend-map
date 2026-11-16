import { describe, expect, it } from "vitest";
import { noteSteamTotal, steamDay } from "../steamdays";

describe("Steam play time per day", () => {
  it("keeps the last total of a day and ignores nonsense", () => {
    let d = noteSteamTotal({}, 100, "2026-11-14");
    d = noteSteamTotal(d, 160, "2026-11-15");
    d = noteSteamTotal(d, 190, "2026-11-15");
    expect(d).toEqual({ "2026-11-14": 100, "2026-11-15": 190 });
    expect(noteSteamTotal(d, 0, "2026-11-16")).toBe(d);
    expect(noteSteamTotal(d, 190, "2026-11-15")).toBe(d);
  });
  it("is the difference to the day before, and says when it covers several days", () => {
    const d = { "2026-11-10": 100, "2026-11-14": 220, "2026-11-15": 250 };
    expect(steamDay(d, "2026-11-15")).toEqual({ minutes: 30, since: "2026-11-14", spans: false });
    expect(steamDay(d, "2026-11-14")).toEqual({ minutes: 120, since: "2026-11-10", spans: true });
    expect(steamDay(d, "2026-11-10")).toBeNull();
    expect(steamDay(d, "2026-11-12")).toBeNull();
    expect(steamDay({ "2026-11-14": 300, "2026-11-15": 10 }, "2026-11-15")).toBeNull();
  });
});
