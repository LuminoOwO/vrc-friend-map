// Desktop tray glue: keeps the Rust side's close action and the tray's mute
// item in step with the settings, and handles the tray menu and the
// "close the window?" question.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isMobile, isTauri } from "./backend";
import { isMuted, muteFor, muteLabel } from "./notifications";
import { getState, setState, subscribeState } from "./store";

export const trayHere = isTauri && !isMobile;

/** Next morning at 8:00. */
function tomorrowMorning(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.getTime();
}

export function startTray() {
  if (!trayHere) return;
  let lastClose = "";
  let lastMute: string | null | undefined;
  const sync = () => {
    const s = getState().settings;
    if (s.closeAction !== lastClose) {
      lastClose = s.closeAction;
      invoke("tray_set_close_action", { action: s.closeAction }).catch(() => {});
    }
    const label = isMuted(s.notify) ? muteLabel(s.notify) : null;
    if (label !== lastMute) {
      lastMute = label;
      invoke("tray_set_muted", { label }).catch(() => {});
    }
  };
  sync();
  subscribeState(sync);
  setInterval(sync, 30_000); // a timed mute running out
  void listen<string>("tray-action", (e) => {
    const a = e.payload;
    if (a === "unmute") muteFor(0);
    else if (a === "mute:forever") muteFor("forever");
    else if (a === "mute:tomorrow") muteFor(tomorrowMorning() - Date.now());
    else if (a.startsWith("mute:")) muteFor(Number(a.slice(5)) * 60_000);
  });
  void listen("close-requested", () => setState({ closeAsk: true }));
}

export async function trayAvailable(): Promise<boolean> {
  return trayHere ? invoke<boolean>("tray_available").catch(() => false) : false;
}

export function hideToTray() {
  return invoke("window_hide");
}

export function quitApp() {
  return invoke("app_quit");
}
