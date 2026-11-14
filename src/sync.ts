// Sync engine: pulls data from the VRChat API through the Rust client, which
// spaces requests out (>= 1 s apart) and backs off on 429. Profiles and mutuals
// are cached and only refetched when older than the configured age.
import { noteFriend } from "./activity";
import { addNewFriendsToPicks } from "./selection";
import { notifyEvent, removedByMe } from "./notifications";
import { backend, type ApiResponse } from "./backend";
import { celebrateNewFriends } from "./notify";
import { getState, resetSync, setState, setSync, showToast, updateCache, updateLocal } from "./store";
import type { Friend, Me, MutualInfo, Presence, UserDetail } from "./types";

class SessionExpired extends Error {}

let generation = 0; // bumps on logout/stop so running loops bail out

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api(path: string, query?: Record<string, string | number | boolean>): Promise<ApiResponse> {
  const gen = generation;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (gen !== generation) throw new Error("stopped");
    const r = await backend.vrcGet(path, query);
    if (r.status === 429) {
      const wait = (r.retry_after ?? 30) * 1000;
      setSync({ backoffUntil: Date.now() + wait, message: "VRChat asked us to slow down, waiting…" });
      continue; // the Rust side holds the next request until the backoff ends
    }
    if (r.status === 401) throw new SessionExpired("Your VRChat session expired. Log in again.");
    if (r.status >= 500) {
      await sleep(4000 * (attempt + 1));
      continue;
    }
    if (getState().sync.backoffUntil) setSync({ backoffUntil: 0, message: "" });
    return r;
  }
  throw new Error(`VRChat API kept failing for ${path}`);
}

async function waitWhilePaused(gen: number) {
  while (getState().sync.paused && gen === generation) await sleep(400);
}

function handleError(e: unknown) {
  if (e instanceof SessionExpired) {
    stopSync();
    setState({ mode: "login", session: null, loginMessage: e.message });
    return;
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === "stopped") return;
  setSync({ error: msg, running: false });
}

// ---------- individual fetches ----------

async function fetchMe(): Promise<Me> {
  const r = await api("/auth/user");
  const d = r.data;
  if (r.status !== 200 || !d?.id) throw new SessionExpired("Your VRChat session needs a fresh login.");
  const me: Me = {
    id: d.id,
    displayName: d.displayName,
    friends: d.friends ?? [],
    onlineFriends: d.onlineFriends ?? [],
    activeFriends: d.activeFriends ?? [],
    offlineFriends: d.offlineFriends ?? [],
    iconUrl: d.iconUrl || d.userIcon || d.currentAvatarThumbnailImageUrl,
    profile: {
      id: d.id,
      displayName: d.displayName,
      status: d.status ?? "active",
      statusDescription: d.statusDescription ?? "",
      location: typeof d.location === "string" ? d.location : "",
      platform: d.last_platform ?? "",
      last_platform: d.last_platform ?? "",
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
    },
  };
  updateCache((c) => ({ ...c, me }));
  return me;
}

async function fetchFriendPages(offline: boolean, gen: number): Promise<Friend[]> {
  const out: Friend[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    if (gen !== generation) throw new Error("stopped");
    const r = await api("/auth/user/friends", { offline, n: 100, offset });
    const page: Friend[] = Array.isArray(r.data) ? r.data : [];
    out.push(...page);
    setSync({ message: `Loading ${offline ? "offline" : "online"} friends… ${out.length}` });
    if (page.length < 100) break;
  }
  return out;
}

async function fetchFriends(me: Me, gen: number) {
  setSync({ phase: "Friends list", message: "Loading friends…" });
  const online = await fetchFriendPages(false, gen);
  const offline = await fetchFriendPages(true, gen);
  const onlineSet = new Set(me.onlineFriends);
  const activeSet = new Set(me.activeFriends);
  const now = Date.now();
  const prevFriends = getState().cache.friends;

  updateCache((c) => {
    const friends: Record<string, Friend> = {};
    const presence: Record<string, Presence> = {};
    const fromList = new Map<string, [Friend, boolean]>();
    online.forEach((f) => fromList.set(f.id, [f, false]));
    offline.forEach((f) => fromList.set(f.id, [f, true]));
    const ids = me.friends.length ? me.friends : [...fromList.keys()];
    for (const id of ids) {
      const hit = fromList.get(id);
      const f = hit?.[0] ?? c.friends[id];
      if (!f) continue;
      friends[id] = f;
      if (onlineSet.has(id)) presence[id] = "online";
      else if (activeSet.has(id)) presence[id] = "web";
      else if (hit) presence[id] = hit[1] ? "offline" : f.location === "offline" || f.platform === "web" ? "web" : "online";
      else presence[id] = "offline";
    }
    return { ...c, friends, presence, lastFriendsSync: now };
  });

  recordFriendChanges(Object.keys(getState().cache.friends), prevFriends);
}

/** Keep a small log of friends added and removed since the first sync. */
/** Was this person in my instance right now, or did they leave it in the last 10 minutes? (game log) */
function wasWithMe(id: string, now: number): boolean {
  const s = getState();
  if (s.here?.active && s.here.players.some((p) => p.id === id)) return true;
  return s.activity.some((e) => e.userId === id && (e.kind === "leave" || e.kind === "join") && now - e.t < 10 * 60_000);
}

/** Returns the new friends a notification was shown for. */
export function recordFriendChanges(current: string[], prevFriends: Record<string, Friend>): Set<string> {
  const now = Date.now();
  const before = getState().local;
  const notified = new Set<string>();
  if (before.logSince) {
    const prevIds = new Set(before.lastFriendIds);
    const added = current.filter((id) => !prevIds.has(id));
    celebrateNewFriends(added);
    addNewFriendsToPicks(added);
    const friends = getState().cache.friends;
    for (const id of added.slice(0, 5)) if (notifyEvent("added", id, friends[id]?.displayName ?? "Someone")) notified.add(id);
  }
  updateLocal((l) => {
    const firstRun = !l.logSince;
    const prev = new Set(l.lastFriendIds);
    const cur = new Set(current);
    const log = [...l.friendLog];
    if (!firstRun) {
      for (const id of current) {
        if (!prev.has(id)) log.push({ t: now, id, name: getState().cache.friends[id]?.displayName ?? id, type: "added" });
      }
      for (const id of prev) {
        if (!cur.has(id)) log.push({ t: now, id, name: prevFriends[id]?.displayName ?? id, type: "removed", byMe: removedByMe.has(id), together: wasWithMe(id, now) });
      }
    }
    return { ...l, logSince: l.logSince || now, lastFriendIds: current, friendLog: log.slice(-500) };
  });
  return notified;
}

async function fetchFavorites() {
  setSync({ phase: "Favorites", message: "Loading favorite groups…" });
  const groupsRes = await api("/favorite/groups", { type: "friend", n: 50 });
  const groups: { name: string; displayName: string }[] = Array.isArray(groupsRes.data) ? groupsRes.data : [];
  const names = new Map(groups.map((g) => [g.name, g.displayName || g.name]));
  const favorites: Record<string, string[]> = {};
  for (let offset = 0; offset < 2000; offset += 100) {
    const r = await api("/favorites", { type: "friend", n: 100, offset });
    const page: { favoriteId: string; tags: string[] }[] = Array.isArray(r.data) ? r.data : [];
    for (const fav of page) {
      favorites[fav.favoriteId] = (fav.tags ?? []).map((t) => names.get(t) ?? t);
    }
    if (page.length < 100) break;
  }
  updateCache((c) => ({ ...c, favorites }));
}

async function fetchDetail(id: string) {
  const r = await api(`/users/${encodeURIComponent(id)}`);
  if (r.status !== 200 || !r.data?.id) return;
  const d = r.data;
  const detail: UserDetail = {
    tags: d.tags ?? [],
    date_joined: d.date_joined,
    pronouns: d.pronouns,
    note: d.note,
    ...profileFields(d),
    ageVerified: d.ageVerificationStatus === "18+" || d.ageVerified === true,
    fetchedAt: Date.now(),
  };
  updateCache((c) => {
    const friend = c.friends[id];
    const merged = friend
      ? {
          ...friend,
          developerType: d.developerType ?? friend.developerType,
          iconUrl: friend.iconUrl || d.iconUrl,
          bannerUrl: friend.bannerUrl || d.bannerUrl,
          bannerColor: friend.bannerColor || d.bannerColor,
        }
      : friend;
    // Bio, links, badges and languages now come from /profile/{id}: keep what that gave.
    const prev = c.details[id];
    const kept = prev ? { bio: prev.bio, bioLinks: prev.bioLinks, badges: prev.badges, languages: prev.languages, profileFetchedAt: prev.profileFetchedAt } : {};
    const next: UserDetail = { ...kept, ...detail };
    return { ...c, details: { ...c.details, [id]: next }, friends: merged ? { ...c.friends, [id]: merged } : c.friends };
  });
}

/** Bio, links, badges and languages, from whichever response has them
 *  (/profile/{id} since VRChat's 2026 change; older /users/{id} answers too).
 *  Fields the response doesn't have are left out, so they don't wipe cached ones. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function profileFields(d: any): Partial<UserDetail> {
  const out: Partial<UserDetail> = {};
  if (typeof d.bio === "string") out.bio = d.bio;
  if (Array.isArray(d.bioLinks)) out.bioLinks = d.bioLinks.filter((x: unknown) => typeof x === "string" && x);
  if (Array.isArray(d.languages)) out.languages = d.languages.filter((x: unknown) => typeof x === "string" && x);
  if (Array.isArray(d.badges))
    out.badges = d.badges
          .filter((b: { badgeImageUrl?: string }) => b && b.badgeImageUrl)
          .map((b: { badgeId?: string; badgeName?: string; badgeDescription?: string; badgeImageUrl: string; showcased?: boolean }) => ({
            id: b.badgeId ?? b.badgeImageUrl,
            name: b.badgeName ?? "Badge",
            description: b.badgeDescription,
            imageUrl: b.badgeImageUrl,
            showcased: b.showcased,
          }));
  return out;
}

/** The profile half of a person (bio, links, badges, languages): GET /profile/{id}. */
export async function fetchProfile(id: string) {
  const r = await api(`/profile/${encodeURIComponent(id)}`);
  if (r.status !== 200 || !r.data) return;
  const d = r.data;
  const fields = profileFields(d);
  updateCache((c) => {
    const prev = c.details[id] ?? { tags: [], fetchedAt: 0 };
    const friend = c.friends[id];
    const merged = friend
      ? { ...friend, iconUrl: d.iconUrl || friend.iconUrl, bannerUrl: d.bannerUrl || friend.bannerUrl, bannerColor: d.bannerColor || friend.bannerColor }
      : friend;
    return {
      ...c,
      details: {
        ...c.details,
        [id]: {
          ...prev,
          ...fields,
          pronouns: typeof d.pronouns === "string" ? d.pronouns : prev.pronouns,
          ageVerified: d.ageVerificationStatus ? d.ageVerificationStatus === "18+" || d.ageVerified === true : prev.ageVerified,
          profileFetchedAt: Date.now(),
        },
      },
      friends: merged ? { ...c.friends, [id]: merged } : c.friends,
    };
  });
}

async function fetchMutuals(id: string, gen: number) {
  const ids: string[] = [];
  let hidden = false;
  for (let offset = 0; offset < 1000; offset += 100) {
    if (gen !== generation) throw new Error("stopped");
    const r = await api(`/users/${encodeURIComponent(id)}/mutuals/friends`, { n: 100, offset });
    if (r.status === 403 || r.status === 400 || r.status === 404) {
      hidden = true;
      break;
    }
    const page: { id: string }[] = Array.isArray(r.data) ? r.data : [];
    ids.push(...page.map((m) => m.id).filter(Boolean));
    if (page.length < 100) break;
  }
  const info: MutualInfo = { ids, count: ids.length, hidden, fetchedAt: Date.now() };
  updateCache((c) => ({ ...c, mutuals: { ...c.mutuals, [id]: info } }));
}

// ---------- orchestration ----------

function staleIds(kind: "details" | "mutuals"): string[] {
  const s = getState();
  const ttl = (kind === "details" ? s.settings.detailTtlDays : s.settings.mutualTtlDays) * 864e5;
  const now = Date.now();
  const rank = (id: string) => (s.cache.presence[id] === "online" ? 0 : s.cache.presence[id] === "web" ? 1 : 2);
  return Object.keys(s.cache.friends)
    .filter((id) => {
      const entry = s.cache[kind][id];
      // Spread refreshes out a little so they don't all expire on the same day.
      const jitter = ((id.charCodeAt(id.length - 1) % 10) / 10) * 864e5;
      return !entry || now - entry.fetchedAt > ttl + jitter;
    })
    .sort((a, b) => rank(a) - rank(b));
}

async function drainQueue(kind: "details" | "mutuals", gen: number) {
  const ids = staleIds(kind);
  if (!ids.length) return;
  const label = kind === "details" ? "Profiles (trust rank, join date)" : "Mutual friends";
  setSync({ phase: label, done: 0, total: ids.length, message: "" });
  for (let i = 0; i < ids.length; i++) {
    await waitWhilePaused(gen);
    if (gen !== generation) throw new Error("stopped");
    const id = ids[i];
    if (!getState().cache.friends[id]) continue;
    if (kind === "details") await fetchDetail(id);
    else await fetchMutuals(id, gen);
    setSync({ done: i + 1, message: getState().cache.friends[id]?.displayName ?? "" });
  }
}

export async function syncAll(opts: { friendsOnly?: boolean } = {}) {
  const s = getState();
  if (s.demo || s.sync.running) return;
  const gen = ++generation;
  setSync({ running: true, error: "", paused: false, done: 0, total: 0 });
  try {
    const me = await fetchMe();
    await fetchFriends(me, gen);
    if (!opts.friendsOnly) {
      await fetchFavorites();
      await drainQueue("details", gen);
      await drainQueue("mutuals", gen);
    }
    if (gen === generation) {
      resetSync();
      setSync({ message: `Updated ${new Date().toLocaleTimeString()}` });
    }
  } catch (e) {
    handleError(e);
  }
}

const groupsLoading = new Set<string>();
const profileLoading = new Set<string>();

/** When a profile is opened: reload it if it's missing fields newer versions
 *  show (links, badges, 18+), or is more than a day old. One request. */
export async function freshenProfile(id: string) {
  const s = getState();
  if (s.demo || profileLoading.has(id)) return;
  const d = s.cache.details[id];
  const userFresh = !!d && d.ageVerified !== undefined && Date.now() - d.fetchedAt < 86400000;
  const profileFresh = !!d?.profileFetchedAt && Date.now() - d.profileFetchedAt < 86400000;
  if (userFresh && profileFresh) return;
  profileLoading.add(id);
  try {
    if (!userFresh) await fetchDetail(id);
    if (!profileFresh) await fetchProfile(id).catch(() => {});
  } catch {
    // shown as-is
  } finally {
    profileLoading.delete(id);
  }
}

const worldLoading = new Set<string>();

/** World name/picture for a location, cached a week. */
export async function loadWorld(worldId: string) {
  const s = getState();
  if (s.demo || !worldId.startsWith("wrld_") || worldLoading.has(worldId)) return;
  const have = s.cache.worlds?.[worldId];
  if (have && Date.now() - have.fetchedAt < 7 * 86400000) return;
  worldLoading.add(worldId);
  try {
    const r = await backend.vrcGet(`/worlds/${encodeURIComponent(worldId)}`);
    if (r.status !== 200 || !r.data?.id) return;
    const w = r.data;
    const info = { id: worldId, name: String(w.name ?? "World"), imageUrl: w.imageUrl, thumbnailImageUrl: w.thumbnailImageUrl, capacity: w.capacity, authorName: w.authorName, fetchedAt: Date.now() };
    updateCache((c) => ({ ...c, worlds: { ...(c.worlds ?? {}), [worldId]: info } }));
  } catch {
    // the card shows the world id instead
  } finally {
    worldLoading.delete(worldId);
  }
}

/** How many people are in an instance right now (not cached). */
export async function loadInstance(location: string): Promise<{ users: number; capacity?: number } | null> {
  if (getState().demo || !location.startsWith("wrld_") || !/^[A-Za-z0-9_\-:~().,]+$/.test(location)) return null;
  try {
    // VRChat expects the location as-is in the path (world:instance~tags).
    const r = await backend.vrcGet(`/instances/${location}`);
    if (r.status !== 200 || !r.data) return null;
    const users = typeof r.data.n_users === "number" ? r.data.n_users : typeof r.data.userCount === "number" ? r.data.userCount : NaN;
    return Number.isFinite(users) ? { users, capacity: r.data.capacity } : null;
  } catch {
    return null;
  }
}

/** Load someone's VRChat groups for their profile (one request, cached a week). */
export async function loadGroups(id: string, force = false) {
  const s = getState();
  if (s.demo || groupsLoading.has(id)) return;
  const have = s.cache.groups?.[id];
  if (!force && have && Date.now() - have.fetchedAt < 7 * 86400000) return;
  groupsLoading.add(id);
  try {
    const r = await backend.vrcGet(`/users/${encodeURIComponent(id)}/groups`);
    const ok = r.status === 200 && Array.isArray(r.data);
    const list = ok
      ? (r.data as Record<string, unknown>[]).map((g) => ({
          groupId: String(g.groupId ?? g.id ?? ""),
          name: String(g.name ?? "Group"),
          iconUrl: typeof g.iconUrl === "string" ? g.iconUrl : undefined,
          bannerUrl: typeof g.bannerUrl === "string" ? g.bannerUrl : undefined,
          description: typeof g.description === "string" ? g.description : undefined,
          shortCode: typeof g.shortCode === "string" ? g.shortCode : undefined,
          discriminator: typeof g.discriminator === "string" ? g.discriminator : undefined,
          memberCount: typeof g.memberCount === "number" ? g.memberCount : undefined,
          isRepresenting: !!g.isRepresenting,
          mutual: !!g.mutualGroup,
        }))
      : [];
    if (r.status === 401 || r.status === 429 || r.status >= 500) return;
    updateCache((c) => ({ ...c, groups: { ...(c.groups ?? {}), [id]: { list, hidden: !ok, fetchedAt: Date.now() } } }));
  } catch {
    // Not important enough to bother the user; the profile just shows no groups.
  } finally {
    groupsLoading.delete(id);
  }
}

export async function refreshPerson(id: string) {
  const s = getState();
  if (s.demo) return;
  if (s.sync.running) {
    // Mark stale so the running queue picks it up.
    updateCache((c) => {
      const details = { ...c.details };
      const mutuals = { ...c.mutuals };
      if (details[id]) details[id] = { ...details[id], fetchedAt: 0 };
      if (mutuals[id]) mutuals[id] = { ...mutuals[id], fetchedAt: 0 };
      return { ...c, details, mutuals };
    });
    return;
  }
  const gen = ++generation;
  setSync({ running: true, phase: "Refreshing", message: s.cache.friends[id]?.displayName ?? "", error: "" });
  try {
    await fetchDetail(id);
    // The profile half (bio, links) shouldn't take the rest of the refresh down with it.
    await fetchProfile(id).catch(() => {});
    await fetchMutuals(id, gen);
    resetSync();
  } catch (e) {
    handleError(e);
  }
}

export function stopSync() {
  generation++;
  resetSync();
}

export function togglePause() {
  setSync({ paused: !getState().sync.paused });
}

let autoTimer: ReturnType<typeof setInterval> | null = null;

/** Background refresh while the app is visible: every ~5 minutes without the
 *  live connection, every ~30 minutes with it (just to catch anything missed). */
export function startAutoRefresh() {
  if (autoTimer) return;
  const gap = () => (getState().live.connected ? 30 : 5) * 60e3 + Math.random() * 90e3;
  let nextAt = Date.now() + gap();
  autoTimer = setInterval(() => {
    const s = getState();
    if (s.demo || s.mode !== "app" || !s.settings.autoRefresh || s.sync.running) return;
    if (document.visibilityState !== "visible") return;
    if (Date.now() < nextAt) return;
    nextAt = Date.now() + gap();
    // Status refresh, then pick up any profiles/mutuals that went stale.
    syncAll();
  }, 15e3);
}

// ---------- live events from VRChat's WebSocket pipeline ----------

const IMAGE_AND_PROFILE_FIELDS = [
  "displayName",
  "status",
  "statusDescription",
  "location",
  "platform",
  "last_platform",
  "last_login",
  "last_activity",
  "last_mobile",
  "iconUrl",
  "bannerUrl",
  "bannerColor",
  "currentAvatarImageUrl",
  "currentAvatarThumbnailImageUrl",
  "profilePicOverride",
  "userIcon",
  "developerType",
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergeUser(prev: Friend | undefined, u: any, id: string): Friend {
  const base: Friend = prev ?? {
    id,
    displayName: id,
    status: "offline",
    statusDescription: "",
    location: "offline",
    platform: "",
    last_platform: "",
    last_login: null,
    last_activity: null,
  };
  const next: Friend = { ...base, id };
  if (u && typeof u === "object") {
    for (const k of IMAGE_AND_PROFILE_FIELDS) {
      if (u[k] !== undefined && u[k] !== null) (next as unknown as Record<string, unknown>)[k] = u[k];
    }
  }
  return next;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function presenceFromUser(u: any): Presence | null {
  if (u?.state === "online") return "online";
  if (u?.state === "active") return "web";
  if (u?.state === "offline") return "offline";
  return null;
}

/** Apply one event from the live connection to the local cache. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyPipelineEvent(type: string, content: any) {
  const s = getState();
  if (s.demo || !content || typeof content.userId !== "string") return;
  const id: string = content.userId;
  const now = new Date().toISOString();
  const known = !!s.cache.friends[id];

  switch (type) {
    case "friend-add": {
      const prevFriends = s.cache.friends;
      const friend = mergeUser(prevFriends[id], content.user, id);
      const u = content.user ?? {};
      updateCache((c) => ({
        ...c,
        friends: { ...c.friends, [id]: friend },
        presence: { ...c.presence, [id]: presenceFromUser(u) ?? (friend.location !== "offline" ? "online" : "offline") },
        // Merge (the event's user object is partial) and mark stale so the full profile is loaded.
        details: Array.isArray(u.tags)
          ? {
              ...c.details,
              [id]: {
                ...c.details[id],
                tags: u.tags,
                date_joined: u.date_joined ?? c.details[id]?.date_joined,
                pronouns: u.pronouns ?? c.details[id]?.pronouns,
                bio: u.bio ?? c.details[id]?.bio,
                note: u.note ?? c.details[id]?.note,
                fetchedAt: 0,
              },
            }
          : c.details,
        me: c.me && !c.me.friends.includes(id) ? { ...c.me, friends: [...c.me.friends, id] } : c.me,
      }));
      const notified = recordFriendChanges(Object.keys(getState().cache.friends), prevFriends);
      noteFriend("friend-add", id, friend.displayName);
      if (!notified.has(id)) showToast(`${friend.displayName} is now your friend`);
      refreshPerson(id); // load their mutual friends so lines appear
      return;
    }
    case "friend-delete": {
      if (!known) return;
      const prevFriends = s.cache.friends;
      const name = prevFriends[id]?.displayName ?? "Someone";
      updateCache((c) => {
        const friends = { ...c.friends };
        const presence = { ...c.presence };
        delete friends[id];
        delete presence[id];
        const me = c.me ? { ...c.me, friends: c.me.friends.filter((x) => x !== id) } : c.me;
        return { ...c, friends, presence, me };
      });
      recordFriendChanges(Object.keys(getState().cache.friends), prevFriends);
      if (getState().selectedId === id) setState({ selectedId: null });
      noteFriend("friend-remove", id, name);
      if (!notifyEvent("removed", id, name)) showToast(`${name} is no longer on your friends list`);
      return;
    }
    case "friend-online":
    case "friend-active":
    case "friend-offline":
    case "friend-update":
    case "friend-location": {
      if (!known) return;
      {
        const name = content.user?.displayName ?? s.cache.friends[id]?.displayName ?? id;
        const wasOnline = (s.cache.presence[id] ?? "offline") === "online";
        if (type === "friend-online" && !wasOnline) {
          noteFriend("online", id, name);
          notifyEvent("online", id, name);
        } else if (type === "friend-offline" && (s.cache.presence[id] ?? "offline") !== "offline") {
          noteFriend("offline", id, name);
          notifyEvent("offline", id, name);
        }
        else if (type === "friend-location" && typeof content.location === "string" && content.location !== s.cache.friends[id]?.location && content.location.startsWith("wrld_")) {
          noteFriend("location", id, name, { location: content.location, worldId: content.location.split(":")[0], worldName: content.world?.name });
        }
      }
      updateCache((c) => {
        const prev = c.friends[id];
        let friend = mergeUser(prev, content.user, id);
        let presence: Presence = c.presence[id] ?? "offline";
        if (type === "friend-online") {
          presence = "online";
          friend = { ...friend, platform: content.platform ?? friend.platform, location: content.location ?? friend.location, last_login: now };
        } else if (type === "friend-active") {
          presence = "web";
          friend = { ...friend, platform: content.platform ?? "web" };
        } else if (type === "friend-offline") {
          presence = "offline";
          friend = { ...friend, status: "offline", location: "offline", last_activity: now, last_platform: content.platform || friend.last_platform };
        } else if (type === "friend-location") {
          presence = content.location === "offline" ? presence : "online";
          friend = { ...friend, location: content.location ?? friend.location };
        } else {
          presence = presenceFromUser(content.user) ?? presence;
        }
        return { ...c, friends: { ...c.friends, [id]: friend }, presence: { ...c.presence, [id]: presence } };
      });
      return;
    }
  }
}
