import { describe, expect, it } from "vitest";
import { MIN_SERVER, newerVersion, versionMismatch } from "../compat";

describe("app and server versions", () => {
  it("compares versions by number", () => {
    expect(newerVersion("0.12.10", "0.12.9")).toBe(true);
    expect(newerVersion("v0.13.0", "0.12.4")).toBe(true);
    expect(newerVersion("0.12.4", "0.12.4-beta")).toBe(false);
  });
  it("fits when both are new enough", () => {
    expect(versionMismatch("0.13.0", { version: "0.13.0", minApp: "0.12.0" })).toBeNull();
    // Older servers don't say a minimum app version.
    expect(versionMismatch("0.13.0", { version: MIN_SERVER })).toBeNull();
  });
  it("says to update the app when the server needs a newer one", () => {
    expect(versionMismatch("0.11.0", { version: "0.13.0", minApp: "0.12.0" })?.short).toBe("Needs a newer app");
  });
  it("says to update the server when it's too old for the app", () => {
    expect(versionMismatch("0.13.0", { version: "0.10.0" })?.short).toBe("Server too old");
  });
});
