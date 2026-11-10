import type { Filters, Friend, MutualInfo, Presence, UserDetail, UserStatus } from "./types";

export interface TrustRank {
  key: string;
  label: string;
  color: string;
  order: number;
}

export const TRUST_RANKS: TrustRank[] = [
  { key: "visitor", label: "Visitor", color: "#CCCCCC", order: 0 },
  { key: "new", label: "New User", color: "#1778FF", order: 1 },
  { key: "user", label: "User", color: "#2BCF5C", order: 2 },
  { key: "known", label: "Known User", color: "#FF7B42", order: 3 },
  { key: "trusted", label: "Trusted User", color: "#8143E6", order: 4 },
];
const TEAM: TrustRank = { key: "team", label: "VRChat Team", color: "#B52626", order: 5 };
const UNKNOWN: TrustRank = { key: "unknown", label: "Not loaded yet", color: "#5d6b78", order: -1 };

/** VRChat's tag names are one rank off from the displayed names (legacy). */
export function trustRank(tags: string[] | undefined, developerType?: string): TrustRank {
  if (developerType === "internal") return TEAM;
  if (!tags) return UNKNOWN;
  const t = new Set(tags);
  if (t.has("system_trust_veteran")) return TRUST_RANKS[4];
  if (t.has("system_trust_trusted")) return TRUST_RANKS[3];
  if (t.has("system_trust_known")) return TRUST_RANKS[2];
  if (t.has("system_trust_basic")) return TRUST_RANKS[1];
  return TRUST_RANKS[0];
}

export const STATUS_COLORS: Record<UserStatus | "web", string> = {
  "join me": "#42CAFF",
  active: "#51E57E",
  "ask me": "#E88134",
  busy: "#DE3A3A",
  offline: "#6b7783",
  web: "#C6C24A",
};

const DEFAULT_STATUS = { ...STATUS_COLORS };
const DEFAULT_TRUST = Object.fromEntries([...TRUST_RANKS, TEAM].map((r) => [r.key, r.color]));
const STATUS_VAR: Record<string, string> = { "join me": "joinme", active: "active", "ask me": "askme", busy: "busy", offline: "offline", web: "web" };

/** Use the color theme's status and rank colors (CSS variables --status-* and
 *  --trust-*); themes without them keep VRChat's own colors. */
export function applyThemeColors(read: (cssVar: string) => string) {
  for (const k of Object.keys(STATUS_COLORS) as (keyof typeof STATUS_COLORS)[]) {
    STATUS_COLORS[k] = read(`--status-${STATUS_VAR[k]}`) || DEFAULT_STATUS[k];
  }
  for (const r of [...TRUST_RANKS, TEAM]) r.color = read(`--trust-${r.key}`) || DEFAULT_TRUST[r.key];
}

export const STATUS_LABEL: Record<UserStatus, string> = {
  "join me": "Join Me",
  active: "Online",
  "ask me": "Ask Me",
  busy: "Do Not Disturb",
  offline: "Offline",
};

export function statusColor(f: Friend, p: Presence): string {
  if (p === "offline") return STATUS_COLORS.offline;
  if (p === "web") return STATUS_COLORS.web;
  return STATUS_COLORS[f.status] ?? STATUS_COLORS.active;
}

export function presenceLabel(f: Friend, p: Presence): string {
  if (p === "offline") return "Offline";
  if (p === "web") return "Active on website / app";
  return STATUS_LABEL[f.status] ?? "Online";
}

export function platformKey(f: Friend): "pc" | "android" | "ios" | "web" | "unknown" {
  const p = (f.platform && f.platform !== "offline" ? f.platform : f.last_platform) || "";
  if (p === "web") return "web";
  if (p.includes("windows") || p === "standalonewindows") return "pc";
  if (p === "android") return "android";
  if (p === "ios") return "ios";
  return "unknown";
}

export const PLATFORM_LABEL: Record<string, string> = {
  pc: "PC",
  android: "Quest / Android",
  ios: "iOS",
  web: "Website",
  unknown: "Unknown",
};

export function presenceOf(f: Friend, presence: Record<string, Presence>): Presence {
  return presence[f.id] ?? (f.status === "offline" ? "offline" : "online");
}

export function iconUrl(f: Friend): string | undefined {
  return f.iconUrl || f.userIcon || f.profilePicOverride || f.currentAvatarThumbnailImageUrl || f.currentAvatarImageUrl || undefined;
}

export function bannerUrl(f: Friend): string | undefined {
  return f.bannerUrl || f.profilePicOverride || f.currentAvatarImageUrl || f.currentAvatarThumbnailImageUrl || undefined;
}

export function toTime(s: string | null | undefined): number {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

/** Best guess for when the person was last online. */
export function lastSeen(f: Friend): number {
  return Math.max(toTime(f.last_activity), toTime(f.last_login));
}

export function relTime(t: number, now = Date.now()): string {
  if (!t) return "unknown";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 60) return `${d} days ago`;
  const mo = Math.round(d / 30);
  if (mo < 24) return `${mo} months ago`;
  return `${Math.round(d / 365)} years ago`;
}

export function duration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export function fmtDate(t: number | string | undefined): string {
  if (!t) return "unknown";
  const d = typeof t === "number" ? new Date(t) : new Date(t);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_ORDER: Record<string, number> = { "join me": 0, active: 1, "ask me": 2, busy: 3 };

export function presenceRank(f: Friend, p: Presence): number {
  if (p === "online") return STATUS_ORDER[f.status] ?? 1;
  if (p === "web") return 5;
  return 6;
}

const LAST_SEEN_MS: Record<string, number> = {
  "24h": 864e5,
  "7d": 7 * 864e5,
  "30d": 30 * 864e5,
  "90d": 90 * 864e5,
};

export interface MatchContext {
  presence: Record<string, Presence>;
  details: Record<string, UserDetail>;
  favorites: Record<string, string[]>;
  circleMembers: Set<string> | null;
  listMembers: Set<string> | null;
  now: number;
}

export function matchesFilters(f: Friend, filters: Filters, ctx: MatchContext): boolean {
  const p = presenceOf(f, ctx.presence);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    if (!f.displayName.toLowerCase().includes(q) && !(f.statusDescription || "").toLowerCase().includes(q)) return false;
  }
  if (filters.presence === "online" && p === "offline") return false;
  if (filters.presence === "offline" && p !== "offline") return false;
  if (filters.lastSeen !== "any") {
    const seen = p === "offline" ? lastSeen(f) : ctx.now;
    if (filters.lastSeen === "older") {
      if (seen && ctx.now - seen < LAST_SEEN_MS["90d"]) return false;
    } else if (!seen || ctx.now - seen > LAST_SEEN_MS[filters.lastSeen]) return false;
  }
  if (filters.trust.length) {
    const r = trustRank(ctx.details[f.id]?.tags, f.developerType);
    if (!filters.trust.includes(r.key)) return false;
  }
  if (filters.platform.length && !filters.platform.includes(platformKey(f))) return false;
  if (filters.favoritesOnly && !ctx.favorites[f.id]?.length) return false;
  if (ctx.circleMembers && !ctx.circleMembers.has(f.id)) return false;
  if (ctx.listMembers && !ctx.listMembers.has(f.id)) return false;
  return true;
}

export function mutualEdges(friendIds: Set<string>, mutuals: Record<string, MutualInfo>): [string, string][] {
  const seen = new Set<string>();
  const edges: [string, string][] = [];
  for (const [a, info] of Object.entries(mutuals)) {
    if (!friendIds.has(a)) continue;
    for (const b of info.ids) {
      if (b === a || !friendIds.has(b)) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(a < b ? [a, b] : [b, a]);
    }
  }
  return edges;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const LANGUAGES: Record<string, string> = {
  eng: "English", deu: "German", fra: "French", spa: "Spanish", ita: "Italian", por: "Portuguese",
  jpn: "Japanese", kor: "Korean", zho: "Chinese", rus: "Russian", ukr: "Ukrainian", pol: "Polish",
  nld: "Dutch", swe: "Swedish", nor: "Norwegian", dan: "Danish", fin: "Finnish", tur: "Turkish",
  ces: "Czech", hun: "Hungarian", ron: "Romanian", ell: "Greek", heb: "Hebrew", ara: "Arabic",
  tha: "Thai", vie: "Vietnamese", ind: "Indonesian", msa: "Malay", tgl: "Tagalog", hin: "Hindi",
  ase: "American Sign Language", bfi: "British Sign Language", dse: "Dutch Sign Language",
  fsl: "French Sign Language", jsl: "Japanese Sign Language", kvk: "Korean Sign Language",
  gsg: "German Sign Language", epo: "Esperanto", cat: "Catalan", est: "Estonian", lav: "Latvian",
  lit: "Lithuanian", slk: "Slovak", slv: "Slovenian", hrv: "Croatian", srp: "Serbian", bul: "Bulgarian",
  isl: "Icelandic", gle: "Irish", cym: "Welsh",
};

/** "language_eng" tags -> ["English"] */
export function languagesOf(tags: string[] | undefined): string[] {
  return (tags ?? [])
    .filter((t) => t.startsWith("language_"))
    .map((t) => {
      const code = t.slice(9);
      return LANGUAGES[code] ?? code.toUpperCase();
    });
}

/** "https://twitter.com/x" -> "twitter.com/x" for display. */
export function shortLink(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}
