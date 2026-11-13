// Settings search: matches what you type against each section's own text,
// plus keywords and synonyms, so "ui style" finds Themes and "lag" finds
// Frame rate.

/** Words people use → words that appear in the settings they mean. */
export const SYNONYMS: Record<string, string[]> = {
  ui: ["theme", "appearance"],
  style: ["theme"],
  look: ["theme", "appearance"],
  looks: ["theme"],
  appearance: ["theme"],
  design: ["theme"],
  skin: ["theme"],
  color: ["theme", "lines"],
  colour: ["theme", "lines"],
  colors: ["theme"],
  colours: ["theme"],
  dark: ["theme"],
  light: ["theme"],
  mode: ["theme"],
  oled: ["theme"],
  font: ["theme"],
  fps: ["frame rate", "vsync"],
  framerate: ["frame rate"],
  frames: ["frame rate"],
  hz: ["frame rate", "vsync"],
  refresh: ["frame rate", "refresh", "reload"],
  lag: ["frame rate", "graphics", "diagnostics"],
  laggy: ["frame rate", "graphics", "diagnostics"],
  slow: ["frame rate", "graphics", "diagnostics", "requests"],
  smooth: ["frame rate", "vsync"],
  stutter: ["frame rate", "vsync"],
  tearing: ["vsync"],
  performance: ["frame rate", "graphics", "diagnostics"],
  speed: ["frame rate", "requests"],
  gpu: ["graphics", "diagnostics"],
  cpu: ["graphics", "software"],
  render: ["graphics"],
  rendering: ["graphics"],
  battery: ["saving power", "frame rate"],
  power: ["saving power"],
  energy: ["saving power"],
  idle: ["saving power"],
  background: ["saving power", "focused"],
  unfocused: ["focused"],
  sound: ["sound", "volume"],
  audio: ["sound", "volume"],
  volume: ["volume"],
  noise: ["sound"],
  notification: ["sound", "new friends"],
  notifications: ["sound", "new friends"],
  alert: ["sound"],
  chime: ["sound"],
  logs: ["game logs", "log"],
  log: ["game logs", "log"],
  lobby: ["instance", "game logs"],
  session: ["instance", "game logs"],
  instance: ["instance"],
  world: ["instance", "game logs"],
  steam: ["log folder", "steam"],
  proton: ["log folder", "steam"],
  folder: ["folder"],
  path: ["folder"],
  circles: ["circle", "group"],
  circle: ["circle", "group"],
  groups: ["group", "circle"],
  clusters: ["group"],
  suggestions: ["suggest", "group"],
  automatic: ["automatic"],
  server: ["server"],
  servers: ["server"],
  sync: ["server", "sync"],
  share: ["server", "shar"],
  sharing: ["server", "shar"],
  encryption: ["server", "encrypt"],
  logger: ["server", "log"],
  strangers: ["aren't friends", "non-friend"],
  others: ["aren't friends"],
  nonfriends: ["aren't friends"],
  people: ["aren't friends", "people"],
  block: ["blocked"],
  blocked: ["blocked"],
  blocks: ["blocked"],
  mute: ["blocked"],
  profiles: ["profile"],
  profile: ["profile"],
  popup: ["profile", "popup"],
  sidebar: ["panel"],
  window: ["popup", "panel"],
  account: ["account", "log out"],
  login: ["account", "log out"],
  logout: ["log out"],
  signout: ["log out"],
  password: ["account"],
  contact: ["contact"],
  api: ["requests"],
  rate: ["requests", "frame rate"],
  limit: ["requests", "frame rate", "limit"],
  requests: ["requests"],
  data: ["data", "cache"],
  storage: ["data", "cache"],
  cache: ["cache"],
  delete: ["delete", "clear"],
  wipe: ["delete"],
  reset: ["delete", "clear"],
  backup: ["backup"],
  version: ["about", "version"],
  about: ["about"],
  update: ["about", "version"],
  debug: ["diagnostics"],
  info: ["diagnostics", "about"],
  benchmark: ["diagnostics"],
  lines: ["lines"],
  ring: ["ring"],
  trust: ["trust"],
  filter: ["filters"],
  filters: ["filters"],
  dim: ["dim", "filters"],
  map: ["map", "lines"],
};

const STOP = new Set(["the", "a", "an", "my", "to", "of", "how", "do", "i", "change", "set", "setting", "settings", "turn", "on", "off", "make", "where", "is", "for", "in", "and", "app"]);

/** One typo apart: a changed, missing, extra or swapped letter. */
export function oneTypo(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

export interface SearchDoc {
  id: string;
  title: string;
  keywords: string;
  text: string;
}

/** Score of a section for a query (0 = no match). Every query word must match somewhere. */
export function scoreSection(query: string, doc: SearchDoc): number {
  const words = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
  if (!words.length) return 0;
  const title = doc.title.toLowerCase();
  const keys = doc.keywords.toLowerCase();
  const text = doc.text.toLowerCase();
  const tokens = new Set(`${title} ${keys} ${text}`.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 3));
  let score = 0;
  for (const w of words) {
    const terms = [w, ...(SYNONYMS[w] ?? [])];
    let best = 0;
    for (const t of terms) {
      if (title.includes(t)) best = Math.max(best, t === w ? 10 : 8);
      else if (keys.includes(t)) best = Math.max(best, t === w ? 7 : 6);
      else if (text.includes(t)) best = Math.max(best, t === w ? 4 : 3);
    }
    if (!best && w.length >= 5) {
      // A typo? ("vsnyc", "themse")
      for (const t of tokens) {
        if (oneTypo(w, t)) {
          best = 2;
          break;
        }
      }
    }
    if (!best) return 0;
    score += best;
  }
  return score;
}
