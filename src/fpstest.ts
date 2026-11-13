// "Find the best limit" (Settings → Frame rate, with vsync off): tries limits
// one after another on the live map and keeps the highest one that holds its
// rate evenly without delaying input.
import { frameHooks } from "./diag";
import { getState, updateMap, updatePerf } from "./store";

export interface LimitResult {
  limit: number;
  fps: number; // frames per second reached
  evenness: number; // 95th-percentile gap between frames / the target gap (1 = perfectly even)
  inputDelay: number; // 95th-percentile delay of the main thread, ms (input waits this long)
  ok: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const p95 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)] : 0);

async function measure(limit: number): Promise<LimitResult> {
  updatePerf({ fps: limit });
  await sleep(700); // settle
  const frames: number[] = [];
  const hook = (t: number) => frames.push(t);
  frameHooks.add(hook);
  // How late a 10 ms timer fires: what a click or key press would wait.
  const delays: number[] = [];
  let expect = performance.now() + 10;
  const probe = setInterval(() => {
    const now = performance.now();
    delays.push(Math.max(0, now - expect));
    expect = now + 10;
  }, 10);
  await sleep(2000);
  clearInterval(probe);
  frameHooks.delete(hook);
  const gaps = frames.slice(1).map((t, i) => t - frames[i]);
  const secs = frames.length > 1 ? (frames[frames.length - 1] - frames[0]) / 1000 : 1;
  const fps = Math.round((frames.length - 1) / secs);
  const target = 1000 / limit;
  const evenness = gaps.length ? p95(gaps) / target : 99;
  const inputDelay = p95(delays);
  const ok = fps >= limit * 0.92 && evenness <= 1.6 && inputDelay <= 8;
  return { limit, fps, evenness, inputDelay, ok };
}

/** Runs the test; the map has to be on screen. Leaves the best limit set. */
export async function findBestLimit(candidates: number[], onStep: (r: LimitResult[]) => void): Promise<LimitResult | null> {
  const s = getState();
  const before = { fps: s.settings.perf.fps, orbit: s.settings.map.orbit };
  if (!before.orbit) updateMap({ orbit: 1 }); // something has to move
  const results: LimitResult[] = [];
  let best: LimitResult | null = null;
  try {
    for (const c of candidates) {
      const r = await measure(c);
      results.push(r);
      onStep([...results]);
      if (r.ok) best = r;
      else if (results.filter((x) => !x.ok).length >= 2) break; // two misses in a row: higher won't do better
    }
  } finally {
    if (!before.orbit) updateMap({ orbit: 0 });
    updatePerf({ fps: best ? best.limit : before.fps });
  }
  return best;
}
