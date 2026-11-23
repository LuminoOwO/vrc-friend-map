// Notifications: someone came online, went offline, became your friend,
// removed you, joined or left your instance. Decides whether to notify (general
// rules, per person, circles, mute), then plays the action's sound followed by
// the person's own tune, and shows a system notification when the app is in
// the background (or always, as chosen).
import { t as tr, lazy, language } from "./i18n";
import { backend, isTauri } from "./backend";
import { playParts, type SoundPart } from "./notify";
import { getState, showToast, updateNotify } from "./store";
import { recordMissed } from "./history";
import { pushPopup } from "./inbox";
import type { CustomSound, NotifyEvent, NotifySettings } from "./types";

export const EVENT_LABEL: Record<NotifyEvent, string> = lazy(() => ({
  added: tr("events.added"),
  removed: tr("events.removed"),
  online: tr("events.online"),
  offline: tr("events.offline"),
  joined: tr("events.joined"),
  left: tr("events.left"),
  anniversary: tr("events.anniversary"),
  gathering: tr("events.gathering"),
  slotOpen: tr("events.slotOpen"),
  friendRequest: tr("events.friendRequest"),
  invite: tr("events.invite"),
  requestInvite: tr("events.requestInvite"),
}));

function message(event: NotifyEvent, name: string, world?: string): string {
  switch (event) {
    case "added":
      return tr("notifyMsg.nameIsNowYourFriend", { name });
    case "removed":
      return tr("notifyMsg.nameIsNoLongerYour", { name });
    case "online":
      return tr("notifyMsg.nameCameOnline", { name });
    case "offline":
      return tr("notifyMsg.nameWentOffline", { name });
    case "joined":
      return world ? tr("notifyMsg.joinedWorld", { name, world }) : tr("notifyMsg.joinedHere", { name });
    case "left":
      return world ? tr("notifyMsg.leftWorld", { name, world }) : tr("notifyMsg.leftHere", { name });
    case "anniversary":
      return world ? tr("notifyMsg.becameFriendsAt", { world, name }) : tr("notifyMsg.becameFriendsToday", { name });
    case "gathering":
      return world ? tr("notifyMsg.togetherIn", { name, world }) : tr("notifyMsg.together", { name });
    case "slotOpen":
      return world ? tr("notifyMsg.slotOpenCount", { name, world }) : tr("notifyMsg.slotOpen", { name });
    case "friendRequest":
      return tr("notifyMsg.friendRequest", { name });
    case "invite":
      return world ? tr("notifyMsg.invitedTo", { name, world }) : tr("notifyMsg.invited", { name });
    case "requestInvite":
      return tr("notifyMsg.nameAsksYouForAn", { name });
  }
}

// ---------- quiet hours, snooze, stars ----------

const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Is it quiet time now (Settings → Notifications → Quiet hours)? */
export function inQuietHours(q: NotifySettings["quiet"], at = new Date()): boolean {
  if (!q.enabled) return false;
  const now = at.getHours() * 60 + at.getMinutes();
  const from = mins(q.from);
  const to = mins(q.to);
  if (from === to) return q.days.includes(at.getDay());
  if (from < to) return q.days.includes(at.getDay()) && now >= from && now < to;
  // Over midnight: the evening part belongs to today, the morning part to the day it started.
  if (now >= from) return q.days.includes(at.getDay());
  if (now < to) return q.days.includes((at.getDay() + 6) % 7);
  return false;
}

export function isStarred(id: string): boolean {
  return getState().local.starred?.includes(id) ?? false;
}

export function snoozedUntil(id: string): number {
  return getState().local.snoozed?.[id] ?? 0;
}

function quietExempt(userId: string, n: NotifySettings): boolean {
  if (n.quiet.allowStarred && isStarred(userId)) return true;
  const circles = getState().local.circles;
  return circles.some((c) => n.quiet.allowCircleIds.includes(c.id) && c.members.includes(userId));
}

function circleRule(event: NotifyEvent, userId: string, n: NotifySettings): boolean {
  const circles = getState().local.circles;
  return circles.some((c) => n.circleRules[c.id]?.includes(event) && c.members.includes(userId));
}

// ---------- custom sounds (store/sounds.json) ----------

let customs: CustomSound[] = [];
let customsLoaded = false;
const listeners = new Set<() => void>();

export function customSounds(): CustomSound[] {
  return customs;
}
export function onCustomSounds(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export async function loadCustomSounds() {
  if (customsLoaded) return;
  customsLoaded = true;
  try {
    const raw = isTauri ? await backend.storeRead("sounds") : localStorage.getItem("vfm-sounds");
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed?.sounds)) customs = parsed.sounds.filter((s: CustomSound) => s?.id && s.data?.startsWith("data:audio/"));
    listeners.forEach((l) => l());
  } catch {
    /* none */
  }
}

async function saveCustoms() {
  const json = JSON.stringify({ sounds: customs });
  if (isTauri) await backend.storeWrite("sounds", json);
  else
    try {
      localStorage.setItem("vfm-sounds", json);
    } catch {
      /* too big for the browser */
    }
  listeners.forEach((l) => l());
}

/** Backup restore: add these sounds (same id: replaced). */
export async function restoreCustomSounds(list: CustomSound[]) {
  await loadCustomSounds();
  const ok = list.filter((s) => s?.id && typeof s.data === "string" && s.data.startsWith("data:audio/") && s.data.length < MAX_SOUND_BYTES * 1.5);
  const ids = new Set(ok.map((s) => s.id));
  customs = [...customs.filter((c) => !ids.has(c.id)), ...ok];
  await saveCustoms();
}

export const MAX_SOUND_BYTES = 1_000_000;

/** Add an audio file as a sound; returns its "custom:<id>" reference. */
export async function addCustomSound(file: File): Promise<string> {
  if (!file.type.startsWith("audio/")) throw new Error("That isn't an audio file.");
  if (file.size > MAX_SOUND_BYTES) throw new Error("Please use a sound under 1 MB (a few seconds is plenty).");
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read the file."));
    r.readAsDataURL(file);
  });
  const id = Math.random().toString(36).slice(2, 10);
  customs = [...customs, { id, name: file.name.replace(/\.[^.]+$/, "").slice(0, 40), data }];
  await saveCustoms();
  return `custom:${id}`;
}

export async function removeCustomSound(id: string) {
  customs = customs.filter((c) => c.id !== id);
  await saveCustoms();
  // Anything that used it falls back to the default.
  const n = getState().settings.notify;
  const actionSounds = { ...n.actionSounds };
  for (const [e, ref] of Object.entries(actionSounds)) if (ref === `custom:${id}`) actionSounds[e as NotifyEvent] = "chime";
  updateNotify({ actionSounds });
}

function part(ref: string): SoundPart | null {
  if (!ref || ref === "none") return null;
  if (ref.startsWith("custom:")) {
    const c = customs.find((x) => x.id === ref.slice(7));
    return c ? { data: c.data } : { sound: "chime" };
  }
  return { sound: ref };
}

/** What plays for an event about someone: the action sound, then their tune. */
export function soundFor(event: NotifyEvent, name: string, n: NotifySettings = getState().settings.notify, userId?: string): SoundPart[] {
  const parts: SoundPart[] = [];
  const a = part(n.actionSounds[event]);
  if (a) parts.push(a);
  // Their own sound (from the bell on their profile) instead of the generated tune.
  const own = userId ? n.personSounds?.[userId] : undefined;
  if (own) {
    const p = part(own);
    if (p) parts.push(p);
  } else if (n.personTune && name) parts.push({ tune: name });
  return parts;
}

// ---------- rules ----------

export function isMuted(n: NotifySettings = getState().settings.notify, now = Date.now()): boolean {
  return n.muteUntil === -1 || n.muteUntil > now;
}

/** Whether an event about this person should notify, by the rules in Settings → Notifications. */
export function shouldNotify(event: NotifyEvent, userId: string, n: NotifySettings = getState().settings.notify): boolean {
  if (!n.enabled) return false;
  const person = n.people[userId]?.mode;
  if (person === "never") return false;
  if (snoozedUntil(userId) > Date.now()) return false;
  if (!n.events[event] && !circleRule(event, userId, n) && !(person && (event === "online" || event === "joined"))) return false;
  if (circleRule(event, userId, n)) return true;
  // Events that aren't about friends' presence: their own switch is all.
  if (event === "anniversary" || event === "gathering" || event === "slotOpen" || event === "invite" || event === "requestInvite") return n.events[event];
  // Picked people: "came online" (and "joined your world" for always) even when those are off in general.
  if (person === "once" && event === "online") return true;
  if (person === "always" && (event === "online" || event === "joined")) return true;
  if (!n.events[event]) return false;
  if (person === "always") return true;
  if (event === "online" || event === "offline") return inScope(userId, n);
  return true;
}

function inScope(userId: string, n: NotifySettings): boolean {
  if (n.scope === "everyone") return true;
  if (n.scope === "picked") return false; // only people set to "always" or "once"
  const circles = getState().local.circles;
  return circles.some((c) => n.circleIds.includes(c.id) && c.members.includes(userId));
}

// ---------- delivery ----------

const queue: { parts: SoundPart[]; volume: number; pause?: number }[] = [];
let playing = false;
async function drain() {
  if (playing) return;
  playing = true;
  while (queue.length) {
    const next = queue.shift()!;
    await playParts(next.parts, next.volume, next.pause).catch(() => {});
  }
  playing = false;
}

let permission: boolean | null = null;
async function systemNotify(title: string, body: string) {
  if (!isTauri) {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, silent: true });
    return;
  }
  // Linux: show it without the desktop's notification sound while the app plays its own.
  if (/Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent) && getState().settings.notify.sound) {
    const { invoke } = await import("@tauri-apps/api/core");
    if (await invoke("notify_silent", { title, body }).then(() => true, () => false)) return;
  }
  try {
    const n = await import("@tauri-apps/plugin-notification");
    if (permission === null) {
      permission = await n.isPermissionGranted();
      if (!permission) permission = (await n.requestPermission()) === "granted";
    }
    if (permission) n.sendNotification({ title, body, silent: true });
  } catch {
    permission = false;
  }
}

/** Ask for permission to show notifications (from a button, so the system asks right away). */
export async function askNotificationPermission(): Promise<boolean> {
  permission = null;
  if (!isTauri) {
    if (!("Notification" in window)) return false;
    return (await Notification.requestPermission()) === "granted";
  }
  try {
    const n = await import("@tauri-apps/plugin-notification");
    permission = (await n.isPermissionGranted()) || (await n.requestPermission()) === "granted";
    return permission;
  } catch {
    return false;
  }
}

const recent = new Map<string, number>();

/** Friends you removed yourself (from a profile): no "removed you" notification. */
export const removedByMe = new Set<string>();

/** An event happened. Notifies if the rules say so; returns whether it did (or would have, if muted). */
export function notifyEvent(event: NotifyEvent, userId: string, name: string, extra: { world?: string } = {}): boolean {
  const s = getState();
  const n = s.settings.notify;
  if (event === "removed" && removedByMe.delete(userId)) return false;
  if (!shouldNotify(event, userId, n)) return false;
  // The same thing twice within a few seconds (e.g. two sources): once.
  const key = `${event}|${userId}`;
  const now = Date.now();
  if (now - (recent.get(key) ?? 0) < 5000) return true;
  recent.set(key, now);
  // "Only the next time they come online": done now.
  if (n.people[userId]?.mode === "once" && event === "online") {
    const people = { ...n.people };
    delete people[userId];
    updateNotify({ people });
  }
  const text = message(event, name, extra.world);
  if (isMuted(n, now)) {
    recordMissed({ t: now, event, userId, name, text, why: "muted" });
    return true;
  }
  if (inQuietHours(n.quiet) && !quietExempt(userId, n)) {
    recordMissed({ t: now, event, userId, name, text, why: "quiet" });
    return true;
  }
  recordMissed({ t: now, event, userId, name, text });
  // Your phones in push mode get it too (from the PC app).
  void import("./phone").then((m) => m.pushToPhones(event, "VRC Friend Map", text));

  if (n.sound && queue.length < 4) {
    queue.push({ parts: soundFor(event, name, n, userId), volume: n.volume, pause: n.pause });
    void drain();
  }
  const background = document.hidden || !document.hasFocus();
  const system = n.system === "always" || (n.system === "background" && background);
  if (system) void systemNotify("VRC Friend Map", text);
  // In the app: a pop-up under the notification center (or the old short toast if pop-ups are off).
  if (!document.hidden) {
    if (n.popupSeconds > 0) pushPopup({ kind: event, userId, text });
    else if (!system) showToast(text);
  }
  return true;
}

/** Preview: what an event about `name` would sound like. */
export function previewEvent(event: NotifyEvent, name: string, userId?: string) {
  const n = getState().settings.notify;
  queue.length = 0;
  queue.push({ parts: soundFor(event, name, n, userId), volume: n.volume || 0.5, pause: n.pause });
  void drain();
}

export function muteFor(ms: number | "forever" | 0) {
  updateNotify({ muteUntil: ms === "forever" ? -1 : ms === 0 ? 0 : Date.now() + ms });
}

export function muteLabel(n: NotifySettings = getState().settings.notify): string {
  if (n.muteUntil === -1) return tr("notifyMsg.mutedUntilYouUnmute");
  if (n.muteUntil > Date.now()) {
    const d = new Date(n.muteUntil);
    const time = d.toLocaleTimeString(language(), { hour: "2-digit", minute: "2-digit" });
    return `Muted until ${d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString(language(), { weekday: "short" })} ${time}`}`;
  }
  return "";
}
