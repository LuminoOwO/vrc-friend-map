// Which features work where. Settings uses this to hide (or grey out, with
// the reason) what can't work on this device; see Settings → Appearance →
// "Hide features not available on this platform".
import { isMobile, isTauri } from "./backend";

const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
export const isAndroid = /Android/i.test(ua);
export const isIOS = /iPhone|iPad|iPod/i.test(ua);
export const isLinux = !isAndroid && /Linux/i.test(ua);
export const isWindows = /Windows/i.test(ua);
export const isMac = !isIOS && /Mac OS X|Macintosh/i.test(ua);
export const isDesktopApp = isTauri && !isMobile;

export type Feature =
  | "tray"
  | "closeWindow"
  | "wheelFix"
  | "gameLogs"
  | "haptics"
  | "installUpdates"
  | "silentSystemNotify"
  | "vrOverlay"
  | "steam"
  | "mpris"
  | "discord"
  | "backgroundService"
  | "widget"
  | "launchGame";

/** Why a feature can't work here, or null when it can. */
export function unavailable(f: Feature): string | null {
  const web = !isTauri ? "Not in the browser version." : null;
  switch (f) {
    case "tray":
    case "closeWindow":
      return web ?? (isMobile ? "Only on computers." : null);
    case "wheelFix":
      return web ?? (isLinux ? null : "Only needed on Linux (X11).");
    case "gameLogs":
      return web ?? (isIOS ? "iPhones can't read VRChat's files." : null);
    case "haptics":
      return isMobile ? null : "Only on phones.";
    case "installUpdates":
      return web ?? (isIOS ? "iPhone apps update by installing a new IPA." : null);
    case "silentSystemNotify":
      return web ?? (isLinux ? null : "Only on Linux.");
    case "vrOverlay":
    case "steam":
    case "launchGame":
      return web ?? (isMobile ? "Only on computers (where VRChat runs on PC)." : null);
    case "mpris":
      return web ?? (isLinux ? null : "Only on Linux (MPRIS).");
    case "discord":
      return web ?? (isMobile ? "Only on computers." : null);
    case "backgroundService":
    case "widget":
      return isAndroid && isTauri ? null : "Only in the Android app.";
  }
}

export const available = (f: Feature) => unavailable(f) === null;
