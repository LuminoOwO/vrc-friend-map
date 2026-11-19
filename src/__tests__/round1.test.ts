import { describe, expect, it } from "vitest";
import { normalizeSettings, shaped } from "../store";
import { describeError, isNetworkError, withReason } from "../synclog";

describe("shaped settings", () => {
  it("keeps stored values of the right type and fills the rest", () => {
    const def = { a: true, b: 2, c: { d: "x", e: [1] } };
    expect(shaped({ a: false, b: "nope", c: { d: "y" }, extra: 1 }, def)).toEqual({ a: false, b: 2, c: { d: "y", e: [1] }, extra: 1 });
    expect(shaped(null, def)).toEqual(def);
  });
  it("new settings get defaults on old data", () => {
    const s = normalizeSettings({ theme: "nord" });
    expect(s.ui.hideUnavailable).toBe(true);
    expect(s.ui.haptics).toBe(false);
    expect(s.ui.beta).toBe(false);
    expect(normalizeSettings({ ui: { textScale: 9 } }).ui.textScale).toBe(1.6);
  });
});

describe("sync log", () => {
  it("adds the meaning of HTTP status codes", () => {
    expect(describeError(new Error("server.example: 404")).detail).toBe("server.example: 404 (404 Not Found)");
    expect(describeError("HTTP 429 Too Many Requests").status).toBe(429);
    expect(withReason("x", undefined)).toBe("x");
  });
  it("spots network errors", () => {
    expect(isNetworkError(new Error("error sending request for url"))).toBe(true);
    expect(isNetworkError(new Error("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("not registered"))).toBe(false);
  });
});

import { onHomeNetwork } from "../phone";
describe("home network addresses (Android 17 asks first)", () => {
  it("knows local addresses from internet ones", () => {
    for (const u of ["http://192.168.178.70:8787", "10.0.0.5:8787", "http://172.20.1.1", "http://pi.local:8787", "http://localhost:8787"]) expect(onHomeNetwork(u), u).toBe(true);
    for (const u of ["https://vfm.example.com", "http://172.32.0.1", "http://8.8.8.8"]) expect(onHomeNetwork(u), u).toBe(false);
  });
});

import { wheelWorksNatively } from "../wheelfix";
describe("wheel fallback on normal systems", () => {
  it("stands down once the web engine clearly gets the wheel, never where it misses steps", () => {
    expect(wheelWorksNatively(4, 0, false)).toBe(false);
    expect(wheelWorksNatively(5, 0, false)).toBe(true);
    expect(wheelWorksNatively(50, 1, false)).toBe(false); // a missed step: the broken case
    expect(wheelWorksNatively(50, 0, true)).toBe(false); // turned on by hand: stays on
  });
});
