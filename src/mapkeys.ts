// Moving around the map with the keyboard: from the highlighted person, the arrow keys go to the
// nearest person in that direction (closer to straight ahead wins over a bit nearer at an angle).

export interface Pt {
  id: string;
  x: number;
  y: number;
}

export type Dir = "left" | "right" | "up" | "down";

const VEC: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

/** The next person from `from` in direction `dir`, or null if there's nobody that way. */
export function nextInDirection(from: Pt, dir: Dir, pts: Pt[]): string | null {
  const [dx, dy] = VEC[dir];
  let best: string | null = null;
  let bestScore = Infinity;
  for (const p of pts) {
    if (p.id === from.id) continue;
    const vx = p.x - from.x;
    const vy = p.y - from.y;
    const along = vx * dx + vy * dy;
    if (along <= 0.5) continue; // not in that direction
    const across = Math.abs(vx * dy - vy * dx);
    // Within a 60° cone counts fully; sideways distance costs double.
    const score = along + across * 2;
    if (across > along * 1.8) continue;
    if (score < bestScore) {
      bestScore = score;
      best = p.id;
    }
  }
  return best;
}

/** Where keyboard use starts: you, else the person nearest the middle of the view. */
export function startPoint(pts: Pt[], meId: string | null | undefined, cx: number, cy: number): string | null {
  if (meId && pts.some((p) => p.id === meId)) return meId;
  let best: string | null = null;
  let d = Infinity;
  for (const p of pts) {
    const dd = (p.x - cx) ** 2 + (p.y - cy) ** 2;
    if (dd < d) {
      d = dd;
      best = p.id;
    }
  }
  return best;
}
