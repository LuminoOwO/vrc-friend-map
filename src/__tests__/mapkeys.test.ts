import { describe, expect, it } from "vitest";
import { nextInDirection, startPoint } from "../mapkeys";

const pts = [
  { id: "c", x: 0, y: 0 },
  { id: "r", x: 100, y: 5 },
  { id: "rFar", x: 300, y: 0 },
  { id: "rAngle", x: 60, y: 80 },
  { id: "u", x: -5, y: -90 },
  { id: "d", x: 10, y: 120 },
];

describe("map keyboard", () => {
  it("goes to the nearest person in the direction", () => {
    expect(nextInDirection(pts[0], "right", pts)).toBe("r");
    expect(nextInDirection(pts[0], "up", pts)).toBe("u");
    expect(nextInDirection(pts[0], "down", pts)).toBe("d");
    expect(nextInDirection(pts[1], "right", pts)).toBe("rFar");
  });
  it("prefers straight ahead over slightly nearer at an angle", () => {
    const p = [{ id: "a", x: 0, y: 0 }, { id: "side", x: 70, y: 40 }, { id: "ahead", x: 0, y: 75 }];
    expect(nextInDirection(p[0], "down", p)).toBe("ahead");
  });
  it("nobody that way", () => {
    expect(nextInDirection(pts[2], "right", pts)).toBeNull();
    expect(nextInDirection({ id: "x", x: 0, y: 0 }, "left", [{ id: "x", x: 0, y: 0 }])).toBeNull();
  });
  it("starts at you, else the middle", () => {
    expect(startPoint(pts, "u", 0, 0)).toBe("u");
    expect(startPoint(pts, "missing", 95, 0)).toBe("r");
    expect(startPoint([], null, 0, 0)).toBeNull();
  });
});
