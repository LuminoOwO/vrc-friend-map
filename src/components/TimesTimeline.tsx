// The "Online times" timeline: a calendar you drag. Time runs left to right, one row per person
// (hundreds are fine: it's one canvas and only the rows on screen are drawn). Drag to move through
// time and down the list, Ctrl + wheel or two fingers to zoom, Shift + wheel to move in time.
// Bars are online sessions with their exact times (point at one), striped areas are times
// nobody was watching (this device off and no server logger), small marks are short
// disconnects that were joined.
import { language, useT } from "../i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Span } from "../onlinetimes";
import { Icon } from "./Icon";

export interface TimelineRow {
  id: string;
  name: string;
  spans: Span[];
  /** Times a short disconnect was joined (ms). */
  joined: number[];
  online?: boolean;
  me?: boolean;
}

export interface TimelineView {
  start: number;
  end: number;
}

const HEAD = 46;
const DAY_ROW = 24;
const MIN_SPAN = 2 * 3600e3;
const MAX_SPAN = 62 * 864e5;
const STEPS = [15 * 60e3, 30 * 60e3, 3600e3, 2 * 3600e3, 3 * 3600e3, 6 * 3600e3, 12 * 3600e3, 864e5, 2 * 864e5, 7 * 864e5];

function css(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** A colour as [r, g, b] (canvas normalises any CSS colour to #rrggbb when it can). */
function rgbOf(ctx: CanvasRenderingContext2D, color: string): [number, number, number] {
  ctx.fillStyle = "#000";
  ctx.fillStyle = color;
  const h = String(ctx.fillStyle);
  const m = /^#([0-9a-f]{6})$/i.exec(h);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as [number, number, number];
  const n = h.match(/[\d.]+/g)?.map(Number) ?? [25, 195, 177];
  return [n[0], n[1], n[2]];
}
const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const lighten = (c: [number, number, number], k: number) => rgba([0, 1, 2].map((i) => Math.round(c[i] + (255 - c[i]) * k)) as [number, number, number], 1);

function fmtTime(t: number): string {
  return new Date(t).toLocaleTimeString(language(), { hour: "2-digit", minute: "2-digit" });
}
function fmtDay(t: number): string {
  return new Date(t).toLocaleDateString(language(), { weekday: "short", day: "numeric", month: "short" });
}
export function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60e3);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

function spanLabel(ms: number, t: ReturnType<typeof useT>): string {
  const h = ms / 3600e3;
  return h < 36 ? t("timeline.spanHours", { n: Math.round(h) }) : t("timeline.spanDays", { n: Math.round((h / 24) * 10) / 10 });
}

export function TimesTimeline({
  rows,
  gaps,
  view,
  onView,
  rowH,
  showJoins = false,
  onOpen,
}: {
  rows: TimelineRow[];
  gaps: Span[];
  view: TimelineView;
  onView: (v: TimelineView) => void;
  rowH: number;
  /** Draw a mark where a short disconnect was joined (off by default). */
  showJoins?: boolean;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [scrollY, setScrollY] = useState(0);
  const [tip, setTip] = useState<{ x: number; y: number; text: string[] } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const nameW = size.w < 560 ? 104 : 170;
  const plotW = Math.max(50, size.w - nameW);
  const maxScroll = Math.max(0, rows.length * rowH - (size.h - HEAD - rowH));
  const sy = Math.min(scrollY, maxScroll);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const xOf = useCallback((ms: number) => nameW + ((ms - view.start) / (view.end - view.start)) * plotW, [nameW, plotW, view]);

  // ---------- drawing ----------
  useEffect(() => {
    const c = canvas.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const col = {
      bg: css("--bg", "#070b0f"),
      panel: css("--panel", "#0b1116"),
      text: css("--text", "#e6edf3"),
      muted: css("--muted", "#8a9aa8"),
      border: css("--border", "#1b2733"),
      accent: css("--accent", "#19c3b1"),
      warn: "#e8a33d",
    };
    const acc = rgbOf(ctx, col.accent);
    const txt = rgbOf(ctx, col.text);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.font = "12px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    const span = view.end - view.start;
    const step = STEPS.find((s) => (s / span) * plotW >= 64) ?? STEPS[STEPS.length - 1];
    const top = HEAD + rowH; // below "you"
    const tint = (a: number) => `rgba(140,160,180,${a})`;

    // Days: soft alternating bands through the whole chart, today tinted, names on top.
    const dayStart = (ms: number) => {
      const d = new Date(ms);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    };
    const todayStart = dayStart(Date.now());
    const days: { from: number; to: number }[] = [];
    for (let d = dayStart(view.start); d < view.end; ) {
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      days.push({ from: d, to: next.getTime() });
      d = next.getTime();
    }
    days.forEach((d, i) => {
      const x0 = Math.max(nameW, xOf(d.from));
      const x1 = Math.min(size.w, xOf(d.to));
      if (x1 <= x0) return;
      const today = d.from === todayStart;
      if (today || i % 2 === 0) {
        ctx.fillStyle = today ? rgba(acc, 0.07) : tint(0.035);
        ctx.fillRect(x0, 0, x1 - x0, size.h);
      }
      // Day name, centred in the visible part of the day.
      const w = x1 - x0;
      if (w < 34) return;
      const date = new Date(d.from);
      const label =
        w > 150
          ? date.toLocaleDateString(language(), { weekday: "long", day: "numeric", month: "short" })
          : w > 80
            ? fmtDay(d.from)
            : date.toLocaleDateString(language(), { weekday: "short" });
      ctx.font = `${today ? 700 : 600} 12px system-ui, sans-serif`;
      ctx.fillStyle = today ? col.accent : col.text;
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, Math.max(x0 + 6, Math.min(x1 - tw - 6, x0 + (w - tw) / 2)), DAY_ROW / 2 + 1);
    });

    // No data (nobody was watching): a light hatch.
    ctx.save();
    ctx.beginPath();
    ctx.rect(nameW, HEAD, plotW, size.h - HEAD);
    ctx.clip();
    for (const g of gaps) {
      const x0 = Math.max(nameW, xOf(g[0]));
      const x1 = Math.min(size.w, xOf(g[1]));
      if (x1 <= x0) continue;
      ctx.fillStyle = tint(0.05);
      ctx.fillRect(x0, HEAD, x1 - x0, size.h - HEAD);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, HEAD, x1 - x0, size.h - HEAD);
      ctx.clip();
      ctx.strokeStyle = tint(0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0 - (size.h - HEAD); x < x1; x += 10) {
        ctx.moveTo(x, size.h);
        ctx.lineTo(x + (size.h - HEAD), HEAD);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // Hours: faint lines and small labels under the day names.
    const off = new Date(view.start).getTimezoneOffset() * 60e3;
    const first = Math.ceil((view.start - off) / step) * step + off;
    ctx.font = "10.5px system-ui, sans-serif";
    for (let ms = first; ms <= view.end; ms += step) {
      const x = xOf(ms);
      if (x < nameW || x > size.w) continue;
      const d = new Date(ms);
      const midnight = d.getHours() === 0 && d.getMinutes() === 0;
      ctx.strokeStyle = midnight ? tint(0.22) : tint(0.08);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, midnight ? 0 : HEAD - 4);
      ctx.lineTo(x + 0.5, size.h);
      ctx.stroke();
      if (step < 864e5 && !midnight) {
        const label = fmtTime(ms);
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = col.muted;
        ctx.fillText(label, x - tw / 2, DAY_ROW + (HEAD - DAY_ROW) / 2 - 1);
      }
    }
    ctx.strokeStyle = tint(0.12);
    ctx.beginPath();
    ctx.moveTo(nameW, HEAD + 0.5);
    ctx.lineTo(size.w, HEAD + 0.5);
    ctx.stroke();

    // Rows (only the visible ones).
    const drawRow = (r: TimelineRow, y: number) => {
      if (r.id === hoverId) {
        ctx.fillStyle = tint(0.07);
        ctx.fillRect(0, y, size.w, rowH);
      }
      const barH = Math.max(3, Math.min(rowH - 6, 12));
      const by = y + (rowH - barH) / 2;
      // A faint track so short sessions are easy to follow along the row.
      ctx.fillStyle = tint(0.04);
      ctx.fillRect(nameW, by + barH / 2 - 0.5, plotW, 1);
      const grad = ctx.createLinearGradient(0, by, 0, by + barH);
      grad.addColorStop(0, lighten(acc, 0.25));
      grad.addColorStop(1, col.accent);
      ctx.fillStyle = grad;
      if (r.me) {
        ctx.shadowColor = col.accent;
        ctx.shadowBlur = 8;
      }
      for (const s of r.spans) {
        if (s[1] < view.start || s[0] > view.end) continue;
        const x0 = Math.max(nameW, xOf(s[0]));
        const x1 = Math.min(size.w, xOf(s[1]));
        const w = Math.max(3, x1 - x0);
        ctx.globalAlpha = r.me || r.online || r.id === hoverId ? 1 : 0.78;
        ctx.beginPath();
        ctx.roundRect(x0, by, w, barH, Math.min(barH / 2, w / 2));
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      // Joined short disconnects: a small notch (only when asked for).
      ctx.fillStyle = col.warn;
      for (const j of showJoins ? r.joined : []) {
        const x = xOf(j);
        if (x < nameW || x > size.w) continue;
        ctx.beginPath();
        ctx.roundRect(x - 1, by - 2, 2, barH + 4, 1);
        ctx.fill();
      }
      // Name column.
      ctx.fillStyle = col.bg;
      ctx.fillRect(0, y, nameW - 1, rowH);
      if (r.id === hoverId) {
        ctx.fillStyle = tint(0.07);
        ctx.fillRect(0, y, nameW - 1, rowH);
      }
      if (rowH >= 12) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y, nameW - 10, rowH);
        ctx.clip();
        if (r.online) {
          ctx.fillStyle = "#51e57e";
          ctx.beginPath();
          ctx.arc(12, y + rowH / 2, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = r.me ? col.accent : r.online || r.id === hoverId ? col.text : rgba(txt, 0.78);
        ctx.font = `${r.me ? "700 " : r.online ? "600 " : ""}${rowH >= 20 ? 13 : 11.5}px system-ui, sans-serif`;
        ctx.fillText(r.name, 22, y + rowH / 2 + 0.5);
        ctx.restore();
      }
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, size.w, size.h - top);
    ctx.clip();
    const firstRow = Math.max(0, Math.floor(sy / rowH));
    const lastRow = Math.min(rows.length - 1, Math.ceil((sy + size.h - top) / rowH));
    // "You" is pinned above, so the list starts with the first friend.
    const lead = rows[0]?.me ? 1 : 0;
    for (let i = firstRow + lead; i <= Math.min(rows.length - 1, lastRow + lead); i++) {
      if (rows[i].me) continue;
      drawRow(rows[i], top + (i - lead) * rowH - sy);
    }
    ctx.restore();
    // You, pinned under the header.
    const me = rows.find((r) => r.me);
    ctx.fillStyle = col.bg;
    ctx.fillRect(0, HEAD, size.w, rowH);
    ctx.fillStyle = rgba(acc, 0.06);
    ctx.fillRect(0, HEAD, size.w, rowH);
    if (me) drawRow(me, HEAD);
    // Header background for the name column.
    ctx.fillStyle = col.bg;
    ctx.fillRect(0, 0, nameW - 1, HEAD);
    ctx.strokeStyle = tint(0.14);
    ctx.beginPath();
    ctx.moveTo(0, top + 0.5);
    ctx.lineTo(size.w, top + 0.5);
    ctx.moveTo(nameW - 0.5, 0);
    ctx.lineTo(nameW - 0.5, size.h);
    ctx.stroke();

    // Now: a line with a small "now" tag in the header.
    const nx = xOf(Date.now());
    if (nx >= nameW && nx <= size.w) {
      ctx.strokeStyle = col.warn;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(nx, HEAD - 2);
      ctx.lineTo(nx, size.h);
      ctx.stroke();
      ctx.lineWidth = 1;
      const label = t("timeline.nowTag");
      ctx.font = "700 10px system-ui, sans-serif";
      const tw = ctx.measureText(label).width + 10;
      const lx = Math.max(nameW + 2, Math.min(size.w - tw - 2, nx - tw / 2));
      ctx.fillStyle = col.warn;
      ctx.beginPath();
      ctx.roundRect(lx, DAY_ROW + 3, tw, 15, 7.5);
      ctx.fill();
      ctx.fillStyle = "#1a1206";
      ctx.fillText(label, lx + 5, DAY_ROW + 10.5);
    }
  }, [rows, gaps, view, size, sy, rowH, showJoins, nameW, plotW, xOf, hoverId, t]);

  // ---------- dragging, zooming ----------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; start: number; end: number; sy: number; moved: boolean; pinch?: number } | null>(null);

  const setRange = (start: number, end: number) => {
    let s = start;
    let e = end;
    const len = Math.min(MAX_SPAN, Math.max(MIN_SPAN, e - s));
    const mid = (s + e) / 2;
    s = mid - len / 2;
    e = mid + len / 2;
    // Not into the future beyond a few hours, not further back than kept.
    const maxEnd = Date.now() + 6 * 3600e3;
    if (e > maxEnd) {
      s -= e - maxEnd;
      e = maxEnd;
    }
    onView({ start: s, end: e });
  };
  const zoomAt = (factor: number, px: number) => {
    const v = viewRef.current;
    const at = v.start + ((px - nameW) / plotW) * (v.end - v.start);
    setRange(at - (at - v.start) * factor, at + (v.end - at) * factor);
  };

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const rowAt = (y: number): TimelineRow | null => {
    if (y >= HEAD && y < HEAD + rowH) return rows.find((r) => r.me) ?? null;
    if (y < HEAD + rowH) return null;
    const i = Math.floor((y - HEAD - rowH + sy) / rowH) + (rows[0]?.me ? 1 : 0);
    return rows[i] && !rows[i].me ? rows[i] : null;
  };

  const hover = (p: { x: number; y: number }) => {
    const r = rowAt(p.y);
    setHoverId(r?.id ?? null);
    if (!r || p.x < nameW) {
      setTip(r && p.x < nameW ? { x: p.x, y: p.y, text: [r.name, t("timeline.openProfile")] } : null);
      return;
    }
    const v = viewRef.current;
    const at = v.start + ((p.x - nameW) / plotW) * (v.end - v.start);
    const s = r.spans.find((x) => at >= x[0] - 60e3 && at <= x[1] + 60e3);
    if (s) {
      const joins = r.joined.filter((j) => j >= s[0] && j <= s[1]).length;
      setTip({
        x: p.x,
        y: p.y,
        text: [
          r.name,
          `${fmtDay(s[0])} ${fmtTime(s[0])} – ${new Date(s[1]).toDateString() === new Date(s[0]).toDateString() ? "" : fmtDay(s[1]) + " "}${fmtTime(s[1])} (${fmtDuration(s[1] - s[0])})`,
          ...(joins ? [t("timeline.disconnects", { count: joins })] : []),
        ],
      });
      return;
    }
    const g = gaps.find((x) => at >= x[0] && at <= x[1]);
    setTip({ x: p.x, y: p.y, text: g ? [t("timeline.noData"), `${fmtDay(g[0])} ${fmtTime(g[0])} – ${fmtTime(g[1])}`] : [r.name, t("timeline.offlineAt", { time: `${fmtDay(at)} ${fmtTime(at)}` })] });
  };

  return (
    <div
      ref={wrap}
      className="tl"
      tabIndex={0}
      role="application"
      aria-label={t("timeline.label")}
      onKeyDown={(e) => {
        const v = viewRef.current;
        const len = v.end - v.start;
        if (e.key === "ArrowLeft") setRange(v.start - len * 0.15, v.end - len * 0.15);
        else if (e.key === "ArrowRight") setRange(v.start + len * 0.15, v.end + len * 0.15);
        else if (e.key === "ArrowUp") setScrollY((y) => Math.max(0, y - rowH * 3));
        else if (e.key === "ArrowDown") setScrollY((y) => Math.min(maxScroll, y + rowH * 3));
        else if (e.key === "+" || e.key === "=") zoomAt(0.7, nameW + plotW / 2);
        else if (e.key === "-") zoomAt(1 / 0.7, nameW + plotW / 2);
        else return;
        e.preventDefault();
      }}
    >
      <canvas
        ref={canvas}
        style={{ width: size.w, height: size.h, touchAction: "none", cursor: drag.current?.moved ? "grabbing" : "grab" }}
        onWheel={(e) => {
          const p = local(e);
          if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(e.deltaY * 0.0025), p.x);
          else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            const v = viewRef.current;
            const d = ((e.shiftKey ? e.deltaY : e.deltaX) / plotW) * (v.end - v.start);
            setRange(v.start + d, v.end + d);
          } else setScrollY((y) => Math.max(0, Math.min(maxScroll, y + e.deltaY)));
          setTip(null);
        }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          const p = local(e);
          pointers.current.set(e.pointerId, p);
          const v = viewRef.current;
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            drag.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, start: v.start, end: v.end, sy, moved: true, pinch: Math.abs(a.x - b.x) || 1 };
          } else drag.current = { x: p.x, y: p.y, start: v.start, end: v.end, sy, moved: false };
        }}
        onPointerMove={(e) => {
          const p = local(e);
          if (!pointers.current.has(e.pointerId)) return hover(p);
          pointers.current.set(e.pointerId, p);
          const d = drag.current;
          if (!d) return;
          if (d.pinch && pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            const now = Math.abs(a.x - b.x) || 1;
            const factor = d.pinch / now;
            const at = d.start + ((d.x - nameW) / plotW) * (d.end - d.start);
            setRange(at - (at - d.start) * factor, at + (d.end - at) * factor);
            return;
          }
          const dx = p.x - d.x;
          const dy = p.y - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
          if (!d.moved) return;
          const shift = (-dx / plotW) * (d.end - d.start);
          setRange(d.start + shift, d.end + shift);
          setScrollY(Math.max(0, Math.min(maxScroll, d.sy - dy)));
          setTip(null);
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          const d = drag.current;
          if (pointers.current.size === 0) {
            if (d && !d.moved) {
              const p = local(e);
              const r = rowAt(p.y);
              if (r && !r.me && p.x < nameW) onOpen(r.id);
            }
            drag.current = null;
          }
        }}
        onPointerLeave={() => {
          if (drag.current) return;
          setTip(null);
          setHoverId(null);
        }}
        onDoubleClick={(e) => {
          const p = local(e);
          if (p.x > nameW) zoomAt(e.shiftKey ? 2 : 0.5, p.x);
        }}
      />
      <div className="tl-zoom" role="group" aria-label={t("timeline.zoom")}>
        <button className="icon-btn" title={t("timeline.zoomOut")} onClick={() => zoomAt(1 / 0.6, nameW + plotW / 2)} disabled={view.end - view.start >= MAX_SPAN}>
          <Icon name="minus" size={15} />
        </button>
        <span className="tl-zoom-label">{spanLabel(view.end - view.start, t)}</span>
        <button className="icon-btn" title={t("timeline.zoomIn")} onClick={() => zoomAt(0.6, nameW + plotW / 2)} disabled={view.end - view.start <= MIN_SPAN}>
          <Icon name="plus" size={15} />
        </button>
      </div>
      {tip && (
        <div className="tl-tip" style={{ left: Math.min(tip.x + 14, size.w - 260), top: Math.min(tip.y + 14, size.h - 70) }}>
          {tip.text.map((l, i) => (i === 0 ? <b key={i}>{l}</b> : <span key={i}>{l}</span>))}
        </div>
      )}
    </div>
  );
}
