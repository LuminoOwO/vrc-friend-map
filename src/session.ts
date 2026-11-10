import { backend } from "./backend";
import { makeDemo } from "./demo";
import { initLogs, stopLogScans } from "./logs";
import { defaultFilters, emptyCache, emptyLocal, flushSaves, loadPersisted, setLogs, setState } from "./store";
import { stopSync, syncAll } from "./sync";

export function enterDemo() {
  stopSync();
  stopLogScans();
  const { cache, local, presence } = makeDemo();
  setState({ demo: true, mode: "app", cache, local, session: null, selectedId: null, loginMessage: "", filters: defaultFilters() });
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
export async function logoutAll(wipeCache: boolean) {
  stopSync();
  await flushSaves();
  await backend.logout();
  if (wipeCache) {
    setState({ cache: emptyCache() });
    await backend.storeWrite("cache", JSON.stringify(emptyCache()));
  }
  setState({ mode: "login", session: null, selectedId: null, settingsOpen: false, loginMessage: "Logged out.", live: { connected: false, message: "" } });
}

export async function wipeEverything() {
  stopSync();
  await backend.logout();
  await backend.storeWrite("cache", JSON.stringify(emptyCache()));
  await backend.storeWrite("local", JSON.stringify(emptyLocal()));
  await backend.clearImageCache();
  await backend.logsClear().catch(() => {});
  await backend.storeWrite("observed", "{}").catch(() => {});
  setLogs({ stats: null, report: null });
  setState({ cache: emptyCache(), local: emptyLocal(), mode: "login", session: null, selectedId: null, settingsOpen: false, loginMessage: "All local data deleted.", live: { connected: false, message: "" } });
}
