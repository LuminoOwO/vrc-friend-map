// Reads everyone's profile (bio, links, badges, languages) slowly in the
// background, so a profile opens with its bio right away, and age hints and
// time zone guesses are ready before you look. One person every
// `settings.bios.everySecs` seconds (default 45 s), friends first (online
// ones before offline), then people you've met. Off with Settings → People →
// "Read bios in the background".
import { refreshHints } from "./age";
import { getState } from "./store";
import { fetchProfile } from "./sync";
import { logSync } from "./synclog";

let timer: ReturnType<typeof setTimeout> | null = null;
let busy = false;

/** Whose profile is missing or older than the profile reload age, in order. */
export function biosToRead(now = Date.now()): string[] {
  const s = getState();
  const ttl = s.settings.detailTtlDays * 864e5;
  const stale = (id: string) => {
    const at = s.cache.details[id]?.profileFetchedAt ?? 0;
    return now - at > ttl;
  };
  const rank = (id: string) => (s.cache.presence[id] === "online" ? 0 : s.cache.presence[id] === "web" ? 1 : 2);
  const friends = Object.keys(s.cache.friends).filter(stale).sort((a, b) => rank(a) - rank(b));
  const others = Object.keys(s.cache.others ?? {}).filter((id) => !s.cache.friends[id] && stale(id));
  return [...friends, ...others];
}

export function bioProgress(): { done: number; total: number } {
  const s = getState();
  const ids = [...Object.keys(s.cache.friends), ...Object.keys(s.cache.others ?? {}).filter((id) => !s.cache.friends[id])];
  const ttl = s.settings.detailTtlDays * 864e5;
  const done = ids.filter((id) => Date.now() - (s.cache.details[id]?.profileFetchedAt ?? 0) <= ttl).length;
  return { done, total: ids.length };
}

async function step() {
  const s = getState();
  if (busy || s.demo || s.mode !== "app" || !s.settings.bios.background || s.sync.running || s.sync.paused) return;
  const id = biosToRead()[0];
  if (!id) return;
  busy = true;
  try {
    await fetchProfile(id);
    if (getState().settings.age.enabled) await refreshHints(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== "stopped") logSync({ area: "Bios", step: "Background reading", result: "failed", detail: msg });
  } finally {
    busy = false;
  }
}

export function startBioCache() {
  if (timer) return;
  const loop = () => {
    const secs = Math.max(10, getState().settings.bios.everySecs);
    timer = setTimeout(async () => {
      await step();
      loop();
    }, secs * 1000);
  };
  loop();
}

export function stopBioCache() {
  if (timer) clearTimeout(timer);
  timer = null;
}
