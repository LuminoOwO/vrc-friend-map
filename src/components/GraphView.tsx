// Relationship map: one node per friend, a line between two friends when they
// are friends with each other (VRChat mutuals), and soft "circle" outlines
// around the groups you create. Circles can overlap. Drag a person into a
// circle outline (or onto a circle in the sidebar) to add them.
import * as d3 from "d3";
import { useEffect, useMemo, useRef, useState } from "react";
import { imgSrc } from "../backend";
import { useDerived } from "../derived";
import { iconUrl, presenceLabel, presenceOf, statusColor, trustRank } from "../model";
import { addToCircle, getState, setState, updateSettings, useApp } from "../store";
import type { Circle } from "../types";
import { Icon } from "./Icon";

interface GNode extends d3.SimulationNodeDatum {
  id: string;
  r: number;
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

function nodeRadius(mutualCount: number) {
  return 9 + Math.min(19, Math.sqrt(mutualCount) * 2.4);
}

// Line colors: how many friends the two connected people have in common
// (among your friends). Five bands, cool = few, hot = many.
const EDGE_RGB: [number, number, number][] = [
  [110, 130, 150],
  [56, 140, 230],
  [25, 195, 177],
  [240, 190, 40],
  [244, 80, 120],
];
const EDGE_ALPHA = [0.16, 0.26, 0.34, 0.46, 0.62];
const EDGE_WIDTH = [1, 1.15, 1.35, 1.7, 2.2];

const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const rgba = ([r, g, b]: [number, number, number], a: number) => `rgba(${r},${g},${b},${a})`;

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

  const cache = useApp((s) => s.cache);
  const circles = useApp((s) => s.local.circles);
  const settings = useApp((s) => s.settings);
  const selectedId = useApp((s) => s.selectedId);
  const derived = useDerived();
  const { friends, idsKey, matched, edges, degree } = derived;

  // Everything the draw function needs, refreshed every render.
  const viewRef = useRef({
    cache,
    circles,
    settings,
    selectedId,
    matched,
    neighbors: new Map<string, Set<string>>(),
    strength: { shared: new Map<string, number>(), thresholds: [0, 1, 2, 3] },
  });
  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const [a, b] of edges) {
      if (!m.has(a)) m.set(a, new Set());
      if (!m.has(b)) m.set(b, new Set());
      m.get(a)!.add(b);
      m.get(b)!.add(a);
    }
    return m;
  }, [edges]);
  const strength = useMemo(() => {
    const shared = new Map<string, number>();
    for (const [a, b] of edges) {
      let small = neighbors.get(a) ?? new Set<string>();
      let big = neighbors.get(b) ?? new Set<string>();
      if (small.size > big.size) [small, big] = [big, small];
      let c = 0;
      for (const x of small) if (big.has(x)) c++;
      shared.set(edgeKey(a, b), c);
    }
    return { shared, thresholds: sharedThresholds([...shared.values()]) };
  }, [edges, neighbors]);
  viewRef.current = { cache, circles, settings, selectedId, matched, neighbors, strength };

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
    const hulls: Hull[] = [];
    for (const circle of circles) {
      if (circle.hidden) continue;
      const pts: [number, number][] = [];
      for (const id of circle.members) {
        const n = nodesRef.current.get(id);
        if (!n || n.x == null || n.y == null) continue;
        if (settings.dimMode === "hide" && !matched.has(id)) continue;
        const pad = n.r + 16;
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          pts.push([n.x + Math.cos(a) * pad, n.y + Math.sin(a) * pad]);
        }
      }
      const hull = pts.length >= 3 ? d3.polygonHull(pts) : null;
      if (hull) hulls.push({ circle, points: hull });
    }
    return hulls;
  }

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h, dpr } = sizeRef.current;
    const t = transformRef.current;
    const { cache, settings, selectedId, matched, neighbors, strength } = viewRef.current;
    const hover = hoverRef.current;
    const focus = selectedId ?? hover;
    const focusSet = focus ? new Set([focus, ...(neighbors.get(focus) ?? [])]) : null;
    const hideMode = settings.dimMode === "hide";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    // Circles (hulls)
    const hulls = computeHulls();
    hullsRef.current = hulls;
    const line = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.5)).context(ctx);
    for (const hull of hulls) {
      const isTarget = dragTargetRef.current === hull.circle.id;
      ctx.beginPath();
      line(hull.points);
      ctx.fillStyle = hexA(hull.circle.color, isTarget ? 0.22 : 0.09);
      ctx.fill();
      ctx.lineWidth = (isTarget ? 3 : 1.5) / Math.max(0.5, t.k);
      ctx.strokeStyle = hexA(hull.circle.color, isTarget ? 0.95 : 0.55);
      ctx.stroke();
    }

    // Edges, grouped into color bands so each band is one stroke call.
    const visible = (id: string) => !hideMode || matched.has(id);
    const colorLines = settings.lineColors !== "plain";
    const band = (a: string, b: string) => (colorLines ? bucketOf(strength.shared.get(edgeKey(a, b)) ?? 0, strength.thresholds) : 0);
    const paths = EDGE_RGB.map(() => new Path2D());
    for (const link of simRef.current ? (simRef.current.force("link") as d3.ForceLink<GNode, GLink>).links() : []) {
      const s = link.source as GNode;
      const d = link.target as GNode;
      if (!visible(s.id) || !visible(d.id)) continue;
      if (focusSet && (s.id === focus || d.id === focus)) continue;
      if (!matched.has(s.id) || !matched.has(d.id)) continue;
      const p = paths[band(s.id, d.id)];
      p.moveTo(s.x!, s.y!);
      p.lineTo(d.x!, d.y!);
    }
    paths.forEach((p, i) => {
      if (colorLines) {
        ctx.strokeStyle = rgba(EDGE_RGB[i], EDGE_ALPHA[i] * (focusSet ? 0.3 : 1));
        ctx.lineWidth = EDGE_WIDTH[i] / t.k;
      } else {
        ctx.strokeStyle = focusSet ? "rgba(160,190,210,0.06)" : "rgba(160,190,210,0.16)";
        ctx.lineWidth = 1 / t.k;
      }
      ctx.stroke(p);
    });
    if (focus) {
      const fNode = nodesRef.current.get(focus);
      if (fNode) {
        const focusPaths = EDGE_RGB.map(() => new Path2D());
        for (const nb of neighbors.get(focus) ?? []) {
          const n = nodesRef.current.get(nb);
          if (!n || !visible(nb)) continue;
          const p = focusPaths[band(focus, nb)];
          p.moveTo(fNode.x!, fNode.y!);
          p.lineTo(n.x!, n.y!);
        }
        focusPaths.forEach((p, i) => {
          ctx.strokeStyle = colorLines ? rgba(EDGE_RGB[i], 0.95) : "rgba(45,212,191,0.75)";
          ctx.lineWidth = ((colorLines ? EDGE_WIDTH[i] : 1) * 1.8) / t.k;
          ctx.stroke(p);
        });
      }
    }

    // Nodes
    const showLabelsAuto = settings.showLabels === "always" || (settings.showLabels === "auto" && t.k >= 1.15);
    for (const n of nodesRef.current.values()) {
      const f = cache.friends[n.id];
      if (!f || n.x == null || n.y == null) continue;
      const isMatch = matched.has(n.id);
      if (hideMode && !isMatch) continue;
      let alpha = isMatch ? 1 : 0.13;
      if (focusSet && !focusSet.has(n.id)) alpha *= 0.35;
      ctx.globalAlpha = alpha;
      const p = presenceOf(f, cache.presence);
      const ring =
        settings.ringMode === "trust" ? trustRank(cache.details[n.id]?.tags, f.developerType).color : statusColor(f, p);
      const img = getImage(iconUrl(f));
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.closePath();
      if (img) {
        ctx.clip();
        ctx.drawImage(img, n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
      } else {
        ctx.fillStyle = "#2a3946";
        ctx.fill();
        ctx.fillStyle = "#c9d6e0";
        ctx.font = `600 ${n.r * 0.8}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(f.displayName.slice(0, 1).toUpperCase(), n.x, n.y + 1);
        ctx.textBaseline = "alphabetic";
      }
      ctx.restore();
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 1.2, 0, Math.PI * 2);
      ctx.lineWidth = n.id === selectedId ? 4 : 2.4;
      ctx.strokeStyle = n.id === selectedId ? "#ffffff" : ring;
      if (p === "offline" && settings.ringMode === "status") ctx.globalAlpha = alpha * 0.7;
      ctx.stroke();
      ctx.globalAlpha = alpha;
      const mi = cache.mutuals[n.id];
      if (mi?.hidden) {
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.arc(n.x, n.y, n.r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(200,210,220,0.6)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (cache.favorites[n.id]?.length) {
        ctx.font = `${Math.max(10, n.r * 0.75)}px system-ui, sans-serif`;
        ctx.fillStyle = "#ffd34d";
        ctx.textAlign = "center";
        ctx.fillText("★", n.x + n.r * 0.78, n.y - n.r * 0.6);
      }
      const labelled = showLabelsAuto || (focusSet?.has(n.id) && settings.showLabels !== "never") || n.id === selectedId;
      if (labelled && isMatch) {
        const fs = 12 / t.k;
        ctx.font = `500 ${fs}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 3 / t.k;
        ctx.strokeStyle = "rgba(11,16,21,0.85)";
        ctx.strokeText(f.displayName, n.x, n.y + n.r + 4 / t.k + fs);
        ctx.fillStyle = "#e6edf3";
        ctx.fillText(f.displayName, n.x, n.y + n.r + 4 / t.k + fs);
      }
    }
    ctx.globalAlpha = 1;

    // Circle names last, so people never cover them.
    for (const hull of hulls) {
      const top = hull.points.reduce((a, b) => (b[1] < a[1] ? b : a));
      const y = top[1] - 6 / t.k;
      ctx.font = `600 ${13 / t.k}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 4 / t.k;
      ctx.strokeStyle = "rgba(11,16,21,0.9)";
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
    const [x0, x1] = d3.extent(pts, (n) => n.x!) as [number, number];
    const [y0, y1] = d3.extent(pts, (n) => n.y!) as [number, number];
    const { w, h } = sizeRef.current;
    const k = Math.min(2, 0.9 / Math.max((x1 - x0 + 80) / w, (y1 - y0 + 80) / h));
    const tr = d3.zoomIdentity.translate(w / 2, h / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    const sel = d3.select(canvas);
    if (animate) sel.transition().duration(500).call(zoom.transform, tr);
    else sel.call(zoom.transform, tr);
  }

  // Build/refresh the simulation when the set of people or connections changes.
  useEffect(() => {
    const prev = nodesRef.current;
    const next = new Map<string, GNode>();
    let added = 0;
    for (const f of friends) {
      const mi = cache.mutuals[f.id];
      const r = nodeRadius(mi?.count ?? 0);
      const old = prev.get(f.id);
      const remembered = !old ? savedPositions.get(f.id) : undefined;
      if (remembered) {
        next.set(f.id, { id: f.id, r, deg: degree.get(f.id) ?? 0, x: remembered.x, y: remembered.y });
      } else if (old) {
        old.r = r;
        old.deg = degree.get(f.id) ?? 0;
        next.set(f.id, old);
      } else {
        added++;
        const a = Math.random() * Math.PI * 2;
        const dist = 50 + Math.random() * 250;
        next.set(f.id, { id: f.id, r, deg: degree.get(f.id) ?? 0, x: Math.cos(a) * dist, y: Math.sin(a) * dist });
      }
    }
    nodesRef.current = next;
    const nodes = [...next.values()];
    const links: GLink[] = edges.map(([a, b]) => ({ source: a, target: b }));
    const ringRadius = 160 + Math.sqrt(nodes.length) * 30;

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
          .distance((l) => 40 + (l.source as GNode).r + (l.target as GNode).r)
          .strength((l) => 0.6 / Math.max(1, Math.min((l.source as GNode).deg, (l.target as GNode).deg))),
      )
      .force("charge", d3.forceManyBody<GNode>().strength((n) => -50 - n.r * 7).distanceMax(520))
      .force("collide", d3.forceCollide<GNode>((n) => n.r + 5))
      .force("x", d3.forceX<GNode>(0).strength(0.035))
      .force("y", d3.forceY<GNode>(0).strength(0.035))
      .force("lonely", d3.forceRadial<GNode>(ringRadius, 0, 0).strength((n) => (n.deg === 0 ? 0.06 : 0)));

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
      requestAnimationFrame(() => fit(false));
      sim.alpha(0.25).restart();
    } else {
      sim.alpha(added > 0 ? 0.5 : 0.15).restart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, edges]);

  // Pull members of each circle together; people in two circles sit between them.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const groups = circles
      .filter((c) => !c.hidden && c.members.length > 1)
      .map((c) => c.members.map((id) => nodesRef.current.get(id)).filter(Boolean) as GNode[]);
    const force = (alpha: number) => {
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
          n.vx! += (cx - n.x!) * 0.09 * alpha;
          n.vy! += (cy - n.y!) * 0.09 * alpha;
        }
      }
    };
    sim.force("circles", force as unknown as d3.Force<GNode, GLink>);
    sim.alpha(Math.max(sim.alpha(), 0.3)).restart();
  }, [circles, idsKey]);

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
  }, [cache, circles, settings, selectedId, matched]);

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
      for (const n of nodesRef.current.values()) {
        if (settings.dimMode === "hide" && !matched.has(n.id)) continue;
        const d = Math.hypot(n.x! - x, n.y! - y);
        if (d < n.r + 4 / transformRef.current.k && d < bestD) {
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
      .scaleExtent([0.08, 6])
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        setTooltip(null);
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
      setTooltip(id ? { id, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
    };
    const onLeave = () => {
      hoverRef.current = null;
      setTooltip(null);
      requestDraw();
    };
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const n = findAt(e.clientX - rect.left, e.clientY - rect.top);
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

  const tipFriend = tooltip ? cache.friends[tooltip.id] : null;
  const empty = friends.length === 0;
  const noMutualData = !empty && Object.keys(cache.mutuals).length === 0;

  return (
    <div className="graph" ref={containerRef}>
      <canvas ref={canvasRef} className="graph-canvas" />
      {empty && <div className="graph-empty">No friends loaded yet. They'll appear here after the first sync.</div>}
      {noMutualData && (
        <div className="graph-hint">Connections appear as mutual-friend data loads (one request per friend, about a second each).</div>
      )}
      {tipFriend && tooltip && (
        <div className="tooltip" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          <div className="tt-name" style={{ color: trustRank(cache.details[tipFriend.id]?.tags, tipFriend.developerType).color }}>
            {tipFriend.displayName}
          </div>
          <div className="tt-line">
            <span className="dot" style={{ background: statusColor(tipFriend, presenceOf(tipFriend, cache.presence)) }} />
            {tipFriend.statusDescription || presenceLabel(tipFriend, presenceOf(tipFriend, cache.presence))}
          </div>
          <div className="tt-line muted">
            {cache.mutuals[tipFriend.id]?.hidden
              ? "Mutuals hidden"
              : `${cache.mutuals[tipFriend.id]?.count ?? "?"} mutual friends · ${neighbors.get(tipFriend.id)?.size ?? 0} shown`}
          </div>
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
      </div>
      <Legend ringMode={settings.ringMode} thresholds={strength.thresholds} showLines={settings.lineColors !== "plain" && edges.length > 0} />
    </div>
  );
}

function Legend({ ringMode, thresholds, showLines }: { ringMode: "status" | "trust"; thresholds: number[]; showLines: boolean }) {
  const items =
    ringMode === "status"
      ? [
          ["#42CAFF", "Join me"],
          ["#51E57E", "Online"],
          ["#E88134", "Ask me"],
          ["#DE3A3A", "Busy"],
          ["#C6C24A", "Website/app"],
          ["#6b7783", "Offline"],
        ]
      : [
          ["#8143E6", "Trusted"],
          ["#FF7B42", "Known"],
          ["#2BCF5C", "User"],
          ["#1778FF", "New"],
          ["#CCCCCC", "Visitor"],
        ];
  return (
    <div className="legend">
      <div className="legend-row">
        {items.map(([c, l]) => (
          <span key={l}>
            <span className="dot" style={{ background: c }} />
            {l}
          </span>
        ))}
        <span>
          <span className="star">★</span>Favorite
        </span>
        <span title="Bigger = more mutual friends">◯ size = mutuals</span>
      </div>
      {showLines && (
        <div className="legend-row" title="Line color = how many friends the two connected people have in common (among your friends)">
          <span className="legend-title">Lines · friends in common</span>
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

function hexA(hex: string, a: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
