// Global app state: a tiny external store + debounced persistence to disk.
import { useSyncExternalStore } from "react";
import { backend, type SessionInfo } from "./backend";
import { CIRCLE_COLORS, uid } from "./model";
import type { Cache, Circle, Filters, LocalData, Settings, SyncState } from "./types";

export type View = "graph" | "cards" | "lists";

export interface Toast {
  id: number;
  text: string;
  undo?: () => void;
}

export interface AppState {
  mode: "loading" | "login" | "app";
  demo: boolean;
  session: SessionInfo | null;
  loginMessage: string;
  loginBusy: boolean;
  cache: Cache;
  local: LocalData;
  settings: Settings;
  filters: Filters;
  view: View;
  selectedId: string | null;
  hoverId: string | null;
  sync: SyncState;
  toast: Toast | null;
  settingsOpen: boolean;
  sidebarOpen: boolean;
  /** Live connection to VRChat's event stream. */
  live: { connected: boolean; message: string };
}

export const emptyCache = (): Cache => ({
  me: null,
  friends: {},
  presence: {},
  details: {},
  mutuals: {},
  favorites: {},
  lastFriendsSync: 0,
});

export const emptyLocal = (): LocalData => ({
  logSince: 0,
  lastFriendIds: [],
  circles: [],
  imports: [],
  friendLog: [],
});

export const defaultSettings = (): Settings => ({
  contact: "",
  intervalMs: 1200,
  autoRefresh: true,
  detailTtlDays: 7,
  mutualTtlDays: 7,
  ringMode: "status",
  showLabels: "auto",
  dimMode: "dim",
  lineColors: "shared",
});

export const defaultFilters = (): Filters => ({
  search: "",
  presence: "all",
  lastSeen: "any",
  trust: [],
  platform: [],
  circleId: null,
  favoritesOnly: false,
  listId: null,
});

const idleSync = (): SyncState => ({
  running: false,
  phase: "",
  done: 0,
  total: 0,
  message: "",
  backoffUntil: 0,
  error: "",
  paused: false,
});

let state: AppState = {
  mode: "loading",
  demo: false,
  session: null,
  loginMessage: "",
  loginBusy: false,
  cache: emptyCache(),
  local: emptyLocal(),
  settings: defaultSettings(),
  filters: defaultFilters(),
  view: "graph",
  selectedId: null,
  hoverId: null,
  sync: idleSync(),
  toast: null,
  settingsOpen: false,
  sidebarOpen: typeof window !== "undefined" ? window.innerWidth > 900 : true,
  live: { connected: false, message: "" },
};

const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Select a slice of state. Selectors must return existing references or primitives. */
export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

// ---------- persistence ----------

const timers: Record<string, ReturnType<typeof setTimeout>> = {};

function scheduleSave(name: "cache" | "local" | "settings") {
  if (state.demo && name !== "settings") return;
  clearTimeout(timers[name]);
  timers[name] = setTimeout(() => {
    const value = name === "cache" ? state.cache : name === "local" ? state.local : state.settings;
    backend.storeWrite(name, JSON.stringify(value)).catch((e) => console.error("save failed", name, e));
  }, 1200);
}

export async function flushSaves() {
  for (const name of ["cache", "local", "settings"] as const) {
    if (timers[name]) {
      clearTimeout(timers[name]);
      delete timers[name];
      if (state.demo && name !== "settings") continue;
      const value = name === "cache" ? state.cache : name === "local" ? state.local : state.settings;
      await backend.storeWrite(name, JSON.stringify(value));
    }
  }
}

export function updateCache(fn: (c: Cache) => Cache) {
  setState((s) => ({ cache: fn(s.cache) }));
  scheduleSave("cache");
}

export function updateLocal(fn: (l: LocalData) => LocalData) {
  setState((s) => ({ local: fn(s.local) }));
  scheduleSave("local");
}

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => ({ settings: { ...s.settings, ...patch } }));
  scheduleSave("settings");
  const st = state.settings;
  if ("contact" in patch || "intervalMs" in patch) backend.setApiSettings(st.contact, st.intervalMs).catch(() => {});
}

export function updateFilters(patch: Partial<Filters>) {
  setState((s) => ({ filters: { ...s.filters, ...patch } }));
}

export function setSync(patch: Partial<SyncState>) {
  setState((s) => ({ sync: { ...s.sync, ...patch } }));
}

export function resetSync() {
  setState({ sync: idleSync() });
}

async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = await backend.storeRead(name);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) } as T;
  } catch (e) {
    console.error("failed to read", name, e);
    return fallback;
  }
}

export async function loadPersisted() {
  const [cache, local, settings] = await Promise.all([
    readJson("cache", emptyCache()),
    readJson("local", emptyLocal()),
    readJson("settings", defaultSettings()),
  ]);
  // Older versions kept per-friend "first seen" dates; keep only what the change log needs.
  const legacy = local as LocalData & { firstSeen?: Record<string, number>; trackingSince?: number };
  if (legacy.firstSeen) {
    if (!local.lastFriendIds.length) local.lastFriendIds = Object.keys(legacy.firstSeen).filter((id) => legacy.firstSeen![id] > 0);
    if (!local.logSince) local.logSince = legacy.trackingSince ?? 0;
    delete legacy.firstSeen;
    delete legacy.trackingSince;
  }
  setState({ cache, local, settings });
  await backend.setApiSettings(settings.contact, settings.intervalMs).catch(() => {});
}

// ---------- toasts ----------

let toastSeq = 0;
export function showToast(text: string, undo?: () => void) {
  const id = ++toastSeq;
  setState({ toast: { id, text, undo } });
  setTimeout(() => {
    if (state.toast?.id === id) setState({ toast: null });
  }, undo ? 6000 : 3500);
}

// ---------- circles ----------

export function createCircle(name: string, members: string[] = []): string {
  const id = uid();
  const color = CIRCLE_COLORS[state.local.circles.length % CIRCLE_COLORS.length];
  updateLocal((l) => ({ ...l, circles: [...l.circles, { id, name: name.trim() || "New circle", color, members }] }));
  return id;
}

export function patchCircle(id: string, patch: Partial<Circle>) {
  updateLocal((l) => ({ ...l, circles: l.circles.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
}

export function deleteCircle(id: string) {
  const prev = state.local.circles;
  const circle = prev.find((c) => c.id === id);
  updateLocal((l) => ({ ...l, circles: l.circles.filter((c) => c.id !== id) }));
  if (state.filters.circleId === id) updateFilters({ circleId: null });
  if (circle) showToast(`Deleted circle "${circle.name}"`, () => updateLocal((l) => ({ ...l, circles: prev })));
}

export function addToCircle(circleId: string, userId: string, quiet = false) {
  const circle = state.local.circles.find((c) => c.id === circleId);
  if (!circle || circle.members.includes(userId)) return;
  patchCircle(circleId, { members: [...circle.members, userId] });
  if (!quiet) {
    const name = state.cache.friends[userId]?.displayName ?? "Friend";
    showToast(`Added ${name} to ${circle.name}`, () => removeFromCircle(circleId, userId, true));
  }
}

export function removeFromCircle(circleId: string, userId: string, quiet = false) {
  const circle = state.local.circles.find((c) => c.id === circleId);
  if (!circle) return;
  patchCircle(circleId, { members: circle.members.filter((m) => m !== userId) });
  if (!quiet) {
    const name = state.cache.friends[userId]?.displayName ?? "Friend";
    showToast(`Removed ${name} from ${circle.name}`, () => addToCircle(circleId, userId, true));
  }
}
