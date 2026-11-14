// Age concerns: hints whether someone is over or under 18, your own notes, and
// the notes friends share. Designed so it can't become a list of minors:
//
// - Hints come only from the person's own VRChat profile (bio, pronouns,
//   status text, links) and, if you turn it on, one read of each page they
//   link to. Nothing is followed further.
// - VRChat's 18+ verification is ignored (verified accounts get sold).
// - Your notes stay on this device. Under-18 notes and hints are never shared,
//   exported or synced.
// - What you can share with friends is only "most certainly over 18",
//   "probably over 18" or a neutral "keep your distance" with no reason.
//   A missing vouch means nothing.
import { backend, isTauri } from "./backend";
import { getState, updateCache, updateLocal } from "./store";
import type { AgeHint, AgeNote, AgeRating, ShareNote } from "./types";

export const RATINGS: { value: AgeRating; label: string }[] = [
  { value: "sure-adult", label: "I'm sure they're an adult" },
  { value: "adult", label: "Most certainly over 18" },
  { value: "likely-adult", label: "Probably over 18" },
  { value: "likely-minor", label: "Probably under 18" },
  { value: "minor", label: "Most certainly under 18" },
];

export const SHARE_NOTES: { value: ShareNote["v"]; label: string }[] = [
  { value: "adult", label: "Most certainly over 18" },
  { value: "likely-adult", label: "Probably over 18" },
  { value: "distance", label: "Keep your distance" },
];

const DAY = 864e5;
/** Guesses fade: old ones shouldn't stick to people. "I'm sure" doesn't expire. */
export function noteExpires(n: AgeNote): number {
  if (n.rating === "sure-adult") return Infinity;
  return n.t + (n.rating === "likely-adult" || n.rating === "likely-minor" ? 180 : 365) * DAY;
}

export function noteOf(id: string): AgeNote | null {
  const n = getState().local.ageNotes?.[id];
  return n && noteExpires(n) > Date.now() ? n : null;
}

export function setNote(id: string, rating: AgeRating | null) {
  updateLocal((l) => {
    const ageNotes = { ...(l.ageNotes ?? {}) };
    if (rating) ageNotes[id] = { rating, t: Date.now() };
    else delete ageNotes[id];
    return { ...l, ageNotes };
  });
}

export function setShareNote(id: string, v: ShareNote["v"] | null) {
  updateLocal((l) => {
    const shareNotes = { ...(l.shareNotes ?? {}) };
    if (v) shareNotes[id] = { v, t: Date.now() };
    else delete shareNotes[id];
    return { ...l, shareNotes };
  });
}

// ---------- hints ----------

const YEAR = new Date().getFullYear();

type Rule = { dir: AgeHint["dir"]; weight: 1 | 2; re: RegExp; why: string; age?: (m: RegExpMatchArray) => number | null };

// Order matters: "minors DNI" is checked before a plain "minor".
const RULES: Rule[] = [
  { dir: "adult", weight: 2, re: /\b(?:minors?|under ?18s?|kids)\s*(?:dni|do\s*n[o']t\s*(?:interact|add|friend)|don'?t\s*(?:interact|add|friend)|stay\s*away|will\s*be\s*blocked|get\s*blocked|not\s*allowed|go\s*away)/i, why: "asks minors to stay away" },
  { dir: "adult", weight: 2, re: /\bdni\W{0,3}(?:if\s*(?:you'?re|ur)\s*(?:a\s*)?)?(?:minors?|under ?18|kids)\b/i, why: "asks minors to stay away" },
  { dir: "adult", weight: 2, re: /\b18\s*\+\s*only\b|\badults?\s*only\b|\bno\s*minors\b/i, why: "adults only" },
  { dir: "minor", weight: 2, re: /\b(?:i'?m|i\s*am|im|age[:\s]*|aged)\s*(1[0-7])\b(?!\s*(?:\+|cm|k|%|h\b))/i, why: "states an age under 18", age: (m) => Number(m[1]) },
  { dir: "adult", weight: 2, re: /\b(?:i'?m|i\s*am|im|age[:\s]*|aged)\s*(1[89]|[2-9]\d)\b(?!\s*(?:cm|k|%|h\b))/i, why: "states an age over 18", age: (m) => Number(m[1]) },
  { dir: "minor", weight: 2, re: /\b(1[0-7])\s*(?:y\/?o|yo|yrs?(?:\s*old)?|years?\s*old)\b/i, why: "states an age under 18", age: (m) => Number(m[1]) },
  { dir: "adult", weight: 2, re: /\b(1[89]|[2-9]\d)\s*(?:y\/?o|yo|yrs?(?:\s*old)?|years?\s*old)\b/i, why: "states an age over 18", age: (m) => Number(m[1]) },
  { dir: "minor", weight: 2, re: /\b(?:[6-9]|1[0-2])(?:st|nd|rd|th)\s*grade\b|\b(?:middle|junior\s*high)\s*school\b/i, why: "school grade" },
  { dir: "minor", weight: 1, re: /\bhigh\s*school(?:er)?\b|\bfreshman\b|\bsophomore\b/i, why: "high school" },
  { dir: "adult", weight: 1, re: /\b(?:college|university|uni)\s*(?:student|grad|graduate)?\b|\bgrad\s*school\b/i, why: "college or university" },
  { dir: "adult", weight: 1, re: /\b(?:my\s*(?:wife|husband|kids?|son|daughter)|married|fianc[ée]e?)\b/i, why: "family as an adult" },
  { dir: "adult", weight: 1, re: /\bnsfw\b|\b18\s*\+|\b21\s*\+/i, why: "18+ content" },
  { dir: "minor", weight: 2, re: /\b(?:i'?m|i\s*am|im)\s*(?:a\s*)?minor\b|\bunderage\b/i, why: "says they're a minor" },
  { dir: "minor", weight: 1, re: /\bteen(?:ager)?\b/i, why: "teen" },
];

const BORN = /\b(?:born|b\.|bday|birth\s*year)[^0-9]{0,12}((?:19|20)\d\d)\b|\b(?:19[5-9]\d|20[0-2]\d)\s*(?:born|kid|baby)\b/i;

/** Age hints in some text (pure, for tests). */
export function hintsIn(text: string, source: string): AgeHint[] {
  const out: AgeHint[] = [];
  let rest = text;
  for (const r of RULES) {
    const m = rest.match(r.re);
    if (!m) continue;
    const age = r.age?.(m);
    if (age != null && (age > 99 || age < 8)) continue;
    out.push({ dir: r.dir, weight: r.weight, why: r.why, source, snippet: snippet(text, m.index ?? 0, m[0].length) });
    // Don't count the same words twice ("minors DNI" isn't also "minor").
    rest = rest.replace(m[0], " ");
  }
  const b = text.match(BORN);
  if (b) {
    const year = Number(b[1] ?? b[0].slice(0, 4));
    if (year > 1940 && year <= YEAR) {
      const age = YEAR - year;
      out.push({ dir: age >= 19 ? "adult" : "minor", weight: 2, why: `born ${year}`, source, snippet: snippet(text, b.index ?? 0, b[0].length) });
    }
  }
  return out;
}

function snippet(text: string, at: number, len: number): string {
  const s = Math.max(0, at - 20);
  const e = Math.min(text.length, at + len + 20);
  return `${s > 0 ? "…" : ""}${text.slice(s, e).replace(/\s+/g, " ").trim()}${e < text.length ? "…" : ""}`;
}

export function summarize(hints: AgeHint[]): { adult: number; minor: number; verdict: "adult" | "minor" | "mixed" | "none" } {
  const adult = hints.filter((h) => h.dir === "adult").reduce((a, h) => a + h.weight, 0);
  const minor = hints.filter((h) => h.dir === "minor").reduce((a, h) => a + h.weight, 0);
  const verdict = adult && minor ? (adult >= minor * 2 ? "adult" : minor >= adult * 2 ? "minor" : "mixed") : adult ? "adult" : minor ? "minor" : "none";
  return { adult, minor, verdict };
}

/** Visible text of a fetched page (no scripts run: DOMParser only builds the tree). */
function pageText(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script:not([type='application/json']):not(#__NEXT_DATA__), style, noscript, svg").forEach((n) => n.remove());
    const meta = [...doc.querySelectorAll("meta[name='description'], meta[property='og:description'], meta[property='og:title']")]
      .map((m) => m.getAttribute("content") ?? "")
      .join(" \n ");
    // Link pages (Linktree and the like) keep their text in JSON.
    const json = [...doc.querySelectorAll("script[type='application/json'], #__NEXT_DATA__")]
      .map((s) => (s.textContent ?? "").match(/"(?:description|bio|title|name)"\s*:\s*"([^"]{1,300})"/g)?.join(" \n ") ?? "")
      .join(" \n ");
    return `${doc.title}\n${meta}\n${json}\n${doc.body?.innerText || doc.body?.textContent || ""}`.slice(0, 60_000);
  } catch {
    return html.slice(0, 60_000);
  }
}

const reading = new Set<string>();

/** Work out the hints for someone (when their profile is opened). Cached on this device. */
export async function refreshHints(id: string, force = false) {
  const s = getState();
  const settings = s.settings.age;
  if (!settings.enabled || reading.has(id)) return;
  const have = s.cache.ageHints?.[id];
  const d = s.cache.details[id];
  const f = s.cache.friends[id] ?? s.cache.others?.[id];
  if (!d && !f) return;
  if (!force && have && Date.now() - have.t < 7 * DAY && have.profileAt === (d?.profileFetchedAt ?? 0)) return;
  reading.add(id);
  try {
    const hints: AgeHint[] = [];
    hints.push(...hintsIn(d?.bio ?? "", "bio"));
    hints.push(...hintsIn(d?.pronouns ?? "", "pronouns"));
    hints.push(...hintsIn(f?.statusDescription ?? "", "status"));
    const links = (d?.bioLinks ?? []).slice(0, 5);
    for (const l of links) hints.push(...hintsIn(decodeURIComponent(l), "link"));
    if (settings.readLinks && isTauri && !s.demo) {
      for (const l of links) {
        try {
          const html = await backend.fetchLinkText(l);
          hints.push(...hintsIn(pageText(html), `linked page ${new URL(l).hostname}`));
        } catch {
          // unreachable or refused (private address, not text): no hints from it
        }
      }
    }
    updateCache((c) => ({ ...c, ageHints: { ...(c.ageHints ?? {}), [id]: { t: Date.now(), profileAt: d?.profileFetchedAt ?? 0, hints } } }));
  } finally {
    reading.delete(id);
  }
}

/** Notes friends shared about someone (adult vouches and "keep your distance"). */
export function friendNotesAbout(id: string): { by: string; byId?: string; v: ShareNote["v"]; t: number }[] {
  const s = getState();
  return s.local.imports.flatMap((l) =>
    (l.notes ?? [])
      .filter((n) => n.id === id && l.owner.id !== id)
      .map((n) => ({ by: (l.owner.id && s.cache.friends[l.owner.id]?.displayName) || l.owner.displayName, byId: l.owner.id, v: n.v, t: n.t })),
  );
}

/** Why to think twice before a friend request, or null. */
export function concernAbout(id: string): string | null {
  const s = getState();
  if (!s.settings.age.enabled || !s.settings.age.warnRequests) return null;
  const note = noteOf(id);
  if (note && (note.rating === "sure-adult" || note.rating === "adult")) return null;
  const reasons: string[] = [];
  if (note?.rating === "minor") reasons.push("your note says they're most certainly under 18");
  else if (note?.rating === "likely-minor") reasons.push("your note says they're probably under 18");
  const hints = s.cache.ageHints?.[id]?.hints ?? [];
  const sum = summarize(hints);
  if (!note && (sum.verdict === "minor" || sum.verdict === "mixed")) reasons.push(sum.verdict === "minor" ? "their profile has hints they're under 18" : "their profile has mixed age hints");
  const distance = friendNotesAbout(id).filter((n) => n.v === "distance");
  if (distance.length) reasons.push(`${distance.map((n) => n.by).join(", ")} said to keep your distance`);
  return reasons.length ? reasons.join("; ") : null;
}
