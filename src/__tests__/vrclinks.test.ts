import { describe, expect, it } from "vitest";
import { parseVrchatLink } from "../vrclinks";

const U = "usr_c1644b5b-3ca4-45b4-97c6-a2a0de70d469";
const W = "wrld_4cf554b4-430c-4f8f-b53e-1f294eed230b";
const G = "grp_71a7ff59-112c-4e78-a990-c7cc650776e5";

describe("VRChat links", () => {
  it("profiles, worlds, groups", () => {
    expect(parseVrchatLink(`https://vrchat.com/home/user/${U}`)).toEqual({ kind: "user", id: U });
    expect(parseVrchatLink(`https://vrchat.com/home/world/${W}`)).toEqual({ kind: "world", id: W });
    expect(parseVrchatLink(`https://vrchat.com/home/group/${G}`)).toEqual({ kind: "group", id: G });
  });
  it("instances", () => {
    expect(parseVrchatLink(`https://vrchat.com/home/launch?worldId=${W}&instanceId=12345~friends(${U})~region(eu)`)).toEqual({ kind: "instance", location: `${W}:12345~friends(${U})~region(eu)` });
    expect(parseVrchatLink(`vrchat://launch?ref=vrchat.com&id=${W}:999~region(us)`)).toEqual({ kind: "instance", location: `${W}:999~region(us)` });
  });
  it("not a link", () => {
    expect(parseVrchatLink("hello")).toBeNull();
  });
});
