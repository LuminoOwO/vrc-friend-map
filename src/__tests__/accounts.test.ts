import { describe, expect, it } from "vitest";
import { accountFor, applyAlts, isCrossover, isMainFriend, mainFriendIds, matchesAccount, mergeAccounts, MAIN } from "../accountmerge";
import { reconcile } from "../accounts";
import type { Cache, Friend } from "../types";

const fr = (id: string, name = id): Friend => ({ id, displayName: name, status: "active", statusDescription: "", location: "offline", platform: "standalonewindows" }) as Friend;

describe("several accounts on one map", () => {
  const alts = {
    usr_alt: { friends: { usr_b: fr("usr_b"), usr_c: fr("usr_c"), usr_main: fr("usr_main") }, presence: { usr_b: "online" as const, usr_c: "offline" as const }, fetchedAt: 1 },
  };
  it("mixes friend lists, main data first, and says who knows whom", () => {
    const r = mergeAccounts({ usr_a: fr("usr_a"), usr_b: fr("usr_b", "B (main)") }, { usr_a: "online", usr_b: "offline" }, alts, ["usr_alt"], ["usr_main"]);
    expect(Object.keys(r.friends).sort()).toEqual(["usr_a", "usr_b", "usr_c"]);
    expect(r.friends.usr_b.displayName).toBe("B (main)");
    expect(r.presence.usr_b).toBe("offline");
    expect(r.presence.usr_c).toBe("offline");
    expect(r.friendOf).toEqual({ usr_b: [MAIN, "usr_alt"], usr_c: ["usr_alt"] });
    expect(r.friends.usr_main).toBeUndefined();
  });
  it("keeps the main account's friends apart (sharing, friend log) and asks VRChat as the right account", () => {
    const base = { friends: { usr_a: fr("usr_a"), usr_b: fr("usr_b") }, presence: {}, me: { id: "usr_main", friends: ["usr_a", "usr_b"] }, alts } as unknown as Cache;
    const c = applyAlts(base, ["usr_alt"]);
    expect(Object.keys(c.friends).sort()).toEqual(["usr_a", "usr_b", "usr_c"]);
    expect(mainFriendIds(c).sort()).toEqual(["usr_a", "usr_b"]);
    expect(isMainFriend(c, "usr_c")).toBe(false);
    expect(isCrossover(c, "usr_b")).toBe(true);
    expect(accountFor(c, "usr_c")).toBe("usr_alt");
    expect(accountFor(c, "usr_a")).toBeUndefined();
    // Hiding the account takes its friends off the map again.
    const hidden = applyAlts(c, []);
    expect(Object.keys(hidden.friends).sort()).toEqual(["usr_a", "usr_b"]);
    expect(hidden.friendOf).toBeUndefined();
  });
  it("filters by account and crossover", () => {
    const of = { usr_b: [MAIN, "usr_alt"], usr_c: ["usr_alt"] };
    expect(matchesAccount(of, "usr_a", "main")).toBe(true);
    expect(matchesAccount(of, "usr_c", "main")).toBe(false);
    expect(matchesAccount(of, "usr_c", "usr_alt")).toBe(true);
    expect(matchesAccount(of, "usr_b", "crossover")).toBe(true);
    expect(matchesAccount(of, "usr_c", "crossover")).toBe(false);
  });
  it("matches the settings to the accounts stored on this device", () => {
    const list = [{ id: "usr_x", name: "X", show: false, live: true, notify: true }];
    expect(reconcile(list, [{ id: "usr_x", name: "X" }])).toBe(list);
    expect(reconcile(list, [{ id: "usr_x", name: "X2" }, { id: "usr_y", name: "Y" }])).toEqual([
      { id: "usr_x", name: "X2", show: false, live: true, notify: true },
      { id: "usr_y", name: "Y", show: true, live: false, notify: false },
    ]);
    expect(reconcile(list, [])).toEqual([]);
  });
});
