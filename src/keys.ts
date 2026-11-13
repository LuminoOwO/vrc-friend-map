// App-wide keys (desktop): F11 toggles real window fullscreen, and browser
// shortcuts that make no sense in an app (caret browsing, print, save page,
// view source, open file) are swallowed before Chromium acts on them.
import { invoke } from "@tauri-apps/api/core";
import { isMobile, isTauri } from "./backend";

export function startKeys() {
  if (!isTauri || isMobile) return;
  window.addEventListener(
    "keydown",
    (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "F11" && !mod && !e.altKey) {
        e.preventDefault();
        void invoke("window_toggle_fullscreen").catch(() => {});
        return;
      }
      if (e.key === "F7" || (mod && !e.shiftKey && ["p", "s", "u", "o"].includes(e.key.toLowerCase()))) e.preventDefault();
    },
    { capture: true },
  );
}
