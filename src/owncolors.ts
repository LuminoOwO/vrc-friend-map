// Your own colors (Settings → Appearance): accent, background, panels and text, on top of any
// theme. The other shades (cards, borders, muted text, the map's cards) are worked out from them,
// as plain hex values so the map canvas can use them too.
export interface OwnColors {
  accent: string;
  bg: string;
  panel: string;
  text: string;
}

export const NO_OWN_COLORS: OwnColors = { accent: "", bg: "", panel: "", text: "" };

const HEX = /^#[0-9a-f]{6}$/i;

/** Only "#rrggbb" or "" (the theme's own color). */
export function normalizeOwnColors(raw: unknown): OwnColors {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (v: unknown) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : "");
  return { accent: pick(r.accent), bg: pick(r.bg), panel: pick(r.panel), text: pick(r.text) };
}

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => `#${c.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0")).join("")}`;

/** `a` with `t` (0–1) of `b` mixed in. */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return hex(x.map((v, i) => v + (y[i] - v) * t));
}

function luminance(h: string): number {
  const [r, g, b] = rgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * CSS variables for the chosen colors. `current` reads the theme's value of a variable (for the
 * colors you didn't pick), so mixes stay right whatever theme is underneath.
 */
export function ownColorVars(c: OwnColors, current: (v: string) => string): Record<string, string> {
  const out: Record<string, string> = {};
  const now = (v: string, fallback: string) => {
    const x = current(v).trim();
    return HEX.test(x) ? x : fallback;
  };
  const bg = c.bg || now("--bg", "#070b0f");
  const text = c.text || now("--text", "#e6edf3");
  if (c.accent) {
    const dark = luminance(c.accent) > 0.4;
    out["--accent"] = c.accent;
    out["--accent-strong"] = mix(c.accent, dark ? "#000000" : "#ffffff", 0.15);
    out["--accent-soft"] = `${c.accent}24`;
    out["--on-accent"] = dark ? "#111111" : "#ffffff";
  }
  if (c.bg) {
    out["--bg"] = c.bg;
    out["--profile-bg"] = mix(c.bg, text, 0.02);
    out["--canvas-outline"] = c.bg;
  }
  if (c.panel) {
    out["--panel"] = c.panel;
    out["--panel-2"] = mix(c.panel, text, 0.05);
    out["--card"] = mix(c.panel, text, 0.07);
    out["--card-hover"] = mix(c.panel, text, 0.12);
    out["--chip-bg"] = mix(c.panel, text, 0.1);
    out["--node-bg"] = mix(c.panel, text, 0.1);
    out["--pcard"] = mix(c.panel, text, 0.06);
    out["--canvas-card"] = mix(c.panel, text, 0.04);
    out["--border"] = mix(c.panel, text, 0.14);
    out["--border-strong"] = mix(c.panel, text, 0.24);
  }
  if (c.text) {
    out["--text"] = c.text;
    out["--canvas-label"] = c.text;
    out["--muted"] = mix(c.text, bg, 0.4);
    out["--canvas-sub"] = mix(c.text, bg, 0.25);
    out["--canvas-dim"] = mix(c.text, bg, 0.45);
  }
  return out;
}
