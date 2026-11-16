// Your own things about people: stars, nicknames, snoozes, time zones, block
// reasons and watched instances. Stars, nicknames and time zones sync between
// your devices (device sync); block reasons are shared with friends only as
// presets and only when you turn that on per server (like friend removals).
import { history, onlineShare } from "./history";
import { getState, showToast, updateLocal } from "./store";
import { guessTimezones, type TzCandidate } from "./tz";
import type { BlockReason } from "./types";

// ---------- stars and nicknames ----------

export function toggleStar(id: string) {
  updateLocal((l) => {
    const cur = l.starred ?? [];
    return { ...l, starred: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
  });
}

export function setNickname(id: string, name: string) {
  updateLocal((l) => {
    const nicknames = { ...(l.nicknames ?? {}) };
    const n = name.trim().slice(0, 40);
    if (n) nicknames[id] = n;
    else delete nicknames[id];
    return { ...l, nicknames };
  });
}

/** The name to show: your nickname if you gave one, else their display name. */
export function shownName(id: string, fallback = ""): string {
  const s = getState();
  return s.local.nicknames?.[id] || s.cache.friends[id]?.displayName || s.cache.others?.[id]?.displayName || fallback;
}

// ---------- snooze ----------

export function snooze(id: string, until: number | null) {
  updateLocal((l) => {
    const snoozed = { ...(l.snoozed ?? {}) };
    if (until && until > Date.now()) snoozed[id] = until;
    else delete snoozed[id];
    return { ...l, snoozed };
  });
}

/** "for an hour", "until tomorrow 8:00" → ms. */
export function snoozeUntil(kind: "1h" | "3h" | "tomorrow" | "week", now = new Date()): number {
  if (kind === "1h") return now.getTime() + 36e5;
  if (kind === "3h") return now.getTime() + 3 * 36e5;
  if (kind === "week") return now.getTime() + 7 * 864e5;
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0, 0);
  return t.getTime();
}

// ---------- time zones ----------

export interface PersonTz {
  /** The zone to show, or null when there's nothing to go on. */
  tz: string | null;
  how: "set" | "confirmed" | "shared" | "suggested" | "none";
  candidates: TzCandidate[];
  /** For shared ones: who shared it. */
  by?: string;
}

/** Their shared time zone (from what they share through a server), if any. */
function sharedTz(id: string): string | null {
  const lists = getState().local.imports;
  const own = lists.find((l) => l.owner.id === id && typeof (l as { tz?: string }).tz === "string");
  return own ? ((own as { tz?: string }).tz ?? null) : null;
}

export function timezoneOf(id: string): PersonTz {
  const s = getState();
  const set = s.local.timezones?.[id];
  const candidates = suggestTimezones(id);
  if (set) return { tz: set.tz, how: set.how, candidates };
  const shared = sharedTz(id);
  if (shared) return { tz: shared, how: "shared", candidates };
  if (candidates.length) return { tz: candidates[0].tz, how: "suggested", candidates };
  return { tz: null, how: "none", candidates };
}

const tzCache = new Map<string, { key: string; out: TzCandidate[] }>();

export function suggestTimezones(id: string): TzCandidate[] {
  const s = getState();
  const d = s.cache.details[id];
  const f = s.cache.friends[id] ?? s.cache.others?.[id];
  const reads = s.cache.linkReads?.[id]?.reads ?? [];
  const groups = s.cache.groups?.[id]?.list?.map((g) => g.name) ?? [];
  const hours = onlineShare(history().seen[id]);
  const key = JSON.stringify([d?.bio, d?.pronouns, f?.statusDescription, d?.languages, groups, reads.map((r) => r.text.length), hours?.slice(0, 3)]);
  const hit = tzCache.get(id);
  if (hit && hit.key === key) return hit.out;
  const out = guessTimezones({
    texts: [
      { source: "bio", text: d?.bio ?? "" },
      { source: "status", text: f?.statusDescription ?? "" },
      { source: "pronouns", text: d?.pronouns ?? "", weight: 0.5 },
      ...reads.filter((r) => r.status === "read").map((r) => ({ source: r.site, text: r.text, weight: 0.8 })),
    ],
    languages: d?.languages,
    groups,
    hours,
  });
  tzCache.set(id, { key, out });
  return out;
}

export function setTimezone(id: string, tz: string | null, how: "set" | "confirmed" = "set") {
  updateLocal((l) => {
    const timezones = { ...(l.timezones ?? {}) };
    if (tz) timezones[id] = { tz, t: Date.now(), how };
    else delete timezones[id];
    return { ...l, timezones };
  });
}

// ---------- block reasons ----------

export interface ReasonPreset {
  id: string;
  label: string;
  group: "annoying" | "harmful" | "technical";
}

/** Shared presets (stable ids: what friends receive). Never anything about age. */
export const BLOCK_REASONS: ReasonPreset[] = [
  { id: "soundboard", label: "Spamming soundboard", group: "annoying" },
  { id: "loud-music", label: "Music too loud", group: "annoying" },
  { id: "mic-spam", label: "Mic spam / screaming", group: "annoying" },
  { id: "annoying-avatar", label: "Annoying avatar", group: "annoying" },
  { id: "trolling", label: "Trolling", group: "annoying" },
  { id: "invite-spam", label: "Spamming invites or friend requests", group: "annoying" },
  { id: "begging", label: "Begging (VRC+, money)", group: "annoying" },
  { id: "drama", label: "Drama / gossip", group: "annoying" },
  { id: "anti-queer", label: "Anti-queer", group: "harmful" },
  { id: "racism", label: "Racism / slurs", group: "harmful" },
  { id: "harassment", label: "Harassment", group: "harmful" },
  { id: "sexual", label: "Unwanted sexual advances", group: "harmful" },
  { id: "following", label: "Following me between instances", group: "harmful" },
  { id: "personal-space", label: "Invading personal space", group: "harmful" },
  { id: "doxxing", label: "Sharing personal info (doxxing)", group: "harmful" },
  { id: "scam", label: "Scamming", group: "harmful" },
  { id: "impersonation", label: "Impersonating someone", group: "harmful" },
  { id: "crasher", label: "Crasher", group: "technical" },
  { id: "seizure", label: "Seizure / flashing avatar", group: "technical" },
  { id: "malicious-links", label: "Malicious links", group: "technical" },
  { id: "ripped", label: "Stolen (ripped) avatar", group: "technical" },
  { id: "ban-evasion", label: "Ban evasion (an alt account)", group: "technical" },
];
export const REASON_IDS = new Set(BLOCK_REASONS.map((r) => r.id));
export const reasonLabel = (id: string) => BLOCK_REASONS.find((r) => r.id === id)?.label ?? id;
export const REASON_GROUP_LABEL = { annoying: "Annoying", harmful: "Harmful", technical: "Technical" } as const;

export function setBlockReason(id: string, reasons: string[], text?: string) {
  updateLocal((l) => {
    const blockReasons = { ...(l.blockReasons ?? {}) };
    const clean = reasons.filter((r) => REASON_IDS.has(r));
    if (!clean.length && !text?.trim()) delete blockReasons[id];
    else blockReasons[id] = { reasons: clean, text: text?.trim().slice(0, 500) || undefined, t: Date.now() } satisfies BlockReason;
    return { ...l, blockReasons };
  });
}

export function blockReasonOf(id: string): BlockReason | null {
  return getState().local.blockReasons?.[id] ?? null;
}

/** Friends' shared block reasons about someone. */
export function friendBlocksAbout(id: string): { by: string; byId?: string; reasons: string[]; t: number }[] {
  const s = getState();
  return s.local.imports.flatMap((l) =>
    ((l as { blocks?: { id: string; reasons: string[]; t: number }[] }).blocks ?? [])
      .filter((b) => b.id === id && l.owner.id !== id)
      .map((b) => ({ by: (l.owner.id && s.cache.friends[l.owner.id]?.displayName) || l.owner.displayName, byId: l.owner.id, reasons: b.reasons.filter((r) => REASON_IDS.has(r)), t: b.t })),
  );
}

// ---------- watching an instance for a free slot ----------

export function watchSlot(location: string, name: string, on: boolean) {
  updateLocal((l) => {
    const slotWatch = { ...(l.slotWatch ?? {}) };
    if (on) slotWatch[location] = { t: Date.now(), name };
    else delete slotWatch[location];
    return { ...l, slotWatch };
  });
  if (on) showToast("You'll be told when a slot opens there (checked every minute).");
}

