// Who's in your instance right now, from VRChat's log as it's written
// (src-tauri/src/livelog.rs). Desktop only, nothing is asked of VRChat.
import { addActivity, fromLive, loadActivity, type LiveEvent } from "./activity";
import { friendBlocksAbout, reasonLabel } from "./personal";
import { notifyEvent } from "./notifications";
import { backend, isTauri } from "./backend";
import { logDirs, logsSupported, naiveToDate } from "./logs";
import { getState, setState } from "./store";
import type { LiveSnapshot } from "./types";

let unlisten: (() => void) | null = null;
let unlistenEvents: (() => void) | null = null;
let runningKey = "";

/** Start, restart or stop following the log to match settings. */
export async function syncLive() {
  const s = getState();
  const want =
    isTauri && s.mode === "app" && !s.demo && s.settings.logs.enabled && s.settings.logs.live && logsSupported(s.logs.platform);
  const key = want ? JSON.stringify(logDirs()) : "";
  if (key === runningKey) return;
  runningKey = key;
  if (!want) {
    await backend.liveStop().catch(() => {});
    if (!s.demo) setState({ here: null });
    return;
  }
  unlisten ??= await backend.onLive((here) => setState({ here }));
  unlistenEvents ??= await backend.onLiveEvents((ev) => {
    addActivity(ev.map(fromLive));
    checkFriendBlocks(ev);
    // Friends joining or leaving your instance, as it happens (not the log's backlog).
    const s = getState();
    for (const e of ev) {
      if ((e.kind !== "join" && e.kind !== "leave") || e.initial || !s.cache.friends[e.id]) continue;
      if (Date.now() - naiveToDate(e.ts).getTime() > 90_000) continue;
      notifyEvent(e.kind === "join" ? "joined" : "left", e.id, s.cache.friends[e.id].displayName, { world: e.worldName || undefined });
    }
  });
  await loadActivity();
  try {
    await backend.liveStart(logDirs());
    setState({ here: await backend.liveSnapshot() });
    const backlog = await backend.liveEvents(0).catch(() => []);
    addActivity(backlog.map(fromLive));
    checkFriendBlocks(backlog);
  } catch {
    runningKey = "";
    setState({ here: null });
  }
}

const blockFlagged = new Set<string>();

/** Someone joined (or was already there): if friends who share their blocks with you blocked them,
 *  an Activity line, and a notification if you turned that on (off by default). */
export function checkFriendBlocks(ev: LiveEvent[]) {
  const s = getState();
  for (const e of ev) {
    if (e.kind !== "join" || !e.id || s.cache.friends[e.id] || e.id === s.cache.me?.id) continue;
    const blocks = friendBlocksAbout(e.id);
    if (!blocks.length) continue;
    const key = `${e.location || e.worldId}|${e.id}`;
    if (blockFlagged.has(key)) continue;
    blockFlagged.add(key);
    const reasons = [...new Set(blocks.flatMap((b) => b.reasons))].map(reasonLabel).slice(0, 3);
    const by = blocks.map((b) => b.by).join(", ") + (reasons.length ? ` (${reasons.join(", ")})` : "");
    const t = naiveToDate(e.ts).getTime();
    addActivity([{ key: `fb|${key}`, t, kind: "friend-blocked", userId: e.id, name: e.name, worldId: e.worldId, worldName: e.worldName || undefined, note: by }]);
    // Only what's happening now (or since you arrived), not an old log's backlog.
    if (Date.now() - t < 10 * 60_000) notifyEvent("friendBlockedHere", e.id, e.name, { world: by });
  }
}

/** Everyone in your instance except you. */
export function othersHere(here: LiveSnapshot | null, myId: string | undefined): LiveSnapshot["players"] {
  if (!here?.active) return [];
  const me = myId ?? here.localId ?? "";
  return here.players.filter((p) => p.id !== me);
}

/** Demo: a made-up instance with a few demo friends and two strangers. */
export function demoHere(friendIds: string[], names: Record<string, string>): LiveSnapshot {
  const now = Math.floor(Date.now() / 1000);
  const picked = friendIds.slice(0, 4);
  return {
    active: true,
    location: "wrld_demo:12345~friends(usr_demo)~region(eu)",
    worldId: "wrld_demo",
    worldName: "The Black Cat",
    since: now - 3600,
    players: [
      ...picked.map((id, i) => ({ id, name: names[id] ?? id, since: now - 3000 + i * 60 })),
      { id: "usr_demo-stranger-0001", name: "Moonlit Fox", since: now - 900 },
      { id: "usr_demo-stranger-0002", name: "Pixel Bard", since: now - 300 },
    ],
    localId: "usr_demo-me",
    file: "demo",
    closed: false,
  };
}
