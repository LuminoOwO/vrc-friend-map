import { describe, expect, it } from "vitest";
import { hzFromFrameTimes } from "../components/FrameRateSection";

/** Frame times of a screen at `hz`, rounded to whole ms like WebKitGTK does, with a few dropped frames. */
function frames(hz: number, n: number, round = true, drops: number[] = []) {
  const out: number[] = [];
  let t = 1000;
  for (let i = 0; i < n; i++) {
    t += (1000 / hz) * (drops.includes(i) ? 2 : 1);
    out.push(round ? Math.round(t) : t);
  }
  return out;
}

describe("screen refresh rate from frame times", () => {
  it("reads 60 Hz when frame times are rounded to whole milliseconds", () => {
    expect(hzFromFrameTimes(frames(59.95, 110))).toBe(60);
    expect(hzFromFrameTimes(frames(60, 110, true, [5, 40, 80]))).toBe(60);
  });
  it("reads other common rates", () => {
    expect(hzFromFrameTimes(frames(144, 110))).toBe(144);
    expect(hzFromFrameTimes(frames(165, 110, false))).toBe(165);
    expect(hzFromFrameTimes(frames(75, 110))).toBe(75);
  });
});
