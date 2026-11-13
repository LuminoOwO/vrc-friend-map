import { useCallback, useEffect, useRef, useState } from "react";
import { backend, imgSrc, isTauri } from "../backend";
import { setState, showToast, useApp } from "../store";
import { Icon } from "./Icon";

export interface ViewerItem {
  /** The image's original VRChat URL. */
  url: string;
  /** What it is, e.g. "Lumi – profile picture". Also the download's file name. */
  title: string;
}

/** Open the fullscreen viewer. `items` can hold several images to flip through. */
export function openImage(items: ViewerItem | ViewerItem[], index = 0) {
  const list = (Array.isArray(items) ? items : [items]).filter((i) => !!i.url);
  if (list.length) setState({ viewer: { items: list, index: Math.min(index, list.length - 1) } });
}

/** VRChat's thumbnail URLs (…/image/file_x/1/256) have a full-size original (…/file/file_x/1/file). */
export function fullSize(url: string): string {
  const m = url.match(/^(https:\/\/[^/]+\/api\/1\/)image\/(file_[^/]+)\/(\d+)\/\d+\/?$/);
  return m ? `${m[1]}file/${m[2]}/${m[3]}/file` : url;
}

/** Props for anything that opens an image when clicked (keyboard too). */
export function viewable(items: ViewerItem | ViewerItem[] | null | undefined, index = 0) {
  if (!items || (Array.isArray(items) ? !items.some((i) => i.url) : !items.url)) return {};
  return {
    role: "button",
    tabIndex: 0,
    className: "viewable",
    title: "Click to view",
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      openImage(items, index);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openImage(items, index);
      }
    },
  };
}

const MIN = 0.1;
const MAX = 16;

export function ImageViewer() {
  const viewer = useApp((s) => s.viewer);
  if (!viewer) return null;
  return <Viewer key={viewer.index + viewer.items[viewer.index].url} items={viewer.items} index={viewer.index} />;
}

function Viewer({ items, index }: { items: ViewerItem[]; index: number }) {
  const item = items[index];
  const [src, setSrc] = useState(() => imgSrc(fullSize(item.url))!);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState({ s: 1, x: 0, y: 0 }); // scale and offset from the centre
  const [fit, setFit] = useState(1);
  const [saving, setSaving] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; s: number; x: number; y: number; cx: number; cy: number } | null>(null);

  const close = useCallback(() => setState({ viewer: null }), []);
  const go = useCallback(
    (d: number) => {
      if (items.length > 1) setState({ viewer: { items, index: (index + d + items.length) % items.length } });
    },
    [items, index],
  );

  // Fit the picture into the screen.
  const fitNow = useCallback(() => {
    const el = stage.current;
    if (!el || !natural) return;
    const r = el.getBoundingClientRect();
    const f = Math.min((r.width - 32) / natural.w, (r.height - 32) / natural.h, 4);
    setFit(f);
    setView({ s: f, x: 0, y: 0 });
  }, [natural]);
  useEffect(fitNow, [fitNow]);
  useEffect(() => {
    window.addEventListener("resize", fitNow);
    return () => window.removeEventListener("resize", fitNow);
  }, [fitNow]);

  /** Zoom by `factor` keeping the screen point (px, py) (relative to the centre) in place. */
  const zoomAt = useCallback((factor: number, px = 0, py = 0) => {
    setView((v) => {
      const s = Math.min(MAX, Math.max(MIN, v.s * factor));
      const k = s / v.s;
      return { s, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  }, []);
  const centre = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 };
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "+" || e.key === "=") zoomAt(1.25);
      else if (e.key === "-") zoomAt(0.8);
      else if (e.key === "0") fitNow();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, go, zoomAt, fitNow]);

  const onWheel = (e: React.WheelEvent) => {
    const c = centre(e);
    zoomAt(Math.exp(-e.deltaY * 0.0015), c.x, c.y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, centre(e));
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const [a, b] = pts;
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), s: view.s, x: view.x, y: view.y, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = centre(e);
    pointers.current.set(e.pointerId, now);
    const pts = [...pointers.current.values()];
    if (pts.length === 2 && gesture.current) {
      const [a, b] = pts;
      const g = gesture.current;
      const s = Math.min(MAX, Math.max(MIN, (g.s * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, g.dist)));
      const k = s / g.s;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      setView({ s, x: cx - (g.cx - g.x) * k, y: cy - (g.cy - g.y) * k });
    } else if (pts.length === 1) {
      setView((v) => ({ ...v, x: v.x + now.x - prev.x, y: v.y + now.y - prev.y }));
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    const c = centre(e);
    if (Math.abs(view.s - fit) < 0.01) zoomAt(Math.max(1, fit * 2.5) / view.s, c.x, c.y);
    else fitNow();
  };

  const download = async () => {
    setSaving(true);
    try {
      let path: string;
      try {
        path = await backend.saveImage(fullSize(item.url), item.title);
      } catch {
        path = await backend.saveImage(item.url, item.title); // the full size may not be public
      }
      if (isTauri) showToast(`Saved to ${path}`);
      setLastSaved(path);
    } catch (e) {
      showToast(`Couldn't save: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const pct = Math.round(view.s * 100);
  return (
    <div className="viewer" role="dialog" aria-label={item.title}>
      <div className="viewer-bar">
        <span className="viewer-title">
          {item.title}
          {natural && <span className="muted"> · {natural.w} × {natural.h}</span>}
          {items.length > 1 && <span className="muted"> · {index + 1} / {items.length}</span>}
        </span>
        <div className="viewer-tools">
          <button className="icon-btn" title="Zoom out (−)" onClick={() => zoomAt(0.8)}>
            <Icon name="minus" size={18} />
          </button>
          <button className="btn small viewer-pct" title="Fit to screen (0)" onClick={fitNow}>
            {pct}%
          </button>
          <button className="icon-btn" title="Zoom in (+)" onClick={() => zoomAt(1.25)}>
            <Icon name="plus" size={18} />
          </button>
          <button className="btn small" title="Actual size" onClick={() => setView({ s: 1, x: 0, y: 0 })}>
            1:1
          </button>
          <button className="btn small primary" disabled={saving} onClick={download} title="Save to Downloads / VRC Friend Map">
            <Icon name="download" size={16} /> <span className="hide-sm">{saving ? "Saving…" : "Download"}</span>
          </button>
          {lastSaved && isTauri && !/android/i.test(navigator.userAgent) && (
            <button className="btn small" onClick={() => backend.revealFile(lastSaved).catch(() => showToast("Couldn't open the folder"))}>
              <span className="hide-sm">Show in folder</span>
              <Icon name="folder" size={16} />
            </button>
          )}
          <button className="icon-btn viewer-close" title="Close (Esc)" onClick={close}>
            <Icon name="close" size={20} />
          </button>
        </div>
      </div>
      <div
        ref={stage}
        className="viewer-stage"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onClick={(e) => {
          if (e.target === e.currentTarget && pointers.current.size === 0) close();
        }}
      >
        <img
          src={src}
          alt={item.title}
          draggable={false}
          style={{ transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.s})`, visibility: natural ? "visible" : "hidden" }}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          onError={() => {
            const small = imgSrc(item.url)!;
            if (src !== small) setSrc(small);
          }}
        />
        {!natural && <div className="viewer-loading">Loading…</div>}
        {items.length > 1 && (
          <>
            <button className="viewer-nav prev" title="Previous (←)" onClick={() => go(-1)}>
              <Icon name="chevron-left" size={26} />
            </button>
            <button className="viewer-nav next" title="Next (→)" onClick={() => go(1)}>
              <Icon name="chevron-right" size={26} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
