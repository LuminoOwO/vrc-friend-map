import { describe, expect, it } from "vitest";
import { mergeCircles, mergeRecord, mergeSelf, mergeServerShare, mergeSet, mineForMerge, mustLogOut, readSelf, sameSelf, SELF_FORMAT, stableJson, type SelfData } from "../devicesync";
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

describe("device sync settles (no swapping back and forth)", () => {
  type Dev = { settings: Record<string, unknown> | undefined; at: Record<string, number>; base: SelfData | null; changes: number };
  const empty = { circles: [], dismissedGroups: [], shareNotes: {}, notifyPeople: {} };
  const self = (d: Dev): SelfData => ({ ...empty, settings: d.settings as SelfData["settings"], settingsAt: d.at });
  /** One device syncing with the server copy, the way share.ts syncDevices does. */
  const syncOnce = (d: Dev, server: { copy: SelfData | null; publishes: number }, keys: string[]) => {
    const before = self(d);
    const mine = mineForMerge(before, d.base, server.copy, keys);
    const merged = server.copy ? mergeSelf(d.base, mine, server.copy) : mine;
    if (d.settings && merged.settings) for (const k of keys) if (k in merged.settings) d.settings[k] = (merged.settings as Record<string, unknown>)[k];
    for (const k of keys) if (merged.settingsAt?.[k] !== undefined) d.at[k] = merged.settingsAt[k];
    if (stableJson(self(d)) !== stableJson(before)) d.changes++;
    if (!server.copy || stableJson(merged) !== stableJson(server.copy)) {
      server.copy = JSON.parse(JSON.stringify(merged));
      server.publishes++;
    }
    d.base = merged;
  };

  it("a device that doesn't sync settings never 'takes over' changes and doesn't republish", () => {
    const server = { copy: null as SelfData | null, publishes: 0 };
    const pc: Dev = { settings: { theme: "dark", map: { a: 1 } }, at: { theme: 5, map: 5 }, base: null, changes: 0 };
    const phone: Dev = { settings: undefined, at: { theme: 9 }, base: null, changes: 0 };
    for (let i = 0; i < 6; i++) {
      syncOnce(pc, server, ["theme", "map"]);
      syncOnce(phone, server, []);
    }
    expect(phone.changes).toBe(0);
    expect(pc.changes).toBe(0);
    expect(server.publishes).toBeLessThanOrEqual(2);
    expect((server.copy?.settings as Record<string, unknown>).theme).toBe("dark");
  });

  it("a group kept on one device: the other device's value passes through untouched", () => {
    const server = { copy: null as SelfData | null, publishes: 0 };
    const pc: Dev = { settings: { theme: "dark", map: { a: 1 } }, at: { theme: 5, map: 5 }, base: null, changes: 0 };
    const phone: Dev = { settings: { map: { a: 2 } }, at: { map: 7, theme: 8 }, base: null, changes: 0 };
    for (let i = 0; i < 6; i++) {
      syncOnce(pc, server, ["theme", "map"]);
      syncOnce(phone, server, ["map"]);
    }
    expect(pc.settings).toEqual({ theme: "dark", map: { a: 2 } });
    expect(phone.settings).toEqual({ map: { a: 2 } });
    expect(server.publishes).toBeLessThanOrEqual(3);
    const before = server.publishes;
    syncOnce(pc, server, ["theme", "map"]);
    syncOnce(phone, server, ["map"]);
    expect(server.publishes).toBe(before);
  });

  it("which interface a device shows (classic or new) isn't part of what syncs", () => {
    const got = readSelf({ format: SELF_FORMAT, t: 1, circles: [], settings: { ui: { beta: true, haptics: false } } });
    expect(got?.settings?.ui).toEqual({ haptics: false });
  });
});

describe("device sync comparisons", () => {
  it("the same data in a different key order counts as the same", () => {
    const a: SelfData = { circles: [], dismissedGroups: [], shareNotes: {}, notifyPeople: {}, settingsAt: { map: 1, theme: 2 } };
    const b: SelfData = { notifyPeople: {}, shareNotes: {}, dismissedGroups: [], circles: [], settingsAt: { theme: 2, map: 1 } };
    expect(sameSelf(a, b)).toBe(true);
    expect(sameSelf(a, { ...b, settingsAt: { theme: 3, map: 1 } })).toBe(false);
  });
});

describe("sharing choices follow the account", () => {
  const A = "https://a.example";
  it("the newer choice wins; untouched defaults never win", () => {
    const mine = { [A]: { shareFriends: true, audience: "all" as const } };
    const theirs = { [A]: { shareFriends: false, audience: "picked" as const, shareAt: 10 } };
    expect(mergeServerShare(mine, theirs)[A]).toEqual(theirs[A]);
    expect(mergeServerShare({ [A]: { ...mine[A], shareAt: 20 } }, theirs)[A].shareFriends).toBe(true);
  });
  it("a server only one device has keeps its choices", () => {
    expect(mergeServerShare({}, { [A]: { upload: true, shareAt: 1 } })).toEqual({ [A]: { upload: true, shareAt: 1 } });
  });
  it("received choices keep only known keys with the right types", () => {
    const got = readSelf({
      format: SELF_FORMAT,
      t: 1,
      circles: [],
      serverShare: { [A]: { upload: true, audience: "everyone", circleIds: ["c", 3], loggerOwner: true, shareAt: 5 }, "javascript:x": { upload: true } },
    });
    expect(got?.serverShare).toEqual({ [A]: { upload: true, circleIds: ["c"], shareAt: 5 } });
  });
});

describe("log out everywhere", () => {
  const empty = { circles: [], dismissedGroups: [], shareNotes: {}, notifyPeople: {} };
  it("keeps the later press when merging", () => {
    expect(mergeSelf(null, { ...empty, logoutAt: 100 }, { ...empty, logoutAt: 200 }).logoutAt).toBe(200);
    expect(mergeSelf(null, { ...empty, logoutAt: 300 }, { ...empty, logoutAt: 200 }).logoutAt).toBe(300);
    expect(mergeSelf(null, { ...empty }, { ...empty, logoutAt: 50 }).logoutAt).toBe(50);
    // An older app on the other device doesn't send it: ours stays.
    expect(mergeSelf(null, { ...empty, logoutAt: 50 }, { ...empty }).logoutAt).toBe(50);
    expect(mergeSelf(null, { ...empty }, { ...empty }).logoutAt).toBeUndefined();
  });
  it("reads only a sane time", () => {
    const base = { format: SELF_FORMAT, t: 1 };
    expect(readSelf({ ...base, logoutAt: 1234 })?.logoutAt).toBe(1234);
    expect(readSelf({ ...base, logoutAt: "1234" })?.logoutAt).toBeUndefined();
    expect(readSelf({ ...base, logoutAt: -5 })?.logoutAt).toBeUndefined();
    expect(readSelf({ ...base, logoutAt: Infinity })?.logoutAt).toBeUndefined();
  });
  it("logs out only devices logged in before the press", () => {
    expect(mustLogOut(undefined, 10)).toBe(false);
    expect(mustLogOut(200, 100)).toBe(true);
    expect(mustLogOut(100, 200)).toBe(false);
    // Logged in before this was recorded: counts as earlier.
    expect(mustLogOut(100, undefined)).toBe(true);
  });
});

describe("two servers, one a round behind", () => {
  // Settings as two servers hold them: A already has this device's change, B still the old copy.
  const old = { circles: [], dismissedGroups: [], shareNotes: {}, notifyPeople: {}, settings: { closeAction: "ask" } as never, settingsAt: { closeAction: 100 } } as SelfData;
  const changed = { ...old, settings: { closeAction: "tray" } as never, settingsAt: { closeAction: 200 } } as SelfData;
  const valueOf = (s: SelfData) => (s.settings as unknown as { closeAction: string }).closeAction;

  it("one shared base: B's old copy looked like a change and flipped the setting back", () => {
    const sharedBase = changed; // agreed with A just now
    expect(valueOf(mergeSelf(sharedBase, changed, old))).toBe("ask");
  });
  it("a base per server: B's copy is what was agreed with B, so this device's change stays", () => {
    const baseB = old; // last agreed with B
    expect(valueOf(mergeSelf(baseB, changed, old))).toBe("tray");
  });
  it("no base for a server yet (settings left out): the newer change wins", () => {
    const fallback = { ...changed, settings: undefined };
    expect(valueOf(mergeSelf(fallback, changed, old))).toBe("tray");
    expect(valueOf(mergeSelf(fallback, old, changed))).toBe("tray");
  });
});
