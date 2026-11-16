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
}

export interface SelfPayload extends SelfData {
  format: typeof SELF_FORMAT;
  t: number;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

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

function mergeSettings(base: SyncedSettings | undefined, mine: SyncedSettings | undefined, theirs: SyncedSettings | undefined): SyncedSettings | undefined {
  if (!mine && !theirs) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of SYNCED_SETTINGS) {
    const v = pick(base?.[k], mine?.[k], theirs?.[k]);
    if (v !== undefined) out[k] = v;
  }
  return out as SyncedSettings;
}

/** The three-way merge of everything. With no base (first sync on this device), both sides count as new. */
export function mergeSelf(base: SelfData | null, mine: SelfData, theirs: SelfData): SelfData {
  const b: SelfData = base ?? { circles: [], dismissedGroups: [], shareNotes: {}, notifyPeople: {} };
  return {
    circles: mergeCircles(b.circles, mine.circles, theirs.circles),
    dismissedGroups: mergeGroups(b.dismissedGroups, mine.dismissedGroups, theirs.dismissedGroups),
    shareNotes: mergeRecord(b.shareNotes, mine.shareNotes, theirs.shareNotes),
    notifyPeople: mergeRecord(b.notifyPeople, mine.notifyPeople, theirs.notifyPeople),
    settings: mergeSettings(b.settings, mine.settings, theirs.settings),
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

export function sameSelf(a: SelfData, b: SelfData): boolean {
  return same(a, b);
}

/** Settings without the per-device parts. */
export function syncedSettings(s: Settings): SyncedSettings {
  const out: Record<string, unknown> = {};
  for (const k of syncedKeys(s.sharing.syncGroups ?? [], s.sharing.localOnly ?? [])) out[k] = s[k];
  return JSON.parse(JSON.stringify(out)) as SyncedSettings;
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
    settings: p.settings && typeof p.settings === "object" ? p.settings : undefined,
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
