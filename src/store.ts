// Global app state: a tiny external store + debounced persistence to disk.
import { useSyncExternalStore } from "react";
import { backend, type KeyPin, type SessionInfo } from "./backend";
import { pickCircleColor } from "./colors";
import { uid } from "./model";
import { CAT_ACCENTS } from "./catppuccin";
import type {
  Cache,
  Circle,
  Filters,
  GroupSettings,
  LocalData,
  LogScanReport,
  LogSettings,
  MapSettings,
  PairTime,
  PresenceStats,
  LiveSnapshot,
  MetPerson,
  Settings,
  SharedData,
  SharingSettings,
  ShareServer,
  SoundSettings,
  NotifyEvent,
  NotifyPerson,
  NotifySettings,
  PeopleSelection,
  SyncState,
} from "./types";

export type View = "graph" | "cards" | "lists" | "activity";

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
  /** Activity log (src/activity.ts). */
  activity: import("./activity").ActivityEntry[];
  view: View;
  selectedId: string | null;
  hoverId: string | null;
  sync: SyncState;
  toast: Toast | null;
  /** A message that stays until dismissed (version changes, data from a newer version). */
  notice: string | null;
  settingsOpen: boolean;
  /** The close button was pressed and the app should ask what to do. */
  closeAsk: boolean;
  settingsTab: string;
  sidebarOpen: boolean;
  /** Live connection to VRChat's event stream. */
  live: { connected: boolean; message: string };
  logs: LogsState;
  /** Filters shown while pointing at a tile or legend entry (not applied yet). */
  previewFilters: Partial<Filters> | null;
  /** Friend-to-friend time from live locations (see together.ts). */
  observed: { pairs: PairTime[]; since: number } | null;
  /** Friends added in the last few seconds (id -> time), for the animation. */
  fresh: Record<string, number>;
  /** Received through vfm-servers (see share.ts). */
  shared: SharedData | null;
  serversOpen: boolean;
  /** Sync with servers in progress. */
  shareBusy: boolean;
  /** Server waiting for the "not encrypted" confirmation before uploading. */
  confirmUnencrypted: string | null;
  /** Fullscreen image viewer (components/ImageViewer). */
  viewer: { items: import("./components/ImageViewer").ViewerItem[]; index: number } | null;
  /** Friends' sharing keys as first seen (fingerprints), from share.rs. */
  keyPins: Record<string, KeyPin> | null;
  /** Who's in your instance right now (live game log). */
  here: LiveSnapshot | null;
  /** Non-friends from the game logs (for the potential-friends layer). */
  met: MetPerson[];
}

// ---------- data format versions ----------
// Each stored file carries a "schema" number. Loading is tolerant both ways:
// - older files are migrated (after a backup copy in store/backups);
// - files from a newer app version are used as far as this version
//   understands them, and fields it doesn't know are written back unchanged,
//   so going back to the newer version later loses nothing it stored.
export const SCHEMA = { cache: 1, local: 2, settings: 3 } as const;
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
  gravity: "circles",
  orbit: 2,
  hoverCard: true,
  orbitDir: 1,
  showShield: true,
  showFps: false,
  showMe: true,
  showOthers: "off",
  hereView: "list",
  herePlace: "sidebar",
});

export const defaultSounds = (): SoundSettings => ({ newFriend: true, sound: "chime", volume: 0.6 });
export const NOTIFY_EVENTS: NotifyEvent[] = ["added", "removed", "online", "offline", "joined", "left"];
const SOUNDS_REV = 2;
export const defaultNotify = (): NotifySettings => ({
  soundsRev: SOUNDS_REV,
  enabled: true,
  events: { added: true, removed: true, online: false, offline: false, joined: false, left: false },
  scope: "everyone",
  circleIds: [],
  people: {},
  sound: true,
  volume: 0.6,
  actionSounds: { added: "sparkle", removed: "heartbreak", online: "bell", offline: "soft-fall", joined: "chime", left: "door" },
  personTune: true,
  system: "background",
  muteUntil: 0,
});

export const defaultLogSettings = (): LogSettings => ({
  enabled: true,
  autoDetect: true,
  dirs: [],
  scanMinutes: 5,
  retentionDays: 0,
  live: true,
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
  useLogs: true,
  useLive: true,
});

export const defaultSharing = (): SharingSettings => ({
  exportPick: allPeople(),
  encDefault: "server",
  autoSync: true,
  intervalMin: 30,
  useShared: true,
  useLogger: true,
  servers: [],
});

export const allPeople = (): PeopleSelection => ({ who: "all", circleIds: [], picked: [], autoAdd: true });

function normalizePick(raw: unknown): PeopleSelection {
  const d = allPeople();
  if (!isObj(raw)) return d;
  const r = raw as Raw;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((c: unknown): c is string => typeof c === "string") : []);
  return { who: oneOf(r.who, ["all", "circles", "picked"] as const, "all"), circleIds: strs(r.circleIds), picked: strs(r.picked), autoAdd: typeof r.autoAdd === "boolean" ? r.autoAdd : true };
}

export const newServer = (url: string): ShareServer => ({
  id: uid(),
  url,
  addedAt: Date.now(),
  info: null,
  infoAt: 0,
  keyChanged: false,
  registered: false,
  upload: true,
  encrypt: null,
  shareFriends: true,
  shareActivity: true,
  audience: "all",
  circleIds: [],
  audiencePicked: [],
  audienceAutoAdd: true,
  include: allPeople(),
  shareRemovals: false,
  download: true,
  loggerOwner: false,
  ackUnencrypted: false,
  published: [],
  lastSync: 0,
  lastError: "",
  lastNote: "",
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
  sounds: defaultSounds(),
  notify: defaultNotify(),
  closeAction: "ask",
  wheelFix: false,
  theme: "dark",
  catAccent: "mauve",
  profileAs: "popup",
  sharing: defaultSharing(),
  people: { loadEveryone: false, keep: "potential", showBlocked: false },
  perf: { fps: 60, unfocusedFps: 30, idleAfter: 0, idleFps: 30, screenHz: 0, vsync: true },
  lastVersion: "",
});

export const defaultFilters = (): Filters => ({
  search: "",
  presence: "all",
  lastSeen: "any",
  trust: [],
  statuses: [],
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
  activity: [],
  selectedId: null,
  hoverId: null,
  sync: idleSync(),
  toast: null,
  notice: null,
  settingsOpen: false,
  closeAsk: false,
  settingsTab: "general",
  sidebarOpen: typeof window !== "undefined" ? window.innerWidth > 900 : true,
  live: { connected: false, message: "" },
  logs: idleLogs(),
  previewFilters: null,
  observed: null,
  fresh: {},
  shared: null,
  serversOpen: false,
  shareBusy: false,
  confirmUnencrypted: null,
  viewer: null,
  keyPins: null,
  here: null,
  met: [],
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
export const subscribeState = subscribe;

/** Select a slice of state. Selectors must return existing references or primitives. */
export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

// ---------- persistence ----------

const timers: Record<string, ReturnType<typeof setTimeout>> = {};

/** The cache as saved: profiles of non-friends only as Settings → People allows. */
export function cacheForDisk(c: Cache, keep: Settings["people"]["keep"], potential: (id: string) => boolean): Cache {
  if (keep === "everyone" || !c.others) return c;
  const others: NonNullable<Cache["others"]> = {};
  if (keep === "potential") for (const [id, p] of Object.entries(c.others)) if (potential(id)) others[id] = p;
  const mutuals = { ...c.mutuals };
  for (const id of Object.keys(c.others)) if (!others[id] && !c.friends[id]) delete mutuals[id];
  return { ...c, others, mutuals };
}

/** Someone who isn't a friend but could be: friends in common, or time spent together. */
function isPotential(id: string): boolean {
  const m = state.cache.mutuals[id];
  if (m && m.count > 0) return true;
  return !!state.met?.some((p) => p.id === id);
}

function serialize(name: StoreName): string {
  const value =
    name === "cache" ? cacheForDisk(state.cache, state.settings.people.keep, isPotential) : name === "local" ? state.local : state.settings;
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

function noLimit(v: number): number {
  return v >= 1000 ? -1 : v;
}

export function updatePerf(patch: Partial<Settings["perf"]>) {
  updateSettings({ perf: { ...state.settings.perf, ...patch } });
}

export function updatePeople(patch: Partial<Settings["people"]>) {
  updateSettings({ people: { ...state.settings.people, ...patch } });
  if ("keep" in patch) scheduleSave("cache"); // apply the new rule to what's on disk
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

export function updateNotify(patch: Partial<NotifySettings>) {
  updateSettings({ notify: { ...state.settings.notify, ...patch } });
}

function normalizeNotify(raw: unknown, oldSounds: Partial<SoundSettings> | undefined): NotifySettings {
  const d = defaultNotify();
  const n = (raw && typeof raw === "object" ? raw : {}) as Partial<NotifySettings>;
  const fresh = !raw || typeof raw !== "object";
  const events = { ...d.events };
  for (const e of NOTIFY_EVENTS) if (typeof n.events?.[e] === "boolean") events[e] = n.events[e];
  // From before 0.9.0: "Play a sound for new friends" and its sound.
  if (fresh && oldSounds && typeof oldSounds.newFriend === "boolean") events.added = oldSounds.newFriend;
  const actionSounds = { ...d.actionSounds };
  // 0.8's default was chime; only a sound someone picked themselves carries over.
  if (fresh && oldSounds?.sound && oldSounds.sound !== "chime") actionSounds.added = oldSounds.sound;
  for (const e of NOTIFY_EVENTS) if (typeof n.actionSounds?.[e] === "string") actionSounds[e] = n.actionSounds[e];
  // Settings from 0.9.0 test builds: move to the newer default sounds once.
  if (!fresh && (typeof n.soundsRev !== "number" || n.soundsRev < SOUNDS_REV)) {
    const was = { added: ["chime"], removed: ["fall"], online: ["rise"], joined: ["knock"] } as Partial<Record<NotifyEvent, string[]>>;
    for (const e of NOTIFY_EVENTS) if (was[e]?.includes(actionSounds[e])) actionSounds[e] = d.actionSounds[e];
  }
  // "Rise" was removed (too close to Bell).
  for (const e of NOTIFY_EVENTS) if (actionSounds[e] === "rise") actionSounds[e] = "bell";
  const people: Record<string, NotifyPerson> = {};
  for (const [id, p] of Object.entries(n.people ?? {})) {
    if (p && ["always", "once", "never"].includes((p as NotifyPerson).mode)) people[id] = { mode: (p as NotifyPerson).mode };
  }
  return {
    soundsRev: SOUNDS_REV,
    enabled: typeof n.enabled === "boolean" ? n.enabled : d.enabled,
    events,
    scope: oneOf(n.scope, ["everyone", "circles", "picked"] as const, d.scope),
    circleIds: Array.isArray(n.circleIds) ? n.circleIds.filter((x) => typeof x === "string") : [],
    people,
    sound: typeof n.sound === "boolean" ? n.sound : d.sound,
    volume: num(n.volume, fresh && typeof oldSounds?.volume === "number" ? oldSounds.volume : d.volume, 0, 1),
    actionSounds,
    personTune: typeof n.personTune === "boolean" ? n.personTune : d.personTune,
    system: oneOf(n.system, ["always", "background", "never"] as const, d.system),
    muteUntil: typeof n.muteUntil === "number" ? n.muteUntil : 0,
  };
}

export function updateSounds(patch: Partial<SoundSettings>) {
  updateSettings({ sounds: { ...state.settings.sounds, ...patch } });
}

export function updateSharing(patch: Partial<SharingSettings>) {
  updateSettings({ sharing: { ...state.settings.sharing, ...patch } });
}

export function updateServer(id: string, patch: Partial<ShareServer> | ((s: ShareServer) => Partial<ShareServer>)) {
  updateSharing({
    servers: state.settings.sharing.servers.map((s) => (s.id === id ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) } : s)),
  });
}

export function updateGroupSettings(patch: Partial<GroupSettings>) {
  updateSettings({ groups: { ...state.settings.groups, ...patch } });
}

export function updateFilters(patch: Partial<Filters>) {
  setState((s) => ({ filters: { ...s.filters, ...patch } }));
}

export function previewFilters(patch: Partial<Filters> | null) {
  setState({ previewFilters: patch });
}

/** Apply a filter change from a tile or legend click (and end the preview). */
export function applyFilterPatch(patch: Partial<Filters>) {
  setState((s) => ({ filters: { ...s.filters, ...patch }, previewFilters: null }));
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
  const snd = isObj(raw.sounds) ? raw.sounds : {};
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
      gravity: oneOf(m.gravity, ["mutuals", "loners", "center", "circles"] as const, d.map.gravity),
      orbit: num(m.orbit, d.map.orbit, 0, 3),
      hoverCard: typeof m.hoverCard === "boolean" ? m.hoverCard : d.map.hoverCard,
      orbitDir: m.orbitDir === -1 ? -1 : 1,
      showShield: typeof m.showShield === "boolean" ? m.showShield : d.map.showShield,
      showFps: typeof m.showFps === "boolean" ? m.showFps : d.map.showFps,
      showMe: typeof m.showMe === "boolean" ? m.showMe : d.map.showMe,
      showOthers: oneOf(m.showOthers, ["off", "here", "met", "all"] as const, d.map.showOthers),
      hereView: oneOf(m.hereView, ["list", "compact", "hidden"] as const, d.map.hereView),
      herePlace: oneOf(m.herePlace, ["sidebar", "map"] as const, d.map.herePlace),
    },
    notify: normalizeNotify(raw.notify, snd),
    closeAction: oneOf(raw.closeAction, ["ask", "tray", "quit"] as const, d.closeAction),
    wheelFix: typeof raw.wheelFix === "boolean" ? raw.wheelFix : d.wheelFix,
    sounds: {
      ...snd,
      newFriend: typeof snd.newFriend === "boolean" ? snd.newFriend : d.sounds.newFriend,
      sound: oneOf(snd.sound, ["chime", "sparkle", "pop", "bell"] as const, d.sounds.sound),
      volume: num(snd.volume, d.sounds.volume, 0, 1),
    },
    logs: {
      ...l,
      enabled: typeof l.enabled === "boolean" ? l.enabled : d.logs.enabled,
      autoDetect: typeof l.autoDetect === "boolean" ? l.autoDetect : d.logs.autoDetect,
      dirs: Array.isArray(l.dirs) ? l.dirs.filter((x: unknown) => typeof x === "string") : d.logs.dirs,
      scanMinutes: num(l.scanMinutes, d.logs.scanMinutes, 1, 120),
      retentionDays: num(l.retentionDays, d.logs.retentionDays, 0, 3650),
      live: typeof l.live === "boolean" ? l.live : d.logs.live,
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
      useLogs: typeof g.useLogs === "boolean" ? g.useLogs : d.groups.useLogs,
      useLive: typeof g.useLive === "boolean" ? g.useLive : d.groups.useLive,
    },
    theme: oneOf(raw.theme, ["dark", "oled", "light", "mocha", "macchiato", "frappe", "latte", "nord", "dracula"] as const, d.theme),
    catAccent: oneOf(raw.catAccent, CAT_ACCENTS, d.catAccent),
    profileAs: oneOf(raw.profileAs, ["popup", "sidebar"] as const, d.profileAs),
    perf: {
      fps: Math.round(num(raw.perf?.fps, d.perf.fps, -1, 1000)),
      // (0.9.0 betas stored "no change" as 1000)
      unfocusedFps: noLimit(Math.round(num(raw.perf?.unfocusedFps, d.perf.unfocusedFps, -1, 1000))),
      idleAfter: Math.round(num(raw.perf?.idleAfter, d.perf.idleAfter, 0, 86400)),
      idleFps: noLimit(Math.round(num(raw.perf?.idleFps, d.perf.idleFps, -1, 1000))),
      screenHz: Math.round(num(raw.perf?.screenHz, 0, 0, 1000)),
      vsync: typeof raw.perf?.vsync === "boolean" ? raw.perf.vsync : d.perf.vsync,
    },
    people: {
      loadEveryone: typeof raw.people?.loadEveryone === "boolean" ? raw.people.loadEveryone : d.people.loadEveryone,
      keep: oneOf(raw.people?.keep, ["none", "potential", "everyone"] as const, d.people.keep),
      showBlocked: typeof raw.people?.showBlocked === "boolean" ? raw.people.showBlocked : d.people.showBlocked,
    },
    sharing: normalizeSharing(raw.sharing),
    lastVersion: typeof raw.lastVersion === "string" ? raw.lastVersion : "",
  };
  // Format 2 (0.4.0) defaulted to no turning and ring gravity; 0.5.0 changed
  // the defaults. Only switch people who still had those defaults.
  if ((typeof raw.schema === "number" ? raw.schema : 1) < 3 && out.map.gravity === "mutuals" && out.map.orbit === 0) {
    out.map.gravity = d.map.gravity;
    out.map.orbit = d.map.orbit;
  }
  delete (out as Raw).lineColors;
  delete (out as Raw).schema;
  return out;
}

function normalizeSharing(raw: unknown): SharingSettings {
  const d = defaultSharing();
  if (!isObj(raw)) return d;
  const r = raw as Raw;
  const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
  const servers: ShareServer[] = Array.isArray(r.servers)
    ? r.servers
        .filter((x: Raw) => isObj(x) && typeof x.id === "string" && typeof x.url === "string")
        .map((x: Raw): ShareServer => {
          const n = newServer(x.url);
          return {
            ...n,
            ...x,
            info: isObj(x.info) ? (x.info as unknown as ShareServer["info"]) : null,
            encrypt: typeof x.encrypt === "boolean" ? x.encrypt : null,
            audience: oneOf(x.audience, ["all", "circles", "picked"] as const, "all"),
            circleIds: Array.isArray(x.circleIds) ? x.circleIds.filter((c: unknown) => typeof c === "string") : [],
            audiencePicked: Array.isArray(x.audiencePicked) ? x.audiencePicked.filter((c: unknown) => typeof c === "string") : [],
            audienceAutoAdd: bool(x.audienceAutoAdd, true),
            include: normalizePick(x.include),
            shareRemovals: bool(x.shareRemovals, false),
            published: Array.isArray(x.published) ? x.published.filter((c: unknown) => typeof c === "string") : [],
            upload: bool(x.upload, n.upload),
            download: bool(x.download, n.download),
            shareFriends: bool(x.shareFriends, n.shareFriends),
            shareActivity: bool(x.shareActivity, n.shareActivity),
            registered: bool(x.registered, false),
            loggerOwner: bool(x.loggerOwner, false),
            ackUnencrypted: bool(x.ackUnencrypted, false),
            keyChanged: bool(x.keyChanged, false),
          };
        })
    : [];
  return {
    ...r,
    exportPick: normalizePick(r.exportPick),
    encDefault: oneOf(r.encDefault, ["server", "on", "off"] as const, d.encDefault),
    autoSync: bool(r.autoSync, d.autoSync),
    intervalMin: num(r.intervalMin, d.intervalMin, 10, 24 * 60),
    useShared: bool(r.useShared, d.useShared),
    useLogger: bool(r.useLogger, d.useLogger),
    servers,
  };
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
  "0.9.0": "notifications with sounds (each friend gets their own little tune) when friends come online, join your world, add or remove you, for everyone or only people you pick (also just once, when you're waiting for someone); a tray icon so the app keeps running with the window closed; an Activity tab; hand-picked people for sharing; unfriend / block / mute on profiles; Linux on Chromium; a frame-rate limit with power saving.",
  "0.8.0": "you're on the map now (between your closest friends), a strip shows who's in your VRChat instance right now, and Map options → Not friends yet shows people you could befriend, with a friend-request button on their profile.",
  "0.7.4": "Settings → Graphics lets you choose GPU or software rendering for the map (Linux and Windows), if it's slow or the window stays blank.",
  "0.7.0": "share friend lists and activity with friends through your own or a friend's server (end-to-end encrypted), and run vfm-server on a spare device to log your friends' instance hopping 24/7 for better circle suggestions. Settings → Servers.",
  "0.6.0": "groups also learned from where your friends hang out together (even without you), profiles like on vrchat.com with the current world and who's there, clickable overview tiles and legend as filters, and more of the card flies into the profile.",
  "0.5.0": "color themes (light, OLED, Catppuccin, Nord, Dracula), profiles open as a popup, the hover card sits right on the person's picture, the map turns slowly by default and circles (and loners) each get their own spot.",
  "0.4.0": "profiles laid out like VRChat's, the full player card when you point at someone, layout gravity options and a slow orbit animation, a sound and animation when someone becomes your friend, and a faster map.",
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
