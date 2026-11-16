import { describe, expect, it } from "vitest";
import { flagLine, joinNote, splitNote, FLAG } from "../notesline";

const facts = { mine: ["crasher", "trolling"], blocks: [{ by: "Luna", reasons: ["loud-music"] }, { by: "Kai", reasons: [] }], removedBy: ["Mo"], distance: 1 };

describe("flag line in VRChat notes", () => {
  it("modes", () => {
    expect(flagLine(facts, { mode: "off", compact: true })).toBe("");
    expect(flagLine(facts, { mode: "mine", compact: true })).toBe(`${FLAG} crasher, troll`);
    expect(flagLine(facts, { mode: "friends", compact: false })).toBe(`${FLAG} crasher, trolling · blocked by 2 friends (music too loud) · removed by Mo · keep distance (1)`);
    expect(flagLine(facts, { mode: "full", compact: true })).toBe(`${FLAG} me: crasher, troll · Luna: loud · Kai: blk · Mo unfr · distance×1`);
    expect(flagLine({ mine: [], blocks: [], removedBy: [], distance: 0 }, { mode: "full", compact: true })).toBe("");
  });
  it("keeps your own text and the limit", () => {
    expect(splitNote(`${FLAG} x\nmy note`)).toEqual({ line: `${FLAG} x`, rest: "my note" });
    expect(splitNote("my note")).toEqual({ line: "", rest: "my note" });
    expect(joinNote(`${FLAG} x`, "my note")).toBe(`${FLAG} x\nmy note`);
    expect(joinNote("", "my note")).toBe("my note");
    const long = "a".repeat(250);
    const j = joinNote(`${FLAG} crasher, trolling`, long, 256);
    expect(j.length).toBeLessThanOrEqual(256);
    expect(j.endsWith(long)).toBe(true);
    expect(joinNote(`${FLAG} x`, "b".repeat(256), 256)).toBe("b".repeat(256));
  });
});
