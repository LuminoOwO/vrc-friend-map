import { useEffect, useMemo, useState } from "react";
import { backend, type GraphicsInfo } from "../backend";
import { benchmark, gpuInfo, mapDrawMs, mapFps, mapStats, type BenchResult } from "../diag";
import { getState, showToast } from "../store";
import { wheelFixCounts, wheelFixHere } from "../wheelfix";

const ENGINE_NAMES: Record<string, string> = {
  chromium: "Chromium (CEF)",
  webkitgtk: "WebKitGTK",
  webview2: "WebView2 (Chromium)",
  wkwebview: "WKWebView (Safari)",
  "android-webview": "Android WebView (Chromium)",
};

/** Settings → Diagnostics: frame rate, GPU, web engine, and a quick benchmark. */
export function Diagnostics() {
  const [open, setOpen] = useState(false);
  const [gfx, setGfx] = useState<GraphicsInfo | null>(null);
  const [tick, setTick] = useState(0);
  const [bench, setBench] = useState<BenchResult | null>(null);
  const [benching, setBenching] = useState(false);
  const gpu = useMemo(() => (open ? gpuInfo() : null), [open]);

  useEffect(() => {
    if (!open) return;
    backend.graphicsInfo().then(setGfx).catch(() => setGfx(null));
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [open]);

  const rows = useMemo((): [string, string][] => {
    if (!open) return [];
    const fps = mapFps();
    const out: [string, string][] = [
      ["Map frame rate", fps ? `${fps} fps` : "not drawing right now (open the map; it draws while it moves)"],
      ["Map drawing time", fps ? `${mapDrawMs().toFixed(1)} ms per frame (JavaScript only)` : "–"],
      ["Slowest recent frame", mapStats.worstGap ? `${Math.round(mapStats.worstGap)} ms` : "–"],
      ["Map canvas", mapStats.canvasW ? `${mapStats.canvasW} × ${mapStats.canvasH} px (scale ${mapStats.dpr})` : "–"],
      ["Window", `${window.innerWidth} × ${window.innerHeight} (screen ${window.screen.width} × ${window.screen.height}, scale ${window.devicePixelRatio})`],
      ["Web engine", gfx?.engine ? ENGINE_NAMES[gfx.engine] ?? gfx.engine : "browser"],
      ["GPU", gpu ? `${gpu.renderer}${gpu.software ? "  ⚠ software (CPU) rendering" : ""}` : "–"],
      ["GPU vendor", gpu?.vendor ?? "–"],
      ["WebGL", gpu?.webgl ?? "–"],
      ["Vsync", gfx ? (gfx.unlocked_now ? "off (faster than the screen allowed)" : gfx.unlocked ? "on (turns off on the next start)" : "on") : "–"],
      ["Frame rate limit", (() => { const p = getState().settings.perf; return p.fps === -1 ? "unlimited" : p.fps === 0 ? `match the screen${p.screenHz ? ` (${p.screenHz} Hz)` : ""}` : `${p.fps} fps`; })()],
      ["Graphics setting", gfx ? `${gfx.mode}${gfx.forced ? ` (forced to ${gfx.forced} by VRC_FRIEND_MAP_GPU)` : ""}` : "–"],
      ["Mouse wheel", (() => { const c = wheelFixCounts(); return `${c.real} wheel events from the web engine${wheelFixHere ? `, ${c.used} from the wheel fix (${c.skipped} not needed)` : ""}`; })()],
      ["System", gfx?.os ? `${gfx.os} ${gfx.arch}` : navigator.platform],
      ["CPU threads", String(navigator.hardwareConcurrency || "?")],
      ["User agent", navigator.userAgent],
    ];
    for (const [k, v] of gfx?.env ?? []) out.push([`env ${k}`, v]);
    if (bench) {
      out.push([
        "Benchmark",
        `${bench.fps} fps shown, ${bench.msPerFrame.toFixed(1)} ms JavaScript per frame, ${bench.width} × ${bench.height} px, ${bench.frames} frames`,
      ]);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tick, gfx, gpu, bench]);

  const copy = () => {
    const text = `VRC Friend Map ${__APP_VERSION__} diagnostics\n` + rows.map(([k, v]) => `${k}: ${v}`).join("\n");
    navigator.clipboard?.writeText(text).then(
      () => showToast("Diagnostics copied"),
      () => showToast("Couldn't copy"),
    );
  };

  const run = async () => {
    setBenching(true);
    try {
      setBench(await benchmark());
    } finally {
      setBenching(false);
    }
  };

  return (
    <>
      <h3>Diagnostics</h3>
      {!open ? (
        <button className="btn" onClick={() => setOpen(true)}>
          Show frame rate, GPU and web engine details
        </button>
      ) : (
        <>
          <dl className="diag-list">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {gpu?.software && (
            <p className="small">
              The web engine draws without the graphics card here, so big windows get slow. Try Graphics → “Prefer the graphics card”, or
              update your graphics driver.
            </p>
          )}
          <div className="row">
            <button className="btn" disabled={benching} onClick={run}>
              {benching ? "Measuring…" : "Run a quick drawing benchmark"}
            </button>
            <button className="btn" onClick={copy}>
              Copy diagnostics
            </button>
          </div>
          <p className="small muted">
            The benchmark draws a busy scene at full window size for 1.5 seconds. “fps shown” is what reached the screen; if it's low while
            the JavaScript time is small, the web engine itself (not the map) is the slow part.
          </p>
        </>
      )}
    </>
  );
}
