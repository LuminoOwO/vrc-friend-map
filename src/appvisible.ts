// Whether the app's window is hidden in the tray. Hiding a window to the tray
// doesn't tell the page it's hidden (document.hidden stays false), so the map
// would keep animating; the Rust side says so instead (src-tauri/src/tray.rs:
// "window-hidden" / "window-shown"). While hidden, the map draws nothing and
// CSS animations are paused (html.app-hidden in styles.css).
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "./backend";

let hidden = false;
const subs = new Set<(hidden: boolean) => void>();

function set(v: boolean) {
  if (v === hidden) return;
  hidden = v;
  document.documentElement.classList.toggle("app-hidden", v);
  subs.forEach((f) => f(v));
}

/** The window is in the tray (or the page is hidden). */
export function appHidden(): boolean {
  return hidden || document.hidden;
}

export function onAppVisibility(cb: (hidden: boolean) => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

export function startAppVisibility() {
  if (isTauri) {
    void listen("window-hidden", () => set(true));
    void listen("window-shown", () => set(false));
  }
  // Any sign of life from the window means it's showing again.
  for (const e of ["focus", "pointermove", "pointerdown", "keydown"] as const) window.addEventListener(e, () => set(false), { passive: true, capture: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) set(false);
    subs.forEach((f) => f(appHidden()));
  });
}
