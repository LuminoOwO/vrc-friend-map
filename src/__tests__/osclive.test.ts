import { describe, expect, it } from "vitest";
import { toggles, wear } from "../osclive";

describe("OSC live", () => {
  it("keeps each avatar once, newest first, with its last known name", () => {
    let h = wear([], "avtr_a", "Fox", 1);
    h = wear(h, "avtr_b", "Cat", 2);
    h = wear(h, "avtr_a", "", 3);
    expect(h).toEqual([
      { id: "avtr_a", name: "Fox", at: 3 },
      { id: "avtr_b", name: "Cat", at: 2 },
    ]);
  });
  it("offers only the avatar's own inputs as toggles", () => {
    const t = toggles({
      id: "avtr_a",
      name: "Fox",
      parameters: [
        { name: "Ears", type: "Bool", input: true },
        { name: "Outfit", type: "Int", input: true },
        { name: "VelocityX", type: "Float", input: false },
        { name: "AFK", type: "Bool", input: true },
        { name: "Weird", type: "String", input: true },
      ],
    });
    expect(t.map((p) => p.name)).toEqual(["Ears", "Outfit"]);
    expect(toggles(null)).toEqual([]);
  });
});
