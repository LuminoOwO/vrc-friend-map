// Small things the app does with your servers besides sharing:
// - tells servers your display name (for their owner's user list);
// - heartbeat to a server whose logger is yours, so it hands its live VRChat
//   connection to this PC while the app runs (and takes it back after);
// - registers this phone's push target with your own logger server, so the
//   server can send invites to the phone even with your PC off;
// - the shared cache of public VRChat info (worlds, groups, avatars).
import { backend, isTauri } from "./backend";
import { getState, subscribeState } from "./store";
import { isMobile } from "./backend";
import type { ShareServer } from "./types";

const usable = (s: ShareServer) => s.registered && !!s.url;

let timer: ReturnType<typeof setInterval> | null = null;
let lastName = "";
let lastPush = "";

async function tick() {
  const st = getState();
  if (st.demo || st.mode !== "app" || !isTauri) return;
  const servers = st.settings.sharing.servers.filter(usable);
  // Display name.
  const name = st.cache.me?.displayName ?? "";
  if (name && name !== lastName) {
    lastName = name;
    void backend.share.setName(name).catch(() => {});
  }
  // Hand-off: this PC holds the live connection.
  if (!isMobile && st.live.connected) {
    for (const s of servers.filter((x) => x.loggerOwner)) void backend.share.call(s.url, "POST", "/v1/logger/heartbeat", {}).catch(() => {});
  }
  // This phone's push target, for servers where you own the logger.
  const push = st.local.push;
  const key = push?.endpoint ? `${push.endpoint}|${push.key}` : "";
  if (isMobile && key !== lastPush) {
    lastPush = key;
    for (const s of servers) {
      const device = st.local.deviceId ?? "phone";
      const req = push?.endpoint
        ? backend.share.call(s.url, "PUT", "/v1/logger/push", { device, endpoint: push.endpoint, key: push.key })
        : backend.share.call(s.url, "DELETE", "/v1/logger/push", { device });
      // Servers where the logger isn't yours say no: fine.
      void req.catch(() => {});
    }
  }
}

export function startServerLink() {
  if (timer) return;
  timer = setInterval(() => void tick(), 60_000);
  setTimeout(() => void tick(), 5000);
  let lastPushRef: unknown = null;
  subscribeState(() => {
    const p = getState().local.push;
    if (p !== lastPushRef) {
      lastPushRef = p;
      void tick();
    }
  });
}

// ---------- shared cache of public VRChat info ----------

type Kind = "world" | "group" | "avatar";
const DAY = 864e5;

function cacheServers(): ShareServer[] {
  const st = getState();
  if (st.demo || !isTauri) return [];
  return st.settings.sharing.servers.filter((s) => usable(s) && s.download && s.useCache !== false);
}

/** A public entry from one of your servers' caches, if it's fresh enough. */
export async function cacheGet<T = Record<string, unknown>>(kind: Kind, id: string, maxAgeMs = DAY): Promise<T | null> {
  for (const s of cacheServers()) {
    try {
      const r = await backend.share.call<{ data: T; at: number }>(s.url, "GET", `/v1/cache/${kind}/${id}`);
      if (r?.data && Date.now() - r.at * 1000 < maxAgeMs) return r.data;
    } catch {
      // not cached there, or the server doesn't cache this kind
    }
  }
  return null;
}

/** Put what VRChat returned (public info only) into your servers' caches. */
export function cachePut(kind: Kind, id: string, data: unknown) {
  if (!data || typeof data !== "object" || (data as { id?: string }).id !== id) return;
  const json = JSON.stringify(data);
  if (json.length > 60_000) return;
  for (const s of cacheServers()) void backend.share.call(s.url, "PUT", `/v1/cache/${kind}/${id}`, data).catch(() => {});
}
