// VRChat's own notes on people (shown in game on their profile), and the
// optional red-flag line the app keeps at the top of them.
//
// Settings → People → Red flags in VRChat notes (off by default):
//   mine:    "⚑ crasher, trolling"                       (your block reasons)
//   friends: "⚑ crasher · blocked by 2 friends · removed by Kai"
//   full:    "⚑ me: crasher · Luna: trolling · Kai removed them"
// "Compact" uses short words. The line is recognised by the ⚑ at the start
// of the first line; your own text below it is never changed. Nothing about
// age goes there (notes live on VRChat's servers).
import { friendNotesAbout } from "./age";
import { backend } from "./backend";
import { BLOCK_REASONS, friendBlocksAbout } from "./personal";
import { getState, updateCache } from "./store";
import { logSync } from "./synclog";
import { vrcWrite } from "./writes";

export const FLAG = "⚑";
/** VRChat's note length limit (characters). */
export const NOTE_MAX = 256;

const SHORT: Record<string, string> = {
  soundboard: "soundboard",
  "loud-music": "loud",
  "mic-spam": "mic spam",
  "annoying-avatar": "avatar",
  trolling: "troll",
  "invite-spam": "spam",
  begging: "begging",
  drama: "drama",
  "anti-queer": "anti-queer",
  racism: "racist",
  harassment: "harass",
  sexual: "sexual",
  following: "follows",
  "personal-space": "space",
  doxxing: "doxx",
  scam: "scam",
  impersonation: "fake",
  crasher: "crasher",
  seizure: "flashing",
  "malicious-links": "bad links",
  ripped: "ripped",
  "ban-evasion": "alt",
};

const label = (id: string, compact: boolean) => (compact ? SHORT[id] : BLOCK_REASONS.find((r) => r.id === id)?.label.toLowerCase()) ?? id;

export interface NotesLineSettings {
  mode: "off" | "mine" | "friends" | "full";
  compact: boolean;
}

/** Split a note into the app's flag line and your own text. */
export function splitNote(note: string): { line: string; rest: string } {
  const n = note ?? "";
  if (!n.startsWith(FLAG)) return { line: "", rest: n };
  const i = n.indexOf("\n");
  return i < 0 ? { line: n, rest: "" } : { line: n.slice(0, i), rest: n.slice(i + 1) };
}

/** The note with this flag line on top (or without one), within the limit. */
export function joinNote(line: string, rest: string, max = NOTE_MAX): string {
  if (!line) return rest.slice(0, max);
  const room = max - rest.length - (rest ? 1 : 0);
  if (room < 4) return rest.slice(0, max); // your own text comes first
  const l = line.length > room ? `${line.slice(0, room - 1)}…` : line;
  return rest ? `${l}\n${rest}` : l;
}

export interface FlagFacts {
  mine: string[];
  blocks: { by: string; reasons: string[] }[];
  removedBy: string[];
  distance: number;
}

/** The flag line for someone from these facts ("" when there's nothing). */
export function flagLine(f: FlagFacts, s: NotesLineSettings): string {
  if (s.mode === "off") return "";
  const parts: string[] = [];
  const mine = f.mine.map((r) => label(r, s.compact));
  if (s.mode === "mine") {
    if (!mine.length) return "";
    return `${FLAG} ${mine.join(", ")}`;
  }
  if (s.mode === "friends") {
    if (mine.length) parts.push(mine.join(", "));
    const reasons = [...new Set(f.blocks.flatMap((b) => b.reasons))].filter((r) => !f.mine.includes(r)).map((r) => label(r, s.compact));
    if (f.blocks.length) parts.push(`${s.compact ? "blk" : "blocked by"} ${f.blocks.length} friend${f.blocks.length === 1 ? "" : "s"}${reasons.length ? ` (${reasons.join(", ")})` : ""}`);
    if (f.removedBy.length) parts.push(`${s.compact ? "unfr" : "removed by"} ${f.removedBy.length === 1 ? f.removedBy[0] : `${f.removedBy.length} friends`}`);
    if (f.distance) parts.push(s.compact ? `distance×${f.distance}` : `keep distance (${f.distance})`);
  } else {
    if (mine.length) parts.push(`me: ${mine.join(", ")}`);
    for (const b of f.blocks) parts.push(`${b.by}: ${b.reasons.map((r) => label(r, s.compact)).join(", ") || (s.compact ? "blk" : "blocked")}`);
    for (const r of f.removedBy) parts.push(`${r} ${s.compact ? "unfr" : "removed them"}`);
    if (f.distance) parts.push(s.compact ? `distance×${f.distance}` : `keep distance (${f.distance})`);
  }
  return parts.length ? `${FLAG} ${parts.join(" · ")}` : "";
}

export function factsAbout(id: string): FlagFacts {
  const s = getState();
  const mine = s.local.blockReasons?.[id]?.reasons ?? [];
  const blocks = friendBlocksAbout(id).map((b) => ({ by: b.by, reasons: b.reasons }));
  const removedBy = s.local.imports
    .filter((l) => l.owner.id !== id && (l.removals ?? []).some((r) => r.id === id && Date.now() - r.t < 365 * 864e5))
    .map((l) => (l.owner.id && s.cache.friends[l.owner.id]?.displayName) || l.owner.displayName);
  const distance = friendNotesAbout(id).filter((n) => n.v === "distance").length;
  return { mine, blocks, removedBy, distance };
}

// ---------- VRChat's notes ----------

export interface UserNotesCache {
  byUser: Record<string, string>;
  fetchedAt: number;
}

/** Load all your VRChat notes (paged), at most every hour unless forced. */
export async function loadUserNotes(force = false): Promise<Record<string, string>> {
  const s = getState();
  const have = (s.cache as { userNotes?: UserNotesCache }).userNotes;
  if (!force && have && Date.now() - have.fetchedAt < 36e5) return have.byUser;
  const byUser: Record<string, string> = {};
  for (let offset = 0; offset < 5000; offset += 100) {
    const r = await backend.vrcGet("/userNotes", { n: 100, offset });
    if (r.status !== 200 || !Array.isArray(r.data)) break;
    const page = r.data as { targetUserId?: string; note?: string }[];
    for (const n of page) if (n?.targetUserId && typeof n.note === "string") byUser[n.targetUserId] = n.note;
    if (page.length < 100) break;
  }
  updateCache((c) => ({ ...c, userNotes: { byUser, fetchedAt: Date.now() } }) as typeof c);
  return byUser;
}

export function userNoteOf(id: string): string {
  const s = getState();
  return (s.cache as { userNotes?: UserNotesCache }).userNotes?.byUser[id] ?? s.cache.details[id]?.note ?? "";
}

/** Save a VRChat note (your own text; the app's flag line stays on top). */
export async function setUserNote(id: string, text: string): Promise<string | null> {
  const { line } = splitNote(userNoteOf(id));
  const note = joinNote(line, text.slice(0, NOTE_MAX));
  return writeNote(id, note);
}

async function writeNote(id: string, note: string): Promise<string | null> {
  try {
    const r = await vrcWrite("POST", "/userNotes", { targetUserId: id, note }, "Note");
    if (r.status < 200 || r.status >= 300) return `VRChat said no (${r.status})`;
    updateCache((c) => {
      const un = (c as { userNotes?: UserNotesCache }).userNotes ?? { byUser: {}, fetchedAt: 0 };
      const details = c.details[id] ? { ...c.details, [id]: { ...c.details[id], note } } : c.details;
      return { ...c, details, userNotes: { ...un, byUser: { ...un.byUser, [id]: note } } } as typeof c;
    });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** People whose flag line is out of date: [id, the new note]. */
export function pendingNoteLines(notes: Record<string, string>, s: NotesLineSettings): [string, string][] {
  const st = getState();
  const ids = new Set<string>([
    ...Object.keys(st.local.blockReasons ?? {}),
    ...st.local.imports.flatMap((l) => [...(l.removals ?? []).map((r) => r.id), ...((l as { blocks?: { id: string }[] }).blocks ?? []).map((b) => b.id), ...(l.notes ?? []).filter((n) => n.v === "distance").map((n) => n.id)]),
    // people who still have a line (to update or remove it)
    ...Object.entries(notes)
      .filter(([, n]) => n.startsWith(FLAG))
      .map(([id]) => id),
  ]);
  const out: [string, string][] = [];
  for (const id of ids) {
    if (id === st.cache.me?.id) continue;
    const current = notes[id] ?? "";
    const { rest } = splitNote(current);
    const next = joinNote(flagLine(factsAbout(id), s), rest);
    if (next !== current) out.push([id, next]);
  }
  return out;
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export async function updateNoteLines() {
  const st = getState();
  const s = st.settings.notesLine;
  if (running || st.demo || st.mode !== "app") return;
  // Off: still clean up lines the app wrote before (once per run).
  running = true;
  try {
    const notes = await loadUserNotes();
    const todo = pendingNoteLines(notes, s).slice(0, 40);
    for (const [id, note] of todo) {
      const err = await writeNote(id, note);
      if (err) {
        logSync({ area: "VRChat", step: "Red flags in notes", result: "failed", detail: err });
        break;
      }
    }
    if (todo.length) logSync({ area: "VRChat", step: "Red flags in notes", result: "ok", detail: `${todo.length} note${todo.length === 1 ? "" : "s"} updated` });
  } catch (e) {
    logSync({ area: "VRChat", step: "Red flags in notes", result: "failed", detail: String(e) });
  } finally {
    running = false;
  }
}

export function startNotesLine() {
  if (timer) return;
  const run = () => {
    const st = getState();
    // Only when the feature is on, or was on (lines to remove).
    const un = (st.cache as { userNotes?: UserNotesCache }).userNotes;
    const hasLines = !!un && Object.values(un.byUser).some((n) => n.startsWith(FLAG));
    if (st.settings.notesLine.mode !== "off" || hasLines) void updateNoteLines();
  };
  setTimeout(run, 60e3);
  timer = setInterval(run, 20 * 60e3);
}

export function stopNotesLine() {
  if (timer) clearInterval(timer);
  timer = null;
}
