import { describe, expect, it } from "vitest";
import { isMuted, shouldNotify } from "../notifications";
import { tuneOf } from "../notify";
import { defaultNotify, getState, setState } from "../store";
import type { NotifySettings } from "../types";

const rules = (patch: Partial<NotifySettings> = {}): NotifySettings => ({ ...defaultNotify(), ...patch });

describe("notification rules", () => {
  it("defaults: friend list changes on, online off", () => {
    expect(shouldNotify("added", "a", rules())).toBe(true);
    expect(shouldNotify("removed", "a", rules())).toBe(true);
    expect(shouldNotify("online", "a", rules())).toBe(false);
  });

  it("master switch off silences everything, even picked people", () => {
    const n = rules({ enabled: false, people: { a: { mode: "always" } } });
    expect(shouldNotify("online", "a", n)).toBe(false);
  });

  it("picked people come online even when online is off in general", () => {
    const n = rules({ people: { a: { mode: "once" }, b: { mode: "always" } } });
    expect(shouldNotify("online", "a", n)).toBe(true);
    expect(shouldNotify("online", "b", n)).toBe(true);
    expect(shouldNotify("joined", "b", n)).toBe(true);
    expect(shouldNotify("offline", "a", n)).toBe(false);
    expect(shouldNotify("online", "c", n)).toBe(false);
  });

  it("never wins over global rules", () => {
    const n = rules({ events: { ...defaultNotify().events, online: true }, people: { a: { mode: "never" } } });
    expect(shouldNotify("online", "a", n)).toBe(false);
    expect(shouldNotify("added", "a", n)).toBe(false);
    expect(shouldNotify("online", "b", n)).toBe(true);
  });

  it("circle scope only covers circle members", () => {
    setState({ local: { ...getState().local, circles: [{ id: "c1", name: "Close", color: "#f00", members: ["a"] } as never] } });
    const n = rules({ events: { ...defaultNotify().events, online: true }, scope: "circles", circleIds: ["c1"] });
    expect(shouldNotify("online", "a", n)).toBe(true);
    expect(shouldNotify("online", "b", n)).toBe(false);
    expect(shouldNotify("added", "b", n)).toBe(true); // scope is only for online/offline
  });

  it("picked scope means only people with their own rule", () => {
    const n = rules({ events: { ...defaultNotify().events, online: true }, scope: "picked" });
    expect(shouldNotify("online", "a", n)).toBe(false);
  });

  it("mute", () => {
    expect(isMuted(rules({ muteUntil: 0 }))).toBe(false);
    expect(isMuted(rules({ muteUntil: -1 }))).toBe(true);
    expect(isMuted(rules({ muteUntil: Date.now() + 60_000 }))).toBe(true);
    expect(isMuted(rules({ muteUntil: Date.now() - 1 }))).toBe(false);
  });
});

describe("person tunes", () => {
  it("are the same for the same name and differ between names", () => {
    expect(tuneOf("Lumi")).toEqual(tuneOf("lumi "));
    const names = ["Lumi", "Alex", "Sam", "Nova", "Kit", "Rin", "Mochi", "Echo"];
    const distinct = new Set(names.map((n) => JSON.stringify(tuneOf(n))));
    expect(distinct.size).toBe(names.length);
  });
});

describe("sound defaults migration", () => {
  it("moves test-build defaults to the new ones once, keeps own picks", async () => {
    const { normalizeSettings: normalizeSettingsForTest } = await import("../store");
    const n = normalizeSettingsForTest({ notify: { actionSounds: { added: "chime", removed: "fall", online: "rise", offline: "pop", joined: "knock", left: "door" } } }).notify;
    expect(n.actionSounds).toMatchObject({ added: "sparkle", removed: "heartbreak", online: "bell", offline: "pop", joined: "chime", left: "door" });
    const again = normalizeSettingsForTest({ notify: { ...n, actionSounds: { ...n.actionSounds, joined: "knock" } } }).notify;
    expect(again.actionSounds.joined).toBe("knock");
  });
});
