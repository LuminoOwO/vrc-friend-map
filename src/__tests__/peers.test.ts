import { describe, expect, it } from "vitest";
import { forMe, missing } from "../peers";

describe("your own devices", () => {
  it("takes only messages from another device, for this one or everyone", () => {
    expect(forMe({ from: "pc" }, "phone")).toBe(true);
    expect(forMe({ from: "pc", to: "phone" }, "phone")).toBe(true);
    expect(forMe({ from: "pc", to: "laptop" }, "phone")).toBe(false);
    expect(forMe({ from: "phone" }, "phone")).toBe(false);
    expect(forMe({}, "phone")).toBe(false);
  });
  it("asks only for sounds it doesn't have", () => {
    expect(missing(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
    expect(missing([], ["b"])).toEqual([]);
  });
});
