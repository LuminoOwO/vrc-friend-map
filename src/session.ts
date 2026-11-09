import { backend } from "./backend";
import { makeDemo } from "./demo";
import { defaultFilters, emptyCache, emptyLocal, flushSaves, loadPersisted, setState } from "./store";
import { stopSync, syncAll } from "./sync";

export function enterDemo() {
  stopSync();
  const { cache, local } = makeDemo();
  setState({ demo: true, mode: "app", cache, local, session: null, selectedId: null, loginMessage: "", filters: defaultFilters() });
}

export async function exitDemo() {
  setState({ demo: false, selectedId: null, filters: defaultFilters() });
  await loadPersisted();
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
  setState({ cache: emptyCache(), local: emptyLocal(), mode: "login", session: null, selectedId: null, settingsOpen: false, loginMessage: "All local data deleted.", live: { connected: false, message: "" } });
}
