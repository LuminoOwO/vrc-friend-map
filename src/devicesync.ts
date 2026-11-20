// Syncing your own data between your devices, through your vfm-servers.
//
// What goes along: circles, dismissed group suggestions, what you tell
// friends about people, per-person notification rules, and (if you turn it
// on) settings that make sense on every device. Never: age notes and hints
// (they stay on each device), and per-device settings (frame rate, tray,
// wheel fix, graphics, notification volume and mute).
//
// The item is end-to-end encrypted for your own key only (see the "self"
// item kind), so the server can't read it.
//
// Merging is three-way against the last state both sides agreed on (the
// "base"), so edits on two devices combine instead of one overwriting the
// other: members added or removed on either side apply, a circle deleted on
// one device goes away unless the other changed it, and for single values
// (a circle's name, a setting) the side that changed it wins, the other
// device's change if both did.
import type { BlockReason, Circle, InviteTemplate, LocalData, NotifyPerson, Settings, ShareNote } from "./types";

export const SELF_FORMAT = "vrc-friend-map/self-v1";

/** Settings that follow you to other devices (when "Also sync settings" is on). */
export const SYNCED_SETTINGS = ["theme", "catAccent", "map", "groups", "age", "people", "closeAction", "bios", "notesLine", "insights", "ui"] as const;

/** Groups of settings you can sync or keep per device (Servers → Also sync settings). */
export const SETTING_GROUPS: { id: string; label: string; keys: (typeof SYNCED_SETTINGS)[number][] }[] = [
  { id: "look", label: "Look (theme, colors, interface)", keys: ["theme", "catAccent", "ui"] },
  { id: "map", label: "Map options", keys: ["map"] },
  { id: "groups", label: "Group detection", keys: ["groups"] },
  { id: "people", label: "People (age hints, bios, red flags, insights)", keys: ["age", "people", "bios", "notesLine", "insights"] },
  { id: "window", label: "Closing the window", keys: ["closeAction"] },
];

/** The settings keys that sync, given the chosen groups and this device's exceptions. */
export function syncedKeys(groups: string[], localOnly: string[]): (typeof SYNCED_SETTINGS)[number][] {
  const on = SETTING_GROUPS.filter((g) => (!groups.length || groups.includes(g.id)) && !localOnly.includes(g.id));
  return on.flatMap((g) => g.keys);
}
type SyncedSettings = Partial<Pick<Settings, (typeof SYNCED_SETTINGS)[number]>>;

export interface SelfData {
  circles: Circle[];
  dismissedGroups: string[][];
  shareNotes: Record<string, ShareNote>;
  notifyPeople: Record<string, NotifyPerson>;
  settings?: SyncedSettings;
  /** Since 0.12: stars (as a set), nicknames, time zones, block reasons, invite templates, shared circles. */
  starred?: string[];
  nicknames?: Record<string, string>;
  timezones?: NonNullable<LocalData["timezones"]>;
  blockReasons?: Record<string, BlockReason>;
  inviteTemplates?: Record<string, InviteTemplate>;
  sharedCircles?: NonNullable<LocalData["sharedCircles"]>;
  worldNotes?: NonNullable<LocalData["worldNotes"]>;
  pushTargets?: NonNullable<LocalData["pushTargets"]>;
  /** Since 0.12.2: when each settings group was last changed, so the newer change wins. */
  settingsAt?: Record<string, number>;
}

export interface SelfPayload extends SelfData {
  format: typeof SELF_FORMAT;
  t: number;
}

/** JSON with object keys sorted, so the same data always gives the same text. */
export function stableJson(v: unknown): string {
  return JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]])) : x,
  );
}

/**
 * Equal data, whatever order its keys are in. (Plain JSON.stringify depends on key order, and
 * a merged copy is built in a different order than this device's own: they looked different on
 * every sync, so devices kept "taking over" and re-sending the same data.)
 */
const same = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);

/** One value: whoever changed it since the base wins; if both did, `theirs`. */
function pick<T>(base: T | undefined, mine: T | undefined, theirs: T | undefined): T | undefined {
  if (same(mine, theirs)) return mine;
  if (same(mine, base)) return theirs;
  if (same(theirs, base)) return mine;
  return theirs;
}

/** A set: additions and removals from both sides apply. */
export function mergeSet(base: string[], mine: string[], theirs: string[]): string[] {
  const b = new Set(base);
  const m = new Set(mine);
  const t = new Set(theirs);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of [...mine, ...theirs]) {
    if (seen.has(x)) continue;
    seen.add(x);
    const inBoth = m.has(x) && t.has(x);
    const added = !b.has(x) && (m.has(x) || t.has(x));
    if (inBoth || added) out.push(x);
    // In the base and still on one side only: the other side removed it.
  }
  return out;
}

/** Keyed records (notes, rules): per key, the side that changed it wins; deletions count as changes. */
export function mergeRecord<T>(base: Record<string, T>, mine: Record<string, T>, theirs: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)])) {
    const v = pick(base[k], mine[k], theirs[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function mergeCircles(base: Circle[], mine: Circle[], theirs: Circle[]): Circle[] {
  const byId = (l: Circle[]) => new Map(l.map((c) => [c.id, c]));
  const b = byId(base);
  const m = byId(mine);
  const t = byId(theirs);
  const out: Circle[] = [];
  // Keep your order, then circles new from the other device.
  for (const id of [...new Set([...m.keys(), ...t.keys()])]) {
    const cb = b.get(id);
    const cm = m.get(id);
    const ct = t.get(id);
    if (!cm || !ct) {
      const there = cm ?? ct!;
      // Only on one side: new there, or deleted on the other side.
      if (!cb) out.push(there); // new
      else if (!same(there, cb)) out.push(there); // deleted on one side but changed on the other: keep the change
      continue;
    }
    out.push({
      id,
      name: pick(cb?.name, cm.name, ct.name) ?? cm.name,
      color: pick(cb?.color, cm.color, ct.color) ?? cm.color,
      members: mergeSet(cb?.members ?? [], cm.members, ct.members),
      ...(pick(cb?.hidden, cm.hidden, ct.hidden) ? { hidden: true } : {}),
      ...(pick(cb?.auto, cm.auto, ct.auto) ? { auto: true } : {}),
    });
  }
  return out;
}

function mergeGroups(base: string[][], mine: string[][], theirs: string[][]): string[][] {
  const key = (g: string[]) => [...g].sort().join(",");
  const keys = mergeSet(base.map(key), mine.map(key), theirs.map(key));
  const all = new Map([...mine, ...theirs].map((g) => [key(g), g]));
  return keys.map((k) => all.get(k)!).filter(Boolean);
}

/**
 * Settings: whoever changed a group since the base wins; if both did, or there's
 * no base yet (a device that just joined), the newer change (by `settingsAt`).
 * Without times (older apps) the other side wins, as before.
 */
function mergeSettings(
  base: SyncedSettings | undefined,
  mine: SyncedSettings | undefined,
  theirs: SyncedSettings | undefined,
  mineAt: Record<string, number> = {},
  theirsAt: Record<string, number> = {},
): SyncedSettings | undefined {
  if (!mine && !theirs) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of SYNCED_SETTINGS) {
    const b = base?.[k];
    const m = mine?.[k];
    const t = theirs?.[k];
    let v: unknown;
    if (same(m, t)) v = m;
    else if (b !== undefined && same(m, b)) v = t;
    else if (b !== undefined && same(t, b)) v = m;
    else v = (mineAt[k] ?? 0) > (theirsAt[k] ?? 0) ? m : t;
    if (v !== undefined) out[k] = v;
  }
  return out as SyncedSettings;
}

/** The newer time per key. */
function mergeTimes(a: Record<string, number> | undefined, b: Record<string, number> | undefined): Record<string, number> | undefined {
  if (!a && !b) return undefined;
  const out: Record<string, number> = { ...(a ?? {}) };
  for (const [k, t] of Object.entries(b ?? {})) if (typeof t === "number" && t > (out[k] ?? 0)) out[k] = t;
  return out;
}

/** The three-way merge of everything. With no base (first sync on this device), both sides count as new. */
export function mergeSelf(base: SelfData | null, mine: SelfData, theirs: SelfData): SelfData {
  const b: SelfData = base ?? { circles: [], dismissedGroups: [], shareNotes: {}, notifyPeople: {} };
  return {
    circles: mergeCircles(b.circles, mine.circles, theirs.circles),
    dismissedGroups: mergeGroups(b.dismissedGroups, mine.dismissedGroups, theirs.dismissedGroups),
    shareNotes: mergeRecord(b.shareNotes, mine.shareNotes, theirs.shareNotes),
    notifyPeople: mergeRecord(b.notifyPeople, mine.notifyPeople, theirs.notifyPeople),
    settings: mergeSettings(b.settings, mine.settings, theirs.settings, mine.settingsAt, theirs.settingsAt),
    settingsAt: mergeTimes(mine.settingsAt, theirs.settingsAt),
    // A device with an older app doesn't send these: then nothing changed there.
    starred: theirs.starred === undefined ? mine.starred : mergeSet(b.starred ?? [], mine.starred ?? [], theirs.starred),
    nicknames: theirs.nicknames === undefined ? mine.nicknames : mergeRecord(b.nicknames ?? {}, mine.nicknames ?? {}, theirs.nicknames),
    timezones: theirs.timezones === undefined ? mine.timezones : mergeRecord(b.timezones ?? {}, mine.timezones ?? {}, theirs.timezones),
    blockReasons: theirs.blockReasons === undefined ? mine.blockReasons : mergeRecord(b.blockReasons ?? {}, mine.blockReasons ?? {}, theirs.blockReasons),
    inviteTemplates: theirs.inviteTemplates === undefined ? mine.inviteTemplates : mergeRecord(b.inviteTemplates ?? {}, mine.inviteTemplates ?? {}, theirs.inviteTemplates),
    sharedCircles: theirs.sharedCircles === undefined ? mine.sharedCircles : mergeRecord(b.sharedCircles ?? {}, mine.sharedCircles ?? {}, theirs.sharedCircles),
    worldNotes: theirs.worldNotes === undefined ? mine.worldNotes : mergeRecord(b.worldNotes ?? {}, mine.worldNotes ?? {}, theirs.worldNotes),
    pushTargets: theirs.pushTargets === undefined ? mine.pushTargets : mergeRecord(b.pushTargets ?? {}, mine.pushTargets ?? {}, theirs.pushTargets),
  };
}

/**
 * Values each device keeps for itself even when settings sync: which interface it shows
 * (classic or new). They never go into the shared copy, so two devices with different choices
 * don't overwrite each other's copy on every sync.
 */
function withoutDeviceOnly(settings: SyncedSettings | undefined): SyncedSettings | undefined {
  if (!settings?.ui || typeof settings.ui !== "object") return settings;
  const { beta: _beta, ...ui } = settings.ui as Settings["ui"];
  return { ...settings, ui: ui as Settings["ui"] };
}

/**
 * This device's side for a merge. Settings it doesn't sync (syncing settings off, or a group
 * kept on this device) take the last agreed value, so this device counts as "didn't change
 * them" instead of "removed them" and passes the other devices' values along untouched.
 */
export function mineForMerge(mine: SelfData, base: SelfData | null, theirs: SelfData | null, keys: readonly string[]): SelfData {
  // Without an agreed base yet (first sync here), the other devices' copy is the reference.
  const ref = base?.settings ? base : theirs;
  const own = new Set(mine.settings ? keys : []);
  const settings: Record<string, unknown> = {};
  const at = { ...(mine.settingsAt ?? {}) };
  for (const k of SYNCED_SETTINGS) {
    if (own.has(k)) {
      if (mine.settings?.[k] !== undefined) settings[k] = mine.settings[k];
      continue;
    }
    // ...and their change times too: this device's own edits to them aren't shared.
    const v = ref?.settings?.[k];
    if (v !== undefined) settings[k] = v;
    const t = ref?.settingsAt?.[k];
    if (t === undefined) delete at[k];
    else at[k] = t;
  }
  return { ...mine, settings: mine.settings || ref?.settings ? (settings as SyncedSettings) : undefined, settingsAt: at };
}

export function sameSelf(a: SelfData, b: SelfData): boolean {
  return same(a, b);
}

/** Settings without the per-device parts. */
export function syncedSettings(s: Settings): SyncedSettings {
  const out: Record<string, unknown> = {};
  for (const k of syncedKeys(s.sharing.syncGroups ?? [], s.sharing.localOnly ?? [])) out[k] = s[k];
  return withoutDeviceOnly(JSON.parse(JSON.stringify(out)) as SyncedSettings)!;
}

/** A received payload, checked; null when it isn't one. */
export function readSelf(raw: unknown): SelfData | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<SelfPayload>;
  if (p.format !== SELF_FORMAT) return null;
  const circles = Array.isArray(p.circles)
    ? p.circles.filter(
        (c): c is Circle => !!c && typeof c.id === "string" && typeof c.name === "string" && typeof c.color === "string" && Array.isArray(c.members),
      )
    : [];
  const rec = <T>(v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, T>) : {});
  const notes = rec<ShareNote>(p.shareNotes);
  // Same rule as everywhere: only adult vouches and "keep your distance".
  for (const [k, n] of Object.entries(notes)) if (!n || !["adult", "likely-adult", "distance"].includes(n.v)) delete notes[k];
  return {
    circles: circles.map((c) => ({ ...c, members: c.members.filter((m) => typeof m === "string") })),
    dismissedGroups: Array.isArray(p.dismissedGroups) ? p.dismissedGroups.filter((g) => Array.isArray(g)) : [],
    shareNotes: notes,
    notifyPeople: rec<NotifyPerson>(p.notifyPeople),
    // Older apps still send device-only values; drop them like ours.
    settings: p.settings && typeof p.settings === "object" ? withoutDeviceOnly(p.settings) : undefined,
    settingsAt:
      p.settingsAt && typeof p.settingsAt === "object" ? Object.fromEntries(Object.entries(p.settingsAt).filter(([, t]) => typeof t === "number")) : undefined,
    starred: Array.isArray(p.starred) ? p.starred.filter((x) => typeof x === "string") : undefined,
    nicknames: p.nicknames ? rec<string>(p.nicknames) : undefined,
    timezones: p.timezones ? rec(p.timezones) : undefined,
    blockReasons: p.blockReasons ? rec<BlockReason>(p.blockReasons) : undefined,
    inviteTemplates: p.inviteTemplates ? rec<InviteTemplate>(p.inviteTemplates) : undefined,
    sharedCircles: p.sharedCircles ? rec(p.sharedCircles) : undefined,
    worldNotes: p.worldNotes ? rec(p.worldNotes) : undefined,
    pushTargets: p.pushTargets ? rec(p.pushTargets) : undefined,
  };
}
