// Global app state: a tiny external store + debounced persistence to disk.
import { t as tr } from "./i18n";
import { useSyncExternalStore } from "react";
import { NO_OWN_COLORS, normalizeOwnColors } from "./owncolors";
import { ACCOUNT_SHARE_KEYS } from "./devicesync";
import { backend, type KeyPin, type SessionInfo } from "./backend";
import { pickCircleColor } from "./colors";
import { uid } from "./model";
import { CAT_ACCENTS } from "./catppuccin";
import type {
  Cache,
  Circle,
  ExtrasSettings,
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
  UiSettings,
} from "./types";

export type View = "graph" | "cards" | "lists" | "activity" | "insights" | "logbook" | "vrchat";

/** An in-app pop-up (top left): a notification, or "why did you block …?". */
export interface Popup {
  id: number;
  kind: NotifyEvent | "blockAsk";
  /** A person, or a world for "slotOpen". */
  userId: string;
  text: string;
  t: number;
}

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
  /** In-app pop-ups, newest last (src/inbox.ts). */
  popups: Popup[];
  /** A message that stays until dismissed (version changes, data from a newer version). */
  notice: string | null;
  settingsOpen: boolean;
  /** The close button was pressed and the app should ask what to do. */
  closeAsk: boolean;
  /** A newer version to offer (the update dialog), or null. */
  update: import("./updates").UpdateInfo | null;
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
  /** People you just blocked, waiting for you to pick reasons (block reasons dialog). */
  blockAsk: string[];
  /** People shown at full strength on the map (everyone else dimmed), e.g. a friend group pointed at. */
  spotlight: string[] | null;
  /** Set while a spotlit group is kept (shown on the map with a way to turn it off). */
  spotlightLabel: string | null;
  /** Computers: a temporary page in the side panel instead of its usual sections. */
  sidePanel: "groups" | null;
  /** Whether the block reasons dialog is showing (the first of blockAsk), or waiting in the notification center. */
  blockAskShown: boolean;
  /** Insights view: two people picked for "path" / "compare". */
  pickPair: [string | null, string | null];
  /** Map time travel: show the map as it was at this time (ms), or null for now. */
  timeTravel: number | null;
  /** Detail dialogs for VRChat content (instance location, group id, world id). */
  openInstance: string | null;
  openGroup: string | null;
  openWorld: string | null;
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
  ageNotes: {},
  shareNotes: {},
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
export const NOTIFY_EVENTS: NotifyEvent[] = ["added", "removed", "online", "offline", "joined", "left", "anniversary", "gathering", "slotOpen", "friendRequest", "invite", "requestInvite"];
const SOUNDS_REV = 2;
export const defaultNotify = (): NotifySettings => ({
  soundsRev: SOUNDS_REV,
  enabled: true,
  events: { added: true, removed: true, online: false, offline: false, joined: false, left: false, anniversary: true, gathering: true, slotOpen: true, friendRequest: true, invite: true, requestInvite: true },
  scope: "everyone",
  circleIds: [],
  people: {},
  sound: true,
  volume: 0.6,
  pause: 0.25,
  actionSounds: { added: "sparkle", removed: "heartbreak", online: "bell", offline: "soft-fall", joined: "chime", left: "door", anniversary: "fanfare", gathering: "marimba", slotOpen: "coin", friendRequest: "sparkle", invite: "doorbell", requestInvite: "knock" },
  personTune: true,
  system: "background",
  popupSeconds: 30,
  blockAskPopup: false,
  muteUntil: 0,
  quiet: { enabled: false, from: "23:00", to: "08:00", days: [0, 1, 2, 3, 4, 5, 6], allowStarred: true, allowCircleIds: [] },
  circleRules: {},
  personSounds: {},
  gathering: { min: 3, who: "both", circleIds: [] },
});

export const defaultLogSettings = (): LogSettings => ({
  enabled: true,
  autoDetect: true,
  dirs: [],
  scanMinutes: 5,
  retentionDays: 0,
  live: true,
  pictureDirs: [],
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
  syncSettings: false,
  intervalMin: 30,
  useShared: true,
  useLogger: true,
  syncGroups: [],
  localOnly: [],
  neverUnencrypted: false,
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
  shareBlocks: false,
  shareTimezone: false,
  syncMine: true,
  shareNotes: true,
  download: true,
  loggerOwner: false,
  ackUnencrypted: false,
  published: [],
  lastSync: 0,
  lastError: "",
  failedSyncs: 0,
  lastNote: "",
});

export const defaultUi = (): UiSettings => ({
  hideUnavailable: true,
  haptics: false,
  beta: false,
  textScale: 1,
  reducedMotion: "system",
  colorblind: false,
  language: "system",
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
  startInTray: false,
  wheelFix: false,
  age: { enabled: true, readLinks: false, warnRequests: true, linkDepth: 1, maxPages: 10, socials: true, fxTwitter: false },
  updates: { check: true, skipped: "" },
  theme: "dark",
  catAccent: "mauve",
  ownColors: { ...NO_OWN_COLORS },
  profileAs: "popup",
  sharing: defaultSharing(),
  people: { loadEveryone: false, keep: "potential", showBlocked: false },
  perf: { fps: 60, unfocusedFps: 30, idleAfter: 0, idleFps: 30, screenHz: 0, vsync: true },
  lastVersion: "",
  ui: defaultUi(),
  bios: { background: true, everySecs: 45 },
  notesLine: { mode: "off", compact: true },
  insights: { drifting: false },
  phone: { background: "off", refreshRate: 0, widget: true, rootLogs: false },
  accounts: { actAs: false, list: [] },
  extras: {
    nowPlaying: { status: false, template: "🎵 {title}" },
    playtime: { bio: false, template: "⏱ {hours} h in VRChat" },
  },
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
  favoriteGroup: null,
  who: "all",
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
  popups: [],
  notice: null,
  settingsOpen: false,
  closeAsk: false,
  update: null,
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
  blockAsk: [],
  blockAskShown: false,
  spotlight: null,
  spotlightLabel: null,
  sidePanel: null,
  pickPair: [null, null],
  timeTravel: null,
  openInstance: null,
  openGroup: null,
  openWorld: null,
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

export function updateUi(patch: Partial<UiSettings>) {
  updateSettings({ ui: { ...getState().settings.ui, ...patch } });
}

/**
 * `times`: when these settings were changed (device sync passes the other
 * device's times); left out, now. Device sync uses them so the newer change wins.
 */
export function updateSettings(patch: Partial<Settings>, times?: Record<string, number>) {
  const before = state.settings;
  setState((s) => ({ settings: { ...s.settings, ...patch } }));
  const now = Date.now();
  const stamps: Record<string, number> = {};
  for (const k of Object.keys(patch) as (keyof Settings)[]) {
    if (times?.[k] !== undefined) stamps[k] = times[k];
    else if (!times && JSON.stringify(patch[k]) !== JSON.stringify(before[k])) stamps[k] = now;
  }
  if (Object.keys(stamps).length) updateLocal((l) => ({ ...l, settingsAt: { ...(l.settingsAt ?? {}), ...stamps } }));
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
    pause: num(n.pause, d.pause, 0, 2),
    actionSounds,
    personTune: typeof n.personTune === "boolean" ? n.personTune : d.personTune,
    system: oneOf(n.system, ["always", "background", "never"] as const, d.system),
    popupSeconds: Math.round(num(n.popupSeconds, d.popupSeconds, 0, 600)),
    blockAskPopup: typeof n.blockAskPopup === "boolean" ? n.blockAskPopup : d.blockAskPopup,
    muteUntil: typeof n.muteUntil === "number" ? n.muteUntil : 0,
    quiet: shaped(n.quiet, d.quiet, (q) => ({
      ...q,
      from: /^\d\d:\d\d$/.test(q.from) ? q.from : d.quiet.from,
      to: /^\d\d:\d\d$/.test(q.to) ? q.to : d.quiet.to,
      days: q.days.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6),
    })),
    circleRules: Object.fromEntries(
      Object.entries(isObj(n.circleRules) ? n.circleRules : {}).map(([k, v]) => [k, Array.isArray(v) ? v.filter((e) => NOTIFY_EVENTS.includes(e as NotifyEvent)) : []]),
    ) as Record<string, NotifyEvent[]>,
    personSounds: Object.fromEntries(Object.entries(isObj(n.personSounds) ? n.personSounds : {}).filter(([, v]) => typeof v === "string" && v)) as Record<string, string>,
    gathering: shaped(n.gathering, d.gathering, (g) => ({ ...g, min: Math.round(num(g.min, 3, 2, 20)), who: oneOf(g.who, ["starred", "circles", "both"] as const, "both") })),
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
    servers: state.settings.sharing.servers.map((s) => {
      if (s.id !== id) return s;
      const p = typeof patch === "function" ? patch(s) : patch;
      // Your own change to the sharing choices (not one taken over from another device): stamp
      // it, so it wins over older choices on your other devices.
      const mine = !("shareAt" in p) && ACCOUNT_SHARE_KEYS.some((k) => k in p && JSON.stringify(p[k]) !== JSON.stringify(s[k]));
      return { ...s, ...p, ...(mine ? { shareAt: Date.now() } : {}) };
    }),
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

/** Settings groups added from 0.12 on: take what's stored where its type
 *  matches the default (recursively), defaults for the rest. Enums and ranges
 *  are checked by `fix` when given. Unknown keys are kept. */
export function shaped<T>(raw: unknown, def: T, fix?: (v: T) => T): T {
  const walk = (r: unknown, d: unknown): unknown => {
    if (isObj(d)) {
      const src = isObj(r) ? r : {};
      const out: Raw = { ...src };
      for (const k of Object.keys(d)) out[k] = walk(src[k], (d as Raw)[k]);
      return out;
    }
    if (Array.isArray(d)) return Array.isArray(r) ? r : d;
    if (typeof d === "number") return typeof r === "number" && Number.isFinite(r) ? r : d;
    return typeof r === typeof d ? r : d;
  };
  const v = walk(raw, def) as T;
  return fix ? fix(v) : v;
}

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
    startInTray: raw.startInTray === true,
    wheelFix: typeof raw.wheelFix === "boolean" ? raw.wheelFix : d.wheelFix,
    updates: {
      check: typeof raw.updates?.check === "boolean" ? raw.updates.check : d.updates.check,
      skipped: typeof raw.updates?.skipped === "string" ? raw.updates.skipped : "",
    },
    age: {
      enabled: typeof raw.age?.enabled === "boolean" ? raw.age.enabled : d.age.enabled,
      readLinks: typeof raw.age?.readLinks === "boolean" ? raw.age.readLinks : d.age.readLinks,
      warnRequests: typeof raw.age?.warnRequests === "boolean" ? raw.age.warnRequests : d.age.warnRequests,
      linkDepth: Math.round(num(raw.age?.linkDepth, d.age.linkDepth, 0, 3)),
      maxPages: Math.round(num(raw.age?.maxPages, d.age.maxPages, 1, 30)),
      socials: typeof raw.age?.socials === "boolean" ? raw.age.socials : d.age.socials,
      fxTwitter: typeof raw.age?.fxTwitter === "boolean" ? raw.age.fxTwitter : d.age.fxTwitter,
    },
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
      pictureDirs: Array.isArray(l.pictureDirs) ? l.pictureDirs.filter((x: unknown) => typeof x === "string") : [],
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
    theme: oneOf(raw.theme, ["dark", "oled", "light", "mocha", "macchiato", "frappe", "latte", "nord", "dracula", "graphite", "tokyonight", "gruvbox", "rosepine", "onedark", "everforest", "solarized", "solarizedlight"] as const, d.theme),
    catAccent: oneOf(raw.catAccent, CAT_ACCENTS, d.catAccent),
    ownColors: normalizeOwnColors(raw.ownColors),
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
    insights: shaped(raw.insights, d.insights),
    accounts: {
      actAs: typeof raw.accounts?.actAs === "boolean" ? raw.accounts.actAs : false,
      list: Array.isArray(raw.accounts?.list)
        ? raw.accounts.list
            .filter((a: any) => a && typeof a.id === "string" && a.id.startsWith("usr_"))
            .map((a: any) => ({ id: a.id, name: String(a.name ?? ""), show: a.show !== false, live: a.live === true, notify: a.notify === true }))
        : [],
    },
    // The OSC chatbox settings were taken out (0.13.0); drop them from older saves.
    extras: shaped(raw.extras, d.extras, ({ osc: _osc, ...x }: ExtrasSettings & { osc?: unknown }) => x),
    phone: shaped(raw.phone, d.phone, (p) => ({ ...p, background: oneOf(p.background, ["off", "visible", "quiet", "push"] as const, "off") })),
    notesLine: shaped(raw.notesLine, d.notesLine, (n) => ({ ...n, mode: oneOf(n.mode, ["off", "mine", "friends", "full"] as const, "off") })),
    bios: shaped(raw.bios, d.bios, (b) => ({ ...b, everySecs: num(b.everySecs, 45, 10, 3600) })),
    ui: shaped(raw.ui, d.ui, (u) => ({
      ...u,
      textScale: num(u.textScale, 1, 0.8, 1.6),
      reducedMotion: oneOf(u.reducedMotion, ["system", "on", "off"] as const, "system"),
      language: typeof u.language === "string" && /^(system|[a-z]{2,3}(-[A-Za-z]{2,4})?)$/.test(u.language) ? u.language : "system",
    })),
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
            shareBlocks: bool(x.shareBlocks, false),
            shareTimezone: bool(x.shareTimezone, false),
            syncMine: bool(x.syncMine, true),
            shareNotes: bool(x.shareNotes, true),
            published: Array.isArray(x.published) ? x.published.filter((c: unknown) => typeof c === "string") : [],
            upload: bool(x.upload, n.upload),
            download: bool(x.download, n.download),
            shareFriends: bool(x.shareFriends, n.shareFriends),
            shareActivity: bool(x.shareActivity, n.shareActivity),
            registered: bool(x.registered, false),
            loggerOwner: bool(x.loggerOwner, false),
            ackUnencrypted: bool(x.ackUnencrypted, false),
            keyChanged: bool(x.keyChanged, false),
            useCache: bool(x.useCache, true),
            hideAudience: bool(x.hideAudience, false),
          };
        })
    : [];
  return {
    ...r,
    exportPick: normalizePick(r.exportPick),
    encDefault: oneOf(r.encDefault, ["server", "on", "off"] as const, d.encDefault),
    autoSync: bool(r.autoSync, d.autoSync),
    syncSettings: bool(r.syncSettings, d.syncSettings),
    intervalMin: num(r.intervalMin, d.intervalMin, 10, 24 * 60),
    useShared: bool(r.useShared, d.useShared),
    useLogger: bool(r.useLogger, d.useLogger),
    syncGroups: Array.isArray(r.syncGroups) ? r.syncGroups.filter((x: unknown) => typeof x === "string") : [],
    localOnly: Array.isArray(r.localOnly) ? r.localOnly.filter((x: unknown) => typeof x === "string") : [],
    neverUnencrypted: bool(r.neverUnencrypted, false),
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
    ageNotes: (isObj(raw.ageNotes) ? raw.ageNotes : {}) as LocalData["ageNotes"],
    shareNotes: (isObj(raw.shareNotes) ? raw.shareNotes : {}) as LocalData["shareNotes"],
    dismissedGroups: Array.isArray(raw.dismissedGroups) ? raw.dismissedGroups.filter(Array.isArray) : [],
    selfBase: isObj(raw.selfBase) ? (raw.selfBase as LocalData["selfBase"]) : null,
    betaHintSeen: raw.betaHintSeen === true,
    newUiSwitched: raw.newUiSwitched === true,
    settingsAt: isObj(raw.settingsAt) ? Object.fromEntries(Object.entries(raw.settingsAt as Record<string, unknown>).filter(([, t]) => typeof t === "number")) as Record<string, number> : {},
    starred: Array.isArray(raw.starred) ? raw.starred.filter((x: unknown) => typeof x === "string") : [],
    nicknames: isObj(raw.nicknames) ? Object.fromEntries(Object.entries(raw.nicknames).filter(([, v]) => typeof v === "string" && v)) as Record<string, string> : {},
    snoozed: isObj(raw.snoozed) ? Object.fromEntries(Object.entries(raw.snoozed).filter(([, v]) => typeof v === "number" && v > Date.now())) as Record<string, number> : {},
    timezones: (isObj(raw.timezones) ? raw.timezones : {}) as LocalData["timezones"],
    inviteTemplates: Array.isArray(raw.inviteTemplates) ? raw.inviteTemplates.filter((t: Raw) => isObj(t) && typeof t.text === "string") : [],
    blockReasons: (isObj(raw.blockReasons) ? raw.blockReasons : {}) as LocalData["blockReasons"],
    slotWatch: (isObj(raw.slotWatch) ? raw.slotWatch : {}) as LocalData["slotWatch"],
    sharedCircles: (isObj(raw.sharedCircles) ? raw.sharedCircles : {}) as LocalData["sharedCircles"],
    worldNotes: (isObj(raw.worldNotes) ? raw.worldNotes : {}) as LocalData["worldNotes"],
    deviceId: typeof raw.deviceId === "string" && raw.deviceId ? raw.deviceId : Math.random().toString(36).slice(2, 12),
    push: isObj(raw.push) && typeof raw.push.key === "string" ? (raw.push as LocalData["push"]) : undefined,
    pushTargets: (isObj(raw.pushTargets) ? raw.pushTargets : {}) as LocalData["pushTargets"],
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
    ageHints: obj(raw.ageHints) as Cache["ageHints"],
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
  "0.13.0": "the new interface for everyone (classic stays in Settings), a phone layout in the same look with Party and Menu tabs and full-screen profiles, a darker Dark theme, a smoother map and loading placeholders.",
  "0.12.4": "switching between the classic and the beta UI works again (each device keeps its own choice), and the Linux fixes for focus, the mouse wheel and dropdowns.",
  "0.12.3": "Linux: the app no longer takes the keyboard focus back from other windows, the mouse wheel works where it didn't, and dropdown lists open inside the app in its own look.",
  "0.12.2": "much less CPU on Linux (also in the tray), the map no longer shifts every few seconds, synced settings don't snap back, Android 17 reaches a server at home, an easier time zone picker, and in the beta UI Sharing & servers on one page.",
  "0.12.1": "uploading stickers works again (the in-game effect is for emojis only).",
  "0.12.0": "an Insights tab, a Logbook of your game logs (day by day, rankings, pictures, video links, year in review), a VRChat tab (groups, favorites, avatars, prints and emojis), your other VRChat accounts on the same map, stars, nicknames and local times on profiles, quiet hours, your devices syncing with each other live, chatbox over OSC, now playing in your status, encrypted backups, and an opt-in new beta UI.",
  "0.11.0": "updates from inside the app (one click, checked against the release), your circles and notes synced between your devices through your server (encrypted for you only), and a filter for friends of friends you're not friends with yet.",
  "0.10.0": "profiles show bios and links again (VRChat moved them), age hints with notes only you see, edit your own profile, a red flag when a friend removed someone, who's here in the sidebar, Catppuccin with any accent, notifications with sounds (each friend gets their own little tune) when friends come online, join your world, add or remove you, for everyone or only people you pick (also just once, when you're waiting for someone); a tray icon so the app keeps running with the window closed; an Activity tab; hand-picked people for sharing; unfriend / block / mute on profiles.",
  "0.9.0": "Linux runs on Chromium now (smooth on big windows), a new Activity tab with who joined and left and friends coming online, unfriend / block / mute buttons on profiles, a frame-rate limit with power saving, Settings → Diagnostics, and choices for which non-friends' profiles to load and keep.",
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
  // A new install (nothing saved yet) starts in the new UI; updates keep whatever was in use.
  if (!rawSettings) settings.ui = { ...settings.ui, beta: true };

  const current = __APP_VERSION__;
  let notice: string | null = null;
  if (notices.length) {
    notice =
      `Your data was saved by a newer version of VRC Friend Map than this one (${current}). ` +
      `It's still used, and anything this version doesn't understand is kept as it is. A backup copy is in the data folder (store/backups).`;
  } else if (settings.lastVersion && settings.lastVersion !== current) {
    if (compareVersions(settings.lastVersion, current) < 0) {
      const news = WHATS_NEW[current];
      notice = tr("storeMsg.updatedFrom", { from: settings.lastVersion, to: current }) + (news ? tr("storeMsg.newNews", { news }) : "");
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
    // A circle shared with friends: your edit is the newest version now.
    sharedCircles: l.sharedCircles?.[id] && (takeOver || "color" in patch) ? { ...l.sharedCircles, [id]: { ...l.sharedCircles[id], t: Date.now() } } : l.sharedCircles,
  }));
}

export function deleteCircle(id: string) {
  const prev = state.local.circles;
  const circle = prev.find((c) => c.id === id);
  updateLocal((l) => ({ ...l, circles: l.circles.filter((c) => c.id !== id) }));
  if (state.filters.circleId === id) updateFilters({ circleId: null });
  if (circle) showToast(tr("storeMsg.deletedCircleName", { name: circle.name }), () => updateLocal((l) => ({ ...l, circles: prev })));
}

export function addToCircle(circleId: string, userId: string, quiet = false) {
  const circle = state.local.circles.find((c) => c.id === circleId);
  if (!circle || circle.members.includes(userId)) return;
  patchCircle(circleId, { members: [...circle.members, userId] });
  if (!quiet) {
    const name = state.cache.friends[userId]?.displayName ?? "Friend";
    showToast(tr("storeMsg.addedNameToName2", { name, name2: circle.name }), () => removeFromCircle(circleId, userId, true));
  }
}

export function removeFromCircle(circleId: string, userId: string, quiet = false) {
  const circle = state.local.circles.find((c) => c.id === circleId);
  if (!circle) return;
  patchCircle(circleId, { members: circle.members.filter((m) => m !== userId) });
  if (!quiet) {
    const name = state.cache.friends[userId]?.displayName ?? "Friend";
    showToast(tr("storeMsg.removedNameFromName2", { name, name2: circle.name }), () => addToCircle(circleId, userId, true));
  }
}
