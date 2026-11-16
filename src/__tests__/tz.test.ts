import { describe, expect, it } from "vitest";
import { eveningOffset, guessTimezones, offsetHours, timeIn, zoneLabel } from "../tz";

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
