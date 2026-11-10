// Relationship map: one node per friend, a line between two friends when they
// are friends with each other (VRChat mutuals) or spent time together (game
// logs), and soft "circle" outlines around the groups you create. Circles can
// overlap. Drag a person into a circle outline (or onto a circle in the
// sidebar) to add them. Map options change how people and lines are drawn.
import * as d3 from "d3";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { imgSrc } from "../backend";
import { hexA } from "../colors";
import { useDerived } from "../derived";
import { fmtHours, personTime } from "../logs";
import {
  bannerUrl,
  iconUrl,
  lastSeen,
  platformKey,
  presenceLabel,
  presenceOf,
  relTime,
  STATUS_COLORS,
  statusColor,
  TRUST_RANKS,
  trustRank,
} from "../model";
import { addToCircle, getState, setState, updateSettings, useApp } from "../store";
import type { Circle, Friend, MapSettings, Presence } from "../types";
import { captureCard, capturePicture } from "../flip";
import { FRESH_MS } from "../notify";
import { FriendCard } from "./FriendCard";
import { Icon } from "./Icon";
import { MapOptions } from "./MapOptions";

interface GNode extends d3.SimulationNodeDatum {
  id: string;
  /** Radius for round styles; half height for cards. */
  r: number;
  /** Half width / half height of the drawn shape. */
  hw: number;
  hh: number;
  deg: number;
}
type GLink = d3.SimulationLinkDatum<GNode> & { source: GNode | string; target: GNode | string };

interface Hull {
  circle: Circle;
  points: [number, number][];
}

const imageCache = new Map<string, HTMLImageElement | "error">();
/** Layout memory across tab switches (the component unmounts). */
const savedPositions = new Map<string, { x: number; y: number }>();
let savedTransform: d3.ZoomTransform | null = null;

function mutualRadius(mutualCount: number) {
  return 9 + Math.min(19, Math.sqrt(mutualCount) * 2.4);
}

function togetherRadius(secs: number) {
  return 9 + Math.min(19, Math.sqrt(secs / 3600) * 3.2);
}

/** Shape size for a node in the current style. */
function geometry(style: MapSettings["nodeStyle"], base: number, scale: number) {
  switch (style) {
    case "dot": {
      const r = (4 + (base - 9) * 0.4) * scale;
      return { r, hw: r, hh: r };
    }
    case "card":
      return { r: 24 * scale, hw: 82 * scale, hh: 24 * scale };
    case "fullcard":
      return { r: 74 * scale, hw: 90 * scale, hh: 74 * scale };
    default: {
      const r = base * scale;
      return { r, hw: r, hh: r };
    }
  }
}

const isCard = (style: MapSettings["nodeStyle"]) => style === "card" || style === "fullcard";

// Line colors: five bands, cool = few, hot = many.
const DEFAULT_EDGES: [number, number, number][] = [
  [110, 130, 150],
  [56, 140, 230],
  [25, 195, 177],
  [240, 190, 40],
  [244, 80, 120],
];
/** Line band colors; themes can replace them with --edges: "r,g,b|r,g,b|…". */
let EDGE_RGB: [number, number, number][] = DEFAULT_EDGES;
function readEdges(cs: CSSStyleDeclaration) {
  const raw = cs.getPropertyValue("--edges").trim();
  const parsed = raw
    .split("|")
    .map((part) => part.split(",").map((x) => parseInt(x, 10)) as [number, number, number])
    .filter((c) => c.length === 3 && c.every((x) => Number.isFinite(x)));
  EDGE_RGB = parsed.length === 5 ? parsed : DEFAULT_EDGES;
}
const EDGE_ALPHA = [0.16, 0.26, 0.34, 0.46, 0.62];
const EDGE_WIDTH = [1, 1.15, 1.35, 1.7, 2.2];

const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const rgba = ([r, g, b]: [number, number, number], a: number) => `rgba(${r},${g},${b},${Math.min(1, a)})`;

/** Band edges from the actual distribution so the colors spread out for
 *  small and large friend lists alike. Returns 4 inclusive upper bounds. */
export function sharedThresholds(values: number[]): number[] {
  if (!values.length) return [0, 1, 2, 3];
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
  const out: number[] = [];
  let prev = -1;
  for (const v of [q(0.4), q(0.7), q(0.88), q(0.97)]) {
    const x = Math.max(v, prev + 1);
    out.push(x);
    prev = x;
  }
  return out;
}

function bucketOf(n: number, t: number[]): number {
  return n <= t[0] ? 0 : n <= t[1] ? 1 : n <= t[2] ? 2 : n <= t[3] ? 3 : 4;
}

function bucketLabel(i: number, t: number[]): string {
  const lo = i === 0 ? 0 : t[i - 1] + 1;
  if (i === 4) return `${lo}+`;
  const hi = t[i];
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

/** Draw an image to fill a box, cropping instead of stretching (like CSS
 *  object-fit: cover). Avatar thumbnails are 4:3, profile icons are square. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

const fitCache = new Map<string, string>();
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  const key = `${ctx.font}|${Math.round(maxW)}|${text}`;
  const hit = fitCache.get(key);
  if (hit !== undefined) return hit;
  if (fitCache.size > 6000) fitCache.clear();
  let out = text;
  if (ctx.measureText(text).width > maxW) {
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ctx.measureText(text.slice(0, mid) + "…").width <= maxW) lo = mid;
      else hi = mid - 1;
    }
    out = text.slice(0, lo).trimEnd() + "…";
  }
  fitCache.set(key, out);
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Small LRU of pre-drawn bitmaps. Clipping and drawing pictures for every
 *  person on every frame is the slowest part of the map (especially in
 *  WebKitGTK on Linux), so pictures and whole cards are drawn once per zoom
 *  level and then copied. */
class SpriteCache {
  private map = new Map<string, HTMLCanvasElement>();
  constructor(private max: number) {}
  get(key: string, w: number, h: number, paint: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    const hit = this.map.get(key);
    if (hit) {
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    const g = c.getContext("2d")!;
    paint(g);
    this.map.set(key, c);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
    return c;
  }
  clear() {
    this.map.clear();
  }
}
/** Map colors that follow the color theme (read from CSS variables). */
interface Palette { card: string; nodeBg: string; label: string; outline: string; sub: string; dim: string; line: string; border: string; gold: string; ok: string }
function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  readEdges(cs);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    card: v("--canvas-card", "#151e26"),
    nodeBg: v("--node-bg", "#22313d"),
    label: v("--canvas-label", "#e6edf3"),
    outline: v("--canvas-outline", "rgba(11,16,21,0.85)"),
    sub: v("--canvas-sub", "#a9b8c4"),
    dim: v("--canvas-dim", "#7d8b97"),
    line: v("--canvas-line", "160, 190, 210"),
    border: v("--border-strong", "#31455a"),
    gold: v("--gold", "#ffd34d"),
    ok: v("--ok", "#51e57e"),
  };
}
let PAL: Palette = typeof document !== "undefined" ? readPalette() : ({} as Palette);

const iconSprites = new SpriteCache(900);
const cardSprites = new SpriteCache(450);

/** Power-of-two pixel scale for a sprite, so zooming doesn't redraw constantly. */
function spriteScale(k: number, dpr: number, max: number) {
  const want = k * dpr;
  return Math.min(max, Math.max(0.25, 2 ** Math.ceil(Math.log2(Math.max(want, 0.01)))));
}

/** Keeps rectangular cards from overlapping (d3's collide force is round). */
function rectCollide(pad: number, strength = 0.7) {
  let nodes: GNode[] = [];
  const force = () => {
    if (nodes.length < 2) return;
    let maxW = 0;
    let maxH = 0;
    for (const n of nodes) {
      maxW = Math.max(maxW, n.hw);
      maxH = Math.max(maxH, n.hh);
    }
    const tree = d3.quadtree(
      nodes,
      (d) => d.x! + d.vx!,
      (d) => d.y! + d.vy!,
    );
    for (const a of nodes) {
      const ax = a.x! + a.vx!;
      const ay = a.y! + a.vy!;
      const rx = a.hw + maxW + pad;
      const ry = a.hh + maxH + pad;
      tree.visit((q, x0, y0, x1, y1) => {
        if (!("length" in q)) {
          let leaf: d3.QuadtreeLeaf<GNode> | undefined = q as d3.QuadtreeLeaf<GNode>;
          while (leaf) {
            const b = leaf.data;
            if (b.index! > a.index!) {
              const dx = b.x! + b.vx! - ax || 0.01;
              const dy = b.y! + b.vy! - ay || 0.01;
              const ox = a.hw + b.hw + pad - Math.abs(dx);
              const oy = a.hh + b.hh + pad - Math.abs(dy);
              if (ox > 0 && oy > 0) {
                if (ox / (a.hw + b.hw) < oy / (a.hh + b.hh)) {
                  const s = Math.sign(dx) * ox * 0.5 * strength;
                  a.vx! -= s;
                  b.vx! += s;
                } else {
                  const s = Math.sign(dy) * oy * 0.5 * strength;
                  a.vy! -= s;
                  b.vy! += s;
                }
              }
            }
            leaf = leaf.next;
          }
        }
        return x0 > ax + rx || x1 < ax - rx || y0 > ay + ry || y1 < ay - ry;
      });
    }
  };
  force.initialize = (n: GNode[]) => {
    nodes = n;
  };
  return force;
}

const PLAT_SHORT: Record<string, string> = { pc: "PC", android: "Quest", ios: "iOS", web: "Web", unknown: "" };

export function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<d3.Simulation<GNode, GLink> | null>(null);
  const nodesRef = useRef<Map<string, GNode>>(new Map());
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const zoomRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const hullsRef = useRef<Hull[]>([]);
  const sizeRef = useRef({ w: 800, h: 600, dpr: 1 });
  const rafRef = useRef(0);
  const hoverRef = useRef<string | null>(null);
  const dragTargetRef = useRef<string | null>(null);
  const fittedRef = useRef(false);
  const [tooltip, setTooltip] = useState<{ id: string; x: number; y: number } | null>(null);
  const fresh = useApp((s) => s.fresh);
  const orbitRef = useRef({ angle: 0, last: 0 });
  const hoverCardRef = useRef<HTMLDivElement>(null);
  const tooltipIdRef = useRef<string | null>(null);

  /** Put the hover card so its round picture sits exactly on the person's picture on the map. */
  function placeHoverCard() {
    const el = hoverCardRef.current;
    const id = hoverRef.current;
    if (!el || !id) return;
    const n = nodesRef.current.get(id);
    if (!n || n.x == null || n.y == null) return;
    const t = transformRef.current;
    const map = viewRef.current.settings.map;
    let wx = n.x;
    if (map.nodeStyle === "card") {
      const s = map.nodeScale;
      wx = n.x - n.hw + 10 * s + (n.hh - 7 * s);
    }
    const icon = el.querySelector(".fcard-icon") as HTMLElement | null;
    if (!icon) return;
    // Layout offsets (not getBoundingClientRect, which includes the pop-in scale).
    let ox = icon.offsetWidth / 2;
    let oy = icon.offsetHeight / 2;
    for (let node: HTMLElement | null = icon; node && node !== el; node = node.offsetParent as HTMLElement | null) {
      ox += node.offsetLeft;
      oy += node.offsetTop;
      if (node.offsetParent === el.offsetParent) {
        ox -= el.offsetLeft;
        oy -= el.offsetTop;
        break;
      }
    }
    el.style.left = `${t.applyX(wx) - ox}px`;
    el.style.top = `${t.applyY(n.y) - oy}px`;
    el.style.transformOrigin = `${ox}px ${oy}px`;
  }
  const theme = useApp((s) => s.settings.theme);
  useEffect(() => {
    // Wait a frame so the new theme's CSS variables are in place.
    const id = requestAnimationFrame(() => {
      PAL = readPalette();
      iconSprites.clear();
      cardSprites.clear();
      requestDraw();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const cache = useApp((s) => s.cache);
  const circles = useApp((s) => s.local.circles);
  const settings = useApp((s) => s.settings);
  const selectedId = useApp((s) => s.selectedId);
  const stats = useApp((s) => s.logs.stats);
  const minMinutes = useApp((s) => s.settings.groups.minMinutes);
  const map = settings.map;
  const derived = useDerived();
  const { friends, idsKey, matched, edges: mutualEdgeList, degree: mutualDegree } = derived;

  const mutualNeighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const [a, b] of mutualEdgeList) {
      if (!m.has(a)) m.set(a, new Set());
      if (!m.has(b)) m.set(b, new Set());
      m.get(a)!.add(b);
      m.get(b)!.add(a);
    }
    return m;
  }, [mutualEdgeList]);

  const together = map.lines === "together" && !!stats && stats.pairs.length > 0;

  // The lines shown (and used for the layout), each with a value for its color band.
  const lineData = useMemo(() => {
    const value = new Map<string, number>();
    let list: [string, string][];
    if (together) {
      list = [];
      for (const p of stats!.pairs) {
        if (p.secs < minMinutes * 60 || !cache.friends[p.a] || !cache.friends[p.b]) continue;
        list.push(p.a < p.b ? [p.a, p.b] : [p.b, p.a]);
        value.set(edgeKey(p.a, p.b), Math.round(p.secs / 3600));
      }
    } else {
      list = mutualEdgeList;
      for (const [a, b] of list) {
        let small = mutualNeighbors.get(a) ?? new Set<string>();
        let big = mutualNeighbors.get(b) ?? new Set<string>();
        if (small.size > big.size) [small, big] = [big, small];
        let c = 0;
        for (const x of small) if (big.has(x)) c++;
        value.set(edgeKey(a, b), c);
      }
    }
    const neighbors = new Map<string, Set<string>>();
    const degree = new Map<string, number>();
    for (const [a, b] of list) {
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
      degree.set(a, (degree.get(a) ?? 0) + 1);
      degree.set(b, (degree.get(b) ?? 0) + 1);
    }
    return { list, value, thresholds: sharedThresholds([...value.values()]), neighbors, degree };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [together, stats, minMinutes, mutualEdgeList, mutualNeighbors, idsKey]);

  const secsById = useMemo(() => new Map((stats?.people ?? []).map((p) => [p.id, p.secs])), [stats]);

  // Everything the draw function needs, refreshed every render.
  const viewRef = useRef({ cache, circles, settings, selectedId, matched, lineData, secsById, fresh });
  viewRef.current = { cache, circles, settings, selectedId, matched, lineData, secsById, fresh };

  const requestDraw = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      draw();
    });
  };

  function getImage(url: string | undefined): HTMLImageElement | null {
    if (!url) return null;
    const hit = imageCache.get(url);
    if (hit === "error") return null;
    if (hit) return hit.complete && hit.naturalWidth > 0 ? hit : null;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => requestDraw();
    img.onerror = () => imageCache.set(url, "error");
    img.src = imgSrc(url) ?? "";
    imageCache.set(url, img);
    return null;
  }

  function computeHulls(): Hull[] {
    const { circles, matched, settings } = viewRef.current;
    const card = isCard(settings.map.nodeStyle);
    const hulls: Hull[] = [];
    for (const circle of circles) {
      if (circle.hidden) continue;
      const pts: [number, number][] = [];
      for (const id of circle.members) {
        const n = nodesRef.current.get(id);
        if (!n || n.x == null || n.y == null) continue;
        if (settings.dimMode === "hide" && !matched.has(id)) continue;
        if (card) {
          const pad = 14;
          for (const [sx, sy] of [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ]) {
            pts.push([n.x + sx * (n.hw + pad), n.y + sy * (n.hh + pad)]);
          }
        } else {
          const pad = n.r + 16;
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            pts.push([n.x + Math.cos(a) * pad, n.y + Math.sin(a) * pad]);
          }
        }
      }
      const hull = pts.length >= 3 ? d3.polygonHull(pts) : null;
      if (hull) hulls.push({ circle, points: hull });
    }
    return hulls;
  }

  function drawRound(ctx: CanvasRenderingContext2D, n: GNode, f: Friend, ring: string, p: Presence, style: MapSettings["nodeStyle"], selected: boolean, alpha: number) {
    const { cache, settings } = viewRef.current;
    const x = n.x!;
    const y = n.y!;
    if (style === "dot") {
      ctx.beginPath();
      ctx.arc(x, y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = ring;
      if (p === "offline" && settings.ringMode === "status") ctx.globalAlpha = alpha * 0.75;
      ctx.fill();
      ctx.globalAlpha = alpha;
      if (selected) {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }
      return;
    }
    const url = iconUrl(f);
    const img = getImage(url);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, n.r, 0, Math.PI * 2);
    ctx.closePath();
    if (img) {
      const px = Math.min(256, Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, n.r * 2 * transformRef.current.k * sizeRef.current.dpr)))));
      const sprite = iconSprites.get(`${url}|${px}`, px, px, (g) => {
        g.beginPath();
        g.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
        g.fillStyle = PAL.nodeBg;
        g.fill();
        g.clip();
        drawCover(g, img, 0, 0, px, px);
      });
      ctx.drawImage(sprite, x - n.r, y - n.r, n.r * 2, n.r * 2);
    } else {
      ctx.fillStyle = PAL.nodeBg;
      ctx.fill();
      ctx.fillStyle = PAL.sub;
      ctx.font = `600 ${n.r * 0.8}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(f.displayName.slice(0, 1).toUpperCase(), x, y + 1);
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, n.r + 1.2, 0, Math.PI * 2);
    ctx.lineWidth = selected ? 4 : 2.4;
    ctx.strokeStyle = selected ? PAL.label : ring;
    if (p === "offline" && settings.ringMode === "status") ctx.globalAlpha = alpha * 0.7;
    ctx.stroke();
    ctx.globalAlpha = alpha;
    if (cache.mutuals[n.id]?.hidden) {
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.arc(x, y, n.r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(200,210,220,0.6)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (settings.map.showStars && cache.favorites[n.id]?.length) {
      ctx.font = `${Math.max(10, n.r * 0.75)}px system-ui, sans-serif`;
      ctx.fillStyle = PAL.gold;
      ctx.textAlign = "center";
      ctx.fillText("★", x + n.r * 0.78, y - n.r * 0.6);
    }
  }

  /** Draw a card, from the sprite cache when the zoom allows it. */
  function drawCard(ctx: CanvasRenderingContext2D, n: GNode, f: Friend, ring: string, p: Presence, full: boolean, selected: boolean, k: number) {
    const { cache, settings, circles } = viewRef.current;
    const dpr = sizeRef.current.dpr;
    if (k * dpr > 2.01) {
      paintCard(ctx, n, f, ring, p, full, selected, k);
      return;
    }
    const sc = spriteScale(k, dpr, 2);
    const W = n.hw * 2;
    const H = n.hh * 2;
    const screenW = W * k;
    const lod = screenW < 54 ? 0 : screenW <= 110 ? 1 : 2;
    const iconOk = !!getImage(iconUrl(f));
    const bannerOk = full && lod > 0 && !!getImage(bannerUrl(f));
    const mi = cache.mutuals[n.id];
    const key = [
      n.id, full ? "F" : "C", lod, sc, W, H, f.displayName, f.statusDescription, p, ring, f.status, f.bannerColor,
      iconOk, bannerOk, trustRank(cache.details[n.id]?.tags, f.developerType).label, mi ? `${mi.count}${mi.hidden}` : "-",
      settings.map.showStars && cache.favorites[n.id]?.length ? 1 : 0, platformKey(f),
      full ? circles.filter((c) => c.members.includes(n.id)).map((c) => c.color).join() : "",
      full && p === "offline" ? Math.floor(lastSeen(f) / 3600000) : 0,
    ].join("|");
    const pad = 4;
    const sprite = cardSprites.get(key, (W + pad * 2) * sc, (H + pad * 2) * sc, (g) => {
      g.scale(sc, sc);
      paintCard(g, { ...n, x: n.hw + pad, y: n.hh + pad }, f, ring, p, full, false, lod === 0 ? 50 / W : lod === 1 ? 54.5 / W : 999);
    });
    ctx.drawImage(sprite, n.x! - n.hw - pad, n.y! - n.hh - pad, W + pad * 2, H + pad * 2);
    if (selected) {
      const s = settings.map.nodeScale;
      roundRect(ctx, n.x! - n.hw, n.y! - n.hh, W, H, (full ? 10 : 8) * s);
      ctx.lineWidth = 3 * s;
      ctx.strokeStyle = PAL.label;
      ctx.stroke();
    }
  }

  function paintCard(ctx: CanvasRenderingContext2D, n: GNode, f: Friend, ring: string, p: Presence, full: boolean, selected: boolean, k: number) {
    const { cache, settings, circles } = viewRef.current;
    const s = settings.map.nodeScale;
    const x0 = n.x! - n.hw;
    const y0 = n.y! - n.hh;
    const W = n.hw * 2;
    const H = n.hh * 2;
    const trust = trustRank(cache.details[n.id]?.tags, f.developerType);
    const screenW = W * k;
    const radius = (full ? 10 : 8) * s;
    const offline = p === "offline";

    const icon = getImage(iconUrl(f));

    // Very zoomed out: a tile with the picture in the middle is enough.
    if (screenW < 54) {
      roundRect(ctx, x0, y0, W, H, radius);
      ctx.fillStyle = PAL.card;
      ctx.fill();
      const r = Math.min(n.hw, n.hh) * 0.62;
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x!, n.y!, r, 0, Math.PI * 2);
      ctx.fillStyle = PAL.nodeBg;
      ctx.fill();
      if (icon) {
        ctx.clip();
        drawCover(ctx, icon, n.x! - r, n.y! - r, r * 2, r * 2);
      }
      ctx.restore();
      roundRect(ctx, x0, y0, W, H, radius);
      ctx.lineWidth = Math.max(2 / k, 3 * s);
      ctx.strokeStyle = selected ? PAL.label : ring;
      ctx.stroke();
      return;
    }

    roundRect(ctx, x0, y0, W, H, radius);
    ctx.fillStyle = PAL.card;
    ctx.fill();

    const drawIcon = (cx: number, cy: number, r: number, ringW: number) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = PAL.nodeBg;
      ctx.fill();
      if (icon) {
        ctx.clip();
        drawCover(ctx, icon, cx - r, cy - r, r * 2, r * 2);
      } else {
        ctx.fillStyle = PAL.sub;
        ctx.font = `700 ${r * 0.9}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(f.displayName.slice(0, 1).toUpperCase(), cx, cy + 1);
        ctx.textBaseline = "alphabetic";
      }
      ctx.restore();
      ctx.beginPath();
      ctx.arc(cx, cy, r + ringW / 2, 0, Math.PI * 2);
      ctx.lineWidth = ringW;
      ctx.strokeStyle = ring;
      ctx.stroke();
    };

    if (!full) {
      // Compact card: status bar, round picture, name and status.
      ctx.save();
      roundRect(ctx, x0, y0, W, H, radius);
      ctx.clip();
      ctx.fillStyle = ring;
      ctx.fillRect(x0, y0, 3.5 * s, H);
      ctx.restore();
      const r = n.hh - 7 * s;
      drawIcon(x0 + 7 * s + r + 3 * s, n.y!, r, 2 * s);
      const tx = x0 + 2 * r + 18 * s;
      const maxW = x0 + W - tx - 8 * s;
      ctx.textAlign = "left";
      ctx.font = `600 ${12.5 * s}px system-ui, sans-serif`;
      ctx.fillStyle = trust.color;
      ctx.fillText(fitText(ctx, f.displayName, maxW), tx, n.y! - 2 * s);
      ctx.font = `${10.5 * s}px system-ui, sans-serif`;
      ctx.fillStyle = offline ? PAL.dim : PAL.sub;
      ctx.fillText(fitText(ctx, f.statusDescription || presenceLabel(f, p), maxW), tx, n.y! + 12 * s);
      if (settings.map.showStars && cache.favorites[n.id]?.length) {
        ctx.font = `${10 * s}px system-ui, sans-serif`;
        ctx.fillStyle = PAL.gold;
        ctx.textAlign = "right";
        ctx.fillText("★", x0 + W - 5 * s, y0 + 11 * s);
      }
    } else {
      // Full player card, laid out like VRChat's social menu tile.
      const bannerH = 54 * s;
      ctx.save();
      roundRect(ctx, x0, y0, W, H, radius);
      ctx.clip();
      ctx.fillStyle = f.bannerColor || "#1e2a33";
      ctx.fillRect(x0, y0, W, bannerH);
      const banner = getImage(bannerUrl(f));
      if (banner) drawCover(ctx, banner, x0, y0, W, bannerH);
      if (offline) {
        ctx.fillStyle = "rgba(11,16,21,0.45)";
        ctx.fillRect(x0, y0, W, bannerH);
      }
      ctx.restore();

      const r = 21 * s;
      const cx = x0 + 12 * s + r;
      const cy = y0 + bannerH;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4 * s, 0, Math.PI * 2);
      ctx.fillStyle = PAL.card;
      ctx.fill();
      drawIcon(cx, cy, r, 3 * s);
      // Status dot on the picture.
      ctx.beginPath();
      ctx.arc(cx + r * 0.72, cy + r * 0.72, 5.5 * s, 0, Math.PI * 2);
      ctx.fillStyle = statusColor(f, p);
      ctx.fill();
      ctx.lineWidth = 2.5 * s;
      ctx.strokeStyle = PAL.card;
      ctx.stroke();

      const plat = PLAT_SHORT[platformKey(f)];
      if (plat && screenW > 110) {
        ctx.font = `700 ${8.5 * s}px system-ui, sans-serif`;
        const tw = ctx.measureText(plat).width;
        roundRect(ctx, x0 + W - tw - 14 * s, y0 + 6 * s, tw + 8 * s, 13 * s, 4 * s);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fill();
        ctx.fillStyle = "#e6edf3";
        ctx.textAlign = "left";
        ctx.fillText(plat, x0 + W - tw - 10 * s, y0 + 15.5 * s);
      }
      if (settings.map.showStars && cache.favorites[n.id]?.length) {
        ctx.font = `${12 * s}px system-ui, sans-serif`;
        ctx.fillStyle = PAL.gold;
        ctx.textAlign = "left";
        ctx.fillText("★", x0 + 7 * s, y0 + 16 * s);
      }

      if (screenW > 110) {
        const tx = cx + r + 9 * s;
        ctx.textAlign = "left";
        ctx.font = `650 ${13 * s}px system-ui, sans-serif`;
        ctx.fillStyle = trust.color;
        ctx.fillText(fitText(ctx, f.displayName, x0 + W - tx - 8 * s), tx, y0 + bannerH + 16 * s);

        const left = x0 + 11 * s;
        const inner = W - 22 * s;
        ctx.font = `${10.5 * s}px system-ui, sans-serif`;
        ctx.fillStyle = offline ? PAL.dim : PAL.sub;
        ctx.fillText(fitText(ctx, f.statusDescription || presenceLabel(f, p), inner), left, y0 + bannerH + 39 * s);

        // Trust rank pill + last seen.
        ctx.font = `600 ${9 * s}px system-ui, sans-serif`;
        const label = trust.label;
        const lw = ctx.measureText(label).width;
        const py = y0 + bannerH + 47 * s;
        roundRect(ctx, left, py, lw + 10 * s, 14 * s, 7 * s);
        ctx.fillStyle = hexA(trust.color, 0.18);
        ctx.fill();
        ctx.lineWidth = 1 * s;
        ctx.strokeStyle = hexA(trust.color, 0.7);
        ctx.stroke();
        ctx.fillStyle = trust.color;
        ctx.fillText(label, left + 5 * s, py + 10 * s);
        ctx.font = `${9.5 * s}px system-ui, sans-serif`;
        ctx.fillStyle = PAL.dim;
        ctx.textAlign = "right";
        const when = offline ? `seen ${relTime(lastSeen(f))}` : p === "web" ? "on website" : "in VRChat";
        ctx.fillText(fitText(ctx, when, inner - lw - 18 * s), x0 + W - 11 * s, py + 10 * s);

        // Footer: mutuals + circle dots.
        const fy = y0 + H - 9 * s;
        const mi = cache.mutuals[n.id];
        ctx.textAlign = "left";
        ctx.fillStyle = PAL.dim;
        ctx.fillText(mi ? (mi.hidden ? "mutuals hidden" : `${mi.count} mutual${mi.count === 1 ? "" : "s"}`) : "mutuals …", left, fy);
        let dx = x0 + W - 11 * s;
        for (const c of circles) {
          if (!c.members.includes(n.id)) continue;
          ctx.beginPath();
          ctx.arc(dx - 3.5 * s, fy - 3.5 * s, 3.5 * s, 0, Math.PI * 2);
          ctx.fillStyle = c.color;
          ctx.fill();
          dx -= 10 * s;
          if (dx < x0 + W / 2) break;
        }
      }
    }

    roundRect(ctx, x0, y0, W, H, radius);
    ctx.lineWidth = selected ? 3 * s : 1 * s;
    ctx.strokeStyle = selected ? PAL.label : PAL.border;
    ctx.stroke();
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h, dpr } = sizeRef.current;
    const t = transformRef.current;
    const { cache, settings, selectedId, matched, lineData } = viewRef.current;
    const map = settings.map;
    const hover = hoverRef.current;
    const focus = selectedId ?? hover;
    const neighbors = lineData.neighbors;
    const focusSet = focus ? new Set([focus, ...(neighbors.get(focus) ?? [])]) : null;
    const hideMode = settings.dimMode === "hide";
    const style = map.nodeStyle;
    const card = isCard(style);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    // Visible part of the world; anything outside is skipped.
    const [vx0, vy0] = t.invert([0, 0]);
    const [vx1, vy1] = t.invert([w, h]);

    // Circles (hulls)
    const hulls = map.hulls ? computeHulls() : [];
    hullsRef.current = hulls;
    const line = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.5)).context(ctx);
    for (const hull of hulls) {
      const isTarget = dragTargetRef.current === hull.circle.id;
      ctx.beginPath();
      line(hull.points);
      ctx.fillStyle = hexA(hull.circle.color, Math.min(0.5, (isTarget ? 0.22 : 0.09) * map.hullOpacity));
      ctx.fill();
      ctx.lineWidth = (isTarget ? 3 : 1.5) / Math.max(0.5, t.k);
      ctx.strokeStyle = hexA(hull.circle.color, Math.min(1, (isTarget ? 0.95 : 0.55) * map.hullOpacity));
      ctx.stroke();
    }

    // Lines, grouped into color bands so each band is one stroke call.
    if (map.lines !== "none") {
      const visible = (id: string) => !hideMode || matched.has(id);
      const colorLines = map.lines !== "plain";
      const band = (a: string, b: string) => (colorLines ? bucketOf(lineData.value.get(edgeKey(a, b)) ?? 0, lineData.thresholds) : 0);
      if (!map.focusLinesOnly) {
        const paths = EDGE_RGB.map(() => new Path2D());
        for (const [a, b] of lineData.list) {
          const s = nodesRef.current.get(a);
          const d = nodesRef.current.get(b);
          if (!s || !d || s.x == null || d.x == null) continue;
          if (!visible(a) || !visible(b)) continue;
          if (focusSet && (a === focus || b === focus)) continue;
          if ((s.x < vx0 && d.x < vx0) || (s.x > vx1 && d.x > vx1) || (s.y! < vy0 && d.y! < vy0) || (s.y! > vy1 && d.y! > vy1)) continue;
          if (!matched.has(a) || !matched.has(b)) continue;
          const p = paths[band(a, b)];
          p.moveTo(s.x, s.y!);
          p.lineTo(d.x, d.y!);
        }
        paths.forEach((p, i) => {
          if (colorLines) {
            ctx.strokeStyle = rgba(EDGE_RGB[i], EDGE_ALPHA[i] * map.lineOpacity * (focusSet ? 0.3 : 1));
            ctx.lineWidth = (EDGE_WIDTH[i] * map.lineWidth) / t.k;
          } else {
            ctx.strokeStyle = `rgba(${PAL.line},${Math.min(1, (focusSet ? 0.06 : 0.16) * map.lineOpacity)})`;
            ctx.lineWidth = map.lineWidth / t.k;
          }
          ctx.stroke(p);
        });
      }
      if (focus) {
        const fNode = nodesRef.current.get(focus);
        if (fNode && fNode.x != null) {
          const focusPaths = EDGE_RGB.map(() => new Path2D());
          for (const nb of neighbors.get(focus) ?? []) {
            const n = nodesRef.current.get(nb);
            if (!n || n.x == null || !visible(nb)) continue;
            const p = focusPaths[band(focus, nb)];
            p.moveTo(fNode.x, fNode.y!);
            p.lineTo(n.x, n.y!);
          }
          focusPaths.forEach((p, i) => {
            ctx.strokeStyle = colorLines ? rgba(EDGE_RGB[i], 0.95) : "rgba(45,212,191,0.75)";
            ctx.lineWidth = ((colorLines ? EDGE_WIDTH[i] : 1) * 1.8 * map.lineWidth) / t.k;
            ctx.stroke(p);
          });
        }
      }
    }

    // People. The hovered/selected person is drawn last so nothing covers them.
    const order = [...nodesRef.current.values()];
    if (focus) {
      const i = order.findIndex((n) => n.id === focus);
      if (i >= 0) order.push(order.splice(i, 1)[0]);
    }
    const showLabelsAuto = settings.showLabels === "always" || (settings.showLabels === "auto" && t.k >= 1.15);
    const margin = 30 / t.k;
    const nowMs = Date.now();
    const { fresh } = viewRef.current;
    let animating = false;
    for (const n of order) {
      const f = cache.friends[n.id];
      if (!f || n.x == null || n.y == null) continue;
      if (n.x + n.hw < vx0 - margin || n.x - n.hw > vx1 + margin || n.y + n.hh < vy0 - margin || n.y - n.hh > vy1 + margin + 20 / t.k) continue;
      const isMatch = matched.has(n.id);
      if (hideMode && !isMatch) continue;
      let alpha = isMatch ? 1 : 0.13;
      if (focusSet && !focusSet.has(n.id)) alpha *= 0.35;
      ctx.globalAlpha = alpha;
      const p = presenceOf(f, cache.presence);
      const ring = settings.ringMode === "trust" ? trustRank(cache.details[n.id]?.tags, f.developerType).color : statusColor(f, p);
      const selected = n.id === selectedId;
      // A new friend pops in and sends out rings for a few seconds.
      const born = fresh[n.id];
      const age = born ? nowMs - born : Infinity;
      if (age < FRESH_MS) {
        animating = true;
        const grow = Math.min(1, age / 650);
        const pop = 1 + Math.sin(grow * Math.PI) * 0.35;
        for (let i = 0; i < 3; i++) {
          const phase = ((age / 1400 + i / 3) % 1);
          const fade = 1 - age / FRESH_MS;
          ctx.beginPath();
          ctx.arc(n.x, n.y, Math.max(n.hw, n.hh) * (1 + phase * 1.8), 0, Math.PI * 2);
          ctx.globalAlpha = alpha * (1 - phase) * 0.8 * fade;
          ctx.strokeStyle = PAL.ok;
          ctx.lineWidth = 3 / t.k;
          ctx.stroke();
          ctx.globalAlpha = alpha;
        }
        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.scale(grow * pop, grow * pop);
        ctx.translate(-n.x, -n.y);
        if (card) drawCard(ctx, n, f, ring, p, style === "fullcard", selected, t.k);
        else drawRound(ctx, n, f, ring, p, style, selected, alpha);
        ctx.restore();
      } else if (card) drawCard(ctx, n, f, ring, p, style === "fullcard", selected, t.k);
      else drawRound(ctx, n, f, ring, p, style, selected, alpha);
      ctx.globalAlpha = alpha;
      const labelled = !card && (showLabelsAuto || (focusSet?.has(n.id) && settings.showLabels !== "never") || selected);
      if (labelled && isMatch) {
        const fs = 12 / t.k;
        ctx.font = `500 ${fs}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 3 / t.k;
        ctx.strokeStyle = PAL.outline;
        ctx.strokeText(f.displayName, n.x, n.y + n.r + 4 / t.k + fs);
        ctx.fillStyle = PAL.label;
        ctx.fillText(f.displayName, n.x, n.y + n.r + 4 / t.k + fs);
      }
    }
    ctx.globalAlpha = 1;
    if (animating) requestDraw();
    placeHoverCard();

    // Circle names last, so people never cover them.
    for (const hull of hulls) {
      const top = hull.points.reduce((a, b) => (b[1] < a[1] ? b : a));
      const y = top[1] - 6 / t.k;
      ctx.font = `600 ${13 / t.k}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 4 / t.k;
      ctx.strokeStyle = PAL.outline;
      ctx.strokeText(hull.circle.name, top[0], y);
      ctx.fillStyle = hexA(hull.circle.color, 1);
      ctx.fillText(hull.circle.name, top[0], y);
    }
    ctx.restore();
  }

  function fit(animate = true) {
    const canvas = canvasRef.current;
    const zoom = zoomRef.current;
    if (!canvas || !zoom) return;
    const { matched, settings } = viewRef.current;
    const pts = [...nodesRef.current.values()].filter((n) => n.x != null && (settings.dimMode !== "hide" || matched.has(n.id)));
    if (!pts.length) return;
    const x0 = d3.min(pts, (n) => n.x! - n.hw)!;
    const x1 = d3.max(pts, (n) => n.x! + n.hw)!;
    const y0 = d3.min(pts, (n) => n.y! - n.hh)!;
    const y1 = d3.max(pts, (n) => n.y! + n.hh)!;
    const { w, h } = sizeRef.current;
    const k = Math.min(2, 0.92 / Math.max((x1 - x0 + 60) / w, (y1 - y0 + 60) / h));
    const tr = d3.zoomIdentity.translate(w / 2, h / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    const sel = d3.select(canvas);
    if (animate) sel.transition().duration(500).call(zoom.transform, tr);
    else sel.call(zoom.transform, tr);
  }

  // Build/refresh the simulation when people, lines or node shapes change.
  const layoutKey = `${idsKey}#${lineData.list.length}#${map.nodeStyle}#${map.nodeScale}#${map.sizeBy}#${map.spacing}#${map.gravity}`;
  const ringRef = useRef(300);
  useEffect(() => {
    const prev = nodesRef.current;
    const next = new Map<string, GNode>();
    const { secsById } = viewRef.current;
    const style = map.nodeStyle;
    const card = isCard(style);
    let added = 0;
    for (const f of friends) {
      const base =
        map.sizeBy === "same" ? 14 : map.sizeBy === "together" ? togetherRadius(secsById.get(f.id) ?? 0) : mutualRadius(cache.mutuals[f.id]?.count ?? 0);
      const g = geometry(style, base, map.nodeScale);
      const deg = lineData.degree.get(f.id) ?? mutualDegree.get(f.id) ?? 0;
      const old = prev.get(f.id);
      const remembered = !old ? savedPositions.get(f.id) : undefined;
      if (remembered) {
        next.set(f.id, { id: f.id, ...g, deg, x: remembered.x, y: remembered.y });
      } else if (old) {
        Object.assign(old, g, { deg });
        next.set(f.id, old);
      } else if (viewRef.current.fresh[f.id] && prev.size > 0) {
        // A brand-new friend appears in the middle of what you're looking at.
        added++;
        const { w, h } = sizeRef.current;
        const [cx, cy] = transformRef.current.invert([w / 2, h / 2]);
        next.set(f.id, { id: f.id, ...g, deg, x: cx + (Math.random() - 0.5) * 20, y: cy + (Math.random() - 0.5) * 20 });
      } else {
        added++;
        const a = Math.random() * Math.PI * 2;
        const dist = (50 + Math.random() * 250) * (card ? 2.5 : 1);
        next.set(f.id, { id: f.id, ...g, deg, x: Math.cos(a) * dist, y: Math.sin(a) * dist });
      }
    }
    nodesRef.current = next;
    const nodes = [...next.values()];
    const links: GLink[] = lineData.list.map(([a, b]) => ({ source: a, target: b }));
    const sp = map.spacing;
    const ringRadius = (160 + Math.sqrt(nodes.length) * (card ? 90 : 30)) * sp;

    let sim = simRef.current;
    if (!sim) {
      sim = d3.forceSimulation<GNode, GLink>().alphaDecay(0.028).velocityDecay(0.35);
      sim.on("tick", requestDraw);
      simRef.current = sim;
    }
    sim.nodes(nodes);
    sim
      .force(
        "link",
        d3
          .forceLink<GNode, GLink>(links)
          .id((d) => d.id)
          .distance((l) => {
            const s = l.source as GNode;
            const d = l.target as GNode;
            return card ? (30 + s.hw + d.hw) * 0.85 * sp : (40 + s.r + d.r) * sp;
          })
          .strength((l) => 0.6 / Math.max(1, Math.min((l.source as GNode).deg, (l.target as GNode).deg))),
      )
      .force(
        "charge",
        d3
          .forceManyBody<GNode>()
          .strength((n) => (card ? -(60 + n.hw * 5) : -(50 + n.r * 7)) * sp * (map.gravity === "center" ? 0.55 : 1))
          .distanceMax((card ? 900 : 520) * sp),
      )
      .force("collide", card ? null : d3.forceCollide<GNode>((n) => n.r + 5 * map.nodeScale))
      .force("rect", card ? (rectCollide(8 * map.nodeScale) as unknown as d3.Force<GNode, GLink>) : null)
      .force("x", null)
      .force("y", null)
      .force("lonely", null);
    ringRef.current = ringRadius;

    const restored = !fittedRef.current && savedTransform && nodes.filter((n) => savedPositions.has(n.id)).length > nodes.length * 0.8;
    if (restored) {
      fittedRef.current = true;
      const t = savedTransform!;
      requestAnimationFrame(() => {
        if (canvasRef.current && zoomRef.current) d3.select(canvasRef.current).call(zoomRef.current.transform, t);
      });
      sim.alpha(0.08).restart();
    } else if (!fittedRef.current && nodes.length) {
      sim.alpha(1).stop();
      for (let i = 0; i < 160; i++) sim.tick();
      fittedRef.current = true;
      requestAnimationFrame(() => {
        fit(false);
        // Phones: start closer so pictures are big enough to recognize,
        // even if not everyone fits on screen.
        const { w } = sizeRef.current;
        if (w < 700 && canvasRef.current && zoomRef.current) {
          const t = transformRef.current;
          const k = Math.min(1.6, Math.max(t.k * 2.2, 0.55));
          d3.select(canvasRef.current).call(zoomRef.current.scaleTo, k);
        }
      });
      sim.alpha(0.25).restart();
    } else {
      sim.alpha(added > 0 ? 0.5 : 0.35).restart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // Refit when the node style changes size a lot (e.g. switching to cards).
  const styleRef = useRef(map.nodeStyle);
  useEffect(() => {
    if (styleRef.current === map.nodeStyle) return;
    styleRef.current = map.nodeStyle;
    const timer = setTimeout(() => fit(), 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.nodeStyle]);

  // Gravity: where everyone is pulled. People in two circles sit between them.
  //  mutuals  – the middle pulls lightly; people without lines float in a ring
  //  loners   – people without lines gather loosely in one spot to the side
  //  center   – everyone is pulled tightly toward the middle
  //  circles  – each circle gets its own spot around the middle
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const pull = 0.09 * map.groupPull;
    const gravity = map.gravity;
    const visibleCircles = circles.filter((c) => !c.hidden && c.members.length > 0);
    const groups = visibleCircles
      .filter((c) => c.members.length > 1)
      .map((c) => c.members.map((id) => nodesRef.current.get(id)).filter(Boolean) as GNode[]);
    const circleIndex = new Map<string, number[]>();
    visibleCircles.forEach((c, i) => {
      for (const id of c.members) {
        if (!circleIndex.has(id)) circleIndex.set(id, []);
        circleIndex.get(id)!.push(i);
      }
    });
    let loners = false;
    for (const n of nodesRef.current.values()) {
      if (n.deg === 0 && !circleIndex.has(n.id)) {
        loners = true;
        break;
      }
    }
    // In "each circle in its own spot", loners get a spot of their own too.
    const slots = Math.max(1, visibleCircles.length + (loners ? 1 : 0));
    const force = (alpha: number) => {
      const R = ringRef.current;
      const turn = orbitRef.current.angle;
      for (const n of nodesRef.current.values()) {
        if (n.x == null || n.y == null) continue;
        let tx = 0;
        let ty = 0;
        let k = 0.035;
        const lonely = n.deg === 0;
        const mine = circleIndex.get(n.id);
        if (gravity === "center") {
          k = 0.11;
        } else if (gravity === "circles" && mine) {
          for (const i of mine) {
            const a = turn + (i / slots) * Math.PI * 2;
            tx += Math.cos(a) * R * 1.1;
            ty += Math.sin(a) * R * 1.1;
          }
          tx /= mine.length;
          ty /= mine.length;
          k = 0.14;
        } else if (lonely && gravity === "circles" && visibleCircles.length) {
          const a = turn + (visibleCircles.length / slots) * Math.PI * 2;
          tx = Math.cos(a) * R * 1.1;
          ty = Math.sin(a) * R * 1.1;
          k = 0.12;
        } else if (lonely && gravity === "loners") {
          tx = Math.cos(turn) * R * 1.15;
          ty = Math.sin(turn) * R * 1.15;
          k = 0.08;
        } else if (lonely) {
          // Ring: pull toward the ring along the person's own direction.
          const d = Math.hypot(n.x, n.y) || 1;
          tx = (n.x / d) * R;
          ty = (n.y / d) * R;
          k = 0.06;
        }
        n.vx! += (tx - n.x) * k * alpha;
        n.vy! += (ty - n.y) * k * alpha;
      }
      if (!pull) return;
      for (const g of groups) {
        let cx = 0;
        let cy = 0;
        for (const n of g) {
          cx += n.x!;
          cy += n.y!;
        }
        cx /= g.length;
        cy /= g.length;
        for (const n of g) {
          n.vx! += (cx - n.x!) * pull * alpha;
          n.vy! += (cy - n.y!) * pull * alpha;
        }
      }
    };
    sim.force("circles", force as unknown as d3.Force<GNode, GLink>);
    sim.alpha(Math.max(sim.alpha(), 0.3)).restart();
  }, [circles, layoutKey, map.groupPull, map.gravity]);

  // Orbit: slowly turn everyone around the middle. Positions really move, so
  // names stay upright and dragging still works.
  useEffect(() => {
    if (!map.orbit) return;
    const speed = ([0, 0.012, 0.03, 0.07][Math.round(map.orbit)] ?? 0.012) * (map.orbitDir === -1 ? -1 : 1); // radians per second
    let raf = 0;
    orbitRef.current.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - orbitRef.current.last) / 1000);
      orbitRef.current.last = now;
      const a = speed * dt;
      orbitRef.current.angle += a;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      for (const n of nodesRef.current.values()) {
        if (n.x == null || n.y == null || n.fx != null) continue;
        const x = n.x;
        n.x = x * cos - n.y * sin;
        n.y = x * sin + n.y * cos;
      }
      if (!document.hidden) draw();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.orbit, map.orbitDir]);

  // Keep the selected person in view (the detail panel narrows the canvas).
  useEffect(() => {
    if (!selectedId) return;
    const timer = setTimeout(() => {
      const n = nodesRef.current.get(selectedId);
      const canvas = canvasRef.current;
      const zoom = zoomRef.current;
      if (!n || n.x == null || !canvas || !zoom) return;
      const t = transformRef.current;
      const { w, h } = sizeRef.current;
      const sx = t.applyX(n.x);
      const sy = t.applyY(n.y!);
      const margin = 60;
      if (sx < margin || sx > w - margin || sy < margin || sy > h - margin) {
        d3.select(canvas).transition().duration(400).call(zoom.translateTo, n.x, n.y!);
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [selectedId]);

  // Redraw on any visual change.
  useEffect(() => {
    requestDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, circles, settings, selectedId, matched, lineData, fresh]);

  // Canvas size, zoom and drag.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const container = containerRef.current!;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      requestDraw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    const findAt = (px: number, py: number): GNode | undefined => {
      const [x, y] = transformRef.current.invert([px, py]);
      let best: GNode | undefined;
      let bestD = Infinity;
      const { matched, settings } = viewRef.current;
      const card = isCard(settings.map.nodeStyle);
      const slack = 4 / transformRef.current.k;
      for (const n of nodesRef.current.values()) {
        if (settings.dimMode === "hide" && !matched.has(n.id)) continue;
        const dx = Math.abs(n.x! - x);
        const dy = Math.abs(n.y! - y);
        const inside = card ? dx <= n.hw + slack && dy <= n.hh + slack : Math.hypot(dx, dy) < n.r + slack;
        const d = Math.hypot(dx, dy);
        if (inside && d < bestD) {
          best = n;
          bestD = d;
        }
      }
      return best;
    };

    const circleUnderPointer = (clientX: number, clientY: number, node: GNode): string | null => {
      const el = document.elementFromPoint(clientX, clientY)?.closest("[data-circle-drop]") as HTMLElement | null;
      if (el?.dataset.circleDrop) return el.dataset.circleDrop;
      for (const hull of hullsRef.current) {
        if (hull.circle.members.includes(node.id)) continue;
        if (d3.polygonContains(hull.points, [node.x!, node.y!])) return hull.circle.id;
      }
      return null;
    };

    let dragStart: [number, number] | null = null;
    const drag = d3
      .drag<HTMLCanvasElement, unknown, { node: GNode; x: number; y: number }>()
      .subject((event) => {
        const n = findAt(event.x, event.y);
        if (!n) return undefined as unknown as { node: GNode; x: number; y: number };
        const t = transformRef.current;
        return { node: n, x: t.applyX(n.x!), y: t.applyY(n.y!) };
      })
      .on("start", (event) => {
        dragStart = [event.x, event.y];
        const n = event.subject.node;
        n.fx = n.x;
        n.fy = n.y;
        simRef.current?.alphaTarget(0.15).restart();
        tooltipIdRef.current = null;
        setTooltip(null);
      })
      .on("drag", (event) => {
        const t = transformRef.current;
        const n = event.subject.node;
        n.fx = t.invertX(event.x);
        n.fy = t.invertY(event.y);
        const src = event.sourceEvent as MouseEvent | TouchEvent;
        const pt = "touches" in src ? src.touches[0] : src;
        if (pt) {
          const target = circleUnderPointer(pt.clientX, pt.clientY, n);
          if (target !== dragTargetRef.current) {
            dragTargetRef.current = target;
            document.querySelectorAll("[data-circle-drop]").forEach((el) => {
              el.classList.toggle("drop-hover", (el as HTMLElement).dataset.circleDrop === target);
            });
          }
        }
        requestDraw();
      })
      .on("end", (event) => {
        const n = event.subject.node;
        simRef.current?.alphaTarget(0);
        const moved = dragStart ? Math.hypot(event.x - dragStart[0], event.y - dragStart[1]) : 0;
        const target = dragTargetRef.current;
        dragTargetRef.current = null;
        document.querySelectorAll(".drop-hover").forEach((el) => el.classList.remove("drop-hover"));
        if (target && moved > 25) addToCircle(target, n.id);
        n.fx = null;
        n.fy = null;
        requestDraw();
      });

    const zoom = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.04, 6])
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        requestDraw();
      });
    zoomRef.current = zoom;
    const sel = d3.select(canvas);
    sel.call(drag).call(zoom).on("dblclick.zoom", null);

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.buttons) return;
      const rect = canvas.getBoundingClientRect();
      const n = findAt(e.clientX - rect.left, e.clientY - rect.top);
      const id = n?.id ?? null;
      if (id !== hoverRef.current) {
        hoverRef.current = id;
        canvas.style.cursor = id ? "pointer" : "grab";
        requestDraw();
      }
      if (id !== (tooltipIdRef.current ?? null)) {
        tooltipIdRef.current = id;
        setTooltip(id ? { id, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
      }
    };
    const onLeave = () => {
      hoverRef.current = null;
      tooltipIdRef.current = null;
      setTooltip(null);
      requestDraw();
    };
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const n = findAt(e.clientX - rect.left, e.clientY - rect.top);
      // Opening from the hover card: remember where its parts are for the transition.
      if (n && hoverCardRef.current && tooltipIdRef.current === n.id) {
        captureCard(n.id, hoverCardRef.current.querySelector(".fcard"));
        hoverRef.current = null;
        tooltipIdRef.current = null;
        setTooltip(null);
      } else if (n && n.x != null && n.y != null) {
        const t = transformRef.current;
        const r = Math.min(n.hw, n.hh) * t.k;
        capturePicture(n.id, new DOMRect(rect.left + t.applyX(n.x) - r, rect.top + t.applyY(n.y) - r, r * 2, r * 2));
      }
      setState({ selectedId: n ? n.id : null });
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("click", onClick);
    return () => {
      for (const n of nodesRef.current.values()) if (n.x != null && n.y != null) savedPositions.set(n.id, { x: n.x, y: n.y });
      if (transformRef.current !== d3.zoomIdentity) savedTransform = transformRef.current;
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("click", onClick);
      sel.on(".zoom", null).on(".drag", null);
      simRef.current?.stop();
      simRef.current = null;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      fittedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    placeHoverCard();
  });

  const tipFriend = tooltip ? cache.friends[tooltip.id] : null;
  const tipTime = tipFriend ? personTime(stats, tipFriend.id) : null;
  const empty = friends.length === 0;
  const noMutualData = !empty && Object.keys(cache.mutuals).length === 0 && !together;
  const wantsTogether = map.lines === "together" && !together;
  const card = isCard(map.nodeStyle);

  return (
    <div className="graph" ref={containerRef}>
      <canvas ref={canvasRef} className="graph-canvas" />
      {empty && <div className="graph-empty">No friends loaded yet. They'll appear here after the first sync.</div>}
      {noMutualData && !wantsTogether && (
        <div className="graph-hint">Connections appear as mutual-friend data loads (one request per friend, about a second each).</div>
      )}
      {wantsTogether && !empty && (
        <div className="graph-hint">No time-together data from game logs yet, so lines show mutual friends for now.</div>
      )}
      {tipFriend && tooltip && map.hoverCard && map.nodeStyle !== "fullcard" && (
        <div className="hover-card" ref={hoverCardRef} style={{ left: -9999, top: -9999 }}>
          <FriendCard
            friend={tipFriend}
            presence={presenceOf(tipFriend, cache.presence)}
            detail={cache.details[tipFriend.id]}
            mutual={cache.mutuals[tipFriend.id]}
            favorite={cache.favorites[tipFriend.id]}
            circles={circles.filter((c) => c.members.includes(tipFriend.id))}
            now={Date.now()}
            onSelect={() => {}}
          />
          {tipTime && (
            <div className="hover-extra">
              {fmtHours(tipTime.secs)} together · {tipTime.days} day{tipTime.days === 1 ? "" : "s"}
            </div>
          )}
        </div>
      )}
      {tipFriend && tooltip && !map.hoverCard && map.nodeStyle !== "fullcard" && (
        <div className="tooltip" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          <div className="tt-name" style={{ color: trustRank(cache.details[tipFriend.id]?.tags, tipFriend.developerType).color }}>
            {tipFriend.displayName}
          </div>
          <div className="tt-line">
            <span className="dot" style={{ background: statusColor(tipFriend, presenceOf(tipFriend, cache.presence)) }} />
            {tipFriend.statusDescription || presenceLabel(tipFriend, presenceOf(tipFriend, cache.presence))}
          </div>
          {tipTime && (
            <div className="tt-line muted">
              {fmtHours(tipTime.secs)} together · {tipTime.days} day{tipTime.days === 1 ? "" : "s"}
            </div>
          )}
        </div>
      )}
      <div className="graph-controls">
        <button className="icon-btn" title="Fit to screen" onClick={() => fit()}>
          <Icon name="fit" />
        </button>
        <button
          className="btn small"
          title="What the ring around each person shows"
          onClick={() => updateSettings({ ringMode: getState().settings.ringMode === "status" ? "trust" : "status" })}
        >
          Ring: {settings.ringMode === "status" ? "status" : "trust rank"}
        </button>
        {!card && (
          <button
            className="btn small"
            title="Name labels"
            onClick={() => {
              const order = ["auto", "always", "never"] as const;
              const next = order[(order.indexOf(getState().settings.showLabels) + 1) % 3];
              updateSettings({ showLabels: next });
            }}
          >
            Names: {settings.showLabels}
          </button>
        )}
        <button className={`btn small keep ${optionsOpen ? "active" : ""}`} title="Map options" onClick={() => setOptionsOpen(!optionsOpen)}>
          <Icon name="sliders" size={15} /> Map options
        </button>
      </div>
      {optionsOpen && <MapOptions onClose={() => setOptionsOpen(false)} onFit={() => fit()} hasLogData={!!stats?.pairs.length} />}
      <Legend
        ringMode={settings.ringMode}
        thresholds={lineData.thresholds}
        lineMode={together ? "together" : map.lines === "together" ? "shared" : map.lines}
        showLines={lineData.list.length > 0}
        sizeBy={map.nodeStyle === "icon" || map.nodeStyle === "dot" ? map.sizeBy : "same"}
        showStars={map.showStars}
      />
    </div>
  );
}

function Legend({
  ringMode,
  thresholds,
  lineMode,
  showLines,
  sizeBy,
  showStars,
}: {
  ringMode: "status" | "trust";
  thresholds: number[];
  lineMode: MapSettings["lines"];
  showLines: boolean;
  sizeBy: MapSettings["sizeBy"];
  showStars: boolean;
}) {
  const items =
    ringMode === "status"
      ? [
          [STATUS_COLORS["join me"], "Join me"],
          [STATUS_COLORS.active, "Online"],
          [STATUS_COLORS["ask me"], "Ask me"],
          [STATUS_COLORS.busy, "Busy"],
          [STATUS_COLORS.web, "Website/app"],
          [STATUS_COLORS.offline, "Offline"],
        ]
      : [...TRUST_RANKS].reverse().map((r) => [r.color, r.label.replace(" User", "")]);
  const colored = showLines && (lineMode === "shared" || lineMode === "together");
  return (
    <div className="legend">
      <div className="legend-row">
        {items.map(([c, l]) => (
          <span key={l}>
            <span className="dot" style={{ background: c }} />
            {l}
          </span>
        ))}
        {showStars && (
          <span>
            <span className="star">★</span>Favorite
          </span>
        )}
        {sizeBy !== "same" && <span title="Bigger = more">◯ size = {sizeBy === "mutuals" ? "mutuals" : "time together"}</span>}
      </div>
      {colored && (
        <div
          className="legend-row"
          title={
            lineMode === "together"
              ? "Line color = hours the two spent in the same instance (from your game logs)"
              : "Line color = how many friends the two connected people have in common (among your friends)"
          }
        >
          <span className="legend-title">{lineMode === "together" ? "Lines · hours together" : "Lines · friends in common"}</span>
          {EDGE_RGB.map((c, i) => (
            <span key={i}>
              <span className="swatch-line" style={{ background: rgba(c, 0.95) }} />
              {bucketLabel(i, thresholds)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
