// People on the map besides your friends: you, and (optionally) people who
// aren't friends yet: in your instance right now, met in game logs, or in
// friend lists your friends shared. Their profiles and mutual friends load
// slowly in the background, only for people actually shown.
import { useEffect, useMemo } from "react";
import { queueBlockAsk } from "./inbox";
import { backend, isTauri } from "./backend";
import { othersHere } from "./live";
import { getState, setState, updateCache, useApp } from "./store";
import type { Cache, Friend, MetPerson } from "./types";

export interface OtherInfo {
  /** In your instance right now. */
  here: boolean;
  /** From your game logs: time spent in the same instance. */
  met?: MetPerson;
  /** Friends whose shared friend list includes them. */
  via: string[];
}

export interface Extra {
  /** You, when shown. */
  me: Friend | null;
  /** Friends your picture floats between, with weights. */
  anchors: [string, number][];
  /** Non-friends shown on the map. */
  others: Friend[];
  info: Map<string, OtherInfo>;
  /** Lines between a non-friend and a friend (mutuals, shared lists). */
  otherEdges: [string, string][];
  /** Everyone in your instance (friends and others), not you. */
  here: Set<string>;
}

const MET_MIN_SECS = 30 * 60;
const MET_LIMIT = 40;
const FOF_LIMIT = 80;
const FOF_MIN_LISTS = 2;
const ANCHORS = 6;
const PROFILE_TTL = 7 * 864e5;

function placeholder(id: string, name: string): Friend {
  return {
    id,
    displayName: name || "Someone",
    status: "offline",
    statusDescription: "",
    location: "",
    platform: "",
    last_platform: "",
    last_login: null,
    last_activity: null,
  };
}

/** Anyone the app knows: friends, people who aren't friends, or you. */
export function personOf(cache: Cache, id: string): Friend | undefined {
  return cache.friends[id] ?? cache.others?.[id] ?? (cache.me?.id === id ? (cache.me.profile ?? placeholder(id, cache.me.displayName)) : undefined);
}

export function relationOf(cache: Cache, id: string): "friend" | "me" | "other" {
  if (cache.friends[id]) return "friend";
  if (cache.me?.id === id) return "me";
  return "other";
}

export function useExtra(): Extra {
  const cache = useApp((s) => s.cache);
  const local = useApp((s) => s.local);
  const here = useApp((s) => s.here);
  const met = useApp((s) => s.met);
  const stats = useApp((s) => s.logs.stats);
  const showMe = useApp((s) => s.settings.map.showMe);
  const levelSetting = useApp((s) => s.settings.map.showOthers);
  const showBlocked = useApp((s) => s.settings.people.showBlocked);
  const who = useApp((s) => s.filters.who);
  // The filter overrides Map options: "only friends" shows nobody else, "friends of friends" everyone who qualifies.
  const level = who === "friends" ? "off" : who === "potential" && levelSetting === "off" ? "all" : levelSetting;

  const extra = useMemo<Extra>(() => {
    const friends = cache.friends;
    const myId = cache.me?.id;
    const hereNow = othersHere(here, myId);
    const hereSet = new Set(hereNow.map((p) => p.id));

    // You, between the friends you spend the most time with.
    let me: Friend | null = null;
    let anchors: [string, number][] = [];
    if (showMe && cache.me) {
      me = cache.me.profile ?? placeholder(cache.me.id, cache.me.displayName);
      const byTime = (stats?.people ?? []).filter((p) => friends[p.id] && p.secs > 0).sort((a, b) => b.secs - a.secs);
      anchors = byTime.slice(0, ANCHORS).map((p) => [p.id, p.secs]);
      if (!anchors.length) {
        anchors = Object.entries(cache.mutuals)
          .filter(([id]) => friends[id])
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, ANCHORS)
          .map(([id, m]) => [id, Math.max(1, m.count)]);
      }
    }

    const info = new Map<string, OtherInfo>();
    const names = new Map<string, string>();
    const add = (id: string, name: string) => {
      if (!id || friends[id] || id === myId || id === here?.localId) return null;
      if (!showBlocked && isBlocked(cache, id)) return null;
      if (!info.has(id)) info.set(id, { here: false, via: [] });
      if (name && !names.has(id)) names.set(id, name);
      return info.get(id)!;
    };
    if (level !== "off")
      for (const p of hereNow) {
        const i = add(p.id, p.name);
        if (i) i.here = true;
      }
    if (level === "met" || level === "all")
      for (const m of met.slice(0, MET_LIMIT)) {
        const i = add(m.id, m.name);
        if (i) i.met = m;
      }
    if (level === "all") {
      // Friends of friends from shared lists: people at least two friends list.
      const listers = new Map<string, Set<string>>();
      for (const list of local.imports) {
        const owner = list.owner.id;
        if (!owner || !friends[owner] || list.mode !== "full") continue;
        for (const f of list.friends ?? []) {
          if (friends[f.id] || f.id === myId) continue;
          if (!listers.has(f.id)) listers.set(f.id, new Set());
          listers.get(f.id)!.add(owner);
          if (f.displayName && !names.has(f.id)) names.set(f.id, f.displayName);
        }
      }
      [...listers.entries()]
        .filter(([, s]) => s.size >= FOF_MIN_LISTS)
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, FOF_LIMIT)
        .forEach(([id, s]) => {
          const i = add(id, names.get(id) ?? "");
          if (i) i.via = [...s];
        });
    }

    // Only people who share at least one friend with you (from VRChat or a shared list).
    if (who === "potential")
      for (const [id, i] of [...info]) if (!i.via.length && !(cache.mutuals[id]?.ids ?? []).some((f) => friends[f])) info.delete(id);
    const others = [...info.keys()].map((id) => cache.others?.[id] ?? placeholder(id, names.get(id) ?? ""));
    const edges = new Set<string>();
    const otherEdges: [string, string][] = [];
    const link = (o: string, f: string) => {
      const k = `${o}|${f}`;
      if (!friends[f] || edges.has(k)) return;
      edges.add(k);
      otherEdges.push([o, f]);
    };
    for (const [id, i] of info) {
      for (const f of cache.mutuals[id]?.ids ?? []) link(id, f);
      for (const f of i.via) link(id, f);
    }
    return { me, anchors, others, info, otherEdges, here: hereSet };
  }, [cache.friends, cache.others, cache.mutuals, cache.me, cache.moderations, local.imports, here, met, stats, showMe, level, showBlocked, who]);

  // Load profiles (and mutuals) of the people shown; in your instance first.
  useEffect(() => {
    const ids = [...extra.info.entries()].sort((a, b) => Number(b[1].here) - Number(a[1].here)).map(([id]) => id);
    wantProfiles(ids);
  }, [extra.info]);

  // Your blocks, to leave blocked people out (or mark them).
  useEffect(() => {
    if (level !== "off") void refreshModerations();
  }, [level]);

  // People from the game logs, when that level is on.
  useEffect(() => {
    if (level === "met" || level === "all") refreshMet();
  }, [level, stats]);

  return extra;
}

// ---------- background loading ----------

const queue: string[] = [];
const queued = new Set<string>();
let working = false;
let loadedThisSession = 0;
const SESSION_CAP = 200;
const GAP_MS = 2500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ask for these people's profiles; already-fresh ones are skipped. */
export function wantProfiles(ids: string[]) {
  const s = getState();
  if (!isTauri || s.demo) return;
  for (const id of ids) {
    if (queued.has(id) || s.cache.friends[id]) continue;
    const have = s.cache.others?.[id];
    if (have && Date.now() - have.fetchedAt < PROFILE_TTL) continue;
    queued.add(id);
    queue.push(id);
  }
  if (!working) void work();
}

async function work() {
  working = true;
  try {
    while (queue.length && loadedThisSession < SESSION_CAP) {
      const s = getState();
      if (s.mode !== "app" || s.demo) break;
      const id = queue.shift()!;
      queued.delete(id);
      await loadOne(id);
      loadedThisSession++;
      await sleep(GAP_MS);
    }
  } finally {
    working = false;
  }
}

async function get(path: string, query?: Record<string, string | number | boolean>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await backend.vrcGet(path, query);
    if (r.status !== 429) return r;
    await sleep((r.retry_after ?? 30) * 1000);
  }
  return null;
}

async function loadOne(id: string) {
  try {
    const r = await get(`/users/${encodeURIComponent(id)}`);
    if (!r || r.status !== 200 || !r.data?.id) return;
    const d = r.data;
    const person: Friend & { fetchedAt: number } = {
      ...placeholder(id, d.displayName),
      status: d.status ?? "offline",
      statusDescription: d.statusDescription ?? "",
      location: typeof d.location === "string" ? d.location : "",
      last_platform: d.last_platform ?? "",
      platform: d.platform ?? d.last_platform ?? "",
      last_login: d.last_login ?? null,
      last_activity: d.last_activity ?? null,
      iconUrl: d.iconUrl,
      bannerUrl: d.bannerUrl,
      currentAvatarImageUrl: d.currentAvatarImageUrl,
      currentAvatarThumbnailImageUrl: d.currentAvatarThumbnailImageUrl,
      profilePicOverride: d.profilePicOverride,
      userIcon: d.userIcon,
      developerType: d.developerType,
      tags: d.tags ?? [],
      fetchedAt: Date.now(),
    };
    updateCache((c) => ({ ...c, others: { ...(c.others ?? {}), [id]: person } }));
    // Mutual friends with you, where they allow it (one page is plenty here).
    await sleep(GAP_MS);
    const m = await get(`/users/${encodeURIComponent(id)}/mutuals/friends`, { n: 100, offset: 0 });
    if (!m) return;
    const hidden = m.status === 403 || m.status === 400 || m.status === 404;
    const ids = !hidden && Array.isArray(m.data) ? (m.data as { id: string }[]).map((x) => x.id).filter(Boolean) : [];
    updateCache((c) => ({ ...c, mutuals: { ...c.mutuals, [id]: { ids, count: ids.length, hidden, fetchedAt: Date.now() } } }));
  } catch {
    // try again next session
  }
}

let metAt = 0;

/** Non-friends from the game logs, by time spent with you. */
export async function refreshMet(force = false) {
  const s = getState();
  if (!isTauri || s.demo || (!force && Date.now() - metAt < 60_000)) return;
  metAt = Date.now();
  const exclude = [...Object.keys(s.cache.friends), ...(s.cache.me ? [s.cache.me.id] : [])];
  try {
    const met = await backend.logsMet({ exclude, min_secs: MET_MIN_SECS, limit: MET_LIMIT });
    setState({ met });
  } catch {
    /* logs off */
  }
}

/** Your friend status with someone: friends, request sent, they asked you. */
/** `account` (here and below): one of your extra accounts to act as; left out: the main one. */
export async function friendStatus(id: string, account?: string): Promise<{ isFriend: boolean; outgoing: boolean; incoming: boolean } | null> {
  if (!isTauri || getState().demo) return null;
  try {
    const r = await backend.friendStatus(id, account);
    if (r.status !== 200 || typeof r.data !== "object" || !r.data) return null;
    return { isFriend: !!r.data.isFriend, outgoing: !!r.data.outgoingRequest, incoming: !!r.data.incomingRequest };
  } catch {
    return null;
  }
}

/** Send or cancel one friend request. Returns an error message, or null. */
export async function setFriendRequest(id: string, send: boolean, account?: string): Promise<string | null> {
  if (getState().demo) return "Not in demo mode.";
  try {
    const r = await backend.friendRequest(id, !send, account);
    if (r.status >= 200 && r.status < 300) return null;
    if (r.status === 429) return "VRChat says: too many requests. Try again in a while.";
    const msg = typeof r.data === "object" && r.data ? (r.data.error?.message ?? r.data.message) : undefined;
    return `VRChat said no (${r.status})${msg ? `: ${msg}` : ""}`;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

// ---------- blocks, mutes, hidden avatars ----------

const MODERATION_TTL = 10 * 60_000;
let moderationsLoading: Promise<void> | null = null;

export function moderationsOf(cache: Cache, id: string): string[] {
  return cache.moderations?.byUser[id] ?? [];
}

/** A name for anyone: friend, someone whose profile was loaded, or from your blocks/mutes. */
export function displayNameOf(cache: Cache, id: string): string | undefined {
  return cache.friends[id]?.displayName ?? cache.others?.[id]?.displayName ?? cache.moderations?.names?.[id];
}

export function isBlocked(cache: Cache, id: string): boolean {
  return moderationsOf(cache, id).includes("block");
}

/** Your player moderations (blocks, mutes, ...), at most every 10 minutes unless forced. */
export function refreshModerations(force = false): Promise<void> {
  const s = getState();
  if (!isTauri || s.demo || s.mode !== "app") return Promise.resolve();
  if (!force && s.cache.moderations && Date.now() - s.cache.moderations.fetchedAt < MODERATION_TTL) return Promise.resolve();
  moderationsLoading ??= (async () => {
    try {
      const r = await get("/auth/user/playermoderations");
      if (!r || r.status !== 200 || !Array.isArray(r.data)) return;
      const byUser: Record<string, string[]> = {};
      const names: Record<string, string> = {};
      const blockedAt: Record<string, string> = {};
      for (const m of r.data as { type?: string; targetUserId?: string; targetDisplayName?: string; created?: string }[]) {
        if (!m?.targetUserId || !m.type) continue;
        (byUser[m.targetUserId] ??= []).push(m.type);
        if (typeof m.targetDisplayName === "string" && m.targetDisplayName) names[m.targetUserId] = m.targetDisplayName;
        if (m.type === "block" && typeof m.created === "string") blockedAt[m.targetUserId] = m.created;
      }
      // Blocks made in game since last time: ask why (only after the first load).
      const before = getState().cache.moderations;
      if (before) {
        const fresh = Object.entries(byUser)
          .filter(([id, kinds]) => kinds.includes("block") && !(before.byUser[id] ?? []).includes("block") && !getState().local.blockReasons?.[id])
          .map(([id]) => id);
        if (fresh.length) queueBlockAsk(fresh, names);
      }
      updateCache((c) => ({ ...c, moderations: { byUser, fetchedAt: Date.now(), names: { ...(c.moderations?.names ?? {}), ...names }, blockedAt } }));
    } catch {
      /* try again later */
    } finally {
      moderationsLoading = null;
    }
  })();
  return moderationsLoading;
}

function vrcError(r: { status: number; data: unknown }): string {
  if (r.status === 429) return "VRChat says: too many requests. Try again in a while.";
  const d = r.data as { error?: { message?: string }; message?: string } | null;
  const msg = typeof d === "object" && d ? (d.error?.message ?? d.message) : undefined;
  return `VRChat said no (${r.status})${msg ? `: ${String(msg).replace(/^"|"$/g, "")}` : ""}`;
}

/** Block, mute, hide their avatar, or undo it. Returns an error message, or null. */
export async function setModeration(id: string, kind: "block" | "mute" | "hideAvatar", on: boolean, account?: string): Promise<string | null> {
  if (getState().demo) return "Not in demo mode.";
  try {
    const r = await backend.moderateUser(id, kind, !on, account);
    if (r.status < 200 || r.status >= 300) return vrcError(r);
    // The cached blocks and mutes are the main account's.
    if (account) return null;
    updateCache((c) => {
      const byUser = { ...(c.moderations?.byUser ?? {}) };
      const cur = new Set(byUser[id] ?? []);
      if (on) cur.add(kind);
      else cur.delete(kind);
      byUser[id] = [...cur];
      const name = c.friends[id]?.displayName ?? c.others?.[id]?.displayName;
      const names = name ? { ...(c.moderations?.names ?? {}), [id]: name } : c.moderations?.names;
      const blockedAt = { ...(c.moderations?.blockedAt ?? {}) };
      if (kind === "block") {
        if (on) blockedAt[id] = new Date().toISOString();
        else delete blockedAt[id];
      }
      return { ...c, moderations: { ...c.moderations, byUser, fetchedAt: c.moderations?.fetchedAt ?? 0, names, blockedAt } };
    });
    if (kind === "block" && on) queueBlockAsk([id], { [id]: displayNameOf(getState().cache, id) });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Remove a friend. Returns an error message, or null. */
export async function unfriend(id: string, account?: string): Promise<string | null> {
  if (getState().demo) return "Not in demo mode.";
  try {
    const r = await backend.unfriend(id, account);
    if (r.status < 200 || r.status >= 300) return vrcError(r);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** One of your extra accounts' blocks, mutes and hidden avatars, by user (one request). */
export async function accountModerations(account: string): Promise<Record<string, string[]>> {
  const r = await backend.vrcGet("/auth/user/playermoderations", undefined, account);
  const byUser: Record<string, string[]> = {};
  if (r.status === 200 && Array.isArray(r.data))
    for (const m of r.data as { type?: string; targetUserId?: string }[]) if (m?.targetUserId && m.type) (byUser[m.targetUserId] ??= []).push(m.type);
  return byUser;
}
