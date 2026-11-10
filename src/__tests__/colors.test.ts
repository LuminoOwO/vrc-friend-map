import { describe, expect, it } from "vitest";
import { CIRCLE_PALETTE, colorDistance, duplicateColorIds, pickCircleColor } from "../colors";

describe("circle colors", () => {
  it("uses every palette color once before anything repeats", () => {
    const used: string[] = [];
    for (let i = 0; i < CIRCLE_PALETTE.length; i++) used.push(pickCircleColor(used));
    expect(new Set(used).size).toBe(CIRCLE_PALETTE.length);
  });

  it("generates new distinct colors once the palette is used up", () => {
    const used = [...CIRCLE_PALETTE];
    for (let i = 0; i < 8; i++) {
      const c = pickCircleColor(used);
      expect(used.includes(c)).toBe(false);
      expect(Math.min(...used.map((u) => colorDistance(u, c)))).toBeGreaterThan(8);
      used.push(c);
    }
  });

  it("skips palette colors close to a custom color in use", () => {
    expect(pickCircleColor(["#2ed4be"])).not.toBe("#2dd4bf");
  });

  it("finds duplicates, keeping the first", () => {
    expect(duplicateColorIds([
      { id: "a", color: "#2DD4BF" },
      { id: "b", color: "#2dd4bf" },
      { id: "c", color: "#f472b6" },
    ])).toEqual(["b"]);
  });
});
