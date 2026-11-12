// Dev-only frame-time harness: open the dev server with ?perf=<collector url>.
// Runs the demo through a few map settings while panning, and POSTs the
// results (frame intervals and draw() times) to the collector.
import { getState, setState, updateMap, updateSettings } from "./store";
import type { MapSettings, Theme } from "./types";

type G = {
  transform: () => { x: number; y: number; k: number };
  setTransform: (x: number, y: number, k: number) => void;
  fit: () => void;
  reheat: () => void;
  stats: { times: number[] };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (a: number[], p: number) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0);

async function measure(g: G, ms: number, pan: boolean) {
  const t = g.transform();
  const frames: number[] = [];
  g.stats.times.length = 0;
  let last = performance.now();
  const start = last;
  await new Promise<void>((done) => {
    const step = (now: number) => {
      frames.push(now - last);
      last = now;
      if (pan) {
        const a = (now - start) / 600;
        g.setTransform(t.x + Math.sin(a) * 120, t.y + Math.cos(a * 0.7) * 80, t.k * (1 + Math.sin(a * 0.5) * 0.15));
      }
      if (now - start < ms) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  });
  frames.shift();
  const draws = g.stats.times.slice();
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return {
    fps: Math.round(1000 / avg(frames)),
    frameP50: +pct(frames, 0.5).toFixed(1),
    frameP95: +pct(frames, 0.95).toFixed(1),
    draws: draws.length,
    drawAvg: +avg(draws).toFixed(2),
    drawP95: +pct(draws, 0.95).toFixed(2),
  };
}

export async function runPerf(collector: string) {
  const post = (body: unknown) => fetch(collector, { method: "POST", body: JSON.stringify(body) }).catch(() => {});
  try {
    await post({ event: "start", ua: navigator.userAgent, dpr: devicePixelRatio, w: innerWidth, h: innerHeight });
    // Start the demo from the login screen.
    for (let i = 0; i < 50; i++) {
      const b = [...document.querySelectorAll("button")].find((x) => /demo/i.test(x.textContent ?? ""));
      if (b) {
        b.click();
        break;
      }
      await sleep(200);
    }
    for (let i = 0; i < 50 && !(window as unknown as { __vfmGraph?: G }).__vfmGraph; i++) await sleep(200);
    const g = (window as unknown as { __vfmGraph: G }).__vfmGraph;
    if (!g) throw new Error("no graph");
    await sleep(4000); // layout settles
    const only = new URLSearchParams(location.search).get("only");
    const all: { name: string; theme?: Theme; map?: Partial<MapSettings>; pan?: boolean; sim?: boolean; css?: string; group?: string; noHere?: boolean }[] = [
      { group: "css", name: "css: baseline (pan)" },
      { group: "new2", name: "new2: baseline (pan)" },
      { group: "new2", name: "new2: no me", map: { showMe: false } },
      { group: "new2", name: "new2: nobody here", noHere: true },
      { group: "new2", name: "new2: no me, nobody here", map: { showMe: false }, noHere: true },
      { group: "new", name: "new: baseline (pan)" },
      { group: "new", name: "new: no here strip", css: ".here-now { display: none !important; }" },
      { group: "new", name: "new: no me", map: { showMe: false } },
      { group: "new", name: "new: neither", map: { showMe: false }, css: ".here-now { display: none !important; }" },
      { group: "new", name: "new: strip without shadow", map: { showMe: false }, css: ".here-now { box-shadow: none !important; }" },
      { group: "new", name: "new: strip own layer", map: { showMe: false }, css: ".here-now { will-change: transform; transform: translateZ(0); }" },
      { group: "css", name: "css: no dither background", css: ".graph, .login { background: var(--bg) !important; }" },
      { group: "css", name: "css: no shadows/filters", css: "* { box-shadow: none !important; filter: none !important; text-shadow: none !important; }" },
      { group: "css", name: "css: hide overlays", css: ".graph > :not(canvas) { display: none !important; }" },
      { group: "css", name: "css: hide sidebar/topbar", css: ".sidebar, .topbar, aside, header { display: none !important; }" },
      { group: "css", name: "css: no transitions/animations", css: "* { transition: none !important; animation: none !important; }" },
      { group: "css", name: "css: all of the above", css: ".graph, .login { background: var(--bg) !important; } * { box-shadow: none !important; filter: none !important; transition: none !important; animation: none !important; } .graph > :not(canvas) { display: none !important; }" },
    ];
    const scenarios: { name: string; theme?: Theme; map?: Partial<MapSettings>; pan?: boolean; sim?: boolean; css?: string; group?: string; noHere?: boolean }[] = only ? all.filter((x) => x.group === only) : [
      { name: "idle (no movement)", pan: false },
      { name: "pan: pictures (default)" },
      { name: "pan: dots", map: { nodeStyle: "dot" } },
      { name: "pan: cards", map: { nodeStyle: "card" } },
      { name: "pan: full cards", map: { nodeStyle: "fullcard" } },
      { name: "pan: pictures, no circles", map: { nodeStyle: "icon", hulls: false } },
      { name: "pan: pictures, no lines", map: { nodeStyle: "icon", hulls: true, lines: "none" } },
      { name: "pan: oled theme", theme: "oled", map: { lines: getState().settings.map.lines } },
      { name: "layout moving (sim)", theme: "dark", pan: false, sim: true },
      { name: "pan: me + others shown", map: { showMe: true, showOthers: "here" } },
    ];
    const styleEl = document.createElement("style");
    document.head.appendChild(styleEl);
    const base = { ...getState().settings.map };
    const savedHere = getState().here;
    for (const sc of scenarios) {
      updateMap({ ...base, ...(sc.map ?? {}) });
      if (sc.theme) updateSettings({ theme: sc.theme });
      styleEl.textContent = sc.css ?? "";
      if (sc.noHere !== undefined) setState({ here: sc.noHere ? null : savedHere });
      await sleep(sc.theme ? 2500 : 800);
      const gg = (window as unknown as { __vfmGraph: G }).__vfmGraph;
      gg.fit();
      await sleep(400);
      if (sc.sim) gg.reheat();
      const r = await measure(gg, 4000, sc.pan !== false);
      await post({ event: "result", name: sc.name, ...r });
    }
    await post({ event: "done" });
  } catch (e) {
    await post({ event: "error", message: String(e) });
  }
}
