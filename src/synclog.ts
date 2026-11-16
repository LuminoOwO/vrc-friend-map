// Sync log: what each sync did and, when something failed, exactly why
// (HTTP status, the server's message). Kept in memory and in localStorage
// (the last 200 entries), shown from the sync status in the top bar.
//
// A sync cut off because the app went to the background (phones suspend the
// web view, requests then fail with network errors) is "interrupted", not
// "failed": it's retried quietly when the app is visible again.
import { useSyncExternalStore } from "react";

export type SyncResult = "ok" | "failed" | "interrupted" | "info";

export interface SyncLogEntry {
  t: number;
  /** "VRChat", a server's name, "Your devices", "Bios"… */
  area: string;
  step: string;
  result: SyncResult;
  detail: string;
  status?: number;
}

const KEY = "vfm.synclog";
const MAX = 200;
let entries: SyncLogEntry[] = load();
const listeners = new Set<() => void>();

function load(): SyncLogEntry[] {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.slice(-MAX) : [];
  } catch {
    return [];
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(entries));
    } catch {
      // storage full or unavailable: the log is only a help
    }
  }, 500);
}

export function logSync(e: Omit<SyncLogEntry, "t"> & { t?: number }) {
  const entry: SyncLogEntry = { ...e, t: e.t ?? Date.now() };
  // Collapse repeats of the same thing (e.g. a server failing every sync).
  const last = entries[entries.length - 1];
  if (last && last.area === entry.area && last.step === entry.step && last.result === entry.result && last.detail === entry.detail) {
    entries = [...entries.slice(0, -1), { ...last, t: entry.t }];
  } else {
    entries = [...entries, entry].slice(-MAX);
  }
  save();
  listeners.forEach((l) => l());
}

export function clearSyncLog() {
  entries = [];
  save();
  listeners.forEach((l) => l());
}

export function syncLogEntries(): SyncLogEntry[] {
  return entries;
}

export function useSyncLog(): SyncLogEntry[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => entries,
  );
}

// ---------- background detection ----------

let hiddenAt = 0;
let visibleAt = Date.now();
const onVisible = new Set<() => void>();

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else {
      visibleAt = Date.now();
      const run = [...onVisible];
      onVisible.clear();
      run.forEach((f) => f());
    }
  });
}

/** Was the app in the background when (or shortly before) this failed? */
export function wasInterrupted(at = Date.now()): boolean {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return true;
  // Failures that show up just after coming back are from requests the
  // system cut while the app was away.
  return hiddenAt > 0 && hiddenAt <= at && at - visibleAt < 8000 && visibleAt > hiddenAt;
}

/** Run once the app is visible again (immediately if it is). */
export function whenVisible(f: () => void) {
  if (typeof document === "undefined" || document.visibilityState === "visible") f();
  else onVisible.add(f);
}

/** Turn an error into a readable line, keeping HTTP status codes. */
export function describeError(e: unknown): { detail: string; status?: number } {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
  const m = msg.match(/\b([45]\d\d)\b/);
  const status = m ? Number(m[1]) : undefined;
  return { detail: withReason(msg, status), status };
}

const REASONS: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized (login needed)",
  403: "Forbidden",
  404: "Not Found",
  408: "Request Timeout",
  409: "Conflict",
  413: "Too Large",
  429: "Too Many Requests (slowing down)",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

export function withReason(msg: string, status?: number): string {
  if (!status || !REASONS[status] || msg.includes(REASONS[status].split(" (")[0])) return msg;
  return `${msg} (${status} ${REASONS[status]})`;
}

export function httpLine(path: string, status: number): string {
  return `${path}: ${status} ${REASONS[status] ?? ""}`.trim();
}

export function isNetworkError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return /network|failed to fetch|connection|timed out|timeout|dns|reset|aborted|unreachable|error sending request/.test(msg);
}
