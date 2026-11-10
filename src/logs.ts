// Game-log reading on desktop: finds VRChat's log folders, scans them on a
// timer, and turns the stored history into time-together statistics and
// friend group suggestions.
import { useMemo } from "react";
import { backend, isTauri } from "./backend";
import { useDerived } from "./derived";
import { detectGroups, suggestionName, toSuggestions, type Suggestion } from "./groups";
import { createCircle, getState, patchCircle, setLogs, showToast, updateLocal, useApp } from "./store";
import type { PresenceStats } from "./types";

let timer: ReturnType<typeof setInterval> | null = null;
let timerMinutes = 0;
let statsKey = "";

/** Current local wall-clock time in the logs' "naive" seconds. */
export function nowNaive(): number {
  return Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 1000);
}

/** Naive log seconds -> real Date in local time. */
export function naiveToDate(n: number): Date {
  const d = new Date(n * 1000);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}

export const DESKTOP = ["linux", "windows", "macos"];

export function logsSupported(platform: string): boolean {
  return DESKTOP.includes(platform);
}

export function logDirs(): string[] {
  const s = getState();
  const set = new Set<string>();
  if (s.settings.logs.autoDetect) s.logs.detected.forEach((d) => set.add(d));
  s.settings.logs.dirs.forEach((d) => d.trim() && set.add(d.trim()));
  return [...set];
}

/** Called once at startup (and when leaving demo mode). */
export async function initLogs() {
  if (!isTauri) {
    setLogs({ platform: "browser" });
    return;
  }
  const platform = await backend.platform().catch(() => "");
  setLogs({ platform });
  if (!logsSupported(platform)) return;
  const detected = await backend.logsDetect().catch(() => []);
  const report = await backend.logsInfo().catch(() => null);
  setLogs({ detected, report });
  await refreshStats(true);
  scheduleLogScans();
}

/** (Re)arm the periodic scan to match the current settings. */
export function scheduleLogScans() {
  const s = getState();
  const minutes = s.settings.logs.enabled && logsSupported(s.logs.platform) && !s.demo ? s.settings.logs.scanMinutes : 0;
  if (minutes === timerMinutes && (timer || !minutes)) return;
  if (timer) clearInterval(timer);
  timer = null;
  timerMinutes = minutes;
  if (!minutes) return;
  scanLogs(false);
  timer = setInterval(() => scanLogs(false), minutes * 60000);
}

export function stopLogScans() {
  if (timer) clearInterval(timer);
  timer = null;
  timerMinutes = 0;
}

export async function scanLogs(manual: boolean) {
  const s = getState();
  if (s.demo || s.logs.scanning || !logsSupported(s.logs.platform)) return;
  if (!s.settings.logs.enabled && !manual) return;
  const dirs = logDirs();
  if (!dirs.length) {
    setLogs({ error: manual ? "No VRChat log folder found. Add it under Settings → Game logs." : "" });
    return;
  }
  setLogs({ scanning: true, error: "" });
  try {
    const report = await backend.logsScan(dirs, s.settings.logs.retentionDays);
    setLogs({
      report,
      scanning: false,
      lastScan: Date.now(),
      error: report.newer_version
        ? `The log history was saved by a newer version of the app (format ${report.newer_version}); it's left untouched.`
        : report.errors.join("; "),
    });
    if (report.files_read > 0 || !getState().logs.stats) await refreshStats(true);
    if (manual) showToast(report.files_read ? `Read ${report.files_read} log file${report.files_read === 1 ? "" : "s"}` : "No new log entries");
  } catch (e) {
    setLogs({ scanning: false, error: String(e) });
  }
}

/** Recompute time-together statistics for the current friend list. */
export async function refreshStats(force = false) {
  const s = getState();
  if (s.demo || !isTauri || !logsSupported(s.logs.platform)) return;
  const friendIds = Object.keys(s.cache.friends).sort();
  const g = s.settings.groups;
  const selfId = s.cache.me?.id ?? s.session?.user_id ?? null;
  const since = g.sinceDays > 0 ? nowNaive() - g.sinceDays * 86400 : null;
  const key = `${friendIds.length}:${friendIds.join(",").length}:${selfId}:${g.crowd}:${g.sinceDays}:${s.logs.report?.visits ?? 0}:${s.logs.report?.last ?? 0}`;
  if (!force && key === statsKey) return;
  statsKey = key;
  if (!friendIds.length) return;
  try {
    const stats = await backend.logsStats({ friend_ids: friendIds, self_id: selfId, crowd: g.crowd, since });
    setLogs({ stats });
  } catch (e) {
    setLogs({ error: String(e) });
  }
}

export async function forgetLogHistory() {
  await backend.logsClear();
  statsKey = "";
  setLogs({ stats: null, report: await backend.logsInfo().catch(() => null) });
  updateLocal((l) => ({ ...l, dismissedGroups: [] }));
}

// ---------- suggestions ----------

export function useGroupSuggestions(): { suggestions: Suggestion[]; pairsUsable: number } {
  const stats = useApp((s) => s.logs.stats);
  const circles = useApp((s) => s.local.circles);
  const dismissed = useApp((s) => s.local.dismissedGroups);
  const g = useApp((s) => s.settings.groups);
  const friendsMap = useApp((s) => s.cache.friends);
  const { idsKey, edges } = useDerived();
  const groups = useMemo(() => {
    if (!stats) return { list: [], usable: 0 };
    const friendIds = new Set(Object.keys(friendsMap));
    const mutual = new Set(edges.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
    const usable = stats.pairs.filter((p) => p.secs >= g.minMinutes * 60 && p.days >= g.minDays).length;
    return { list: detectGroups(stats, friendIds, mutual, g), usable };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, idsKey, edges, g]);
  const suggestions = useMemo(() => toSuggestions(groups.list, circles, dismissed), [groups, circles, dismissed]);
  return { suggestions, pairsUsable: groups.usable };
}

export function nameOf(id: string): string {
  return getState().cache.friends[id]?.displayName ?? "Someone";
}

export function acceptSuggestion(s: Suggestion, only?: string[]) {
  const all = only ?? [...s.members, ...s.extra];
  if (s.match) {
    const circle = getState().local.circles.find((c) => c.id === s.match!.circleId);
    if (!circle) return;
    const add = all.filter((id) => !circle.members.includes(id));
    patchCircle(circle.id, { members: [...circle.members, ...add], ...(circle.auto ? { auto: true } : {}) });
    showToast(`Added ${add.length} ${add.length === 1 ? "person" : "people"} to ${circle.name}`);
  } else {
    createCircle(suggestionName(s, nameOf), all);
    showToast(`Created a circle with ${all.length} people`);
  }
}

export function dismissSuggestion(s: Suggestion) {
  const all = [...s.members, ...s.extra];
  updateLocal((l) => ({ ...l, dismissedGroups: [...l.dismissedGroups, all].slice(-200) }));
}

/** Auto mode: create circles for new groups and grow circles it created. */
export function applyAutoGroups(suggestions: Suggestion[]) {
  let created = 0;
  let updated = 0;
  for (const s of suggestions) {
    const all = [...s.members, ...s.extra];
    if (s.match) {
      if (!s.match.auto) continue; // never change circles you made yourself
      const circle = getState().local.circles.find((c) => c.id === s.match!.circleId);
      if (!circle) continue;
      patchCircle(circle.id, { members: [...new Set([...circle.members, ...all])], auto: true });
      updated++;
    } else {
      createCircle(suggestionName(s, nameOf), all, { auto: true });
      created++;
    }
  }
  if (created || updated) {
    const parts = [created && `created ${created}`, updated && `updated ${updated}`].filter(Boolean).join(", ");
    showToast(`Automatic groups: ${parts}`);
  }
}

export function personTime(stats: PresenceStats | null, id: string) {
  return stats?.people.find((p) => p.id === id) ?? null;
}

export function fmtHours(secs: number): string {
  const h = secs / 3600;
  if (h < 1) return `${Math.max(1, Math.round(secs / 60))} min`;
  if (h < 10) return `${h.toFixed(1).replace(/\.0$/, "")} h`;
  return `${Math.round(h)} h`;
}
