// VRChat content in the app: instances, worlds, groups (with posts, events,
// gallery, members and management), favorites, avatars, and your prints,
// stickers and emojis. Reads go through the Rust client's allow-listed GET;
// changes through the write queue (src/writes.ts), only from your clicks.
import { backend, type ApiResponse } from "./backend";
import { getState, updateCache } from "./store";
import { errorText, vrcWrite } from "./writes";
import { cacheGet, cachePut } from "./serverlink";
import { publicWorld } from "./sync";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function get(path: string, query?: Record<string, string | number | boolean>): Promise<Json> {
  const r = await backend.vrcGet(path, query);
  if (r.status === 404) return null;
  if (r.status < 200 || r.status >= 300) throw new Error(`VRChat: ${r.status} ${errorText(r)}`.trim());
  return r.data;
}

async function getPaged(path: string, query: Record<string, string | number | boolean> = {}, max = 1000): Promise<Json[]> {
  const out: Json[] = [];
  for (let offset = 0; offset < max; offset += 100) {
    const page = await get(path, { ...query, n: 100, offset });
    if (!Array.isArray(page)) break;
    out.push(...page);
    if (page.length < 100) break;
  }
  return out;
}

function ok(r: ApiResponse): string | null {
  return r.status >= 200 && r.status < 300 ? null : `${r.status} ${errorText(r)}`.trim();
}

async function write(method: "POST" | "PUT" | "DELETE", path: string, body?: Record<string, unknown>, label?: string): Promise<string | null> {
  try {
    return ok(await vrcWrite(method, path, body, label));
  } catch (e) {
    return String(e instanceof Error ? e.message : e);
  }
}

// ---------- instances and worlds ----------

export interface InstanceInfo {
  location: string;
  worldId: string;
  name?: string;
  type: string;
  region: string;
  ownerId?: string;
  users: number;
  capacity: number;
  /** Who's inside, when VRChat tells (your own instance, group owners…). */
  people?: { id: string; displayName: string }[];
  queue?: number;
  closedAt?: string | null;
  hardClose?: boolean;
  ageGate?: boolean;
}

export async function instanceInfo(location: string): Promise<InstanceInfo | null> {
  const d = await get(`/instances/${location}`);
  if (!d) return null;
  return {
    location,
    worldId: d.worldId ?? location.split(":")[0],
    name: d.world?.name,
    type: d.type ?? "",
    region: d.region ?? d.photonRegion ?? "",
    ownerId: d.ownerId ?? undefined,
    users: d.n_users ?? d.userCount ?? 0,
    capacity: d.capacity ?? d.world?.capacity ?? 0,
    people: Array.isArray(d.users) ? d.users.map((u: Json) => ({ id: u.id, displayName: u.displayName })) : undefined,
    queue: d.queueSize,
    closedAt: d.closedAt,
    hardClose: d.hardClose,
    ageGate: d.ageGate,
  };
}

export interface WorldFull {
  id: string;
  name: string;
  description: string;
  authorId: string;
  authorName: string;
  imageUrl?: string;
  capacity: number;
  occupants: number;
  favorites: number;
  visits: number;
  tags: string[];
  /** [instance id, users] */
  instances: [string, number][];
  updated?: string;
  created?: string;
}

export async function worldFull(id: string): Promise<WorldFull | null> {
  const d = await get(`/worlds/${id}`);
  if (!d) return null;
  cachePut("world", id, publicWorld(d));
  updateCache((c) => ({ ...c, worlds: { ...(c.worlds ?? {}), [id]: { id, name: d.name, imageUrl: d.imageUrl, thumbnailImageUrl: d.thumbnailImageUrl, capacity: d.capacity, authorName: d.authorName, fetchedAt: Date.now() } } }));
  return {
    id,
    name: d.name ?? "",
    description: d.description ?? "",
    authorId: d.authorId ?? "",
    authorName: d.authorName ?? "",
    imageUrl: d.imageUrl,
    capacity: d.capacity ?? 0,
    occupants: d.occupants ?? 0,
    favorites: d.favorites ?? 0,
    visits: d.visits ?? 0,
    tags: d.tags ?? [],
    instances: Array.isArray(d.instances) ? d.instances.filter((x: Json) => Array.isArray(x)) : [],
    updated: d.updated_at,
    created: d.created_at,
  };
}

// ---------- groups ----------

export interface GroupRole {
  id: string;
  name: string;
  permissions: string[];
  order: number;
}

export interface GroupFull {
  id: string;
  name: string;
  shortCode: string;
  discriminator: string;
  description: string;
  iconUrl?: string;
  bannerUrl?: string;
  rules: string;
  links: string[];
  languages: string[];
  memberCount: number;
  onlineMemberCount: number;
  ownerId: string;
  joinState: string;
  privacy: string;
  tags: string[];
  galleries: { id: string; name: string; description?: string }[];
  roles: GroupRole[];
  /** Your membership (null if you aren't a member). */
  me: { roleIds: string[]; permissions: string[]; isRepresenting?: boolean; joinedAt?: string } | null;
}

export async function groupFull(id: string): Promise<GroupFull | null> {
  const d = await get(`/groups/${id}`, { includeRoles: true, purpose: "group" });
  if (!d) return null;
  const roles: GroupRole[] = (d.roles ?? []).map((r: Json) => ({ id: r.id, name: r.name, permissions: r.permissions ?? [], order: r.order ?? 0 }));
  const mine = d.myMember;
  const perms = new Set<string>(mine?.permissions ?? []);
  for (const rid of mine?.roleIds ?? []) for (const p of roles.find((r) => r.id === rid)?.permissions ?? []) perms.add(p);
  return {
    id,
    name: d.name ?? "",
    shortCode: d.shortCode ?? "",
    discriminator: d.discriminator ?? "",
    description: d.description ?? "",
    iconUrl: d.iconUrl,
    bannerUrl: d.bannerUrl,
    rules: d.rules ?? "",
    links: d.links ?? [],
    languages: d.languages ?? [],
    memberCount: d.memberCount ?? 0,
    onlineMemberCount: d.onlineMemberCount ?? 0,
    ownerId: d.ownerId ?? "",
    joinState: d.joinState ?? "",
    privacy: d.privacy ?? "",
    tags: d.tags ?? [],
    galleries: (d.galleries ?? []).map((g: Json) => ({ id: g.id, name: g.name, description: g.description })),
    roles: roles.sort((a, b) => a.order - b.order),
    me: mine ? { roleIds: mine.roleIds ?? [], permissions: [...perms], isRepresenting: mine.isRepresenting, joinedAt: mine.joinedAt } : null,
  };
}

/** Can you do this in the group? ("*" = everything, the owner). */
export function can(g: GroupFull, perm: string): boolean {
  const p = g.me?.permissions ?? [];
  return p.includes("*") || p.includes(perm);
}

export interface GroupPost {
  id: string;
  title: string;
  text: string;
  imageUrl?: string;
  authorId: string;
  createdAt: string;
  visibility: string;
}

export async function groupPosts(id: string): Promise<GroupPost[]> {
  const d = await get(`/groups/${id}/posts`, { n: 50, offset: 0 });
  const list = Array.isArray(d) ? d : Array.isArray(d?.posts) ? d.posts : [];
  return list.map((p: Json) => ({ id: p.id, title: p.title ?? "", text: p.text ?? "", imageUrl: p.imageUrl, authorId: p.authorId, createdAt: p.createdAt, visibility: p.visibility ?? "" }));
}

export async function groupInstances(id: string): Promise<{ location: string; world: string; worldName: string; users: number; capacity: number }[]> {
  const d = await get(`/groups/${id}/instances`);
  if (!Array.isArray(d)) return [];
  return d.map((i: Json) => ({ location: i.location ?? `${i.world?.id}:${i.instanceId}`, world: i.world?.id ?? "", worldName: i.world?.name ?? "", users: i.memberCount ?? i.n_users ?? 0, capacity: i.world?.capacity ?? 0 }));
}

export interface GroupEvent {
  id: string;
  groupId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  category: string;
  accessType: string;
  imageUrl?: string;
  interested?: number;
}

export async function groupEvents(id: string): Promise<GroupEvent[]> {
  const d = await get(`/calendar/${id}`, { n: 100 });
  const list = Array.isArray(d) ? d : Array.isArray(d?.results) ? d.results : [];
  return list.map(eventOf).sort((a: GroupEvent, b: GroupEvent) => a.startsAt.localeCompare(b.startsAt));
}

/** Upcoming events of all your groups (VRChat's calendar for you). */
export async function myEvents(): Promise<GroupEvent[]> {
  const d = await get(`/calendar`, { n: 100 });
  const list = Array.isArray(d) ? d : Array.isArray(d?.results) ? d.results : [];
  return list.map(eventOf).sort((a: GroupEvent, b: GroupEvent) => a.startsAt.localeCompare(b.startsAt));
}

function eventOf(e: Json): GroupEvent {
  return {
    id: e.id,
    groupId: e.ownerId ?? e.groupId ?? "",
    title: e.title ?? "",
    description: e.description ?? "",
    startsAt: e.startsAt ?? "",
    endsAt: e.endsAt ?? "",
    category: e.category ?? "",
    accessType: e.accessType ?? "",
    imageUrl: e.imageUrl,
    interested: e.interestedUserCount,
  };
}

export async function galleryImages(groupId: string, galleryId: string): Promise<{ id: string; imageUrl: string; submittedBy?: string; approved?: boolean }[]> {
  const d = await get(`/groups/${groupId}/galleries/${galleryId}`, { n: 100, offset: 0 });
  return Array.isArray(d) ? d.map((i: Json) => ({ id: i.id, imageUrl: i.imageUrl, submittedBy: i.submittedByUserId, approved: i.approved })) : [];
}

export interface GroupMember {
  userId: string;
  displayName: string;
  iconUrl?: string;
  roleIds: string[];
  joinedAt?: string;
  managerNotes?: string;
}

export async function groupMembers(id: string, max = 1000): Promise<GroupMember[]> {
  const list = await getPaged(`/groups/${id}/members`, {}, max);
  return list.map((m: Json) => ({ userId: m.userId, displayName: m.user?.displayName ?? m.userId, iconUrl: m.user?.thumbnailUrl ?? m.user?.iconUrl, roleIds: m.roleIds ?? [], joinedAt: m.joinedAt, managerNotes: m.managerNotes }));
}

export async function groupRequests(id: string): Promise<GroupMember[]> {
  const list = await getPaged(`/groups/${id}/requests`, {}, 500);
  return list.map((m: Json) => ({ userId: m.userId, displayName: m.user?.displayName ?? m.userId, iconUrl: m.user?.thumbnailUrl, roleIds: [], joinedAt: m.createdAt }));
}

export async function groupBans(id: string): Promise<GroupMember[]> {
  const list = await getPaged(`/groups/${id}/bans`, {}, 500);
  return list.map((m: Json) => ({ userId: m.userId, displayName: m.user?.displayName ?? m.userId, iconUrl: m.user?.thumbnailUrl, roleIds: [], joinedAt: m.bannedAt }));
}

export async function groupAuditLogs(id: string): Promise<{ t: string; actor: string; type: string; description: string }[]> {
  const d = await get(`/groups/${id}/auditLogs`, { n: 100, offset: 0 });
  const list = Array.isArray(d?.results) ? d.results : Array.isArray(d) ? d : [];
  return list.map((l: Json) => ({ t: l.created_at ?? l.createdAt ?? "", actor: l.actorDisplayName ?? l.actorId ?? "", type: l.eventType ?? "", description: l.description ?? "" }));
}

// management (VRChat checks the permissions; the buttons only show when you have them)
export const groupActions = {
  join: (g: string) => write("POST", `/groups/${g}/join`, {}, "Join group"),
  leave: (g: string) => write("POST", `/groups/${g}/leave`, {}, "Leave group"),
  update: (g: string, patch: Partial<Pick<GroupFull, "name" | "shortCode" | "description" | "joinState" | "languages" | "links" | "rules">>) => write("PUT", `/groups/${g}`, patch, "Group settings"),
  kick: (g: string, u: string) => write("DELETE", `/groups/${g}/members/${u}`, undefined, "Kick from group"),
  ban: (g: string, u: string) => write("POST", `/groups/${g}/bans`, { userId: u }, "Ban from group"),
  unban: (g: string, u: string) => write("DELETE", `/groups/${g}/bans/${u}`, undefined, "Unban"),
  addRole: (g: string, u: string, r: string) => write("PUT", `/groups/${g}/members/${u}/roles/${r}`, undefined, "Add role"),
  removeRole: (g: string, u: string, r: string) => write("DELETE", `/groups/${g}/members/${u}/roles/${r}`, undefined, "Remove role"),
  respond: (g: string, u: string, action: "accept" | "reject", block = false) => write("PUT", `/groups/${g}/requests/${u}`, { action, block }, "Join request"),
  invite: (g: string, u: string) => write("POST", `/groups/${g}/invites`, { userId: u, confirmOverrideBlock: false }, "Group invite"),
  uninvite: (g: string, u: string) => write("DELETE", `/groups/${g}/invites/${u}`, undefined, "Cancel group invite"),
  setNotes: (g: string, u: string, managerNotes: string) => write("PUT", `/groups/${g}/members/${u}`, { managerNotes }, "Member notes"),
  post: (g: string, title: string, text: string, sendNotification: boolean, visibility: "public" | "group") => write("POST", `/groups/${g}/posts`, { title, text, sendNotification, visibility, roleIds: [] }, "Group post"),
  deletePost: (g: string, p: string) => write("DELETE", `/groups/${g}/posts/${p}`, undefined, "Delete post"),
  deleteImage: (g: string, gal: string, img: string) => write("DELETE", `/groups/${g}/galleries/${gal}/images/${img}`, undefined, "Delete gallery image"),
  createInstance: (g: string, worldId: string, region: string, groupAccessType: "members" | "plus" | "public", queueEnabled: boolean, ageGate: boolean, roleIds: string[] = []) =>
    write("POST", `/instances`, { worldId, type: "group", ownerId: g, region, groupAccessType, queueEnabled, ageGate, roleIds, canRequestInvite: true }, "Create group instance"),
};

// ---------- favorites ----------

export interface FavoriteGroup {
  name: string;
  displayName: string;
  type: "friend" | "world" | "avatar" | "vrcPlusWorld";
  visibility: string;
}
export interface Favorite {
  id: string;
  favoriteId: string;
  type: string;
  tags: string[];
}

export async function favoriteGroups(): Promise<FavoriteGroup[]> {
  const list = await getPaged("/favorite/groups", {}, 300);
  return list.map((g: Json) => ({ name: g.name, displayName: g.displayName || g.name, type: g.type, visibility: g.visibility ?? "private" }));
}

export async function favorites(type: "friend" | "world" | "avatar"): Promise<Favorite[]> {
  const list = await getPaged("/favorites", { type }, 2000);
  return list.map((f: Json) => ({ id: f.id, favoriteId: f.favoriteId, type: f.type, tags: f.tags ?? [] }));
}

export const favoriteActions = {
  add: (type: "friend" | "world" | "avatar", favoriteId: string, group: string) => write("POST", "/favorites", { type, favoriteId, tags: [group] }, "Add favorite"),
  remove: (fav: Favorite) => write("DELETE", `/favorites/${fav.id}`, undefined, "Remove favorite"),
  rename: (g: FavoriteGroup, displayName: string) => {
    const me = getState().cache.me?.id ?? "";
    return write("PUT", `/favorite/group/${g.type}/${g.name}/${me}`, { displayName }, "Rename favorite group");
  },
};

/** World / avatar names for favorites (one request each, cached for worlds). */
export async function worldsByIds(ids: string[]): Promise<Record<string, { name: string; imageUrl?: string; authorName?: string }>> {
  const out: Record<string, { name: string; imageUrl?: string; authorName?: string }> = {};
  const cached = getState().cache.worlds ?? {};
  for (const id of ids) {
    if (cached[id]) {
      out[id] = { name: cached[id].name, imageUrl: cached[id].thumbnailImageUrl ?? cached[id].imageUrl, authorName: cached[id].authorName };
      continue;
    }
    const w = await worldFull(id).catch(() => null);
    if (w) out[id] = { name: w.name, imageUrl: w.imageUrl, authorName: w.authorName };
  }
  return out;
}

// ---------- avatars ----------

export interface AvatarInfo {
  id: string;
  name: string;
  description: string;
  authorName: string;
  authorId: string;
  imageUrl?: string;
  thumbnailImageUrl?: string;
  releaseStatus: string;
  platforms: string[];
  /** Performance rating per platform (Excellent … Very Poor). */
  performance: Record<string, string>;
  updated?: string;
}

function avatarOf(a: Json): AvatarInfo {
  const pkgs: Json[] = a.unityPackages ?? [];
  const performance: Record<string, string> = {};
  for (const p of pkgs) if (p.platform && p.performanceRating) performance[p.platform] = p.performanceRating;
  if (a.performance && typeof a.performance === "object") Object.assign(performance, a.performance);
  return {
    id: a.id,
    name: a.name ?? "",
    description: a.description ?? "",
    authorName: a.authorName ?? "",
    authorId: a.authorId ?? "",
    imageUrl: a.imageUrl,
    thumbnailImageUrl: a.thumbnailImageUrl,
    releaseStatus: a.releaseStatus ?? "",
    platforms: [...new Set(pkgs.map((p) => p.platform).filter(Boolean) as string[])],
    performance,
    updated: a.updated_at,
  };
}

export async function myAvatars(): Promise<AvatarInfo[]> {
  const list = await getPaged("/avatars", { user: "me", releaseStatus: "all", sort: "updated", order: "descending" }, 1000);
  return list.map(avatarOf);
}

export async function favoriteAvatars(): Promise<AvatarInfo[]> {
  const list = await getPaged("/avatars/favorites", {}, 1000);
  return list.map(avatarOf);
}

export async function avatar(id: string): Promise<AvatarInfo | null> {
  const cached = await cacheGet("avatar", id, 864e5);
  if (cached) return avatarOf(cached);
  const d = await get(`/avatars/${id}`);
  if (d && d.releaseStatus === "public") cachePut("avatar", id, d);
  return d ? avatarOf(d) : null;
}

export const selectAvatar = (id: string) => write("PUT", `/avatars/${id}/select`, undefined, "Switch avatar");

/** Someone's current avatar name, from its picture's file name ("Avatar - Fox Girl - Image - …"). */
export async function avatarNameFromImage(imageUrl: string | undefined): Promise<string | null> {
  const m = imageUrl?.match(/\/file\/(file_[0-9a-f-]+)\//i);
  if (!m) return null;
  const d = await get(`/file/${m[1]}`).catch(() => null);
  const name: string = d?.name ?? "";
  const n = name.match(/^Avatar - (.+?) - Image - /);
  return n ? n[1] : null;
}

// ---------- prints, stickers, emojis ----------

export type FileKind = "emoji" | "sticker" | "gallery" | "icon";

export interface VrcFile {
  id: string;
  name: string;
  imageUrl: string;
  tags: string[];
  animated?: boolean;
  created?: string;
}

export async function myFiles(kind: FileKind): Promise<VrcFile[]> {
  const list = await getPaged("/files", { tag: kind }, 500);
  return list.map((f: Json) => {
    const versions: Json[] = f.versions ?? [];
    const last = versions[versions.length - 1];
    return {
      id: f.id,
      name: f.name ?? "",
      imageUrl: last?.file?.url ?? `https://api.vrchat.cloud/api/1/file/${f.id}/${last?.version ?? 1}/file`,
      tags: f.tags ?? [],
      animated: (f.tags ?? []).some((t: string) => t.startsWith("animationStyle_") || t === "emojianimated"),
      created: last?.created_at,
    };
  });
}

export interface Print {
  id: string;
  imageUrl: string;
  note: string;
  worldName?: string;
  createdAt?: string;
}

export async function myPrints(): Promise<Print[]> {
  const me = getState().cache.me?.id;
  if (!me) return [];
  const list = await getPaged(`/prints/user/${me}`, {}, 1000);
  return list.map((p: Json) => ({ id: p.id, imageUrl: p.files?.image ?? p.imageUrl ?? "", note: p.note ?? "", worldName: p.worldName, createdAt: p.createdAt ?? p.timestamp }));
}

export const deleteFile = (id: string) => write("DELETE", `/file/${id}`, undefined, "Delete file");
export const deletePrint = (id: string) => write("DELETE", `/prints/${id}`, undefined, "Delete print");

/** Upload a cropped image as an emoji, sticker, gallery picture, icon or print. */
export async function uploadImage(kind: FileKind | "print", blob: Blob, opts: { animationStyle?: string; frames?: number; fps?: number; note?: string } = {}): Promise<string | null> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const fields: Record<string, string> = {};
  let tag: string = kind;
  if (kind === "emoji" && opts.frames && opts.frames > 1) {
    tag = "emojianimated";
    fields.frames = String(opts.frames);
    fields.framesOverTime = String(opts.fps ?? 10);
    fields.animationStyle = opts.animationStyle ?? "aura";
  } else if (kind === "emoji") {
    // Only emojis take an in-game effect; VRChat refuses it on stickers.
    fields.animationStyle = opts.animationStyle ?? "aura";
  }
  if (kind === "print") {
    fields.timestamp = new Date().toISOString();
    if (opts.note) fields.note = opts.note.slice(0, 64);
  }
  fields.tag = tag;
  fields.maskTag = "square";
  try {
    let r = await backend.vrcUploadImage(kind === "print" ? "print" : tag, bytes, blob.type || "image/png", fields);
    // VRChat said the effect isn't allowed for this kind: upload once more without it.
    if (r.status === 400 && fields.animationStyle && /animation style/i.test(errorText(r))) {
      delete fields.animationStyle;
      r = await backend.vrcUploadImage(kind === "print" ? "print" : tag, bytes, blob.type || "image/png", fields);
    }
    return ok(r);
  } catch (e) {
    return String(e instanceof Error ? e.message : e);
  }
}

/** Sizes VRChat expects per kind (square for emojis/stickers/icons; 16:9 or so for gallery/prints). */
export const UPLOAD_SHAPE: Record<FileKind | "print", { w: number; h: number; label: string }> = {
  emoji: { w: 1024, h: 1024, label: "Emoji (square)" },
  sticker: { w: 1024, h: 1024, label: "Sticker (square)" },
  icon: { w: 1024, h: 1024, label: "Icon (square)" },
  gallery: { w: 1920, h: 1080, label: "Gallery picture (16:9)" },
  print: { w: 1920, h: 1080, label: "Print (16:9)" },
};
