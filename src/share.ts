// Sharing through vfm-servers: upload your friend list and activity to any
// number of servers, download what friends share with you from all of them.
// Encryption and signatures happen in Rust (src-tauri/src/share.rs); this
// file decides what to send where, and merges what comes back.
import { backend, type InfoResult, type PublishResult } from "./backend";
import { getState, newServer, setState, showToast, updateLocal, updateServer, updateSharing } from "./store";
import { combineStats } from "./together";
import { selectedIds } from "./selection";
import type { EncDefault, EncPolicy, ImportedList, PairTime, ServerInfoLite, ShareNote, ShareServer, SharedData, SharedRemoval } from "./types";

export const FRIENDS_FORMAT = "vrc-friend-map/friends-v1";
export const ACTIVITY_FORMAT = "vrc-friend-map/activity-v1";
/** The only notes about people that are ever sent or accepted. */
const SHAREABLE = new Set(["adult", "likely-adult", "distance"]);
const MAX_PAIRS = 5000;

// ---------- the encryption switch ----------

export interface SwitchState {
  /** What will be used for uploads. */
  on: boolean;
  /** The side that is greyed out (can't be chosen), if any. */
  locked: "on" | "off" | null;
  /** Ask before every upload: the server can read the data. */
  warn: boolean;
  /** Where the current position comes from. */
  source: "forced" | "yours" | "default";
  /** Text for the (?) button. */
  why: string;
}

const POLICY_TEXT: Record<EncPolicy, string> = {
  "force-off": "This server only accepts unencrypted uploads, so encryption can't be turned on here.",
  optional: "This server lets you choose. It suggests leaving encryption off.",
  recommended: "This server lets you choose and recommends encryption.",
  "force-on": "This server only accepts end-to-end encrypted uploads, so encryption can't be turned off here.",
};

const ON_TEXT = "On: your data is locked on this device for exactly the people you share with. The server stores it but can't read it, not even its owner with the files on disk. It only sees who shares with how many people, and when.";
const OFF_TEXT = "Off: the server can read what you upload. The people you choose still are the only ones who can download it, and it's signed so nobody can change it, but you're trusting whoever runs the server.";

/**
 * The rules:
 * - force-off: "on" is greyed out; the app warns before uploading.
 * - optional: "off" unless you (or your default) pick "on".
 * - recommended: "on" unless you (or your default) pick "off".
 * - force-on: "off" is greyed out.
 * Your default ("always on" / "always off") replaces the server's
 * suggestion where the server lets you choose; a forced server wins.
 */
export function encryptionSwitch(policy: EncPolicy | undefined, def: EncDefault, choice: boolean | null): SwitchState {
  const p: EncPolicy = policy ?? "recommended";
  if (p === "force-off")
    return { on: false, locked: "on", warn: true, source: "forced", why: `${POLICY_TEXT[p]} ${OFF_TEXT} Only upload here if you fully trust the people running it.` };
  if (p === "force-on") return { on: true, locked: "off", warn: false, source: "forced", why: `${POLICY_TEXT[p]} ${ON_TEXT}` };
  const suggested = def === "on" ? true : def === "off" ? false : p === "recommended";
  const on = choice ?? suggested;
  const from =
    choice !== null ? "You set this for this server." : def === "server" ? "Following the server's suggestion (your default: server-based)." : `Following your default (always ${def}).`;
  return { on, locked: null, warn: false, source: choice !== null ? "yours" : "default", why: `${POLICY_TEXT[p]} ${from} ${on ? ON_TEXT : OFF_TEXT}` };
}

export function serverSwitch(s: ShareServer): SwitchState {
  return encryptionSwitch(s.info?.encryption, getState().settings.sharing.encDefault, s.encrypt);
}

/** Uploads to this server would need the "not encrypted" confirmation now. */
export function needsConfirm(s: ShareServer): boolean {
  return s.upload && serverSwitch(s).warn && !s.ackUnencrypted && (s.shareFriends || s.shareActivity);
}

// ---------- servers ----------

function lite(r: InfoResult): ServerInfoLite {
  const i = r.info;
  return {
    name: i.name,
    version: i.version,
    encryption: i.encryption,
    registration: i.registration,
    motd: i.motd,
    loggerEnabled: i.logger.enabled,
    loggerPaired: i.logger.paired,
    maxItemBytes: i.max_item_bytes,
  };
}

export function serverName(s: ShareServer): string {
  return s.info?.name || s.url.replace(/^https?:\/\//, "");
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Look a server up and add it (not signed up yet). */
export async function addServer(url: string): Promise<ShareServer> {
  const r = await backend.share.info(url);
  const existing = getState().settings.sharing.servers.find((s) => s.url === r.url);
  if (existing) throw new Error(`${serverName(existing)} is already in your list.`);
  const s: ShareServer = { ...newServer(r.url), info: lite(r), infoAt: Date.now(), keyChanged: r.keyChanged };
  // With "always off" or a force-off server, don't start uploading by surprise.
  const sw = encryptionSwitch(s.info?.encryption, getState().settings.sharing.encDefault, null);
  if (sw.warn || (getState().settings.sharing.encDefault === "on" && !sw.on)) s.upload = false;
  updateSharing({ servers: [...getState().settings.sharing.servers, s] });
  return s;
}

export async function refreshServer(id: string): Promise<ShareServer | null> {
  const s = getState().settings.sharing.servers.find((x) => x.id === id);
  if (!s) return null;
  try {
    const r = await backend.share.info(s.url);
    const info = lite(r);
    updateServer(id, (cur) => ({
      info,
      infoAt: Date.now(),
      keyChanged: r.keyChanged,
      // A server that switched to force-off has to be confirmed again.
      ackUnencrypted: cur.info?.encryption === "force-off" && info.encryption === "force-off" ? cur.ackUnencrypted : false,
      lastError: "",
    }));
  } catch (e) {
    updateServer(id, { lastError: errText(e) });
  }
  return getState().settings.sharing.servers.find((x) => x.id === id) ?? null;
}

export async function registerServer(id: string, invite?: string) {
  const s = getState().settings.sharing.servers.find((x) => x.id === id);
  if (!s) return;
  await backend.share.register(s.url, invite);
  let loggerOwner = false;
  try {
    loggerOwner = (await backend.share.me(s.url)).loggerOwner;
  } catch {
    /* fine */
  }
  updateServer(id, { registered: true, lastError: "", loggerOwner });
}

/** Remove from the list; optionally delete your account and uploads there first. */
export async function removeServer(id: string, leave: boolean) {
  const s = getState().settings.sharing.servers.find((x) => x.id === id);
  if (!s) return;
  if (leave && s.registered) await backend.share.leave(s.url);
  updateSharing({ servers: getState().settings.sharing.servers.filter((x) => x.id !== id) });
  // Forget what only this server delivered.
  const data = getShared();
  for (const [k, it] of Object.entries(data.items)) {
    it.servers = it.servers.filter((x) => x !== id);
    if (!it.servers.length) delete data.items[k];
  }
  delete data.logger[id];
  setShared(data);
}

export async function trustServerKey(id: string) {
  const s = getState().settings.sharing.servers.find((x) => x.id === id);
  if (!s) return;
  await backend.share.trustServer(s.url);
  await refreshServer(id);
}

// ---------- logger ----------

export async function pairLogger(id: string, code: string) {
  const s = getState().settings.sharing.servers.find((x) => x.id === id);
  if (!s) return;
  await backend.share.loggerPair(s.url, code.replace(/\s/g, ""));
  updateServer(id, { loggerOwner: true });
  await refreshServer(id);
  await fetchLogger(s.id).catch(() => {});
}

export async function unpairLogger(id: string, forget: boolean) {
  const s = getState().settings.sharing.servers.find((x) => x.id === id);
  if (!s) return;
  await backend.share.loggerUnpair(s.url, forget);
  updateServer(id, { loggerOwner: false });
  if (forget) {
    const data = getShared();
    delete data.logger[id];
    setShared(data);
  }
  await refreshServer(id);
}

async function fetchLogger(id: string) {
  const s = getState().settings.sharing.servers.find((x) => x.id === id);
  if (!s?.loggerOwner) return;
  const st = await backend.share.loggerStats(s.url);
  const offset = new Date().getTimezoneOffset() * 60;
  const data = getShared();
  data.logger[id] = {
    // The app's live pairs use "naive local" seconds for `last`.
    pairs: st.pairs.map((p) => ({ ...p, last: p.last - offset })),
    since: st.since * 1000,
    updated: st.updated * 1000,
    people: st.people.length,
  };
  setShared(data);
}

// ---------- received data ----------

let shared: SharedData | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function getShared(): SharedData {
  shared ??= { items: {}, logger: {} };
  return { items: { ...shared.items }, logger: { ...shared.logger } };
}

function setShared(d: SharedData) {
  shared = d;
  setState({ shared: d });
  applyReceivedLists(d);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    backend.storeWrite("shared", JSON.stringify(shared)).catch(() => {});
  }, 1500);
}

/** Pinned keys, for the "key confirmed by bio" check and changed keys. */
export async function loadPins() {
  try {
    setState({ keyPins: await backend.share.pins() });
  } catch {
    /* browser / demo */
  }
}

/** "vfm-key:<20 hex>" in a bio. */
export function bioKey(bio: string | undefined): string | null {
  const m = /vfm-key:([0-9a-f]{20})\b/i.exec(bio ?? "");
  return m ? m[1].toLowerCase() : null;
}

/** Does the key a friend put in their bio match the one servers gave you? */
export function bioKeyState(bio: string | undefined, pin: { fingerprint: string } | undefined): "match" | "mismatch" | "unknown" | null {
  const k = bioKey(bio);
  if (!k) return null;
  if (!pin) return "unknown";
  return pin.fingerprint.replace(/\s/g, "") === k ? "match" : "mismatch";
}

export async function acceptKey(user: string) {
  await backend.share.trustKey(user);
  await loadPins();
}

export async function loadShared() {
  try {
    const raw = await backend.storeRead("shared");
    const p = raw ? JSON.parse(raw) : null;
    shared = p && typeof p === "object" ? { items: p.items ?? {}, logger: p.logger ?? {} } : { items: {}, logger: {} };
  } catch {
    shared = { items: {}, logger: {} };
  }
  setState({ shared });
  loadPins();
}

interface FriendsPayload {
  format: string;
  owner?: { id?: string; displayName?: string };
  exportedAt?: string;
  friends?: { id: string; displayName: string }[];
  removals?: SharedRemoval[];
  notes?: { id: string; v: string; t: number }[];
}

/** Friend lists from servers show up under Shared lists, updated on every sync. */
function applyReceivedLists(d: SharedData) {
  const servers = getState().settings.sharing.servers;
  const name = (id: string) => {
    const s = servers.find((x) => x.id === id);
    return s ? serverName(s) : "a server";
  };
  const lists: ImportedList[] = [];
  for (const it of Object.values(d.items)) {
    if (it.kind !== "friends") continue;
    const p = it.payload as FriendsPayload;
    if (!p || p.format !== FRIENDS_FORMAT || !Array.isArray(p.friends)) continue;
    const ownerName = getState().cache.friends[it.owner]?.displayName ?? p.owner?.displayName ?? "Someone";
    lists.push({
      id: `srv:${it.owner}`,
      importedAt: it.created * 1000,
      owner: { id: it.owner, displayName: ownerName },
      exportedAt: p.exportedAt,
      mode: "full",
      friends: p.friends.filter((f) => f && typeof f.id === "string").map((f) => ({ id: f.id, displayName: String(f.displayName ?? "") })),
      via: [...new Set(it.servers.map(name))],
      notes: Array.isArray(p.notes)
        ? p.notes
            .filter((n) => n && typeof n.id === "string" && typeof n.t === "number" && SHAREABLE.has(n.v))
            .map((n) => ({ id: n.id, v: n.v as ShareNote["v"], t: n.t }))
        : undefined,
      removals: Array.isArray(p.removals)
        ? p.removals
            .filter((r) => r && typeof r.id === "string" && typeof r.t === "number")
            .map((r) => ({ id: r.id, t: r.t, byMe: r.byMe === true, together: r.together === true }))
        : undefined,
    });
  }
  const local = getState().local;
  const others = local.imports.filter((l) => !l.id.startsWith("srv:"));
  const before = JSON.stringify(local.imports.filter((l) => l.id.startsWith("srv:")));
  if (before === JSON.stringify(lists)) return;
  updateLocal((l) => ({ ...l, imports: [...others, ...lists] }));
}

/** Activity friends shared with you, as pair times. */
export function receivedPairs(d: SharedData | null): PairTime[][] {
  if (!d) return [];
  const out: PairTime[][] = [];
  for (const it of Object.values(d.items)) {
    if (it.kind !== "activity") continue;
    const p = it.payload as { format?: string; pairs?: PairTime[] };
    if (p?.format === ACTIVITY_FORMAT && Array.isArray(p.pairs)) out.push(p.pairs.filter((x) => x && typeof x.a === "string" && typeof x.b === "string"));
  }
  return out;
}

export function loggerPairs(d: SharedData | null): PairTime[][] {
  return d ? Object.values(d.logger).map((l) => l.pairs) : [];
}

// ---------- uploading ----------

function recipients(s: ShareServer): string[] {
  return selectedIds({ who: s.audience, circleIds: s.circleIds, picked: s.audiencePicked, autoAdd: s.audienceAutoAdd });
}

function friendsPayload(s: ShareServer): string {
  const st = getState();
  const me = st.cache.me;
  const body: FriendsPayload = {
    format: FRIENDS_FORMAT,
    owner: { id: me?.id, displayName: me?.displayName },
    exportedAt: new Date().toISOString(),
    friends: selectedIds(s.include)
      .map((id) => st.cache.friends[id])
      .map((f) => ({ id: f.id, displayName: f.displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
  };
  if (s.shareRemovals) {
    const year = Date.now() - 365 * 864e5;
    body.removals = st.local.friendLog
      .filter((e) => e.type === "removed" && e.t > year)
      .slice(-300)
      .map((e) => ({ id: e.id, t: e.t, byMe: e.byMe, together: e.together }));
  }
  if (s.shareNotes) {
    // Only adult vouches and "keep your distance" exist here; under-18 notes never leave the device.
    body.notes = Object.entries(st.local.shareNotes ?? {})
      .filter(([, n]) => SHAREABLE.has(n.v))
      .slice(0, 2000)
      .map(([id, n]) => ({ id, v: n.v, t: n.t }));
  }
  return JSON.stringify({ ...body, mode: "full" });
}

/** Your own time-together numbers (game logs, live locations, your loggers),
 *  only between your friends (and you); never what others shared with you. */
function activityPayload(s: ShareServer): string {
  const st = getState();
  const known = new Set(selectedIds(s.include));
  if (st.cache.me) known.add(st.cache.me.id);
  const live = maxPairs([st.observed?.pairs ?? [], ...loggerPairs(st.shared)]);
  const stats = combineStats(st.settings.groups.useLogs ? st.logs.stats : null, live);
  const pairs = (stats?.pairs ?? [])
    .filter((p) => known.has(p.a) && known.has(p.b))
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, MAX_PAIRS)
    .map((p) => ({ a: p.a, b: p.b, secs: Math.round(p.secs), weighted: Math.round(p.weighted), visits: p.visits, days: p.days, last: p.last }));
  return JSON.stringify({ format: ACTIVITY_FORMAT, createdAt: new Date().toISOString(), pairs });
}

/** Several observations of the same pairs (different loggers, friends'
 *  apps): they see the same time together, so take the largest, don't add. */
export function maxPairs(lists: PairTime[][]): PairTime[] {
  const m = new Map<string, PairTime>();
  for (const list of lists)
    for (const p of list) {
      const k = p.a < p.b ? `${p.a}|${p.b}` : `${p.b}|${p.a}`;
      const cur = m.get(k);
      if (!cur) m.set(k, { ...p });
      else {
        cur.secs = Math.max(cur.secs, p.secs);
        cur.weighted = Math.max(cur.weighted, p.weighted);
        cur.days = Math.max(cur.days, p.days);
        cur.visits = Math.max(cur.visits, p.visits);
        cur.last = Math.max(cur.last, p.last);
      }
    }
  return [...m.values()];
}

function describe(kinds: string[], r: PublishResult | null, waiting: number, changed: string[]): string {
  if (!kinds.length) return "Not sharing anything here.";
  const what = kinds.map((k) => (k === "friends" ? "friend list" : "activity")).join(" and ");
  let t = `Shared your ${what} with ${r?.recipients ?? 0} ${r?.recipients === 1 ? "person" : "people"}${r?.sealed ? " (encrypted)" : " (not encrypted)"}.`;
  if (waiting) t += ` ${waiting} more will get it once they join this server.`;
  if (changed.length) t += ` ${changed.length} left out: their key changed (check in the server's settings).`;
  return t;
}

export interface SyncOptions {
  /** Started by you (not the timer): may show the confirmation dialog. */
  manual?: boolean;
}

/** Upload, download, and fetch your logger, for one server. */
export async function syncServer(id: string, opts: SyncOptions = {}): Promise<void> {
  let s = await refreshServer(id);
  if (!s || !s.info || s.keyChanged) return;
  const st = getState();
  if (st.demo || !st.cache.me) return;
  if (!s.registered) return;
  const notes: string[] = [];
  try {
    // ---- upload ----
    const sw = serverSwitch(s);
    const wanted = s.upload ? (["friends", "activity"] as const).filter((k) => (k === "friends" ? s!.shareFriends : s!.shareActivity)) : [];
    const blocked = wanted.length > 0 && sw.warn && !s.ackUnencrypted;
    if (blocked) {
      if (opts.manual) {
        // Ask; the dialog calls syncServer again after you confirm.
        setState({ confirmUnencrypted: id });
        return;
      }
      notes.push("Waiting for you to confirm uploading without encryption (press Sync now).");
    } else {
      const to = recipients(s);
      let last: PublishResult | null = null;
      let waiting = 0;
      const changed = new Set<string>();
      for (const kind of wanted) {
        const payload = kind === "friends" ? friendsPayload(s) : activityPayload(s);
        const max = s.info.maxItemBytes || 1 << 20;
        if (payload.length * 1.4 > max) {
          notes.push(`Your ${kind === "friends" ? "friend list" : "activity"} is bigger than this server takes (${Math.round(max / 1024)} KB).`);
          continue;
        }
        last = await backend.share.publish(s.url, kind, payload, to, sw.on);
        waiting = Math.max(waiting, last.notOnServer.length);
        last.keyChanged.forEach((k) => changed.add(k));
      }
      // Stop sharing kinds you turned off.
      for (const kind of s.published.filter((k) => !(wanted as readonly string[]).includes(k))) {
        await backend.share.unpublish(s.url, kind).catch(() => {});
      }
      updateServer(id, { published: [...wanted] });
      if (wanted.length) notes.push(describe([...wanted], last, waiting, [...changed]));
    }

    // ---- download ----
    if (s.download) {
      const inbox = await backend.share.inbox(s.url);
      const me = getState().cache.me?.id;
      const data = getShared();
      const seen = new Set<string>();
      let fresh = 0;
      let problems = 0;
      for (const it of inbox) {
        if (it.owner === me) continue;
        if (it.error || it.payload == null) {
          problems++;
          continue;
        }
        const k = `${it.owner}|${it.kind}`;
        seen.add(k);
        const cur = data.items[k];
        if (!cur || cur.created < it.created) {
          data.items[k] = { owner: it.owner, kind: it.kind, created: it.created, sealed: it.sealed, servers: [id], payload: it.payload };
          fresh++;
        } else if (cur.created === it.created && !cur.servers.includes(id)) {
          data.items[k] = { ...cur, servers: [...cur.servers, id] };
        }
      }
      // Gone from this server (they stopped sharing with you): forget it,
      // unless another server still has it.
      for (const [k, it] of Object.entries(data.items)) {
        if (it.servers.includes(id) && !seen.has(k)) {
          const rest = it.servers.filter((x) => x !== id);
          if (rest.length) data.items[k] = { ...it, servers: rest };
          else delete data.items[k];
        }
      }
      setShared(data);
      const people = new Set(inbox.filter((i) => i.owner !== me && !i.error).map((i) => i.owner)).size;
      notes.push(`${people} ${people === 1 ? "person shares" : "people share"} with you here${fresh ? ` (${fresh} new)` : ""}.`);
      if (problems) notes.push(`${problems} item${problems === 1 ? "" : "s"} couldn't be used (changed keys or damaged).`);
    }

    // ---- logger ----
    s = getState().settings.sharing.servers.find((x) => x.id === id) ?? s;
    if (s.loggerOwner) {
      try {
        await fetchLogger(id);
      } catch (e) {
        const msg = errText(e);
        if (/isn't paired|someone else/.test(msg)) updateServer(id, { loggerOwner: false });
        notes.push(`Logger: ${msg}`);
      }
    }
    updateServer(id, { lastSync: Date.now(), lastError: "", lastNote: notes.join(" ") });
  } catch (e) {
    const msg = errText(e);
    updateServer(id, { lastSync: Date.now(), lastError: msg, lastNote: notes.join(" ") });
    if (/not registered/.test(msg)) updateServer(id, { registered: false });
    if (opts.manual) showToast(`${serverName(s)}: ${msg}`);
  }
}

let syncing = false;

export async function syncAllServers(opts: SyncOptions = {}) {
  if (syncing) return;
  const st = getState();
  if (st.demo || st.mode !== "app" || !st.cache.me) return;
  syncing = true;
  setState({ shareBusy: true });
  try {
    for (const s of st.settings.sharing.servers) await syncServer(s.id, opts);
  } finally {
    syncing = false;
    setState({ shareBusy: false });
    loadPins();
  }
}

/** After the "not encrypted" dialog. */
export async function confirmUnencrypted(id: string, dontAskAgain: boolean, go: boolean) {
  setState({ confirmUnencrypted: null });
  if (!go) {
    updateServer(id, { lastNote: "Upload cancelled: not encrypted on this server." });
    return;
  }
  updateServer(id, { ackUnencrypted: true });
  try {
    await syncServer(id, { manual: true });
  } finally {
    // Without "don't ask again" the next upload asks again.
    if (!dontAskAgain) updateServer(id, { ackUnencrypted: false });
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
let nextAt = 0;

export function startSharing() {
  if (timer) return;
  nextAt = Date.now() + 20_000;
  timer = setInterval(() => {
    const st = getState();
    const sh = st.settings.sharing;
    if (!sh.autoSync || !sh.servers.length || st.demo || st.mode !== "app" || st.sync.running) return;
    if (Date.now() < nextAt) return;
    nextAt = Date.now() + sh.intervalMin * 60_000 + Math.random() * 60_000;
    syncAllServers();
  }, 15_000);
}

export function stopSharing() {
  if (timer) clearInterval(timer);
  timer = null;
}
