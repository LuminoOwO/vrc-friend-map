// The phone in the background (Android): three ways to keep getting
// notifications, picked in Settings → Phone in the background:
//  - "visible": the app's own live connection stays up with a permanent
//    notification (a foreground service keeps the app running);
//  - "quiet":   the same with a silent, minimised notification (on Android
//    13+ it mostly shows under "Active apps");
//  - "push":    no connection on the phone at all; your PC app (or your own
//    server later) sends notifications through UnifiedPush (Sunup, ntfy…),
//    encrypted with a key only your devices know.
// Also: screen refresh rate above 60 Hz, the home-screen widget, links shared
// to the app, and reading VRChat's logs with root (rooted phones, Quest).
import { t as tr } from "./i18n";
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./backend";
import { isAndroid } from "./platform";
import { openVrchatLink } from "./vrclinks";
import { getState, showToast, subscribeState, updateLocal, updateSettings } from "./store";
import { logSync } from "./synclog";
import type { NotifyEvent } from "./types";

export const ANDROID = isTauri && isAndroid;

async function call<T = Record<string, unknown>>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>("android_call", { command, args });
}

// ---------- background mode ----------

export async function applyBackgroundMode() {
  if (!ANDROID) return;
  const p = getState().settings.phone;
  const mode = p.background === "visible" || p.background === "quiet" ? p.background : "off";
  try {
    await call("setBackground", { mode, text: mode === "quiet" ? tr("phoneMsg.quietlyKeepingInTouch") : tr("phoneMsg.liveFriendUpdatesAndInvites") });
  } catch (e) {
    logSync({ area: "Phone", step: "Background", result: "failed", detail: String(e) });
  }
}

export async function askBatteryExemption(): Promise<boolean> {
  if (!ANDROID) return false;
  const r = await call<{ exempt: boolean; asked: boolean }>("batteryExempt");
  return r.exempt;
}

// ---------- refresh rate ----------

export async function refreshRates(): Promise<{ rates: number[]; current: number } | null> {
  if (!ANDROID) return null;
  try {
    return await call("refreshRates");
  } catch {
    return null;
  }
}

/** 0 = the highest the screen can do. */
export async function applyRefreshRate() {
  if (!ANDROID || getState().settings.phone.refreshRate < 0) return;
  await call("setRefreshRate", { hz: getState().settings.phone.refreshRate }).catch(() => {});
}

// ---------- widget ----------

let widgetKey = "";
export function updateWidget() {
  if (!ANDROID || !getState().settings.phone.widget) return;
  const s = getState();
  const starred = s.local.starred ?? [];
  const lines = starred
    .map((id) => s.cache.friends[id])
    .filter((f) => f && s.cache.presence[f.id] !== "offline")
    .map((f) => {
      const world = f.location.startsWith("wrld_") ? s.cache.worlds?.[f.location.split(":")[0]]?.name : null;
      return `★ ${s.local.nicknames?.[f.id] || f.displayName}${world ? ` · ${world}` : s.cache.presence[f.id] === "web" ? tr("phoneMsg.website") : ""}`;
    })
    .slice(0, 12);
  const key = lines.join("\n");
  if (key === widgetKey) return;
  widgetKey = key;
  void call("setWidget", { title: starred.length ? tr("phoneMsg.starredFriendsOnline") : tr("phoneMsg.starFriendsToSeeThem"), lines }).catch(() => {});
}

// ---------- push (UnifiedPush) ----------

export async function pushDistributors(): Promise<{ id: string; name: string }[]> {
  if (!ANDROID) return [];
  const r = await call<{ distributors: { id: string; name: string }[] }>("pushDistributors");
  return r.distributors;
}

function randomKey(): string {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a));
}

/** Register with a distributor; the endpoint arrives a moment later (see poll). */
export async function pushRegister(distributor: string) {
  const local = getState().local;
  const key = local.push?.key || randomKey();
  updateLocal((l) => ({ ...l, push: { ...(l.push ?? { endpoint: "" }), key, distributor } }));
  await call("pushRegister", { distributor, key });
}

export async function pushUnregister() {
  await call("pushUnregister").catch(() => {});
  updateLocal((l) => {
    const pushTargets = { ...(l.pushTargets ?? {}) };
    delete pushTargets[l.deviceId ?? "phone"];
    return { ...l, push: undefined, pushTargets };
  });
}

/** Pick up what happened while the UI wasn't looking: the push endpoint, shared links. */
export async function pollAndroid() {
  if (!ANDROID) return;
  try {
    const r = await call<{ endpoint: string; distributor: string; pushError: string; shared: string[] }>("poll");
    const cur = getState().local.push;
    if (cur && r.endpoint && r.endpoint !== cur.endpoint) {
      updateLocal((l) => ({
        ...l,
        push: { ...l.push!, endpoint: r.endpoint, t: Date.now() },
        // Your PC learns about it through device sync.
        pushTargets: { ...(l.pushTargets ?? {}), [l.deviceId ?? "phone"]: { endpoint: r.endpoint, key: l.push!.key, t: Date.now(), name: "Android phone" } },
      }));
      logSync({ area: "Phone", step: "Push", result: "ok", detail: tr("phoneMsg.registeredWithThePushDistributor") });
    }
    if (r.pushError) logSync({ area: "Phone", step: "Push", result: "failed", detail: r.pushError });
    for (const text of r.shared) if (!openVrchatLink(text)) showToast(tr("phoneMsg.thatSharedTextHasNo"));
  } catch {
    // older APK without the plugin
  }
}

async function setForeground(fg: boolean) {
  if (ANDROID) await call("setForeground", { foreground: fg }).catch(() => {});
}

// ---------- sending pushes (on the PC: to your phones) ----------

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/** AES-GCM with the phone's key: base64(iv ‖ ciphertext+tag). */
export async function sealPush(keyB64: string, msg: object): Promise<string> {
  const raw = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(msg))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return b64(out);
}

const PUSHED: NotifyEvent[] = ["invite", "requestInvite", "online", "joined", "added", "removed", "gathering", "anniversary", "slotOpen"];

/** On the PC: forward a notification to your phones that use push mode. */
export async function pushToPhones(event: NotifyEvent, title: string, body: string) {
  if (ANDROID || !isTauri) return;
  const targets = Object.values(getState().local.pushTargets ?? {}).filter((t) => t.endpoint && t.key && Date.now() - t.t < 60 * 864e5);
  if (!targets.length || !PUSHED.includes(event)) return;
  for (const t of targets) {
    try {
      const sealed = await sealPush(t.key, { title, body, tag: `${event}:${body}`.slice(0, 80), kind: event });
      const status = await invoke<number>("push_send", { endpoint: t.endpoint, body: sealed });
      if (status >= 400) logSync({ area: "Push to phone", step: event, result: "failed", detail: `${t.endpoint.replace(/\/[^/]+$/, "/…")}: ${status}`, status });
    } catch (e) {
      logSync({ area: "Push to phone", step: event, result: "failed", detail: String(e) });
    }
  }
}

// ---------- reading logs with root ----------

export async function rootLogs(): Promise<string> {
  const [dir, n] = await invoke<[string, number]>("android_root_logs");
  const ls = getState().settings.logs;
  if (!ls.dirs.includes(dir)) updateSettings({ logs: { ...ls, dirs: [...ls.dirs, dir] } });
  return tr("phoneMsg.logsCopied", { count: n });
}

// ---------- start ----------

let started = false;
export function startPhone() {
  if (!ANDROID || started) return;
  started = true;
  void applyBackgroundMode();
  void applyRefreshRate();
  void pollAndroid();
  void setForeground(document.visibilityState === "visible");
  document.addEventListener("visibilitychange", () => {
    const fg = document.visibilityState === "visible";
    void setForeground(fg);
    if (fg) void pollAndroid();
  });
  setInterval(() => document.visibilityState === "visible" && void pollAndroid(), 5000);
  // Root logs: copy again every few minutes while the app is open.
  setInterval(() => {
    if (getState().settings.phone.rootLogs) void rootLogs().catch(() => {});
  }, 5 * 60e3);
  let lastPhone = getState().settings.phone;
  let lastPres = getState().cache.presence;
  subscribeState(() => {
    const s = getState();
    if (s.settings.phone !== lastPhone) {
      const prev = lastPhone;
      lastPhone = s.settings.phone;
      if (prev.background !== lastPhone.background) void applyBackgroundMode();
      if (prev.refreshRate !== lastPhone.refreshRate) void applyRefreshRate();
    }
    if (s.cache.presence !== lastPres) {
      lastPres = s.cache.presence;
      updateWidget();
    }
  });
}

// ---------- home network (Android 17+) ----------

/** A server address on your home network (where Android 17 asks first). */
export function onHomeNetwork(url: string): boolean {
  let host = "";
  try {
    host = new URL(/^https?:\/\//.test(url) ? url : `http://${url}`).hostname;
  } catch {
    return false;
  }
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|127\.)/.test(host) || host.endsWith(".local") || host === "localhost";
}

/**
 * Android 17+ only lets apps reach devices at home with the "Nearby devices"
 * permission. Asks for it when a server is on your home network (once per start), and
 * waits up to 30 seconds for your answer. True when the app may connect.
 */
let askedHomeNetwork = false;
export async function allowHomeNetwork(url: string, ask = true, again = false): Promise<boolean> {
  if (!ANDROID || !onHomeNetwork(url)) return true;
  try {
    // Ask at most once per app start (and when you add a server); otherwise only check.
    const asking = ask && (again || !askedHomeNetwork);
    let r = await call<{ granted: boolean; asked: boolean }>(asking ? "localNetwork" : "localNetworkState");
    if (r.granted) return true;
    if (!asking) return false;
    askedHomeNetwork = true;
    for (let i = 0; i < 30; i++) {
      await new Promise((res) => setTimeout(res, 1000));
      r = await call<{ granted: boolean; asked: boolean }>("localNetworkState").catch(() => r);
      if (r.granted) return true;
    }
  } catch {
    return true; // older app shell without the command: just try
  }
  return false;
}
