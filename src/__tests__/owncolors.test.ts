import { describe, expect, it } from "vitest";
import { mix, normalizeOwnColors, ownColorVars } from "../owncolors";

describe("your own colors", () => {
  it("keeps only #rrggbb values", () => {
    expect(normalizeOwnColors({ accent: "#FF0000", bg: "red", panel: 3, text: "#123" })).toEqual({ accent: "#ff0000", bg: "", panel: "", text: "" });
    expect(normalizeOwnColors(null)).toEqual({ accent: "", bg: "", panel: "", text: "" });
  });
  it("mixes colors", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
  it("sets only what you picked, with readable text on the accent", () => {
    const v = ownColorVars({ accent: "#ffff00", bg: "", panel: "", text: "" }, () => "");
    expect(v["--accent"]).toBe("#ffff00");
    expect(v["--on-accent"]).toBe("#111111");
    expect(v["--bg"]).toBeUndefined();
    const p = ownColorVars({ accent: "", bg: "", panel: "#202020", text: "#ffffff" }, () => "");
    expect(p["--panel"]).toBe("#202020");
    expect(p["--border"]).toMatch(/^#[0-9a-f]{6}$/);
    expect(p["--muted"]).toMatch(/^#[0-9a-f]{6}$/);
  });
});
