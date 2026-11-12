import { describe, expect, it } from "vitest";
import { encryptionSwitch, maxPairs } from "../share";
import { normalizeSettings } from "../store";

describe("encryption switch", () => {
  it("force off: 'on' greyed out, warns before upload", () => {
    for (const def of ["server", "on", "off"] as const)
      for (const choice of [null, true, false]) {
        const s = encryptionSwitch("force-off", def, choice);
        expect(s).toMatchObject({ on: false, locked: "on", warn: true, source: "forced" });
      }
  });
  it("force on: 'off' greyed out, no warning", () => {
    for (const def of ["server", "on", "off"] as const)
      for (const choice of [null, true, false]) {
        const s = encryptionSwitch("force-on", def, choice);
        expect(s).toMatchObject({ on: true, locked: "off", warn: false });
      }
  });
  it("optional: off by default, no warning", () => {
    expect(encryptionSwitch("optional", "server", null)).toMatchObject({ on: false, locked: null, warn: false });
  });
  it("optional (recommended): on by default, no warning", () => {
    expect(encryptionSwitch("recommended", "server", null)).toMatchObject({ on: true, locked: null, warn: false });
  });
  it("your default replaces the server's suggestion where you may choose", () => {
    expect(encryptionSwitch("optional", "on", null).on).toBe(true);
    expect(encryptionSwitch("recommended", "off", null).on).toBe(false);
  });
  it("your choice per server wins over defaults, not over a forced server", () => {
    expect(encryptionSwitch("recommended", "on", false)).toMatchObject({ on: false, source: "yours" });
    expect(encryptionSwitch("optional", "off", true)).toMatchObject({ on: true, source: "yours" });
    expect(encryptionSwitch("force-on", "off", false).on).toBe(true);
  });
  it("explains greyed-out sides", () => {
    expect(encryptionSwitch("force-off", "server", null).why).toMatch(/can't be turned on/);
    expect(encryptionSwitch("force-on", "server", null).why).toMatch(/can't be turned off/);
  });
});

describe("merging observations", () => {
  it("takes the largest per pair instead of adding", () => {
    const p = (a: string, b: string, secs: number) => ({ a, b, secs, weighted: secs, visits: 1, days: 1, last: secs });
    const m = maxPairs([[p("x", "y", 100), p("x", "z", 5)], [p("y", "x", 300)]]);
    expect(m).toHaveLength(2);
    expect(m.find((q) => q.b === "y" || q.a === "y")!.secs).toBe(300);
  });
});

describe("settings", () => {
  it("fills in sharing defaults and keeps servers", () => {
    const s = normalizeSettings({ sharing: { encDefault: "on", servers: [{ id: "a", url: "http://pi:8787", encrypt: "yes", audience: "weird" }] } });
    expect(s.sharing.encDefault).toBe("on");
    expect(s.sharing.servers[0]).toMatchObject({ id: "a", url: "http://pi:8787", encrypt: null, audience: "all", upload: true, download: true });
    expect(normalizeSettings(null).sharing.encDefault).toBe("server");
  });
});

describe("bio key line", () => {
  it("matches the pinned fingerprint", async () => {
    const { bioKeyState } = await import("../share");
    const pin = { fingerprint: "a1b2 c3d4 e5f6 0718 293a" };
    expect(bioKeyState("hi! vfm-key:a1b2c3d4e5f60718293a :)", pin)).toBe("match");
    expect(bioKeyState("vfm-key:A1B2C3D4E5F60718293A", pin)).toBe("match");
    expect(bioKeyState("vfm-key:ffffc3d4e5f60718293a", pin)).toBe("mismatch");
    expect(bioKeyState("vfm-key:a1b2c3d4e5f60718293a", undefined)).toBe("unknown");
    expect(bioKeyState("no key here", pin)).toBeNull();
  });
});

describe("0.8.0 settings", () => {
  it("defaults: show me, hide non-friends, follow the live log", () => {
    const s = normalizeSettings(null);
    expect(s.map.showMe).toBe(true);
    expect(s.map.showOthers).toBe("off");
    expect(s.logs.live).toBe(true);
    expect(normalizeSettings({ map: { showOthers: "weird" } }).map.showOthers).toBe("off");
    expect(normalizeSettings({ map: { showOthers: "all", showMe: false }, logs: { live: false } })).toMatchObject({ map: { showOthers: "all", showMe: false }, logs: { live: false } });
  });
});

describe("who's here", () => {
  it("leaves you out", async () => {
    const { othersHere, demoHere } = await import("../live");
    const h = demoHere(["usr_a", "usr_b"], { usr_a: "A", usr_b: "B" });
    expect(othersHere(h, "usr_demo-me").map((p) => p.id)).toEqual(["usr_a", "usr_b", "usr_demo-stranger-0001", "usr_demo-stranger-0002"]);
    expect(othersHere(h, "usr_a").some((p) => p.id === "usr_a")).toBe(false);
    expect(othersHere({ ...h, active: false }, undefined)).toEqual([]);
  });
});

describe("people", () => {
  it("finds friends, non-friends and you", async () => {
    const { personOf, relationOf } = await import("../people");
    const f = { id: "usr_f", displayName: "F" } as never;
    const o = { id: "usr_o", displayName: "O", fetchedAt: 1 } as never;
    const cache = { friends: { usr_f: f }, others: { usr_o: o }, me: { id: "usr_me", displayName: "Me", friends: [], onlineFriends: [], activeFriends: [], offlineFriends: [] } } as never;
    expect(relationOf(cache, "usr_f")).toBe("friend");
    expect(relationOf(cache, "usr_o")).toBe("other");
    expect(relationOf(cache, "usr_me")).toBe("me");
    expect(personOf(cache, "usr_me")?.displayName).toBe("Me");
    expect(personOf(cache, "usr_nobody")).toBeUndefined();
  });
});
