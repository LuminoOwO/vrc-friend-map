// Global app state: a tiny external store + debounced persistence to disk.
import { useSyncExternalStore } from "react";
import { backend, type SessionInfo } from "./backend";
import { pickCircleColor } from "./colors";
import { uid } from "./model";
import type {
  Cache,
  Circle,
  Filters,
  GroupSettings,
  LocalData,
  LogScanReport,
  LogSettings,
  MapSettings,
  PresenceStats,
  Settings,
  SyncState,
} from "./types";

export type View = "graph" | "cards" | "lists";

export interface Toast {
  id: number;
  text: string;
  undo?: () => void;
}

export interface LogsState {
  /** linux / windows / macos / android / ios / browser */
  platform: string;
  detected: string[];
  scanning: boolean;
  report: LogScanReport | null;
  stats: PresenceStats | null;
  error: string;
  lastScan: number;
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
  /** A message that stays until dismissed (version changes, data from a newer version). */
  notice: string | null;
  settingsOpen: boolean;
  settingsTab: string;
  sidebarOpen: boolean;
  /** Live connection to VRChat's event stream. */
  live: { connected: boolean; message: string };
  logs: LogsState;
}

// ---------- data format versions ----------
// Each stored file carries a "schema" number. Loading is tolerant both ways:
// - older files are migrated (after a backup copy in store/backups);
// - files from a newer app version are used as far as this version
//   understands them, and fields it doesn't know are written back unchanged,
//   so going back to the newer version later loses nothing it stored.
export const SCHEMA = { cache: 1, local: 2, settings: 2 } as const;
type StoreName = keyof typeof SCHEMA;
const loadedSchema: Record<StoreName, number> = { cache: SCHEMA.cache, local: SCHEMA.local, settings: SCHEMA.settings };

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
  dismissedGroups: [],
});

export const defaultMap = (): MapSettings => ({
  nodeStyle: "icon",
  nodeScale: 1,
  sizeBy: "mutuals",
  lines: "shared",
  lineWidth: 1,
  lineOpacity: 1,
  focusLinesOnly: false,
  spacing: 1,
  groupPull: 1,
  hulls: true,
  hullOpacity: 1,
  showStars: true,
});

export const defaultLogSettings = (): LogSettings => ({
  enabled: true,
  autoDetect: true,
  dirs: [],
  scanMinutes: 5,
  retentionDays: 0,
});

export const defaultGroupSettings = (): GroupSettings => ({
  crowd: "strong",
  minMinutes: 30,
  minDays: 2,
  resolution: 1,
  minSize: 3,
  overlap: true,
  mutualBoost: true,
  sinceDays: 0,
  auto: false,
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
  map: defaultMap(),
  logs: defaultLogSettings(),
  groups: defaultGroupSettings(),
  lastVersion: "",
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

const idleLogs = (): LogsState => ({
  platform: "",
  detected: [],
  scanning: false,
  report: null,
  stats: null,
  error: "",
  lastScan: 0,
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
  notice: null,
  settingsOpen: false,
  settingsTab: "general",
  sidebarOpen: typeof window !== "undefined" ? window.innerWidth > 900 : true,
  live: { connected: false, message: "" },
  logs: idleLogs(),
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

function serialize(name: StoreName): string {
  const value = name === "cache" ? state.cache : name === "local" ? state.local : state.settings;
  return JSON.stringify({ ...value, schema: Math.max(SCHEMA[name], loadedSchema[name]) });
}

function scheduleSave(name: StoreName) {
  if (state.demo && name !== "settings") return;
  clearTimeout(timers[name]);
  timers[name] = setTimeout(() => {
    delete timers[name];
    backend.storeWrite(name, serialize(name)).catch((e) => console.error("save failed", name, e));
  }, 1200);
}

export async function flushSaves() {
  for (const name of ["cache", "local", "settings"] as const) {
    if (timers[name]) {
      clearTimeout(timers[name]);
      delete timers[name];
      if (state.demo && name !== "settings") continue;
      await backend.storeWrite(name, serialize(name));
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

export function updateMap(patch: Partial<MapSettings>) {
  updateSettings({ map: { ...state.settings.map, ...patch } });
}

export function updateLogSettings(patch: Partial<LogSettings>) {
  updateSettings({ logs: { ...state.settings.logs, ...patch } });
}

export function updateGroupSettings(patch: Partial<GroupSettings>) {
  updateSettings({ groups: { ...state.settings.groups, ...patch } });
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

export function setLogs(patch: Partial<LogsState>) {
  setState((s) => ({ logs: { ...s.logs, ...patch } }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

async function readRaw(name: StoreName): Promise<Raw | null> {
  try {
    const raw = await backend.storeRead(name);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    console.error("failed to read", name, e);
    // Unreadable file: keep a copy before it gets overwritten.
    await backend.storeBackup(name, `unreadable-${stamp()}`).catch(() => {});
    return null;
  }
}

function stamp(): string {
  return new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
}

const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, def: number, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
const oneOf = <T extends string>(v: unknown, opts: readonly T[], def: T): T => (opts.includes(v as T) ? (v as T) : def);

/** Fill in defaults and clamp values; unknown keys are kept as they are. */
export function normalizeSettings(raw: Raw | null): Settings {
  const d = defaultSettings();
  if (!raw) return d;
  const m = isObj(raw.map) ? raw.map : {};
  const l = isObj(raw.logs) ? raw.logs : {};
  const g = isObj(raw.groups) ? raw.groups : {};
  // 0.2.0 had a flat "lineColors" setting.
  const legacyLines = raw.lineColors === "plain" ? "plain" : raw.lineColors === "shared" ? "shared" : undefined;
  const out: Settings = {
    ...raw,
    contact: typeof raw.contact === "string" ? raw.contact : d.contact,
    intervalMs: num(raw.intervalMs, d.intervalMs, 1000, 10000),
    autoRefresh: typeof raw.autoRefresh === "boolean" ? raw.autoRefresh : d.autoRefresh,
    detailTtlDays: num(raw.detailTtlDays, d.detailTtlDays, 1, 60),
    mutualTtlDays: num(raw.mutualTtlDays, d.mutualTtlDays, 1, 60),
    ringMode: oneOf(raw.ringMode, ["status", "trust"] as const, d.ringMode),
    showLabels: oneOf(raw.showLabels, ["auto", "always", "never"] as const, d.showLabels),
    dimMode: oneOf(raw.dimMode, ["dim", "hide"] as const, d.dimMode),
    map: {
      ...m,
      nodeStyle: oneOf(m.nodeStyle, ["dot", "icon", "card", "fullcard"] as const, d.map.nodeStyle),
      nodeScale: num(m.nodeScale, d.map.nodeScale, 0.5, 2.5),
      sizeBy: oneOf(m.sizeBy, ["mutuals", "together", "same"] as const, d.map.sizeBy),
      lines: oneOf(m.lines ?? legacyLines, ["shared", "plain", "together", "none"] as const, d.map.lines),
      lineWidth: num(m.lineWidth, d.map.lineWidth, 0.3, 3),
      lineOpacity: num(m.lineOpacity, d.map.lineOpacity, 0.2, 3),
      focusLinesOnly: typeof m.focusLinesOnly === "boolean" ? m.focusLinesOnly : d.map.focusLinesOnly,
      spacing: num(m.spacing, d.map.spacing, 0.5, 2.5),
      groupPull: num(m.groupPull, d.map.groupPull, 0, 3),
      hulls: typeof m.hulls === "boolean" ? m.hulls : d.map.hulls,
      hullOpacity: num(m.hullOpacity, d.map.hullOpacity, 0.2, 3),
      showStars: typeof m.showStars === "boolean" ? m.showStars : d.map.showStars,
    },
    logs: {
      ...l,
      enabled: typeof l.enabled === "boolean" ? l.enabled : d.logs.enabled,
      autoDetect: typeof l.autoDetect === "boolean" ? l.autoDetect : d.logs.autoDetect,
      dirs: Array.isArray(l.dirs) ? l.dirs.filter((x: unknown) => typeof x === "string") : d.logs.dirs,
      scanMinutes: num(l.scanMinutes, d.logs.scanMinutes, 1, 120),
      retentionDays: num(l.retentionDays, d.logs.retentionDays, 0, 3650),
    },
    groups: {
      ...g,
      crowd: oneOf(g.crowd, ["strong", "mild", "off"] as const, d.groups.crowd),
      minMinutes: num(g.minMinutes, d.groups.minMinutes, 1, 600),
      minDays: num(g.minDays, d.groups.minDays, 1, 60),
      resolution: num(g.resolution, d.groups.resolution, 0.3, 3),
      minSize: num(g.minSize, d.groups.minSize, 2, 20),
      overlap: typeof g.overlap === "boolean" ? g.overlap : d.groups.overlap,
      mutualBoost: typeof g.mutualBoost === "boolean" ? g.mutualBoost : d.groups.mutualBoost,
      sinceDays: num(g.sinceDays, d.groups.sinceDays, 0, 3650),
      auto: typeof g.auto === "boolean" ? g.auto : d.groups.auto,
    },
    lastVersion: typeof raw.lastVersion === "string" ? raw.lastVersion : "",
  };
  delete (out as Raw).lineColors;
  delete (out as Raw).schema;
  return out;
}

export function normalizeLocal(raw: Raw | null): LocalData {
  const d = emptyLocal();
  if (!raw) return d;
  const out: LocalData = {
    ...raw,
    logSince: typeof raw.logSince === "number" ? raw.logSince : 0,
    lastFriendIds: Array.isArray(raw.lastFriendIds) ? raw.lastFriendIds : [],
    circles: Array.isArray(raw.circles)
      ? raw.circles
          .filter((c: Raw) => isObj(c) && typeof c.id === "string")
          .map((c: Raw): Circle => ({
            ...c,
            id: c.id,
            name: typeof c.name === "string" ? c.name : "Circle",
            color: typeof c.color === "string" ? c.color : "#2dd4bf",
            members: Array.isArray(c.members) ? c.members.filter((m: unknown) => typeof m === "string") : [],
          }))
      : [],
    imports: Array.isArray(raw.imports) ? raw.imports : [],
    friendLog: Array.isArray(raw.friendLog) ? raw.friendLog : [],
    dismissedGroups: Array.isArray(raw.dismissedGroups) ? raw.dismissedGroups.filter(Array.isArray) : [],
  };
  // 0.1.x kept per-friend "first seen" dates; only the change log needs them.
  const legacy = raw as { firstSeen?: Record<string, number>; trackingSince?: number };
  if (legacy.firstSeen && isObj(legacy.firstSeen)) {
    if (!out.lastFriendIds.length) out.lastFriendIds = Object.keys(legacy.firstSeen).filter((id) => legacy.firstSeen![id] > 0);
    if (!out.logSince) out.logSince = legacy.trackingSince ?? 0;
  }
  delete (out as Raw).firstSeen;
  delete (out as Raw).trackingSince;
  delete (out as Raw).schema;
  return out;
}

export function normalizeCache(raw: Raw | null): Cache {
  const d = emptyCache();
  if (!raw) return d;
  const obj = (v: unknown) => (isObj(v) ? v : {});
  const out: Cache = {
    ...raw,
    me: isObj(raw.me) ? (raw.me as Cache["me"]) : null,
    friends: obj(raw.friends),
    presence: obj(raw.presence),
    details: obj(raw.details),
    mutuals: obj(raw.mutuals),
    favorites: obj(raw.favorites),
    lastFriendsSync: typeof raw.lastFriendsSync === "number" ? raw.lastFriendsSync : 0,
  };
  delete (out as Raw).schema;
  return out;
}

/** Compare dotted versions numerically: -1, 0 or 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

const WHATS_NEW: Record<string, string> = {
  "0.3.0": "friend groups suggested from your game logs, map options (including full player cards), 24 circle colors and a color picker.",
};

export async function loadPersisted() {
  const [rawCache, rawLocal, rawSettings] = await Promise.all([readRaw("cache"), readRaw("local"), readRaw("settings")]);
  const notices: string[] = [];
  const raws: Record<StoreName, Raw | null> = { cache: rawCache, local: rawLocal, settings: rawSettings };
  for (const name of ["cache", "local", "settings"] as const) {
    const raw = raws[name];
    const schema = raw ? (typeof raw.schema === "number" ? raw.schema : 1) : SCHEMA[name];
    loadedSchema[name] = Math.max(schema, SCHEMA[name]);
    if (!raw || name === "cache") continue;
    if (schema > SCHEMA[name]) {
      await backend.storeBackup(name, `from-newer-v${schema}-${stamp()}`).catch(() => {});
      notices.push(name);
    } else if (schema < SCHEMA[name]) {
      await backend.storeBackup(name, `before-v${SCHEMA[name]}-${stamp()}`).catch(() => {});
    }
  }
  const cache = normalizeCache(rawCache);
  const local = normalizeLocal(rawLocal);
  const settings = normalizeSettings(rawSettings);

  const current = __APP_VERSION__;
  let notice: string | null = null;
  if (notices.length) {
    notice =
      `Your data was saved by a newer version of VRC Friend Map than this one (${current}). ` +
      `It's still used, and anything this version doesn't understand is kept as it is. A backup copy is in the data folder (store/backups).`;
  } else if (settings.lastVersion && settings.lastVersion !== current) {
    if (compareVersions(settings.lastVersion, current) < 0) {
      const news = WHATS_NEW[current];
      notice = `Updated from ${settings.lastVersion} to ${current}.${news ? ` New: ${news}` : ""}`;
    } else {
      notice = `You're running ${current}, an older version than last time (${settings.lastVersion}). Your data is kept; features from the newer version just won't show here.`;
    }
  }
  if (!settings.lastVersion || compareVersions(current, settings.lastVersion) > 0) settings.lastVersion = current;

  setState({ cache, local, settings, notice: notice ?? state.notice });
  scheduleSave("settings");
  if (rawLocal && (rawLocal.schema ?? 1) < SCHEMA.local) scheduleSave("local");
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

export function nextCircleColor(): string {
  return pickCircleColor(state.local.circles.map((c) => c.color));
}

export function createCircle(name: string, members: string[] = [], extra: Partial<Circle> = {}): string {
  const id = uid();
  const color = extra.color ?? nextCircleColor();
  updateLocal((l) => ({ ...l, circles: [...l.circles, { id, name: name.trim() || "New circle", color, members, ...extra }] }));
  return id;
}

/** Changes to a circle's name or members make an automatic circle yours. */
export function patchCircle(id: string, patch: Partial<Circle>) {
  const takeOver = "name" in patch || "members" in patch;
  updateLocal((l) => ({
    ...l,
    circles: l.circles.map((c) => (c.id === id ? { ...c, ...patch, ...(takeOver && c.auto && !("auto" in patch) ? { auto: false } : {}) } : c)),
  }));
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
