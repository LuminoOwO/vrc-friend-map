// Which features work where. Settings uses this to hide (or grey out, with
// the reason) what can't work on this device; see Settings → Appearance →
// "Hide features not available on this platform".
import { t as tr } from "./i18n";
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
  const web = !isTauri ? tr("platformMsg.notInTheBrowserVersion") : null;
  switch (f) {
    case "tray":
    case "closeWindow":
      return web ?? (isMobile ? tr("platformMsg.onlyOnComputers") : null);
    case "wheelFix":
      return web ?? (isLinux ? null : tr("platformMsg.onlyNeededOnLinuxX11"));
    case "gameLogs":
      return web ?? (isIOS ? tr("platformMsg.iphonesCanTReadVrchat") : null);
    case "haptics":
      return isMobile ? null : tr("platformMsg.onlyOnPhones");
    case "installUpdates":
      return web ?? (isIOS ? tr("platformMsg.iphoneAppsUpdateByInstalling") : null);
    case "silentSystemNotify":
      return web ?? (isLinux ? null : tr("platformMsg.onlyOnLinux"));
    case "vrOverlay":
    case "steam":
    case "launchGame":
      return web ?? (isMobile ? tr("platformMsg.onlyOnComputersWhereVrchat") : null);
    case "mpris":
      return web ?? (isLinux ? null : tr("platformMsg.onlyOnLinuxMpris"));
    case "discord":
      return web ?? (isMobile ? tr("platformMsg.onlyOnComputers") : null);
    case "backgroundService":
    case "widget":
      return isAndroid && isTauri ? null : tr("platformMsg.onlyInTheAndroidApp");
  }
}

export const available = (f: Feature) => unavailable(f) === null;
