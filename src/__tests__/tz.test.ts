import { describe, expect, it } from "vitest";
import { dayPart, eveningOffset, guessTimezones, hourIn, isNightThere, offsetHours, timeIn, zoneEntry, zoneLabel, ZONE_LIST } from "../tz";

const top = (texts: string[], extra: Partial<Parameters<typeof guessTimezones>[0]> = {}) =>
  guessTimezones({ texts: texts.map((t) => ({ source: "bio", text: t })), ...extra });

describe("time zone guesses", () => {
  it("reads countries, adjectives and flags", () => {
    expect(top(["german fur, he/him"])[0].tz).toBe("Europe/Berlin");
    expect(top(["🇯🇵 vtuber"])[0].tz).toBe("Asia/Tokyo");
    expect(top(["Location: Tokyo"])[0].tz).toBe("Asia/Tokyo");
  });
  it("offsets, abbreviations and IANA names", () => {
    expect(top(["usually on 8pm EST"])[0].tz).toBe("America/New_York");
    expect(top(["UTC+9"])[0].tz).toBe("Etc/GMT-9");
    expect(zoneLabel("Etc/GMT-9")).toBe("UTC+9");
    expect(top(["tz: Europe/Amsterdam"])[0].tz).toBe("Europe/Amsterdam");
  });
  it("doesn't read 'est' inside words", () => {
    expect(top(["the best person, interested in tests"])).toEqual([]);
  });
  it("places in big countries win over the country", () => {
    expect(top(["american, from Texas"])[0].tz).toBe("America/Chicago");
  });
  it("conflicting groups give several candidates", () => {
    const c = guessTimezones({ texts: [], groups: ["America VRC", "Japan Club"] });
    expect(c.map((x) => x.tz)).toContain("Asia/Tokyo");
    expect(c.map((x) => x.tz)).toContain("America/New_York");
  });
  it("languages", () => {
    expect(guessTimezones({ texts: [], languages: ["deu"] })[0].tz).toBe("Europe/Berlin");
  });
  it("evening peak gives an offset", () => {
    const hours = new Array(168).fill(0);
    // online 20–23 every day in UTC terms, device at UTC
    for (let d = 0; d < 7; d++) for (const h of [20, 21, 22]) hours[d * 24 + h] = 1;
    expect(eveningOffset(hours, 0)).toBe(0);
    expect(eveningOffset(new Array(168).fill(1), 0)).toBeNull();
  });
  it("time in a zone", () => {
    expect(offsetHours("Etc/GMT-9")).toBe(9);
    expect(offsetHours("+05:30")).toBe(5.5);
    expect(timeIn("+05:30", new Date(Date.UTC(2026, 0, 1, 0, 0)))).toBe("05:30");
  });
});

describe("time of day and the zone list", () => {
  it("reads the hour in 24-hour form, whatever clock the app shows", () => {
    // 15:58 in Madrid (winter, UTC+1) is 14:58 UTC.
    const at = new Date("2026-11-18T14:58:00Z");
    expect(hourIn("Europe/Madrid", at)).toBe(15);
    expect(isNightThere("Europe/Madrid", at)).toBe(false);
    expect(isNightThere("Asia/Tokyo", new Date("2026-11-18T17:00:00Z"))).toBe(true); // 02:00 there
    expect(hourIn("+05:30", new Date("2026-11-18T20:00:00Z"))).toBe(1);
  });
  it("names parts of the day", () => {
    expect([2, 6, 10, 16, 20, 23].map(dayPart)).toEqual(["night", "early morning", "morning", "afternoon", "evening", "late evening"]);
  });
  it("has 38 zones that all work, and finds the entry for any zone", () => {
    expect(ZONE_LIST).toHaveLength(38);
    const at = new Date("2026-01-15T12:00:00Z");
    for (const z of ZONE_LIST) expect(offsetHours(z.tz, at), z.tz).not.toBeNull();
    expect(zoneEntry("Europe/Madrid", at)?.tz).toBe("Europe/Berlin");
    expect(zoneEntry("Asia/Kolkata", at)?.offset).toBe("UTC+5:30");
  });
});
