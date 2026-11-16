// Circles you edit together with friends. A shared circle travels inside the
// friend list you share through servers (so it's encrypted like that list);
// each copy carries its last-change time and the newest one wins. Everyone
// listed in "with" (and the owner) can edit; others ignore it.
// Note: anyone you share your friend list with on that server could read the
// circle's name and members (they're your friends anyway).
import { getState, updateLocal } from "./store";
import type { Circle, ImportedList, SharedCircle } from "./types";

export function validSharedCircle(c: unknown): c is SharedCircle {
  const x = c as SharedCircle;
  return (
    !!x &&
    typeof x.key === "string" &&
    typeof x.name === "string" &&
    typeof x.color === "string" &&
    Array.isArray(x.members) &&
    x.members.every((m) => typeof m === "string") &&
    Array.isArray(x.with) &&
    typeof x.owner === "string" &&
    typeof x.t === "number"
  );
}

/** Local circle id for a shared circle key. */
export const localIdOf = (key: string) => `shared:${key}`;

/** Start sharing one of your circles with some friends (or change who). */
export function shareCircle(circleId: string, withIds: string[]) {
  const me = getState().cache.me?.id;
  if (!me) return;
  updateLocal((l) => {
    const sharedCircles = { ...(l.sharedCircles ?? {}) };
    if (!withIds.length) delete sharedCircles[circleId];
    else sharedCircles[circleId] = { with: withIds, owner: sharedCircles[circleId]?.owner ?? me, t: Date.now() };
    return { ...l, sharedCircles };
  });
}

/** Mark a shared circle as changed by you (call after editing its members or name). */
export function touchSharedCircle(circleId: string) {
  updateLocal((l) => {
    const cur = l.sharedCircles?.[circleId];
    if (!cur) return l;
    return { ...l, sharedCircles: { ...l.sharedCircles, [circleId]: { ...cur, t: Date.now() } } };
  });
}

/** Shared circles to put into your outgoing friend list. */
export function outgoingSharedCircles(): SharedCircle[] {
  const s = getState();
  const me = s.cache.me?.id;
  if (!me) return [];
  const out: SharedCircle[] = [];
  for (const [circleId, info] of Object.entries(s.local.sharedCircles ?? {})) {
    const c = s.local.circles.find((x) => x.id === circleId);
    if (!c) continue;
    const key = circleId.startsWith("shared:") ? circleId.slice(7) : `${info.owner}:${circleId}`;
    out.push({ key, name: c.name, color: c.color, members: c.members, with: info.with, owner: info.owner, t: info.t });
  }
  return out;
}

/** Take over newer versions of circles shared with you (from received lists). */
export function mergeSharedCircles(lists: ImportedList[]) {
  const s = getState();
  const me = s.cache.me?.id;
  if (!me) return;
  const incoming = new Map<string, SharedCircle>();
  for (const l of lists) {
    for (const c of l.circles ?? []) {
      // Only from the owner or someone the circle is shared with, and only if it's for you.
      const sender = l.owner.id;
      if (!sender || (sender !== c.owner && !c.with.includes(sender))) continue;
      if (c.owner !== me && !c.with.includes(me)) continue;
      const cur = incoming.get(c.key);
      if (!cur || cur.t < c.t) incoming.set(c.key, c);
    }
  }
  if (!incoming.size) return;
  updateLocal((l) => {
    let circles = l.circles;
    const sharedCircles = { ...(l.sharedCircles ?? {}) };
    let changed = false;
    for (const c of incoming.values()) {
      const localId = c.owner === me ? c.key.split(":").slice(1).join(":") : localIdOf(c.key);
      const mine = sharedCircles[localId];
      if (mine && mine.t >= c.t) continue;
      const existing = circles.find((x) => x.id === localId);
      const next: Circle = { ...(existing ?? { id: localId, hidden: false }), id: localId, name: c.name, color: c.color, members: c.members };
      circles = existing ? circles.map((x) => (x.id === localId ? next : x)) : [...circles, next];
      sharedCircles[localId] = { with: c.with, owner: c.owner, t: c.t };
      changed = true;
    }
    return changed ? { ...l, circles, sharedCircles } : l;
  });
}
