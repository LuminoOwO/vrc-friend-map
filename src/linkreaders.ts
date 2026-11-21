// Readers for the pages people link in their VRChat bio: for each site the
// most direct public way to get the profile text (an open API where there is
// one, else the page itself). Used by the age hints and the time zone
// guesses. All fetching goes through the Rust side (src-tauri/src/linkfetch.rs:
// public addresses only, a few redirects, 400 KB, text only, no cookies).
//
// Link pages (Linktree, Carrd, …) list more links; with "read deeper" on,
// links from them to known profile sites are read too, up to the limits in
// Settings → People → Age hints.
import { t as tr } from "./i18n";

export type Fetcher = (url: string) => Promise<string>;

export interface LinkRead {
  url: string;
  site: string;
  /** read: got text; login: the site wants a login; unreachable: error; skipped: not read (limits, switches). */
  status: "read" | "login" | "unreachable" | "skipped";
  text: string;
  /** Links found there (only to known profile sites). */
  links: string[];
  depth: number;
  /** Where it was found ("bio", or the page that linked it). */
  from: string;
  note?: string;
}

export interface ReadOptions {
  /** How many steps to follow from the bio's own links (0: only those). */
  depth: number;
  /** Most pages to read per person. */
  maxPages: number;
  /** Read social network profiles at all (X, Bluesky, Instagram, …). */
  socials: boolean;
  /** X / Twitter through fxtwitter.com (sends the handle to them). */
  fxTwitter: boolean;
}

export const DEFAULT_READ: ReadOptions = { depth: 1, maxPages: 10, socials: true, fxTwitter: false };

interface Reader {
  site: string;
  kind: "social" | "linkpage" | "art" | "other";
  /** Returns the URL to fetch (API or page) for a matching link, else null. */
  match: (u: URL) => string | null;
  /** Turn the response into text; default: visible page text and meta tags. */
  parse?: (body: string, u: URL) => string;
  /** Needs a switch besides "socials". */
  needs?: "fxTwitter";
}

const host = (u: URL) => u.hostname.replace(/^www\.|^m\.|^mobile\./, "").toLowerCase();
const seg = (u: URL, i = 0) => decodeURIComponent(u.pathname.split("/").filter(Boolean)[i] ?? "");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (body: string): any => {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};
const lines = (...parts: (string | undefined | null | false)[]) => parts.filter((p): p is string => !!p && typeof p === "string").join("\n");
const RESERVED = new Set(["home", "explore", "search", "settings", "login", "signup", "i", "intent", "share", "hashtag", "about", "privacy", "tos", "help"]);
const isHandle = (h: string) => !!h && !RESERVED.has(h.toLowerCase()) && /^[\w.\-]{1,64}$/.test(h);

/** HTML entities and tags out (works without a DOM, for tests and workers). */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/[ \t\r]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** Meta descriptions, titles, JSON blobs and visible text of a page. */
export function pageText(html: string): string {
  const meta = [...html.matchAll(/<meta[^>]+(?:name|property)=["'](?:description|og:description|og:title|twitter:description|profile:username)["'][^>]*>/gi)]
    .map((m) => m[0].match(/content=["']([^"']*)["']/i)?.[1] ?? "")
    .filter(Boolean);
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "";
  // Link pages and apps keep their text in JSON (Next.js, TikTok, …).
  const blobs = [...html.matchAll(/"(?:description|bio|biography|signature|headline|about|summary|location|tagline)"\s*:\s*"((?:[^"\\]|\\.){1,600})"/g)].map((m) => {
    try {
      return JSON.parse(`"${m[1]}"`) as string;
    } catch {
      return m[1];
    }
  });
  const body = stripHtml(html.replace(/^[\s\S]*?<body[^>]*>/i, ""));
  return lines(stripHtml(title), ...meta.map(stripHtml), ...blobs, body).slice(0, 60_000);
}

/** Links on a page to sites we know how to read. */
export function linksIn(body: string): string[] {
  const out = new Set<string>();
  const add = (raw: string) => {
    const url = raw.replace(/\\\//g, "/").replace(/&amp;/g, "&");
    try {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) return;
      if (readerFor(u)) out.add(u.toString());
    } catch {
      // not a URL
    }
  };
  for (const m of body.matchAll(/href=["'](https?:\/\/[^"'\s<>]+)["']/gi)) add(m[1]);
  for (const m of body.matchAll(/"(https?:(?:\\\/|\/)(?:\\\/|\/)[^"\s<>]{4,300})"/g)) add(m[1]);
  return [...out].slice(0, 40);
}

const READERS: Reader[] = [
  // ---- social networks ----
  {
    site: "Bluesky",
    kind: "social",
    match: (u) => (host(u) === "bsky.app" && seg(u) === "profile" && seg(u, 1) ? `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(seg(u, 1))}` : null),
    parse: (b) => {
      const d = json(b);
      return d ? lines(d.displayName, d.handle && `@${d.handle}`, d.description) : "";
    },
  },
  {
    site: "X / Twitter",
    kind: "social",
    needs: "fxTwitter",
    match: (u) => (/^(x|twitter|fxtwitter|vxtwitter|fixupx)\.com$/.test(host(u)) && isHandle(seg(u)) ? `https://api.fxtwitter.com/${encodeURIComponent(seg(u))}` : null),
    parse: (b) => {
      const d = json(b)?.user;
      return d ? lines(d.name, d.screen_name && `@${d.screen_name}`, d.description, d.location && `Location: ${d.location}`, d.website?.url) : "";
    },
  },
  {
    site: "Threads",
    kind: "social",
    match: (u) => (/^threads\.(net|com)$/.test(host(u)) && seg(u).startsWith("@") ? u.toString() : null),
  },
  {
    site: "Instagram",
    kind: "social",
    match: (u) => (host(u) === "instagram.com" && isHandle(seg(u)) && !["p", "reel", "stories"].includes(seg(u)) ? `https://www.instagram.com/${encodeURIComponent(seg(u))}/` : null),
  },
  {
    site: "TikTok",
    kind: "social",
    match: (u) => (host(u) === "tiktok.com" && seg(u).startsWith("@") ? `https://www.tiktok.com/${encodeURIComponent(seg(u))}` : null),
  },
  {
    site: "Tumblr",
    kind: "social",
    match: (u) => {
      const h = host(u);
      if (h.endsWith(".tumblr.com") && h !== "www.tumblr.com") return `https://${h}/`;
      if (h === "tumblr.com" && isHandle(seg(u))) return `https://${seg(u)}.tumblr.com/`;
      return null;
    },
  },
  {
    site: "Reddit",
    kind: "social",
    match: (u) => (/^(old\.|new\.)?reddit\.com$/.test(host(u)) && /^(u|user)$/.test(seg(u)) && seg(u, 1) ? `https://www.reddit.com/user/${encodeURIComponent(seg(u, 1))}/about.json` : null),
    parse: (b) => {
      const d = json(b)?.data;
      return d ? lines(d.subreddit?.title, d.subreddit?.public_description) : "";
    },
  },
  {
    site: "Telegram",
    kind: "social",
    match: (u) => (/^(t\.me|telegram\.me)$/.test(host(u)) && isHandle(seg(u)) ? `https://t.me/${encodeURIComponent(seg(u))}` : null),
  },
  {
    site: "Steam",
    kind: "social",
    match: (u) => {
      if (host(u) !== "steamcommunity.com" || !/^(id|profiles)$/.test(seg(u)) || !seg(u, 1)) return null;
      return `https://steamcommunity.com/${seg(u)}/${encodeURIComponent(seg(u, 1))}/?xml=1`;
    },
    parse: (b) => {
      const tag = (t: string) => b.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`))?.[1];
      const loc = tag("location");
      return lines(tag("steamID"), tag("realname"), loc && `Location: ${stripHtml(loc)}`, stripHtml(tag("summary") ?? ""));
    },
  },
  {
    site: "YouTube",
    kind: "social",
    match: (u) => (/^(youtube\.com|youtu\.be)$/.test(host(u)) && (seg(u).startsWith("@") || /^(c|channel|user)$/.test(seg(u))) ? u.toString() : null),
  },
  {
    site: "Twitch",
    kind: "social",
    match: (u) => (host(u) === "twitch.tv" && isHandle(seg(u)) && !["videos", "directory"].includes(seg(u)) ? `https://www.twitch.tv/${encodeURIComponent(seg(u))}` : null),
  },
  {
    site: "Kick",
    kind: "social",
    match: (u) => (host(u) === "kick.com" && isHandle(seg(u)) ? `https://kick.com/api/v2/channels/${encodeURIComponent(seg(u))}` : null),
    parse: (b) => {
      const d = json(b);
      return d ? lines(d.user?.username, d.user?.bio) : pageText(b);
    },
  },
  {
    site: "GitHub",
    kind: "social",
    match: (u) => (host(u) === "github.com" && isHandle(seg(u)) && !seg(u, 1) ? `https://api.github.com/users/${encodeURIComponent(seg(u))}` : null),
    parse: (b) => {
      const d = json(b);
      return d ? lines(d.name, d.bio, d.location && `Location: ${d.location}`, d.blog, d.twitter_username && `https://x.com/${d.twitter_username}`) : "";
    },
  },
  { site: "SoundCloud", kind: "social", match: (u) => (host(u) === "soundcloud.com" && isHandle(seg(u)) && !seg(u, 1) ? u.toString() : null) },
  { site: "Last.fm", kind: "social", match: (u) => (/^last\.fm$/.test(host(u)) && seg(u) === "user" && seg(u, 1) ? u.toString() : null) },
  { site: "Spotify", kind: "social", match: (u) => (host(u) === "open.spotify.com" && seg(u) === "user" && seg(u, 1) ? u.toString() : null) },
  { site: "Discord", kind: "social", match: (u) => (/^(discord\.com|discord\.gg)$/.test(host(u)) && /^users$/.test(seg(u)) ? u.toString() : null) },
  // ---- link pages ----
  ...(
    [
      ["Linktree", /^linktr\.ee$/],
      ["Carrd", /\.carrd\.co$|^carrd\.co$/],
      ["Beacons", /^beacons\.(ai|page)$/],
      ["bio.link", /^bio\.link$|\.bio\.link$/],
      ["lnk.bio", /^lnk\.bio$/],
      ["solo.to", /^solo\.to$/],
      ["guns.lol", /^guns\.lol$/],
      ["e-z.bio", /^e-z\.bio$/],
      ["Throne", /^throne\.(com|me)$/],
      ["Ko-fi", /^ko-fi\.com$/],
      ["Patreon", /^patreon\.com$/],
      ["VGen", /^vgen\.co$/],
      ["Gumroad", /\.gumroad\.com$|^gumroad\.com$/],
      ["itch.io", /\.itch\.io$/],
      ["Booth", /\.booth\.pm$|^booth\.pm$/],
      ["Linkin.bio", /^linkin\.bio$/],
      ["Taplink", /^taplink\.(cc|at)$/],
      ["Allmylinks", /^allmylinks\.com$/],
      ["Linkr", /^linkr\.bio$/],
      ["msha.ke", /^msha\.ke$/],
      ["campsite.bio", /^campsite\.bio$/],
      ["direct.me", /^direct\.me$/],
      ["Komi", /\.komi\.io$/],
      ["About.me", /^about\.me$/],
      ["Neocities", /\.neocities\.org$/],
      ["GitHub Pages", /\.github\.io$/],
    ] as const
  ).map(([site, re]): Reader => ({ site, kind: "linkpage", match: (u) => (re.test(host(u)) ? u.toString() : null) })),
  // ---- art and character sites ----
  { site: "Fur Affinity", kind: "art", match: (u) => (host(u) === "furaffinity.net" && seg(u) === "user" && seg(u, 1) ? `https://www.furaffinity.net/user/${encodeURIComponent(seg(u, 1))}/` : null) },
  { site: "DeviantArt", kind: "art", match: (u) => (host(u) === "deviantart.com" && isHandle(seg(u)) ? `https://www.deviantart.com/${encodeURIComponent(seg(u))}/about` : null) },
  {
    site: "ArtStation",
    kind: "art",
    match: (u) => (host(u) === "artstation.com" && isHandle(seg(u)) && !["artwork", "search"].includes(seg(u)) ? `https://www.artstation.com/users/${encodeURIComponent(seg(u))}.json` : null),
    parse: (b) => {
      const d = json(b);
      return d ? lines(d.full_name, d.headline, d.summary, d.location && `Location: ${d.location}`) : pageText(b);
    },
  },
  {
    site: "Pixiv",
    kind: "art",
    match: (u) => {
      const m = u.pathname.match(/\/users\/(\d+)/);
      return host(u) === "pixiv.net" && m ? `https://www.pixiv.net/ajax/user/${m[1]}?full=1` : null;
    },
    parse: (b) => {
      const d = json(b)?.body;
      return d ? lines(d.name, d.comment, d.region?.name && `Location: ${d.region.name}`) : "";
    },
  },
  { site: "Toyhouse", kind: "art", match: (u) => (host(u) === "toyhou.se" && isHandle(seg(u)) ? u.toString() : null) },
  { site: "Weasyl", kind: "art", match: (u) => (host(u) === "weasyl.com" && /^(~|profile)/.test(seg(u)) ? u.toString() : null) },
  { site: "Inkbunny", kind: "art", match: (u) => (host(u) === "inkbunny.net" && isHandle(seg(u)) ? u.toString() : null) },
];

/** Fediverse (Mastodon and friends): https://instance/@user. Tried through the
 *  public lookup API first; any server that isn't Mastodon-compatible falls
 *  back to the page. */
const FEDIVERSE: Reader = {
  site: "Fediverse",
  kind: "social",
  match: (u) => {
    const h = seg(u);
    if (!/^@[\w.\-]+(@[\w.\-]+)?$/.test(h) || seg(u, 1)) return null;
    return `https://${u.host}/api/v1/accounts/lookup?acct=${encodeURIComponent(h.slice(1))}`;
  },
  parse: (b) => {
    const d = json(b);
    if (!d || (!d.note && !d.display_name)) return "";
    const fields = Array.isArray(d.fields) ? d.fields.map((f: { name?: string; value?: string }) => `${f.name}: ${stripHtml(f.value ?? "")}`) : [];
    return lines(d.display_name, stripHtml(d.note ?? ""), ...fields);
  },
};

const KNOWN_FEDI_PAGE = new Set(["bsky.app", "x.com", "twitter.com", "threads.net", "threads.com", "tiktok.com", "youtube.com", "medium.com", "instagram.com"]);

export function readerFor(u: URL): Reader | null {
  for (const r of READERS) if (r.match(u)) return r;
  if (!KNOWN_FEDI_PAGE.has(host(u)) && FEDIVERSE.match(u)) return FEDIVERSE;
  return null;
}

/** "Bluesky", "Linktree"… or the host name. */
export function siteName(url: string): string {
  try {
    const u = new URL(url);
    return readerFor(u)?.site ?? host(u);
  } catch {
    return url;
  }
}

const LOGIN_WALL = /\b(log ?in|sign ?in|sign ?up)\b.{0,40}\b(to (see|view|continue)|required|for (full|more))|\bthis (account|profile) is private\b|\blogin_required\b/i;

/** Read one link: the site's reader, else the page. */
export async function readOne(url: string, fetcher: Fetcher, opts: ReadOptions): Promise<Omit<LinkRead, "depth" | "from">> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { url, site: url, status: "skipped", text: "", links: [], note: tr("linkMsg.notALink") };
  }
  const reader = readerFor(u);
  const site = reader?.site ?? host(u);
  if (reader?.kind === "social" && !opts.socials) return { url, site, status: "skipped", text: "", links: [], note: tr("linkMsg.socialSitesAreOff") };
  if (reader?.needs === "fxTwitter" && !opts.fxTwitter) return { url, site, status: "skipped", text: "", links: [], note: tr("linkMsg.xNeedsTheFxtwitterSwitch") };
  const target = reader?.match(u) ?? u.toString();
  let body: string;
  try {
    body = await fetcher(target);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // A fediverse guess that isn't one: try the page.
    if (reader === FEDIVERSE) {
      try {
        body = await fetcher(u.toString());
        const text = pageText(body).slice(0, 4000);
        return { url, site: host(u), status: text.length > 20 ? "read" : "unreachable", text, links: linksIn(body) };
      } catch {
        return { url, site: host(u), status: "unreachable", text: "", links: [], note: msg };
      }
    }
    const login = /\b(401|403)\b/.test(msg);
    return { url, site, status: login ? "login" : "unreachable", text: "", links: [], note: login ? tr("linkMsg.theSiteWantsALogin") : msg };
  }
  const text = (reader?.parse ? reader.parse(body, u) : pageText(body)).trim();
  const links = linksIn(body).filter((l) => l !== url);
  if (!text || (text.length < 200 && LOGIN_WALL.test(text))) return { url, site, status: "login", text: "", links, note: tr("linkMsg.onlyVisibleWhenLoggedIn") };
  return { url, site, status: "read", text: text.slice(0, 4000), links };
}

/** Read a person's links, and (depth > 0) the profile links found on them. */
export async function readLinks(start: string[], fetcher: Fetcher, opts: ReadOptions = DEFAULT_READ): Promise<LinkRead[]> {
  const out: LinkRead[] = [];
  const seen = new Set<string>();
  const norm = (s: string) => s.replace(/\/+$/, "").replace(/^https?:\/\/(www\.)?/, "").toLowerCase();
  let queue: { url: string; depth: number; from: string }[] = start.map((url) => ({ url, depth: 0, from: "bio" }));
  while (queue.length) {
    const next: typeof queue = [];
    for (const item of queue) {
      const key = norm(item.url);
      if (seen.has(key)) continue;
      seen.add(key);
      if (out.filter((r) => r.status !== "skipped").length >= opts.maxPages) {
        out.push({ ...item, site: siteName(item.url), status: "skipped", text: "", links: [], note: tr("linkMsg.pageLimitReached") });
        continue;
      }
      const r = await readOne(item.url, fetcher, opts);
      out.push({ ...r, depth: item.depth, from: item.from });
      if (item.depth < opts.depth) for (const l of r.links) if (!seen.has(norm(l))) next.push({ url: l, depth: item.depth + 1, from: item.url });
    }
    queue = next.slice(0, 30);
  }
  return out;
}
