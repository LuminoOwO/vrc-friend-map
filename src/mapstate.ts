// Small bits of map state shared with Map options and Diagnostics (kept out of
// GraphView.tsx, which imports those).

/** Where you dragged your own bubble (it stays there until "Put me back"). For this run. */
export const mePinned: { at: { x: number; y: number } | null; subs: Set<() => void> } = { at: null, subs: new Set() };

export function unpinMe() {
  mePinned.at = null;
  mePinned.subs.forEach((f) => f());
}

/** How often and why the map's layout restarted (Settings → Diagnostics). */
export const layoutRestarts = { count: 0, last: "", at: 0 };

export function noteLayoutRestart(why: string) {
  layoutRestarts.count++;
  layoutRestarts.last = why;
  layoutRestarts.at = Date.now();
}
