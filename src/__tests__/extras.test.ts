import { describe, expect, it } from "vitest";
import { bioWithLine, fill } from "../extras";

describe("extras", () => {
  it("fills templates and keeps unknown placeholders", () => {
    expect(fill("🎵 {title} by {artist}", { title: "A", artist: "B" })).toBe("🎵 A by B");
    expect(fill("{nope}", {})).toBe("{nope}");
  });
  it("puts the play time line into the bio once", () => {
    const t = "⏱ {hours} h in VRChat";
    expect(bioWithLine("", t, 12)).toBe("⏱ 12 h in VRChat");
    const once = bioWithLine("hi there", t, 2431)!;
    expect(once).toBe("hi there\n⏱ 2,431 h in VRChat");
    expect(bioWithLine(once, t, 2432)).toBe("hi there\n⏱ 2,432 h in VRChat");
    expect(bioWithLine("top\n⏱ 5 h in VRChat\nbottom", t, 6)).toBe("top\n⏱ 6 h in VRChat\nbottom");
    expect(bioWithLine("x".repeat(500), t, 1)).toBeNull();
  });
});
