import { t as tr } from "./i18n";
import { backend } from "./backend";
import { makeDemo } from "./demo";
import { initLogs, stopLogScans } from "./logs";
import { serverSwitch, stopSharing, syncServer } from "./share";
import { knownPeers } from "./peers";
import { demoHere } from "./live";
import { defaultFilters, emptyCache, emptyLocal, flushSaves, getState, loadPersisted, setLogs, setState, updateLocal } from "./store";
import { stopSync, syncAll } from "./sync";

export function enterDemo() {
  stopSync();
  stopLogScans();
  const { cache, local, presence } = makeDemo();
  // A made-up instance so "who's here" can be tried out too.
  const ids = Object.keys(cache.friends);
  const names = Object.fromEntries(ids.map((id) => [id, cache.friends[id].displayName]));
  setState({ demo: true, mode: "app", cache, local, session: null, selectedId: null, loginMessage: "", filters: defaultFilters(), here: demoHere(ids, names) });
  setLogs({ stats: presence, report: { dirs: [], files_seen: 0, files_read: 0, files_stored: 6, visits: presence.visits, first: presence.first, last: presence.last, bytes: 0, newer_version: null, errors: [] } });
}

export async function exitDemo() {
  setState({ demo: false, selectedId: null, filters: defaultFilters() });
  setLogs({ stats: null, report: null });
  await loadPersisted();
  initLogs();
  const info = await backend.sessionInfo();
  setState({ mode: info.logged_in ? "app" : "login", session: info });
  if (info.logged_in) {
    syncAll();
    backend.pipelineStart().catch(() => {});
  }
}

/** Log out of VRChat. Keeps circles and imported lists; optionally wipes the friend cache. */
export async function logoutAll(wipeCache: boolean, message = "Logged out.") {
  stopSync();
  stopSharing();
  await flushSaves();
  // A paired logger uses this VRChat login: only forget it here, don't end it.
  const loggers = getState().settings.sharing.servers.filter((s) => s.loggerOwner);
  await backend.logout(loggers.length > 0);
  if (wipeCache) {
    setState({ cache: emptyCache() });
    await backend.storeWrite("cache", JSON.stringify(emptyCache()));
  }
  const note = loggers.length
    ? tr("sessionMsg.yourLoggerOnValueKeeps", { value: loggers.map((s) => s.info?.name ?? s.url).join(", ") })
    : "";
  setState({ mode: "login", session: null, selectedId: null, settingsOpen: false, serversOpen: false, loginMessage: message + note, live: { connected: false, message: "" } });
}

/** Servers that carry "log out everywhere" to your other devices (your own synced data). */
export function logoutCarriers() {
  return getState().settings.sharing.servers.filter((s) => s.registered && s.syncMine && serverSwitch(s).on);
}

/**
 * "Log out everywhere": logs out this device and every other device of yours that syncs with it
 * (through your servers, or directly at home). VRChat has no way to end sessions other apps or
 * the game hold (only changing your password on vrchat.com does that, as far as is known).
 */
export async function logoutEverywhere() {
  updateLocal((l) => ({ ...l, logoutAt: Date.now() }));
  const servers = logoutCarriers();
  // Through each server your devices sync on (the next sync of a device that's off brings it).
  await Promise.all(servers.map((s) => syncServer(s.id).catch(() => {})));
  // Devices met directly get your changes within 3 seconds.
  if (knownPeers().length) await new Promise((r) => setTimeout(r, 4000));
  await flushSaves();
  const where = servers.length || knownPeers().length ? tr("sessionMsg.yourOtherDevicesLogOut") : "";
  await logoutAll(false, "Logged out everywhere." + where);
}

export async function wipeEverything() {
  stopSync();
  stopSharing();
  await backend.logout();
  await backend.storeWrite("cache", JSON.stringify(emptyCache()));
  await backend.storeWrite("local", JSON.stringify(emptyLocal()));
  await backend.clearImageCache();
  await backend.logsClear().catch(() => {});
  await backend.storeWrite("observed", "{}").catch(() => {});
  await backend.storeWrite("shared", "{}").catch(() => {});
  setLogs({ stats: null, report: null });
  setState({ cache: emptyCache(), local: emptyLocal(), mode: "login", session: null, selectedId: null, settingsOpen: false, loginMessage: "All local data deleted.", live: { connected: false, message: "" } });
}
