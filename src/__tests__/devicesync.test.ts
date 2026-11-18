import { describe, expect, it } from "vitest";
import { mergeCircles, mergeRecord, mergeSelf, mergeSet, readSelf, SELF_FORMAT } from "../devicesync";
import type { Circle } from "../types";

const c = (id: string, members: string[], extra: Partial<Circle> = {}): Circle => ({ id, name: id, color: "#fff", members, ...extra });

describe("device sync merge", () => {
  it("member sets: adds and removals from both devices apply", () => {
    expect(mergeSet(["a", "b", "c"], ["a", "b", "c", "d"], ["a", "c"]).sort()).toEqual(["a", "c", "d"]);
    expect(mergeSet([], ["x"], ["y"]).sort()).toEqual(["x", "y"]);
  });

  it("a circle deleted on one device goes away unless the other changed it", () => {
    const base = [c("friday", ["a"]), c("work", ["b"])];
    const mine = [c("work", ["b"])]; // deleted friday here
    const theirs = [c("friday", ["a"]), c("work", ["b", "z"])];
    expect(mergeCircles(base, mine, theirs)).toEqual([c("work", ["b", "z"])]);
    const theirsChanged = [c("friday", ["a", "new"]), c("work", ["b"])];
    expect(mergeCircles(base, mine, theirsChanged).map((x) => x.id).sort()).toEqual(["friday", "work"]);
  });

  it("renames: the side that changed wins", () => {
    const base = [c("x", [], { name: "Old" })];
    expect(mergeCircles(base, [c("x", [], { name: "New" })], base)[0].name).toBe("New");
    expect(mergeCircles(base, base, [c("x", [], { name: "Theirs" })])[0].name).toBe("Theirs");
  });

  it("first sync on a new device combines both", () => {
    const merged = mergeSelf(
      null,
      { circles: [c("phone", ["p"])], dismissedGroups: [], shareNotes: {}, notifyPeople: {} },
      { circles: [c("pc", ["q"])], dismissedGroups: [["a", "b"]], shareNotes: { u: { v: "adult", t: 1 } }, notifyPeople: { u: { mode: "once" } } },
    );
    expect(merged.circles.map((x) => x.id).sort()).toEqual(["pc", "phone"]);
    expect(merged.dismissedGroups).toEqual([["a", "b"]]);
    expect(merged.shareNotes.u.v).toBe("adult");
    expect(merged.notifyPeople.u.mode).toBe("once");
  });

  it("records: a removed note stays removed", () => {
    const base = { u: { v: "adult", t: 1 } };
    expect(mergeRecord(base, {}, base)).toEqual({});
  });

  it("received data is checked; under-18 or unknown notes are dropped", () => {
    const got = readSelf({
      format: SELF_FORMAT,
      t: 1,
      circles: [c("ok", ["a"]), { id: 5 }],
      dismissedGroups: [],
      shareNotes: { a: { v: "adult", t: 1 }, b: { v: "minor", t: 1 } },
      notifyPeople: {},
    });
    expect(got?.circles.map((x) => x.id)).toEqual(["ok"]);
    expect(Object.keys(got!.shareNotes)).toEqual(["a"]);
    expect(readSelf({ format: "other" })).toBeNull();
  });
});

describe("0.12 personal data", () => {
  it("merges stars and nicknames, and keeps them when the other device is older", async () => {
    const { mergeSelf } = await import("../devicesync");
    const base = { circles: [], dismissedGroups: [], shareNotes: {}, notifyPeople: {}, starred: ["a"], nicknames: {} };
    const mine = { ...base, starred: ["a", "b"], nicknames: { a: "Lu" } };
    const theirs = { ...base, starred: [], nicknames: { c: "Cee" } };
    const m = mergeSelf(base, mine, theirs);
    expect(m.starred).toEqual(["b"]);
    expect(m.nicknames).toEqual({ a: "Lu", c: "Cee" });
    const old = { circles: [], dismissedGroups: [], shareNotes: {}, notifyPeople: {} };
    expect(mergeSelf(base, mine, old).starred).toEqual(["a", "b"]);
  });
});

describe("settings: the newer change wins", () => {
  const self = (ui: unknown, at?: number) => ({ circles: [], dismissedGroups: [], shareNotes: {}, notifyPeople: {}, settings: { ui } as never, settingsAt: at === undefined ? undefined : { ui: at } });
  it("a device that just joined doesn't lose its own newer change", () => {
    // No base yet: the phone unticked something after the PC's last change.
    const merged = mergeSelf(null, self({ beta: false }, 2000), self({ beta: true }, 1000));
    expect((merged.settings as { ui: unknown }).ui).toEqual({ beta: false });
    expect(merged.settingsAt).toEqual({ ui: 2000 });
  });
  it("takes the other device's newer change, and keeps the old rule without times", () => {
    expect((mergeSelf(null, self({ beta: false }, 1000), self({ beta: true }, 3000)).settings as { ui: unknown }).ui).toEqual({ beta: true });
    expect((mergeSelf(null, self({ beta: false }), self({ beta: true })).settings as { ui: unknown }).ui).toEqual({ beta: true });
  });
  it("only one side changed since the base: that side, whatever the times", () => {
    const base = self({ beta: true }, 5000);
    expect((mergeSelf(base, self({ beta: false }, 1), self({ beta: true }, 9999)).settings as { ui: unknown }).ui).toEqual({ beta: false });
  });
});
