// Mouse wheel fallback for X11 (see src-tauri/src/wheelfix.rs). The Rust side
// reports wheel steps over the window; when the page got no real wheel event
// for that step, this makes one: the map zooms (d3 listens for wheel events)
// and anything else scrolls the box under the pointer.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isMobile, isTauri } from "./backend";
import { getState, subscribeState } from "./store";

/** Pixels per wheel step, like Chromium on Linux. */
const STEP = 100;
let lastReal = 0;
let real = 0;
/** Real wheel events that moved nothing (deltas of 0). */
let empty = 0;
let used = 0;
let skipped = 0;

export interface WheelFixState {
  enabled: boolean;
  running: boolean;
  forced: boolean;
  /** On by default (Chromium build on Linux). */
  auto: boolean;
}

export const wheelFixHere = isTauri && !isMobile && /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);

/** How many wheel steps the fallback handled / left to the normal path. */
export function wheelFixCounts() {
  return { real, empty, used, skipped };
}

function scrollable(el: Element | null, dx: number, dy: number): Element | null {
  for (let e = el; e; e = e.parentElement) {
    const s = getComputedStyle(e);
    if (dy && /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight) {
      if ((dy < 0 && e.scrollTop > 0) || (dy > 0 && e.scrollTop + e.clientHeight < e.scrollHeight - 1)) return e;
    }
    if (dx && /(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth) {
      if ((dx < 0 && e.scrollLeft > 0) || (dx > 0 && e.scrollLeft + e.clientWidth < e.scrollWidth - 1)) return e;
    }
  }
  return document.scrollingElement;
}

export function applyWheelStep(x: number, y: number, dx: number, dy: number) {
  const target = document.elementFromPoint(x, y) ?? document.body;
  const ev = new WheelEvent("wheel", {
    deltaX: dx * STEP,
    deltaY: dy * STEP,
    deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  // Handlers like the map's zoom take it and cancel it; otherwise scroll like the browser would.
  if (target.dispatchEvent(ev)) scrollable(target, dx, dy)?.scrollBy({ left: dx * STEP, top: dy * STEP });
}

export function startWheelFix() {
  if (!wheelFixHere) return;
  // Turn the Rust side on once the saved settings say so.
  let asked = false;
  const check = () => {
    if (!asked && getState().settings.wheelFix) {
      asked = true;
      void wheelFixSet(true).catch(() => {});
    }
  };
  check();
  subscribeState(check);
  window.addEventListener(
    "wheel",
    (e) => {
      if (!e.isTrusted) return;
      // A wheel event whose deltas are all 0 moves nothing, so it must not count as "a real
      // event came" and hold back the fallback (otherwise nothing would scroll at all).
      if (Math.abs(e.deltaX) + Math.abs(e.deltaY) + Math.abs(e.deltaZ) < 0.01) {
        empty++;
        // That's the broken case: switch the fallback on for this run even if the setting is
        // off. Where the wheel works, events always move something, so this never happens.
        if (!asked) {
          asked = true;
          void wheelFixSet(true).catch(() => {});
        }
        return;
      }
      lastReal = performance.now();
      real++;
    },
    { capture: true, passive: true },
  );
  void listen<{ x: number; y: number; dx: number; dy: number }>("native-wheel", (e) => {
    const at = performance.now();
    // A real wheel event for the same step may come a little before or after.
    setTimeout(() => {
      if (Math.abs(lastReal - at) < 150) {
        skipped++;
        return;
      }
      used++;
      // The payload is in device pixels; clientX/Y are CSS pixels.
      const dpr = window.devicePixelRatio || 1;
      applyWheelStep(e.payload.x / dpr, e.payload.y / dpr, e.payload.dx, e.payload.dy);
    }, 60);
  });
}

export function wheelFixSet(enabled: boolean): Promise<WheelFixState> {
  return invoke<WheelFixState>("wheel_fix_set", { enabled });
}

export function wheelFixState(): Promise<WheelFixState | null> {
  return wheelFixHere ? invoke<WheelFixState>("wheel_fix_state").catch(() => null) : Promise.resolve(null);
}
