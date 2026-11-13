// Notifications: someone came online, went offline, became your friend,
// removed you, joined or left your instance. Decides whether to notify (general
// rules, per person, circles, mute), then plays the action's sound followed by
// the person's own tune, and shows a system notification when the app is in
// the background (or always, as chosen).
import { backend, isTauri } from "./backend";
import { playParts, type SoundPart } from "./notify";
import { getState, showToast, updateNotify } from "./store";
import type { CustomSound, NotifyEvent, NotifySettings } from "./types";

export const EVENT_LABEL: Record<NotifyEvent, string> = {
  added: "Became your friend",
  removed: "Removed you as a friend",
  online: "Came online",
  offline: "Went offline",
  joined: "Joined your instance",
  left: "Left your instance",
};

function message(event: NotifyEvent, name: string, world?: string): string {
  switch (event) {
    case "added":
      return `${name} is now your friend`;
    case "removed":
      return `${name} is no longer your friend`;
    case "online":
      return `${name} came online`;
    case "offline":
      return `${name} went offline`;
    case "joined":
      return `${name} joined ${world ? world : "your instance"}`;
    case "left":
      return `${name} left ${world ? world : "your instance"}`;
  }
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
export function soundFor(event: NotifyEvent, name: string, n: NotifySettings = getState().settings.notify): SoundPart[] {
  const parts: SoundPart[] = [];
  const a = part(n.actionSounds[event]);
  if (a) parts.push(a);
  if (n.personTune && name) parts.push({ tune: name });
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

const queue: { parts: SoundPart[]; volume: number }[] = [];
let playing = false;
async function drain() {
  if (playing) return;
  playing = true;
  while (queue.length) {
    const next = queue.shift()!;
    await playParts(next.parts, next.volume).catch(() => {});
  }
  playing = false;
}

let permission: boolean | null = null;
async function systemNotify(title: string, body: string) {
  if (!isTauri) {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, silent: true });
    return;
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
  if (isMuted(n, now)) return true;

  const text = message(event, name, extra.world);
  if (n.sound && queue.length < 4) {
    queue.push({ parts: soundFor(event, name, n), volume: n.volume });
    void drain();
  }
  const background = document.hidden || !document.hasFocus();
  if (n.system === "always" || (n.system === "background" && background)) void systemNotify("VRC Friend Map", text);
  else if (!background) showToast(text);
  return true;
}

/** Preview: what an event about `name` would sound like. */
export function previewEvent(event: NotifyEvent, name: string) {
  const n = getState().settings.notify;
  queue.length = 0;
  queue.push({ parts: soundFor(event, name, n), volume: n.volume || 0.5 });
  void drain();
}

export function muteFor(ms: number | "forever" | 0) {
  updateNotify({ muteUntil: ms === "forever" ? -1 : ms === 0 ? 0 : Date.now() + ms });
}

export function muteLabel(n: NotifySettings = getState().settings.notify): string {
  if (n.muteUntil === -1) return "Muted until you unmute";
  if (n.muteUntil > Date.now()) {
    const d = new Date(n.muteUntil);
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `Muted until ${d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { weekday: "short" })} ${time}`}`;
  }
  return "";
}
