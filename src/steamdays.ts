// Steam play time per day. Steam's files only hold VRChat's running total, so
// the app notes that total once a day (the last value seen that day) and a
// day's play time is the difference to the day before. Only on this device.

import { shiftDay, todayKey } from "./logbook";

const LS = "vfm-steam-days";
const KEEP = 800;

export type SteamDays = Record<string, number>;

export function loadSteamDays(): SteamDays {
  try {
    const v = JSON.parse(localStorage.getItem(LS) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** The total (minutes) seen now, as today's value. Returns the updated record. */
export function noteSteamTotal(days: SteamDays, minutes: number, day = todayKey()): SteamDays {
  if (!Number.isFinite(minutes) || minutes <= 0 || days[day] === minutes) return days;
  const next: SteamDays = { ...days, [day]: Math.round(minutes) };
  const keys = Object.keys(next).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) delete next[k];
  return next;
}

export function recordSteamTotal(minutes: number) {
  const before = loadSteamDays();
  const after = noteSteamTotal(before, minutes);
  if (after === before) return;
  try {
    localStorage.setItem(LS, JSON.stringify(after));
  } catch {
    /* storage full or blocked: skip */
  }
}

export interface SteamDay {
  minutes: number;
  /** The day the previous total is from; a day before `day` unless the app wasn't used in between. */
  since: string;
  /** More than one day is covered (the app wasn't running every day). */
  spans: boolean;
}

/** Steam play time counted on `day`, or null when there's no total from before it. */
export function steamDay(days: SteamDays, day: string): SteamDay | null {
  const cur = days[day];
  if (cur == null) return null;
  let since = "";
  for (const k of Object.keys(days)) if (k < day && k > since) since = k;
  if (!since) return null;
  const minutes = cur - days[since];
  if (minutes < 0) return null;
  return { minutes, since, spans: since !== shiftDay(day, -1) };
}
