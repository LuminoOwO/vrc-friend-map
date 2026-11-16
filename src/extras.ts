// Desktop extras (Settings → Extras), all off by default:
//  - OSC: lines in VRChat's chatbox: a template every so often ({song},
//    {time}, {online}, {here}, {playtime}) and "★ Lumi came online";
//  - now playing: the song from your music player in your VRChat status text,
//    put back to what it was when the music stops or you switch it off;
//  - Steam play time: one line in your bio ("⏱ 2,431 h in VRChat"), updated
//    once a day, the rest of the bio left alone.
// Writes to your profile go through the same save as Profile → Edit (with its
// cooldown), and only when the text really changes.
import { invoke } from "@tauri-apps/api/core";
import { backend, isMobile, isTauri } from "./backend";
import { presenceOf } from "./model";
import { startOscLive, stopOscLive } from "./osclive";
import { recordSteamTotal } from "./steamdays";
import { getState, subscribeState } from "./store";
import { fetchProfile } from "./sync";

export const extrasHere = isTauri && !isMobile;

export interface NowPlaying {
  playing: boolean;
  artist: string;
  title: string;
  player: string;
}
export interface Playtime {
  minutes: number;
  two_weeks: number;
  last_played: number;
}

const LS = "vfm-extras";
interface Mem {
  /** Your status text before the song went in (to put back). */
  savedStatus?: string | null;
  /** The status text we set (to tell whether you changed it yourself since). */
  ourStatus?: string;
  /** Day of the last bio update (YYYY-MM-DD). */
  bioDay?: string;
}
function mem(): Mem {
  try {
    return JSON.parse(localStorage.getItem(LS) ?? "{}") as Mem;
  } catch {
    return {};
  }
}
function setMem(patch: Partial<Mem>) {
  try {
    localStorage.setItem(LS, JSON.stringify({ ...mem(), ...patch }));
  } catch {
    /* private mode: only for this run */
  }
}

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m).trim();
}

export function songText(n: NowPlaying | null): string {
  if (!n) return "";
  return n.artist ? `${n.artist} – ${n.title}` : n.title;
}

export const nowPlaying = () => invoke<NowPlaying | null>("now_playing");
export const steamPlaytime = () => invoke<Playtime | null>("steam_playtime");
export function chatbox(text: string) {
  const o = getState().settings.extras.osc;
  return invoke("osc_chatbox", { text, host: o.host, port: o.port, quiet: true });
}

/** The bio with the play time line put in (replacing an earlier one), or null when it wouldn't fit. */
export function bioWithLine(bio: string, template: string, hours: number): string | null {
  const line = fill(template, { hours: hours.toLocaleString("en-US") });
  const esc = template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\\{hours\\}", "[\\d.,\\s]+");
  const re = new RegExp(`^${esc}$`, "m");
  const next = re.test(bio) ? bio.replace(re, line) : bio ? `${bio.replace(/\s+$/, "")}\n${line}` : line;
  return next.length <= 512 ? next : null;
}

let timers: ReturnType<typeof setInterval>[] = [];
let unsub: (() => void) | null = null;
let song: NowPlaying | null = null;
let songSince = 0;
let lastStatusWrite = 0;
let lastLine = "";
let lastLineAt = 0;
let onlineBefore = new Set<string>();
let playtime: Playtime | null = null;

function inGame(): boolean {
  return !!getState().here?.active;
}

async function pollSong() {
  const x = getState().settings.extras;
  if (!x.nowPlaying.status && !(x.osc.enabled && x.osc.template.includes("{song}"))) return;
  const n = await nowPlaying().catch(() => null);
  const prev = songText(song);
  song = n && n.playing ? n : null;
  if (songText(song) !== prev) songSince = Date.now();
  await statusFromSong();
}

async function statusFromSong() {
  const st = getState();
  const me = st.cache.me;
  const x = st.settings.extras.nowPlaying;
  if (!me || st.demo) return;
  const current = me.profile?.statusDescription ?? "";
  const m = mem();
  // You changed your status yourself since: leave it alone and forget ours.
  if (m.ourStatus !== undefined && current !== m.ourStatus) {
    setMem({ ourStatus: undefined, savedStatus: undefined });
    return;
  }
  let want: string | null = null;
  if (x.status && song) want = fill(x.template, { title: song.title, artist: song.artist, song: songText(song) }).slice(0, 32);
  else if (m.ourStatus !== undefined) want = m.savedStatus ?? ""; // music stopped or switched off: put it back
  if (want === null || want === current) return;
  // Not more than one change a minute and a half; a song has to play 20 s first.
  if (Date.now() - lastStatusWrite < 90_000 || (song && Date.now() - songSince < 20_000)) return;
  lastStatusWrite = Date.now();
  const restoring = !(x.status && song);
  const res = await backend.updateProfile(me.id, { statusDescription: want }, {}).catch(() => null);
  if (!res || res.some((r) => r.status < 200 || r.status >= 300)) return;
  if (restoring) setMem({ ourStatus: undefined, savedStatus: undefined });
  else setMem({ ourStatus: want, savedStatus: m.ourStatus === undefined ? current : m.savedStatus });
  void fetchProfile(me.id).catch(() => {});
}

function oscVars(): Record<string, string> {
  const st = getState();
  const online = Object.values(st.cache.friends).filter((f) => presenceOf(f, st.cache.presence) === "online").length;
  const d = new Date();
  return {
    song: songText(song),
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    online: String(online),
    here: String(st.here?.players.length ?? 0),
    playtime: playtime ? Math.round(playtime.minutes / 60).toLocaleString("en-US") : "",
  };
}

function oscOk(): boolean {
  const o = getState().settings.extras.osc;
  if (!o.enabled) return false;
  const local = o.host === "127.0.0.1" || o.host === "::1" || o.host === "localhost";
  return !(o.onlyInGame && local) || inGame();
}

async function oscTick() {
  const o = getState().settings.extras.osc;
  if (!oscOk() || !o.template.trim()) return;
  const line = fill(o.template, oscVars());
  // A line with an empty song etc. is skipped; the same line only every 5 minutes again.
  if (!line || /\{\w+\}/.test(line)) return;
  if (line === lastLine && Date.now() - lastLineAt < 300_000) return;
  if (Date.now() - lastLineAt < o.everySecs * 1000) return;
  lastLine = line;
  lastLineAt = Date.now();
  await chatbox(line).catch(() => {});
}

/** "★ Lumi came online" for starred friends. */
function watchOnline() {
  const st = getState();
  const now = new Set(Object.values(st.cache.friends).filter((f) => presenceOf(f, st.cache.presence) !== "offline").map((f) => f.id));
  const o = st.settings.extras.osc;
  if (onlineBefore.size && o.enabled && o.starredOnline && oscOk()) {
    const starred = new Set(st.local.starred ?? []);
    const came = [...now].filter((id) => !onlineBefore.has(id) && starred.has(id));
    if (came.length && came.length <= 3) {
      const names = came.map((id) => st.local.nicknames?.[id] || st.cache.friends[id]?.displayName || "someone");
      void chatbox(`★ ${names.join(", ")} came online`).catch(() => {});
      lastLineAt = Date.now();
    }
  }
  onlineBefore = now;
}

async function bioTick() {
  const st = getState();
  const x = st.settings.extras.playtime;
  const me = st.cache.me;
  if (!x.bio || !me || st.demo || !x.template.includes("{hours}")) return;
  const day = new Date().toISOString().slice(0, 10);
  if (mem().bioDay === day) return;
  playtime = await steamPlaytime().catch(() => null);
  if (!playtime) return;
  recordSteamTotal(playtime.minutes);
  await fetchProfile(me.id).catch(() => {});
  const bio = getState().cache.details[me.id]?.bio ?? "";
  const next = bioWithLine(bio, x.template, Math.round(playtime.minutes / 60));
  setMem({ bioDay: day });
  if (next === null || next === bio) return;
  const res = await backend.updateProfile(me.id, {}, { bio: next }).catch(() => null);
  if (res && res.every((r) => r.status >= 200 && r.status < 300)) void fetchProfile(me.id).catch(() => {});
}

export function startExtras() {
  if (!extrasHere || timers.length) return;
  startOscLive();
  timers.push(setInterval(() => void pollSong(), 15_000));
  timers.push(setInterval(() => void oscTick(), 5_000));
  timers.push(setInterval(() => void bioTick(), 30 * 60_000));
  setTimeout(() => void bioTick(), 60_000);
  const steamTick = () =>
    void steamPlaytime()
      .then((p) => {
        playtime = p;
        if (p) recordSteamTotal(p.minutes);
      })
      .catch(() => {});
  timers.push(setInterval(steamTick, 30 * 60_000));
  steamTick();
  let lastFriends: unknown = null;
  let lastPresence: unknown = null;
  let t: ReturnType<typeof setTimeout> | undefined;
  unsub = subscribeState(() => {
    const c = getState().cache;
    if (c.friends === lastFriends && c.presence === lastPresence) return;
    lastFriends = c.friends;
    lastPresence = c.presence;
    clearTimeout(t);
    t = setTimeout(watchOnline, 2000);
  });
}

export function stopExtras() {
  stopOscLive();
  timers.forEach(clearInterval);
  timers = [];
  unsub?.();
  unsub = null;
  onlineBefore = new Set();
}
