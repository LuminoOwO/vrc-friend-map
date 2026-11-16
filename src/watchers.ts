// Small background jobs while the app runs: friendiversaries, gathering
// alerts, watched instances (free slot), and checking VRChat's block list for
// blocks made in game (so the app can ask why).
import { history } from "./history";
import { anniversariesOn, gatherings } from "./insights";
import { notifyEvent } from "./notifications";
import { refreshModerations } from "./people";
import { shownName } from "./personal";
import { getState, subscribeState, updateLocal } from "./store";
import { loadInstance } from "./sync";

let timers: ReturnType<typeof setInterval>[] = [];
let unsub: (() => void) | null = null;

// ---------- friendiversaries ----------

export function checkAnniversaries(now = new Date()) {
  const s = getState();
  if (s.demo || !s.settings.notify.events.anniversary) return;
  const h = history();
  const list = anniversariesOn(now, Object.keys(s.cache.friends), s.local.friendLog);
  for (const a of list) {
    if (h.announced.includes(a.key)) continue;
    h.announced.push(a.key);
    notifyEvent("anniversary", a.id, shownName(a.id, "a friend"), { world: a.label });
  }
}

// ---------- gatherings ----------

const announcedGatherings = new Map<string, number>();

function gatheringPeople(): Set<string> {
  const s = getState();
  const g = s.settings.notify.gathering;
  const out = new Set<string>();
  if (g.who !== "circles") for (const id of s.local.starred ?? []) out.add(id);
  if (g.who !== "starred") for (const c of s.local.circles) if (g.circleIds.includes(c.id)) c.members.forEach((m) => out.add(m));
  return out;
}

export function checkGatherings(now = Date.now()) {
  const s = getState();
  if (s.demo || !s.settings.notify.events.gathering) return;
  const who = gatheringPeople();
  if (who.size < 2) return;
  const locations = Object.fromEntries(Object.entries(s.cache.friends).map(([id, f]) => [id, f.location]));
  const myLoc = s.here?.location;
  for (const [loc, ids] of gatherings(locations, who, s.settings.notify.gathering.min)) {
    if (myLoc && loc === myLoc) continue; // you're there
    const key = `${loc}|${[...ids].sort().join(",")}`;
    if (now - (announcedGatherings.get(key) ?? 0) < 2 * 36e5) continue;
    // A bigger group in the same place within 2 hours: also quiet.
    if ([...announcedGatherings.entries()].some(([k, t]) => k.startsWith(`${loc}|`) && now - t < 2 * 36e5)) continue;
    announcedGatherings.set(key, now);
    const names = ids.slice(0, 3).map((id) => shownName(id));
    const label = ids.length > 3 ? `${names.join(", ")} and ${ids.length - 3} more` : names.join(", ").replace(/, ([^,]*)$/, " and $1");
    const worldId = loc.split(":")[0];
    const world = s.cache.worlds?.[worldId]?.name;
    notifyEvent("gathering", ids[0], label, { world });
  }
}

// ---------- watched instances ----------

export async function checkSlots(now = Date.now()) {
  const s = getState();
  const watch = s.local.slotWatch ?? {};
  for (const [loc, w] of Object.entries(watch)) {
    if (now - w.t > 3 * 36e5) {
      updateLocal((l) => {
        const slotWatch = { ...(l.slotWatch ?? {}) };
        delete slotWatch[loc];
        return { ...l, slotWatch };
      });
      continue;
    }
    const info = await loadInstance(loc).catch(() => null);
    if (!info || !info.capacity) continue;
    if (info.users < info.capacity) {
      updateLocal((l) => {
        const slotWatch = { ...(l.slotWatch ?? {}) };
        delete slotWatch[loc];
        return { ...l, slotWatch };
      });
      const worldId = loc.split(":")[0];
      notifyEvent("slotOpen", worldId, w.name, { world: `${info.users}/${info.capacity}` });
    }
  }
}

// ---------- start / stop ----------

export function startWatchers() {
  if (timers.length) return;
  checkAnniversaries();
  timers = [
    setInterval(() => checkAnniversaries(), 30 * 60e3),
    setInterval(() => void checkSlots(), 60e3),
    setInterval(() => void refreshModerations(), 10 * 60e3),
  ];
  let last = "";
  let lastRef: unknown = null;
  let pending: ReturnType<typeof setTimeout> | null = null;
  unsub = subscribeState(() => {
    const f = getState().cache.friends;
    if (f === lastRef) return;
    lastRef = f;
    // Only when locations changed.
    let key = "";
    for (const id in f) key += f[id].location;
    if (key === last) return;
    last = key;
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => checkGatherings(), 8000);
  });
}

export function stopWatchers() {
  timers.forEach(clearInterval);
  timers = [];
  unsub?.();
  unsub = null;
}
