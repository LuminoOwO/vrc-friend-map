// Catppuccin (https://catppuccin.com/palette/): four flavors, each with 14 accent
// colors on top of its base colors. The app's theme variables are built from
// the palette, with the accent you pick.

export const CAT_FLAVORS = ["latte", "frappe", "macchiato", "mocha"] as const;
export type CatFlavor = (typeof CAT_FLAVORS)[number];

export const CAT_ACCENTS = [
  "rosewater",
  "flamingo",
  "pink",
  "mauve",
  "red",
  "maroon",
  "peach",
  "yellow",
  "green",
  "teal",
  "sky",
  "sapphire",
  "blue",
  "lavender",
] as const;
export type CatAccent = (typeof CAT_ACCENTS)[number];

type Base = "text" | "subtext1" | "subtext0" | "overlay2" | "overlay1" | "overlay0" | "surface2" | "surface1" | "surface0" | "base" | "mantle" | "crust";
type Palette = Record<CatAccent | Base, string>;

export const CAT_PALETTES: Record<CatFlavor, Palette> = {
  latte: {
    rosewater: "#dc8a78", flamingo: "#dd7878", pink: "#ea76cb", mauve: "#8839ef", red: "#d20f39", maroon: "#e64553", peach: "#fe640b",
    yellow: "#df8e1d", green: "#40a02b", teal: "#179299", sky: "#04a5e5", sapphire: "#209fb5", blue: "#1e66f5", lavender: "#7287fd",
    text: "#4c4f69", subtext1: "#5c5f77", subtext0: "#6c6f85", overlay2: "#7c7f93", overlay1: "#8c8fa1", overlay0: "#9ca0b0",
    surface2: "#acb0be", surface1: "#bcc0cc", surface0: "#ccd0da", base: "#eff1f5", mantle: "#e6e9ef", crust: "#dce0e8",
  },
  frappe: {
    rosewater: "#f2d5cf", flamingo: "#eebebe", pink: "#f4b8e4", mauve: "#ca9ee6", red: "#e78284", maroon: "#ea999c", peach: "#ef9f76",
    yellow: "#e5c890", green: "#a6d189", teal: "#81c8be", sky: "#99d1db", sapphire: "#85c1dc", blue: "#8caaee", lavender: "#babbf1",
    text: "#c6d0f5", subtext1: "#b5bfe2", subtext0: "#a5adce", overlay2: "#949cbb", overlay1: "#838ba7", overlay0: "#737994",
    surface2: "#626880", surface1: "#51576d", surface0: "#414559", base: "#303446", mantle: "#292c3c", crust: "#232634",
  },
  macchiato: {
    rosewater: "#f4dbd6", flamingo: "#f0c6c6", pink: "#f5bde6", mauve: "#c6a0f6", red: "#ed8796", maroon: "#ee99a0", peach: "#f5a97f",
    yellow: "#eed49f", green: "#a6da95", teal: "#8bd5ca", sky: "#91d7e3", sapphire: "#7dc4e4", blue: "#8aadf4", lavender: "#b7bdf8",
    text: "#cad3f5", subtext1: "#b8c0e0", subtext0: "#a5adcb", overlay2: "#939ab7", overlay1: "#8087a2", overlay0: "#6e738d",
    surface2: "#5b6078", surface1: "#494d64", surface0: "#363a4f", base: "#24273a", mantle: "#1e2030", crust: "#181926",
  },
  mocha: {
    rosewater: "#f5e0dc", flamingo: "#f2cdcd", pink: "#f5c2e7", mauve: "#cba6f7", red: "#f38ba8", maroon: "#eba0ac", peach: "#fab387",
    yellow: "#f9e2af", green: "#a6e3a1", teal: "#94e2d5", sky: "#89dceb", sapphire: "#74c7ec", blue: "#89b4fa", lavender: "#b4befe",
    text: "#cdd6f4", subtext1: "#bac2de", subtext0: "#a6adc8", overlay2: "#9399b2", overlay1: "#7f849c", overlay0: "#6c7086",
    surface2: "#585b70", surface1: "#45475a", surface0: "#313244", base: "#1e1e2e", mantle: "#181825", crust: "#11111b",
  },
};

export const CAT_LABEL: Record<CatFlavor, string> = { latte: "Latte", frappe: "Frappé", macchiato: "Macchiato", mocha: "Mocha" };

export function isCatFlavor(theme: string): theme is CatFlavor {
  return (CAT_FLAVORS as readonly string[]).includes(theme);
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ");

/** CSS variables for a flavor with an accent. */
export function catppuccinVars(flavor: CatFlavor, accent: CatAccent): Record<string, string> {
  const p = CAT_PALETTES[flavor];
  const light = flavor === "latte";
  const a = p[accent];
  // A second accent for hover and pressed states (Catppuccin's own pairing: lavender).
  const strong = accent === "lavender" ? p.blue : p.lavender;
  return {
    "--here": accent === "pink" ? p.mauve : p.pink,
    "--bg": p.base,
    "--panel": p.mantle,
    "--panel-2": p.crust,
    "--card": light ? p.base : p.surface0,
    "--card-hover": light ? p.mantle : p.surface1,
    "--border": p.surface0,
    "--border-strong": p.surface1,
    "--text": p.text,
    "--muted": p.subtext0,
    "--accent": a,
    "--accent-strong": strong,
    "--accent-soft": `${a}26`,
    "--on-accent": light ? p.base : p.crust,
    "--danger": p.red,
    "--danger-text": p.red,
    "--ok": p.green,
    "--warn": p.yellow,
    "--gold": p.yellow,
    "--glow": p.base,
    "--node-bg": p.surface0,
    "--profile-bg": p.mantle,
    "--pcard": p.base,
    "--chip-bg": p.surface0,
    "--canvas-card": p.mantle,
    "--canvas-label": p.text,
    "--canvas-outline": `${p.crust}d9`,
    "--canvas-sub": p.subtext1,
    "--canvas-dim": p.overlay1,
    "--canvas-line": rgb(p.overlay2),
    "--status-joinme": p.sky,
    "--status-active": p.green,
    "--status-askme": p.peach,
    "--status-busy": p.red,
    "--status-offline": p.overlay0,
    "--status-web": p.yellow,
    "--trust-visitor": p.overlay2,
    "--trust-new": p.blue,
    "--trust-user": p.green,
    "--trust-known": p.peach,
    "--trust-trusted": p.mauve,
    "--trust-team": p.red,
    "--edges": [p.overlay0, p.blue, p.teal, p.yellow, p.red].map(rgb).join("|"),
    "--shadow": `0 10px 30px ${p.crust}${light ? "33" : "99"}`,
    "color-scheme": light ? "light" : "dark",
  };
}
