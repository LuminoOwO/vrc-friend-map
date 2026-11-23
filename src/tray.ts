// Desktop tray glue: keeps the Rust side's close action and the tray's mute
// item in step with the settings, and handles the tray menu and the
// "close the window?" question.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { backend, isMobile, isTauri } from "./backend";
import { isMuted, muteFor, muteLabel } from "./notifications";
import { getState, setState, showToast, subscribeState } from "./store";
import { syncAll } from "./sync";
import { presenceOf } from "./model";

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
  let lastStart: boolean | undefined;
  let lastMute: string | null | undefined;
  const sync = () => {
    const s = getState().settings;
    if (s.closeAction !== lastClose) {
      lastClose = s.closeAction;
      invoke("tray_set_close_action", { action: s.closeAction }).catch(() => {});
    }
    if (s.startInTray !== lastStart) {
      lastStart = s.startInTray;
      invoke("tray_set_start_hidden", { on: s.startInTray }).catch(() => {});
    }
    const label = isMuted(s.notify) ? muteLabel(s.notify) : null;
    if (label !== lastMute) {
      lastMute = label;
      invoke("tray_set_muted", { label }).catch(() => {});
    }
  };
  let lastExtras = "";
  const extras = () => {
    const st = getState();
    if (st.mode !== "app") return;
    const fr = Object.values(st.cache.friends);
    const on = fr.filter((f) => presenceOf(f, st.cache.presence) === "online");
    const starred = new Set(st.local.starred ?? []);
    const people = on
      .filter((f) => starred.has(f.id))
      .map((f) => [f.id, st.local.nicknames?.[f.id] || f.displayName] as [string, string])
      .sort((a, b) => a[1].localeCompare(b[1]));
    const online = `${on.length} friend${on.length === 1 ? "" : "s"} in VRChat`;
    const key = online + JSON.stringify(people);
    if (key === lastExtras) return;
    lastExtras = key;
    invoke("tray_set_extras", { online, people }).catch(() => {});
  };
  let extrasTimer: ReturnType<typeof setTimeout> | undefined;
  const all = () => {
    sync();
    // The menu is rebuilt on change; a few seconds of calm first.
    clearTimeout(extrasTimer);
    extrasTimer = setTimeout(extras, 3000);
  };
  sync();
  subscribeState(all);
  setInterval(sync, 30_000); // a timed mute running out
  void listen<string>("tray-action", (e) => {
    const a = e.payload;
    if (a === "unmute") muteFor(0);
    else if (a === "sync") void syncAll();
    else if (a.startsWith("status:")) void setMyStatus(a.slice(7));
    else if (a.startsWith("person:")) setState({ selectedId: a.slice(7) });
    else if (a === "mute:forever") muteFor("forever");
    else if (a === "mute:tomorrow") muteFor(tomorrowMorning() - Date.now());
    else if (a.startsWith("mute:")) muteFor(Number(a.slice(5)) * 60_000);
  });
  void listen("close-requested", () => setState({ closeAsk: true }));
}

const STATUSES = ["join me", "active", "ask me", "busy"];

/** Tray → Your status. */
async function setMyStatus(status: string) {
  const st = getState();
  const me = st.cache.me;
  if (!me || st.demo || !STATUSES.includes(status)) return;
  const res = await backend.updateProfile(me.id, { status }, {}).catch((e) => String(e));
  if (typeof res === "string" || res.some((r) => r.status < 200 || r.status >= 300)) showToast("VRChat didn't take the status change");
  else {
    showToast("Status changed");
    void syncAll();
  }
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
