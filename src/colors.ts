// Circle colors. The first 8 are the original palette (existing circles keep
// theirs); the other 16 were picked to be as far apart as possible from each
// other and from the first 8 (perceptual Lab distance ≥ 25), and bright enough
// for the dark background.
export const CIRCLE_PALETTE = [
  "#2dd4bf", "#f472b6", "#fbbf24", "#a78bfa", "#60a5fa", "#fb7185", "#4ade80", "#f97316",
  "#facc9e", "#d22dd2", "#8ea630", "#a65f30", "#308ea6", "#cbd5e1", "#e8fa9e", "#d22d2d",
  "#6fd22d", "#6455e7", "#e7e755", "#30a66b", "#9efaba", "#e79e55", "#e87bf4", "#7bdcf4",
];

type Lab = [number, number, number];

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toLab(hex: string): Lab | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const lin = (c: number) => {
    const v = c / 255;
    return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92;
  };
  const [r, g, b] = rgb.map(lin);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export function colorDistance(a: string, b: string): number {
  const la = toLab(a);
  const lb = toLab(b);
  if (!la || !lb) return 100;
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}

const norm = (c: string) => c.trim().toLowerCase();

/** How many circles use each color (palette colors only count exact matches). */
export function colorUsage(used: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of used) m.set(norm(c), (m.get(norm(c)) ?? 0) + 1);
  return m;
}

/**
 * Color for a new circle: the first palette color nobody uses yet and that
 * isn't too close to a custom color already in use. When all 24 are taken,
 * a new color is generated as far as possible from every color in use, so
 * colors never repeat on purpose.
 */
export function pickCircleColor(used: string[]): string {
  const usage = colorUsage(used);
  const usedList = [...usage.keys()];
  for (const c of CIRCLE_PALETTE) {
    if (usage.has(c)) continue;
    if (usedList.some((u) => colorDistance(u, c) < 12)) continue;
    return c;
  }
  let best = CIRCLE_PALETTE[0];
  let bestD = -1;
  for (let h = 0; h < 360; h += 5) {
    for (const [s, l] of [
      [0.75, 0.62],
      [0.85, 0.72],
      [0.65, 0.52],
      [0.9, 0.8],
    ]) {
      const c = hslToHex(h, s, l);
      const d = Math.min(...usedList.map((u) => colorDistance(u, c)));
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    }
  }
  return best;
}

/** IDs of circles whose color repeats an earlier circle's (the first keeps it). */
export function duplicateColorIds(circles: { id: string; color: string }[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const c of circles) {
    const k = norm(c.color);
    if (seen.has(k)) dupes.push(c.id);
    else seen.add(k);
  }
  return dupes;
}

export function hexA(hex: string, a: number): string {
  const rgb = hexToRgb(hex) ?? [128, 128, 128];
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}
