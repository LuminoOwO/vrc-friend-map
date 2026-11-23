// Phone or desktop layout, from the window's size rather than the device: a narrow computer
// window gets the phone layout, a tablet gets the desktop one. A small dead band between the
// two widths keeps it from flipping back and forth while you resize.
import { useSyncExternalStore } from "react";
import { isMobile } from "./backend";

/** Below this width the desktop layout turns into the phone layout… */
export const PHONE_BELOW = 760;
/** …and from this width it turns back. */
export const DESKTOP_FROM = 820;
/** A touch device whose short side is below this is a phone (also when turned sideways). */
const PHONE_SHORT_SIDE = 500;

function decide(prev: boolean | null): boolean {
  if (typeof window === "undefined") return isMobile;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (isMobile && Math.min(w, h) < PHONE_SHORT_SIDE) return true;
  if (prev === null) return w < PHONE_BELOW;
  return prev ? w < DESKTOP_FROM : w < PHONE_BELOW;
}

let phone = decide(null);
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("resize", () => {
    const next = decide(phone);
    if (next === phone) return;
    phone = next;
    listeners.forEach((f) => f());
  });
}

/** Whether the phone layout is showing right now. */
export function phoneLayout(): boolean {
  return phone;
}

export function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => phone,
  );
}
