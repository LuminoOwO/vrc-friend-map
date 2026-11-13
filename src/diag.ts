// Numbers for Settings → Diagnostics: how the map draws, what the web view
// runs on, and a quick drawing benchmark. Nothing here leaves the device
// unless the user copies it.

/** Updated by the map on every frame it draws. */
export const mapStats = {
  frames: [] as number[], // start times of the frames in the last second
  times: [] as number[], // their JavaScript drawing times, ms
  worstGap: 0, // longest recent gap between frames while drawing continuously, ms
  canvasW: 0,
  canvasH: 0,
  dpr: 1,
};

/** Called with each frame's start time (for the frame-rate test). */
export const frameHooks = new Set<(t: number) => void>();

export function noteFrame(t0: number, ms: number) {
  for (const h of frameHooks) h(t0);
  const s = mapStats;
  const prev = s.frames[s.frames.length - 1];
  s.frames.push(t0);
  s.times.push(ms);
  while (s.frames.length && t0 - s.frames[0] > 1000) {
    s.frames.shift();
    s.times.shift();
  }
  if (prev && t0 - prev < 250) s.worstGap = Math.max(s.worstGap * 0.98, t0 - prev);
}

export function mapDrawMs(): number {
  const t = mapStats.times;
  return t.length ? t.reduce((a, b) => a + b, 0) / t.length : 0;
}

export function mapFps(now = performance.now()): number {
  const f = mapStats.frames;
  if (f.length < 2 || now - f[f.length - 1] > 500) return 0; // not drawing right now
  return Math.round(((f.length - 1) * 1000) / (f[f.length - 1] - f[0]));
}

export interface GpuInfo {
  webgl: string; // "WebGL 2" / "WebGL 1" / "not available"
  vendor: string;
  renderer: string;
  software: boolean; // a CPU rasterizer (llvmpipe, SwiftShader, ...)
}

export function gpuInfo(): GpuInfo {
  const c = document.createElement("canvas");
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  let webgl = "not available";
  try {
    gl = c.getContext("webgl2");
    if (gl) webgl = "WebGL 2";
    else {
      gl = c.getContext("webgl") as WebGLRenderingContext | null;
      if (gl) webgl = "WebGL 1";
    }
  } catch {
    gl = null;
  }
  if (!gl) return { webgl, vendor: "–", renderer: "–", software: false };
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const vendor = String(ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR));
  const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  const software = /llvmpipe|softpipe|swiftshader|software|swrast|basic render/i.test(`${vendor} ${renderer}`);
  return { webgl, vendor, renderer, software };
}

export interface BenchResult {
  width: number;
  height: number;
  frames: number;
  msPerFrame: number; // JavaScript time per frame, drawing into a visible-size canvas
  fps: number; // frames the browser actually showed per second
}

/** Draws a busy scene into a full-window canvas for about 1.5 s. */
export function benchmark(): Promise<BenchResult> {
  return new Promise((resolve) => {
    const c = document.createElement("canvas");
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.cssText = `position:fixed;inset:0;width:${w}px;height:${h}px;z-index:9999;pointer-events:none;opacity:0.02`;
    document.body.appendChild(c);
    const ctx = c.getContext("2d")!;
    const dots = Array.from({ length: 600 }, (_, i) => ({ x: Math.random() * w, y: Math.random() * h, r: 6 + (i % 5) * 4 }));
    let frames = 0;
    let spent = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t0 = performance.now();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#14161c";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(140,160,255,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < dots.length; i++) {
        ctx.moveTo(dots[i - 1].x, dots[i - 1].y);
        ctx.lineTo(dots[i].x, dots[i].y);
      }
      ctx.stroke();
      ctx.font = "500 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      const a = (now - start) / 900;
      for (const d of dots) {
        const x = d.x + Math.cos(a + d.r) * 8;
        const y = d.y + Math.sin(a + d.r) * 8;
        ctx.fillStyle = "#3b82f6";
        ctx.beginPath();
        ctx.arc(x, y, d.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e5e7eb";
        ctx.fillText("Name", x, y + d.r + 12);
      }
      spent += performance.now() - t0;
      frames++;
      if (now - start < 1500) requestAnimationFrame(step);
      else {
        const secs = (performance.now() - start) / 1000;
        c.remove();
        resolve({ width: c.width, height: c.height, frames, msPerFrame: spent / frames, fps: Math.round(frames / secs) });
      }
    };
    requestAnimationFrame(step);
  });
}
