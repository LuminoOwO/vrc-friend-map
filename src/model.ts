import { matchesAccount } from "./accountmerge";
import { language, t } from "./i18n";
import type { Filters, Friend, MutualInfo, Presence, UserDetail, UserStatus } from "./types";

export interface TrustRank {
  key: string;
  label: string;
  color: string;
  order: number;
}

// Names are read in the current language each time (src/i18n).
const rank = (key: string, color: string, order: number): TrustRank => ({
  key,
  color,
  order,
  get label() {
    return t(`trust.${key}`);
  },
});
export const TRUST_RANKS: TrustRank[] = [rank("visitor", "#CCCCCC", 0), rank("new", "#1778FF", 1), rank("user", "#2BCF5C", 2), rank("known", "#FF7B42", 3), rank("trusted", "#8143E6", 4)];
const TEAM: TrustRank = rank("team", "#B52626", 5);
const UNKNOWN: TrustRank = rank("unknown", "#5d6b78", -1);

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
  get "join me"() {
    return t("status.joinMe");
  },
  get active() {
    return t("status.online");
  },
  get "ask me"() {
    return t("status.askMe");
  },
  get busy() {
    return t("status.busy");
  },
  get offline() {
    return t("status.offline");
  },
};

export function statusColor(f: Friend, p: Presence): string {
  if (p === "offline") return STATUS_COLORS.offline;
  if (p === "web") return STATUS_COLORS.web;
  return STATUS_COLORS[f.status] ?? STATUS_COLORS.active;
}

export function presenceLabel(f: Friend, p: Presence): string {
  if (p === "offline") return t("status.offline");
  if (p === "web") return t("status.web");
  return STATUS_LABEL[f.status] ?? t("status.online");
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
  get pc() {
    return t("platform.pc");
  },
  get android() {
    return t("platform.android");
  },
  get ios() {
    return t("platform.ios");
  },
  get web() {
    return t("platform.web");
  },
  get unknown() {
    return t("platform.unknown");
  },
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

const relFormats = new Map<string, Intl.RelativeTimeFormat>();
/** "5 minutes ago", in the app's language (the browser knows the words for every language). */
export function relTime(at: number, now = Date.now()): string {
  if (!at) return t("time.unknown");
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return t("time.justNow");
  const lang = language();
  let f = relFormats.get(lang);
  if (!f) {
    f = new Intl.RelativeTimeFormat(lang, { numeric: "always" });
    relFormats.set(lang, f);
  }
  const m = Math.round(s / 60);
  if (m < 60) return f.format(-m, "minute");
  const h = Math.round(m / 60);
  if (h < 48) return f.format(-h, "hour");
  const d = Math.round(h / 24);
  if (d < 60) return f.format(-d, "day");
  const mo = Math.round(d / 30);
  if (mo < 24) return f.format(-mo, "month");
  return f.format(-Math.round(d / 365), "year");
}

export function duration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return t("time.min", { m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("time.hMin", { h, m: m % 60 });
  return t("time.dH", { d: Math.floor(h / 24), h: h % 24 });
}

export function fmtDate(at: number | string | undefined): string {
  if (!at) return t("time.unknown");
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return t("time.unknown");
  return d.toLocaleDateString(language(), { year: "numeric", month: "short", day: "numeric" });
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
  /** Your nicknames for people (search finds them too). */
  nicknames?: Record<string, string>;
  starred?: Set<string>;
  /** Which of your accounts know whom (src/accountmerge.ts). */
  friendOf?: Record<string, string[]>;
}

/** "join me" | "active" | "ask me" | "busy" | "web" | "offline" */
export function statusKey(f: Friend, p: Presence): string {
  if (p === "offline") return "offline";
  if (p === "web") return "web";
  return f.status === "offline" ? "active" : f.status;
}

export const IN_GAME_STATUSES = ["join me", "active", "ask me", "busy"];

export function matchesFilters(f: Friend, filters: Filters, ctx: MatchContext): boolean {
  const p = presenceOf(f, ctx.presence);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    if (!f.displayName.toLowerCase().includes(q) && !(f.statusDescription || "").toLowerCase().includes(q) && !(ctx.nicknames?.[f.id] ?? "").toLowerCase().includes(q)) return false;
  }
  if (filters.presence === "online" && p === "offline") return false;
  if (filters.presence === "offline" && p !== "offline") return false;
  if (filters.lastSeen !== "any") {
    const seen = p === "offline" ? lastSeen(f) : ctx.now;
    if (filters.lastSeen === "older") {
      if (seen && ctx.now - seen < LAST_SEEN_MS["90d"]) return false;
    } else if (!seen || ctx.now - seen > LAST_SEEN_MS[filters.lastSeen]) return false;
  }
  if (filters.statuses?.length && !filters.statuses.includes(statusKey(f, p))) return false;
  if (filters.trust.length) {
    const r = trustRank(ctx.details[f.id]?.tags, f.developerType);
    if (!filters.trust.includes(r.key)) return false;
  }
  if (filters.platform.length && !filters.platform.includes(platformKey(f))) return false;
  if (filters.favoritesOnly && !ctx.favorites[f.id]?.length) return false;
  if (filters.favoriteGroup && !ctx.favorites[f.id]?.includes(filters.favoriteGroup)) return false;
  if (filters.starredOnly && !ctx.starred?.has(f.id)) return false;
  if (filters.account && !matchesAccount(ctx.friendOf, f.id, filters.account)) return false;
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

export const LANGUAGES: Record<string, string> = {
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
/** Languages from the profile's list (since 2026) or, before that, the language_ tags. */
export function languagesOf(tags: string[] | undefined, codes?: string[]): string[] {
  const list = codes?.length ? codes.map((c) => c.replace(/^language_/, "")) : (tags ?? []).filter((t) => t.startsWith("language_")).map((t) => t.slice(9));
  return [...new Set(list)].map((code) => LANGUAGES[code] ?? code.toUpperCase());
}

/** "https://twitter.com/x" -> "twitter.com/x" for display. */
export function shortLink(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}
