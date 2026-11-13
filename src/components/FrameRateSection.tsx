import { useEffect, useState } from "react";
import { backend, isTauri, type GraphicsInfo } from "../backend";
import { flushSaves, showToast, updatePerf, useApp } from "../store";
import { findBestLimit, type LimitResult } from "../fpstest";
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

/** Settings → Frame rate: vsync, the limit, and lower ones to save power. */
export function FrameRateSection({ gfx }: { gfx: GraphicsInfo | null }) {
  const perf = useApp((s) => s.settings.perf);
  const view = useApp((s) => s.view);
  // The screen's rate, measured while vsync is on and remembered for runs without it.
  const [hz, setHz] = useState<number | null>(perf.screenHz || null);
  const [saved, setSaved] = useState<boolean | null>(null); // vsync off saved for the next start
  const [testing, setTesting] = useState<LimitResult[] | null>(null);
  const [testDone, setTestDone] = useState(false);

  useEffect(() => {
    if (gfx?.unlocked_now) return; // without vsync this would measure "as fast as possible"
    void measureHz().then((h) => {
      setHz(h);
      if (h !== perf.screenHz) updatePerf({ screenHz: h });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gfx?.unlocked_now]);
  useEffect(() => setSaved(gfx?.unlocked ?? null), [gfx?.unlocked]);

  const canUnlock = !!gfx?.can_unlock;
  const vsyncNow = !gfx?.unlocked_now;
  // Keep the saved startup switch in line with the vsync setting.
  useEffect(() => {
    if (!isTauri || !canUnlock || saved === null || saved === !perf.vsync) return;
    backend
      .graphicsSetUnlocked(!perf.vsync)
      .then(() => setSaved(!perf.vsync))
      .catch((e) => showToast(`Couldn't save: ${e}`));
  }, [perf.vsync, canUnlock, saved]);
  const restartNeeded = canUnlock && saved !== null && saved === vsyncNow;

  const li = nearest(LIMITS, perf.fps);
  const above = perf.fps === -1 || (hz !== null && perf.fps > hz + 2);

  const runTest = async () => {
    const base = hz ?? 60;
    const candidates = [base, 90, 120, 144, 165, 200, 240, 300, 360, 480].filter((c) => c >= base && (c === base || c > base + 5));
    setTestDone(false);
    setTesting([]);
    const best = await findBestLimit(candidates, setTesting);
    setTestDone(true);
    showToast(best ? `Best limit here: ${best.limit} fps` : "None of the limits ran evenly; kept your limit");
  };

  return (
    <>
      <h3>Frame rate</h3>
      <label className="check">
        <input type="checkbox" checked={perf.vsync} disabled={!canUnlock && perf.vsync} onChange={(e) => updatePerf({ vsync: e.target.checked })} />
        Vsync: wait for the screen{hz ? ` (${hz} Hz)` : ""}. Smoothest, and the screen can't show more frames than this anyway.
      </label>
      {!canUnlock && <p className="small muted">Turning vsync off needs the Chromium build (Linux) or Windows.</p>}
      {canUnlock && !perf.vsync && (
        <p className="small muted">
          Without vsync the app draws as soon as a frame is due: less delay between your mouse and the picture, but you may see tearing, and
          very high limits make everything feel worse (frames pile up faster than the screen shows them). Use the test below to find a
          limit that stays even.
        </p>
      )}
      {restartNeeded && (
        <div className="row">
          <span className="small">Restart the app to turn vsync {perf.vsync ? "on" : "off"}.</span>
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
      <label className="field">
        <span>
          Limit: <b>{limitLabel(LIMITS[li], hz)}</b>
        </span>
        <input type="range" min={0} max={LIMITS.length - 1} step={1} value={li} onChange={(e) => updatePerf({ fps: LIMITS[Number(e.target.value)] })} />
      </label>
      {above && vsyncNow && <p className="small muted">With vsync on, {hz ? `${hz} fps` : "the screen's rate"} is the most you get.</p>}
      {!vsyncNow && (
        <div className="row">
          <button className="btn" disabled={(!!testing && !testDone) || view !== "graph"} onClick={runTest} title={view !== "graph" ? "Open the map first" : undefined}>
            {testing && !testDone ? "Testing…" : "Find the best limit"}
          </button>
          <span className="small muted">Tries limits on the map for ~3 s each and keeps the highest that runs evenly without delaying input.</span>
        </div>
      )}
      {testing && testing.length > 0 && (
        <table className="fps-test small">
          <thead>
            <tr>
              <th>Limit</th>
              <th>Reached</th>
              <th>Evenness</th>
              <th>Input delay</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {testing.map((r) => (
              <tr key={r.limit} className={r.ok ? "ok" : "bad"}>
                <td>{r.limit} fps</td>
                <td>{r.fps} fps</td>
                <td>{r.evenness.toFixed(2)}×</td>
                <td>{r.inputDelay.toFixed(1)} ms</td>
                <td>{r.ok ? "✓" : "✗"}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
