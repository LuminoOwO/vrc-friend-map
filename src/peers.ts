// Your own devices syncing with each other directly. They find each other
// through your servers' live connection ("hello"), then talk straight over your
// home network when they can, or through the server live (never stored, and
// only if that server passes bigger messages along). Everything is sealed and
// signed with your own key, which only your devices have.
//
// What goes along: your circles, notes and settings (merged like the server
// sync does) and your own notification sounds (ones a device doesn't have yet).

import { t as tr } from "./i18n";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { backend, isTauri } from "./backend";
import { customSounds, loadCustomSounds, onCustomSounds, restoreCustomSounds } from "./notifications";
import { deviceServers, selfForDevices, selfKey, takeSelfFromDevice } from "./share";
import { getState, subscribeState } from "./store";
import { logSync } from "./synclog";
import type { CustomSound } from "./types";

export interface Peer {
  device: string;
  name: string;
  addrs: string[];
  port: number;
  /** The server it last said hello on. */
  via: string;
  seen: number;
  /** Reached directly last time. */
  direct: boolean;
}

type Msg =
  | { type: "hello"; from: string; to?: string; name: string; addrs: string[]; port: number; sounds: string[]; reply?: boolean }
  | { type: "self"; from: string; to?: string; data: unknown }
  | { type: "want"; from: string; to?: string; ids: string[] }
  | { type: "sounds"; from: string; to?: string; list: CustomSound[] };

const peers = new Map<string, Peer>();
const subs = new Set<() => void>();
const changed = () => subs.forEach((f) => f());

export function knownPeers(): Peer[] {
  return [...peers.values()].sort((a, b) => b.seen - a.seen);
}
export function onPeers(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

let here: { port: number; addrs: string[] } = { port: 0, addrs: [] };
const myDevice = () => getState().local.deviceId ?? "";

function deviceName(): string {
  const ua = navigator.userAgent;
  return /Android/.test(ua) ? tr("peersMsg.androidPhone") : /iPhone|iPad/.test(ua) ? tr("peersMsg.iphoneIpad") : /Windows/.test(ua) ? tr("peersMsg.windowsPc") : /Mac/.test(ua) ? "Mac" : tr("peersMsg.linuxPc");
}

/** Who a message is for and whether to take it: not our own, not for another device. */
export function forMe(m: { from?: unknown; to?: unknown }, me: string): boolean {
  return typeof m.from === "string" && m.from !== me && (m.to === undefined || m.to === me);
}

/** Sounds the other device has and this one doesn't. */
export function missing(theirs: string[], mine: string[]): string[] {
  const have = new Set(mine);
  return theirs.filter((id) => typeof id === "string" && !have.has(id)).slice(0, 50);
}

async function send(msg: Msg, to?: Peer) {
  const blob = await backend.share.deviceSeal(JSON.stringify(msg));
  if (to && to.port) {
    for (const addr of to.addrs) {
      try {
        await backend.share.peerSend(addr, to.port, blob);
        if (!to.direct) {
          to.direct = true;
          changed();
        }
        return;
      } catch {
        /* not reachable directly: try the next address, then the server */
      }
    }
    if (to.direct) {
      to.direct = false;
      changed();
    }
  }
  const servers = deviceServers();
  const via = to ? (servers.find((s) => s.url === to.via) ?? servers[0]) : null;
  for (const s of via ? [via] : servers) {
    try {
      await backend.share.deviceRelay(s.url, blob);
    } catch (e) {
      logSync({ area: s.info?.name || s.url, step: "Your devices (live)", result: "failed", detail: String(e) });
    }
  }
}

function hello(to?: Peer, reply = false): Msg {
  return { type: "hello", from: myDevice(), to: to?.device, name: deviceName(), addrs: here.addrs, port: here.port, sounds: customSounds().map((s) => s.id), reply };
}

async function sendSelf(to?: Peer) {
  const msg: Msg = { type: "self", from: myDevice(), to: to?.device, data: selfForDevices() };
  lastSelf = selfKey();
  if (to) await send(msg, to);
  else for (const p of peers.values()) await send({ ...msg, to: p.device }, p);
}

async function handle(raw: unknown, via: string) {
  const m = raw as Msg;
  if (!m || typeof m !== "object" || !forMe(m, myDevice())) return;
  const known = peers.get(m.from);
  if (m.type === "hello") {
    const p: Peer = {
      device: m.from,
      name: String(m.name || "Another device").slice(0, 40),
      addrs: Array.isArray(m.addrs) ? m.addrs.filter((a) => typeof a === "string").slice(0, 4) : [],
      port: Number(m.port) || 0,
      via: via === "direct" ? (known?.via ?? "") : via,
      seen: Date.now(),
      direct: known?.direct ?? false,
    };
    peers.set(p.device, p);
    changed();
    if (!m.reply) await send(hello(p, true), p);
    await sendSelf(p);
    const want = missing(Array.isArray(m.sounds) ? m.sounds : [], customSounds().map((s) => s.id));
    if (want.length) await send({ type: "want", from: myDevice(), to: p.device, ids: want }, p);
    return;
  }
  if (!known) return;
  known.seen = Date.now();
  if (m.type === "self") {
    const r = takeSelfFromDevice(m.data);
    if (r?.changedHere) logSync({ area: known.name, step: "Your devices (live)", result: "ok", detail: tr("peersMsg.tookOverChangesFromYour") });
    if (r?.sendBack) await sendSelf(known);
  } else if (m.type === "want") {
    const ids = new Set(Array.isArray(m.ids) ? m.ids : []);
    // One sound per message: each stays well under the size servers pass along.
    for (const s of customSounds().filter((x) => ids.has(x.id))) await send({ type: "sounds", from: myDevice(), to: known.device, list: [s] }, known);
  } else if (m.type === "sounds" && Array.isArray(m.list)) {
    await restoreCustomSounds(m.list);
  }
}

let unlistens: UnlistenFn[] = [];
let timers: ReturnType<typeof setInterval>[] = [];
let lastSelf = "";
let lastServers = "";

/** Say hello on every server your devices meet on (when they change, and every 10 minutes). */
async function announce() {
  if (!deviceServers().length) return;
  try {
    here = await backend.share.peerListen();
  } catch {
    here = { port: 0, addrs: [] };
  }
  await send(hello());
}

export async function startPeers() {
  if (!isTauri || unlistens.length) return;
  await loadCustomSounds();
  unlistens.push(
    await listen<{ blob: string; via: string }>("device-message", async (e) => {
      try {
        await handle(await backend.share.deviceOpen(e.payload.blob), e.payload.via);
      } catch {
        /* not from your devices, or too old: ignored */
      }
    }),
    await listen<{ url: string; live: boolean }>("share-live", (e) => {
      if (e.payload.live && deviceServers().some((s) => s.url === e.payload.url)) void announce();
    }),
  );
  const offSounds = onCustomSounds(() => {
    for (const p of peers.values()) void send(hello(p, true), p);
  });
  unlistens.push(offSounds);
  // Your own changes go to your other devices within seconds.
  let t: ReturnType<typeof setTimeout> | undefined;
  unlistens.push(
    subscribeState(() => {
      const servers = deviceServers()
        .map((s) => s.url)
        .join(" ");
      if (servers !== lastServers) {
        lastServers = servers;
        void announce();
      }
      if (!peers.size || t) return;
      // At most every 3 seconds, however busy the app is.
      t = setTimeout(() => {
        t = undefined;
        if (selfKey() !== lastSelf) void sendSelf();
      }, 3000);
    }),
  );
  timers.push(setInterval(() => void announce(), 10 * 60_000));
  // Devices not heard from in 30 minutes are gone.
  timers.push(
    setInterval(() => {
      for (const [k, p] of peers) if (Date.now() - p.seen > 30 * 60_000) peers.delete(k);
      changed();
    }, 60_000),
  );
  lastSelf = selfKey();
  void announce();
}

export function stopPeers() {
  unlistens.forEach((u) => u());
  unlistens = [];
  timers.forEach(clearInterval);
  timers = [];
  peers.clear();
  changed();
}
