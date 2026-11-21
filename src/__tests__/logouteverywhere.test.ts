import { beforeEach, describe, expect, it, vi } from "vitest";

const logoutAll = vi.fn(async () => {});
vi.mock("../session", () => ({ logoutAll }));

import { SELF_FORMAT } from "../devicesync";
import { takeSelfFromDevice } from "../share";
import { getState, setState } from "../store";

const payload = (logoutAt?: number) => ({ format: SELF_FORMAT, t: 1, circles: [], dismissedGroups: [], shareNotes: {}, notifyPeople: {}, logoutAt });
const flush = () => new Promise((r) => setTimeout(r, 20));

describe("log out everywhere, received from another device", () => {
  beforeEach(() => {
    logoutAll.mockClear();
    setState({ demo: false, session: { logged_in: true, user_id: "usr_me", display_name: "Me" }, local: { ...getState().local, loginAt: 1000, logoutAt: undefined } });
  });
  it("logs out a device that logged in before the press", async () => {
    takeSelfFromDevice(payload(2000));
    await flush();
    expect(logoutAll).toHaveBeenCalledTimes(1);
    expect(getState().local.logoutAt).toBe(2000);
  });
  it("leaves a device alone that logged in after it", async () => {
    takeSelfFromDevice(payload(500));
    await flush();
    expect(logoutAll).not.toHaveBeenCalled();
    expect(getState().local.logoutAt).toBe(500);
  });
  it("does nothing without a press, or when not logged in", async () => {
    takeSelfFromDevice(payload());
    setState({ session: { logged_in: false, user_id: null, display_name: null } });
    takeSelfFromDevice(payload(5000));
    await flush();
    expect(logoutAll).not.toHaveBeenCalled();
  });
});
