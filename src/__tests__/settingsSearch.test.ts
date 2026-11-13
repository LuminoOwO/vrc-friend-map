import { describe, expect, it } from "vitest";
import { oneTypo, scoreSection, type SearchDoc } from "../settingsSearch";

const docs: SearchDoc[] = [
  { id: "themes", title: "Themes", keywords: "theme color dark light", text: "Color theme Dark OLED black Light Catppuccin Nord Dracula" },
  { id: "framerate", title: "Frame rate", keywords: "fps vsync", text: "Vsync wait for the screen Frame rate limit Saving power" },
  { id: "sound", title: "New friends", keywords: "sound", text: "Play a sound Volume Chime" },
  { id: "data", title: "Local data", keywords: "storage", text: "Clear image cache Delete all local data" },
];
const best = (q: string) =>
  docs
    .map((d) => [d.id, scoreSection(q, d)] as const)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

describe("settings search", () => {
  it("finds sections by synonyms", () => {
    expect(best("ui style")[0]).toBe("themes");
    expect(best("lag")[0]).toBe("framerate");
    expect(best("fps")[0]).toBe("framerate");
    expect(best("notification volume")[0]).toBe("sound");
    expect(best("wipe everything")).toEqual([]); // "everything" matches nothing
    expect(best("wipe")[0]).toBe("data");
  });
  it("forgives a typo", () => {
    expect(oneTypo("vsnyc", "vsync")).toBe(true);
    expect(oneTypo("thmes", "themes")).toBe(true);
    expect(oneTypo("theme", "frame")).toBe(false);
    expect(best("dracla")[0]).toBe("themes");
  });
  it("ignores filler words", () => {
    expect(best("how do I change the theme")[0]).toBe("themes");
  });
});
