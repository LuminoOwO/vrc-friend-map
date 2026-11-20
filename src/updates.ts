// Update check (GitHub's latest release) and installing from inside the app.
// The Rust side (src-tauri/src/updater.rs) picks the right file for how this
// copy was installed, checks it against the release's SHA256SUMS and installs.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isTauri } from "./backend";
import { getState, setState, showToast, updateSettings } from "./store";

export type InstallKind =
  | "windows-setup"
  | "windows-msi"
  | "windows-portable"
  | "mac"
  | "app-image"
  | "deb"
  | "rpm"
  | "tarball"
  | "flatpak"
  | "android"
  | "ios"
  | "unknown";

export interface UpdateInfo {
  current: string;
  latest: string;
  newer: boolean;
  notes: string;
  page: string;
  kind: InstallKind;
  asset: { name: string; url: string; size: number } | null;
  sums: string | null;
  can_install: boolean;
}

export const KIND_LABEL: Record<InstallKind, string> = {
  "windows-setup": "Windows installer",
  "windows-msi": "Windows (MSI)",
  "windows-portable": "Windows portable",
  mac: "Mac app",
  "app-image": "AppImage",
  deb: ".deb package",
  rpm: ".rpm package",
  tarball: "tarball install",
  flatpak: "Flatpak",
  android: "Android",
  ios: "iPhone / iPad",
  unknown: "this install",
};

/** a is newer than b ("0.10.1" > "0.10.0"). */
export { newerVersion } from "./compat";

/** How often to look for a new version: often, since new versions come quickly right now. */
const EVERY = 6 * 3600_000;
let lastCheck = 0;

export async function checkForUpdate(manual = false): Promise<UpdateInfo | null> {
  if (!isTauri) {
    if (manual) showToast("Update checks work in the app, not in the browser demo.");
    return null;
  }
  try {
    const info = await invoke<UpdateInfo>("update_check");
    lastCheck = Date.now();
    if (info.newer && (manual || info.latest !== getState().settings.updates.skipped)) setState({ update: info });
    else if (manual) showToast(info.newer ? `Version ${info.latest} is available (you skipped it).` : `You have the newest version (${info.current}).`);
    return info;
  } catch (e) {
    if (manual) showToast(`Couldn't check for updates: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Check a bit after start and then every 6 hours, if allowed (on by default). */
export function startUpdateChecks() {
  if (!isTauri) return;
  const tick = () => {
    const s = getState();
    if (!s.settings.updates.check || s.demo) return;
    if (Date.now() - lastCheck > EVERY) void checkForUpdate(false);
  };
  setTimeout(tick, 30_000);
  setInterval(tick, 60 * 60_000);
}

export function skipVersion(v: string) {
  updateSettings({ updates: { ...getState().settings.updates, skipped: v } });
  setState({ update: null });
}

export function onUpdateProgress(f: (done: number, total: number) => void): () => void {
  if (!isTauri) return () => {};
  let un: (() => void) | null = null;
  void listen<{ done: number; total: number }>("update-progress", (e) => f(e.payload.done, e.payload.total)).then((u) => (un = u));
  return () => un?.();
}

/** Download, check and install. Resolves with a message when the app keeps running (Flatpak: the command). */
export async function installUpdate(info: UpdateInfo): Promise<string> {
  if (!info.asset || !info.sums) throw new Error("no file for this install in the release");
  return invoke<string>("update_install", { assetUrl: info.asset.url, assetName: info.asset.name, sumsUrl: info.sums });
}

/** The changelog part of the release notes (they start with a "which file" table). */
export function notesSummary(notes: string): string {
  const at = notes.search(/^### /m);
  return (at >= 0 ? notes.slice(at) : notes).trim().slice(0, 8000);
}
