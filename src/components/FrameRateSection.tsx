import { useEffect, useState } from "react";
import { backend, isTauri, type GraphicsInfo } from "../backend";
import { flushSaves, showToast, updatePerf, useApp } from "../store";
import { PERF_NO_LIMIT } from "../types";

// Slider stops. 0 = the screen's refresh rate, -1 = unlimited.
const LIMITS = [0, 30, 45, 60, 75, 90, 120, 144, 165, 240, 360, -1];
const UNFOCUSED = [0, 1, 5, 10, 15, 20, 30, 45, 60, PERF_NO_LIMIT];
const IDLE = [0, 1, 5, 10, 15, 20, 30, 45, 60];
const IDLE_AFTER = [0, 15, 30, 60, 120, 300, 600, 1800];

const limitLabel = (v: number, hz: number | null) =>
  v === 0 ? `Match the screen${hz ? ` (${hz} Hz)` : ""}` : v === -1 ? "Unlimited" : `${v} fps`;
const lowLabel = (v: number, stopText: string) => (v === 0 ? stopText : v >= PERF_NO_LIMIT ? "No change" : `${v} fps`);
const afterLabel = (s: number) => (s === 0 ? "Never" : s < 60 ? `${s} s` : `${s / 60} min`);
const nearest = (list: number[], v: number) => list.reduce((best, x, i) => (Math.abs(x - v) < Math.abs(list[best] - v) ? i : best), 0);

/** The screen's refresh rate, measured with requestAnimationFrame (rounded to a common value). */
function measureHz(): Promise<number> {
  return new Promise((resolve) => {
    const times: number[] = [];
    const step = (t: number) => {
      times.push(t);
      if (times.length < 40) requestAnimationFrame(step);
      else {
        const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
        const hz = 1000 / gaps[Math.floor(gaps.length / 2)];
        const common = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 160, 165, 170, 180, 200, 240, 280, 300, 360, 480, 500];
        const near = common.find((c) => Math.abs(c - hz) < c * 0.03);
        resolve(near ?? Math.round(hz));
      }
    };
    requestAnimationFrame(step);
  });
}

/** Settings → Frame rate: the limit, and lower ones to save power. */
export function FrameRateSection({ gfx }: { gfx: GraphicsInfo | null }) {
  const perf = useApp((s) => s.settings.perf);
  // The screen's rate, measured while vsync is on and remembered for runs without it.
  const [hz, setHz] = useState<number | null>(perf.screenHz || null);
  const [unlocked, setUnlocked] = useState<boolean | null>(null);

  useEffect(() => {
    if (gfx?.unlocked_now) return; // the measurement would show "as fast as possible"
    void measureHz().then((h) => {
      setHz(h);
      if (h !== perf.screenHz) updatePerf({ screenHz: h });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gfx?.unlocked_now]);
  useEffect(() => setUnlocked(gfx?.unlocked ?? null), [gfx?.unlocked]);

  // Faster than the screen needs Chromium started without vsync (next start).
  const wantsUnlock = perf.fps === -1 || (hz !== null && perf.fps > hz + 2);
  const canUnlock = !!gfx?.can_unlock;
  useEffect(() => {
    if (!isTauri || !canUnlock || unlocked === null || unlocked === wantsUnlock || (hz === null && perf.fps !== -1)) return;
    backend
      .graphicsSetUnlocked(wantsUnlock)
      .then(() => setUnlocked(wantsUnlock))
      .catch((e) => showToast(`Couldn't save: ${e}`));
  }, [wantsUnlock, canUnlock, unlocked, hz, perf.fps]);
  const restartNeeded = canUnlock && unlocked !== null && unlocked !== !!gfx?.unlocked_now;

  const li = nearest(LIMITS, perf.fps);
  return (
    <>
      <h3>Frame rate</h3>
      <label className="field">
        <span>
          Limit: <b>{limitLabel(LIMITS[li], hz)}</b>
        </span>
        <input type="range" min={0} max={LIMITS.length - 1} step={1} value={li} onChange={(e) => updatePerf({ fps: LIMITS[Number(e.target.value)] })} />
      </label>
      {wantsUnlock && !canUnlock && (
        <p className="small muted">Faster than the screen needs the Chromium build (Linux) or Windows; here the map runs at the screen's rate.</p>
      )}
      {wantsUnlock && canUnlock && (
        <p className="small muted">
          Faster than the screen turns off vsync for the app: the GPU works harder and you may see tearing. You only see as many frames as
          the screen shows.
        </p>
      )}
      {restartNeeded && (
        <div className="row">
          <span className="small">Restart the app for the new limit to take effect.</span>
          <button
            className="btn"
            onClick={async () => {
              try {
                await flushSaves();
                await backend.restartApp();
              } catch (err) {
                showToast(`Couldn't restart: ${err}`);
              }
            }}
          >
            Restart now
          </button>
        </div>
      )}

      <h4 className="sub-h">Saving power</h4>
      <label className="field">
        <span>
          While the window isn't focused: <b>{lowLabel(perf.unfocusedFps, "Stop moving")}</b>
        </span>
        <input
          type="range"
          min={0}
          max={UNFOCUSED.length - 1}
          step={1}
          value={nearest(UNFOCUSED, perf.unfocusedFps)}
          onChange={(e) => updatePerf({ unfocusedFps: UNFOCUSED[Number(e.target.value)] })}
        />
      </label>
      <div className="row">
        <label className="field narrow">
          <span>When I haven't touched anything for</span>
          <select value={nearest(IDLE_AFTER, perf.idleAfter)} onChange={(e) => updatePerf({ idleAfter: IDLE_AFTER[Number(e.target.value)] })}>
            {IDLE_AFTER.map((s, i) => (
              <option key={s} value={i}>
                {afterLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="field narrow">
          <span>
            …go down to: <b>{lowLabel(perf.idleFps, "Stop moving")}</b>
          </span>
          <input
            type="range"
            min={0}
            max={IDLE.length - 1}
            step={1}
            disabled={perf.idleAfter === 0}
            value={nearest(IDLE, perf.idleFps)}
            onChange={(e) => updatePerf({ idleFps: IDLE[Number(e.target.value)] })}
          />
        </label>
      </div>
      <p className="small muted">
        These only slow down the orbit and other animation; anything you do (moving the mouse, a key, a click) brings the full rate back
        right away. A minimized window doesn't draw at all. Turn on “Show frame rate” in Map options to see the effect.
      </p>
    </>
  );
}
