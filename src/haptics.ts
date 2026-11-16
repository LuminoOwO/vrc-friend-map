// Short vibrations on phones (Settings → Appearance → Interface, off by default).
// Uses the web vibration API; the Android app declares the VIBRATE permission
// (scripts/android-patch.mjs). iPhones don't support it in web views: no-op.
import { getState } from "./store";

const PATTERNS = { tap: 8, toggle: 12, long: 25, success: [10, 40, 10], warn: [30, 60, 30] } as const;
export type HapticKind = keyof typeof PATTERNS;

export function haptic(kind: HapticKind = "tap", force = false) {
  if (!force && !getState().settings.ui.haptics) return;
  try {
    navigator.vibrate?.(PATTERNS[kind] as number | number[]);
  } catch {
    // not supported
  }
}

let installed = false;
/** One listener for the whole app: buttons, toggles and long-press. */
export function installHaptics() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener(
    "click",
    (e) => {
      if (!getState().settings.ui.haptics) return;
      const el = (e.target as HTMLElement | null)?.closest?.("button, [role=button], [role=tab], input[type=checkbox], input[type=radio], select, .chip");
      if (!el) return;
      haptic(el.matches("input[type=checkbox], input[type=radio]") ? "toggle" : "tap");
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    "contextmenu",
    () => {
      if (getState().settings.ui.haptics) haptic("long");
    },
    { capture: true, passive: true },
  );
}
