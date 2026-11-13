import { useEffect, useState } from "react";
import { backend, isTauri, type GraphicsInfo } from "../backend";
import { flushSaves, showToast, updatePerf, useApp } from "../store";

const IDLE_AFTER = [0, 15, 30, 60, 120, 300, 600, 1800];
const afterLabel = (s: number) => (s === 0 ? "Never" : s < 60 ? `${s} s` : `${s / 60} min`);

/** A frame-rate field: whole numbers from -1 up; applied when it's a valid number. */
function FpsInput({ value, onChange, min = -1 }: { value: number; onChange: (v: number) => void; min?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (t: string) => {
    const v = Math.round(Number(t));
    if (t.trim() !== "" && Number.isFinite(v) && v >= min && v <= 1000) onChange(v);
    else setText(String(value));
  };
  return (
    <input
      className="fps-input"
      type="number"
      inputMode="numeric"
      min={min}
      max={1000}
      step={1}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const v = Number(e.target.value);
        if (e.target.value.trim() !== "" && Number.isInteger(v) && v >= min && v <= 1000) onChange(v);
      }}
      onBlur={(e) => commit(e.target.value)}
    />
  );
}

const meaning = (v: number, zero: string, minus: string) => (v === -1 ? minus : v === 0 ? zero : `${v} fps`);

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
  // The screen's rate, measured while vsync is on and remembered for runs without it.
  const [hz, setHz] = useState<number | null>(perf.screenHz || null);
  const [saved, setSaved] = useState<boolean | null>(null); // vsync off saved for the next start

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
  const above = perf.fps === -1 || (hz !== null && perf.fps > hz + 2);

  return (
    <>
      <h3>Frame rate</h3>
      <label className="check">
        <input type="checkbox" checked={perf.vsync} disabled={!canUnlock && perf.vsync} onChange={(e) => updatePerf({ vsync: e.target.checked })} />
        Vsync (wait for the screen{hz ? `, ${hz} Hz` : ""})
      </label>
      {!canUnlock && <p className="small muted">Turning vsync off needs the Chromium build (Linux) or Windows.</p>}
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
      <label className="fps-row">
        <span>Frame rate limit</span>
        <FpsInput value={perf.fps} onChange={(fps) => updatePerf({ fps })} />
        <span className="small muted">{meaning(perf.fps, `same as the screen${hz ? ` (${hz} Hz)` : ""}`, "unlimited")}</span>
      </label>
      <p className="small muted">
        -1 = unlimited, 0 = same as the screen.
        {above && vsyncNow ? ` With vsync on, ${hz ? `${hz} fps` : "the screen's rate"} is the most you get.` : ""}
      </p>

      <h4 className="sub-h">Saving power</h4>
      <label className="fps-row">
        <span>While the window isn't focused</span>
        <FpsInput value={perf.unfocusedFps} onChange={(unfocusedFps) => updatePerf({ unfocusedFps })} />
        <span className="small muted">{meaning(perf.unfocusedFps, "stop moving", "no change")}</span>
      </label>
      <label className="fps-row">
        <span>After no input for</span>
        <select value={IDLE_AFTER.indexOf(perf.idleAfter) >= 0 ? IDLE_AFTER.indexOf(perf.idleAfter) : 0} onChange={(e) => updatePerf({ idleAfter: IDLE_AFTER[Number(e.target.value)] })}>
          {IDLE_AFTER.map((s, i) => (
            <option key={s} value={i}>
              {afterLabel(s)}
            </option>
          ))}
        </select>
        {perf.idleAfter > 0 && (
          <>
            <span>go down to</span>
            <FpsInput value={perf.idleFps} onChange={(idleFps) => updatePerf({ idleFps })} />
            <span className="small muted">{meaning(perf.idleFps, "stop moving", "no change")}</span>
          </>
        )}
      </label>
      <p className="small muted">For these: 0 = stop moving, -1 = no change.</p>
      <p className="small muted">
        These only slow down the orbit and other animation; anything you do (moving the mouse, a key, a click) brings the full rate back
        right away. A minimized window doesn't draw at all. Turn on “Show frame rate” in Map options to see the effect.
      </p>
    </>
  );
}
