// Layout "Windows": a desktop. The map is the wallpaper; Online now, Activity, Where you are and
// any view open as windows you drag by the title bar and resize from the corner. A taskbar at the
// bottom with a start menu, the open windows, the tray and a clock. Remembered on this device.
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp, type View } from "../../store";
import { GraphView } from "../../components/GraphView";
import { Icon } from "../../components/Icon";
import { Avatar, NotificationList, RAIL, ToolCluster, ViewBody, useOpenWorld } from "../parts";
import { ActivityFeed, Overview, WhereCard } from "../SidePanel";
import { OnlineNow } from "../OnlineNow";
import { useDismiss } from "../dismiss";

type Kind = "online" | "feed" | "here" | "notes" | Exclude<View, "graph">;
interface Win {
  kind: Kind;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  min?: boolean;
}
const APPS: { kind: Kind; label: string; icon: string; w: number; h: number }[] = [
  { kind: "online", label: "Online now", icon: "world", w: 340, h: 460 },
  { kind: "feed", label: "Activity feed", icon: "clock", w: 380, h: 420 },
  { kind: "here", label: "Where you are", icon: "pin", w: 360, h: 420 },
  { kind: "notes", label: "Notifications", icon: "bell", w: 360, h: 400 },
  ...RAIL.filter((r) => r.key !== "graph").map((r) => ({ kind: r.key as Kind, label: r.label, icon: r.icon, w: 760, h: 540 })),
];
const LS = "vfm-ui2-windows";
function read(): Win[] {
  try {
    const r = JSON.parse(localStorage.getItem(LS) ?? "null");
    if (Array.isArray(r)) return r.filter((w) => w && APPS.some((a) => a.kind === w.kind));
  } catch {
    /* not remembered */
  }
  return [
    { kind: "online", x: 24, y: 24, w: 340, h: 460, z: 1 },
    { kind: "feed", x: 380, y: 60, w: 380, h: 380, z: 2 },
  ];
}

export function WindowsLayout({ onPalette }: { onPalette: () => void }) {
  const me = useApp((s) => s.cache.me);
  const [wins, setRaw] = useState<Win[]>(read);
  const set = useCallback((next: Win[]) => {
    setRaw(next);
    try {
      localStorage.setItem(LS, JSON.stringify(next));
    } catch {
      /* private window */
    }
  }, []);
  const top = Math.max(0, ...wins.map((w) => w.z));
  const patch = (kind: Kind, p: Partial<Win>) => set(wins.map((w) => (w.kind === kind ? { ...w, ...p } : w)));
  const focus = (kind: Kind) => patch(kind, { z: top + 1, min: false });
  const open = (kind: Kind) => {
    if (wins.some((w) => w.kind === kind)) return focus(kind);
    const a = APPS.find((x) => x.kind === kind)!;
    const n = wins.length;
    set([...wins, { kind, x: 60 + n * 28, y: 40 + n * 24, w: a.w, h: a.h, z: top + 1 }]);
  };
  const [start, setStart] = useState(false);
  const closeStart = useCallback(() => setStart(false), []);
  const startRef = useDismiss(start, closeStart);
  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  const active = wins.filter((w) => !w.min).sort((a, b) => b.z - a.z)[0]?.kind;
  return (
    <div className="lay-win">
      <div className="win-desk">
        <div className="win-wall">
          <GraphView />
        </div>
        {wins
          .filter((w) => !w.min)
          .map((w) => (
            <Window key={w.kind} win={w} active={w.kind === active} onFocus={() => focus(w.kind)} onChange={(p) => patch(w.kind, p)} onClose={() => set(wins.filter((x) => x.kind !== w.kind))} />
          ))}
      </div>
      <footer className="win-bar">
        <div className="win-start-wrap" ref={startRef}>
          <button className={`win-start ${start ? "on" : ""}`} aria-expanded={start} onClick={() => setStart(!start)}>
            {me ? <Avatar id={me.id} size={26} /> : <Icon name="menu" size={18} />}
            Start
          </button>
          {start && (
            <div className="win-menu" role="menu">
              <div className="win-menu-head">{me?.displayName ?? "Friend Map"}</div>
              {APPS.map((a) => (
                <button
                  key={a.kind}
                  role="menuitem"
                  onClick={() => {
                    open(a.kind);
                    setStart(false);
                  }}
                >
                  <Icon name={a.icon} size={17} /> {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="win-tasks">
          {wins.map((w) => {
            const a = APPS.find((x) => x.kind === w.kind)!;
            return (
              <button key={w.kind} className={`win-task ${w.kind === active ? "on" : ""} ${w.min ? "min" : ""}`} onClick={() => (w.kind === active ? patch(w.kind, { min: true }) : focus(w.kind))}>
                <Icon name={a.icon} size={16} /> <span>{a.label}</span>
              </button>
            );
          })}
        </div>
        <ToolCluster onPalette={onPalette} className="win-tray" />
        <span className="win-clock">
          {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          <small>{clock.toLocaleDateString()}</small>
        </span>
      </footer>
    </div>
  );
}

function Window({ win, active, onFocus, onChange, onClose }: { win: Win; active: boolean; onFocus: () => void; onChange: (p: Partial<Win>) => void; onClose: () => void }) {
  const a = APPS.find((x) => x.kind === win.kind)!;
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; wx: number; wy: number } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const x = pos?.x ?? win.x;
  const y = pos?.y ?? win.y;
  return (
    <div
      ref={ref}
      className={`win ${active ? "active" : ""}`}
      style={{ left: x, top: y, width: win.w, height: win.h, zIndex: 10 + win.z }}
      onPointerDown={onFocus}
      onPointerUp={() => {
        // The corner resize changes the size: remember it.
        const el = ref.current;
        if (el && (el.offsetWidth !== win.w || el.offsetHeight !== win.h)) onChange({ w: el.offsetWidth, h: el.offsetHeight });
      }}
    >
      <header
        className="win-title"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, wx: win.x, wy: win.y };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          setPos({ x: Math.max(-win.w + 80, d.wx + e.clientX - d.x), y: Math.max(0, d.wy + e.clientY - d.y) });
        }}
        onPointerUp={() => {
          drag.current = null;
          if (pos) onChange({ x: pos.x, y: pos.y });
          setPos(null);
        }}
        onDoubleClick={() => onChange(win.w > 900 ? { w: a.w, h: a.h, x: 60, y: 40 } : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight - 56 })}
      >
        <Icon name={a.icon} size={15} />
        <b>{a.label}</b>
        <span className="ui2-grow" />
        <button className="win-ctl" title="Minimize" aria-label="Minimize" onClick={() => onChange({ min: true })}>
          <Icon name="minus" size={14} />
        </button>
        <button className="win-ctl close" title="Close" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className="win-body">
        <WinBody kind={win.kind} />
      </div>
    </div>
  );
}

function WinBody({ kind }: { kind: Kind }) {
  const openWorld = useOpenWorld();
  switch (kind) {
    case "online":
      return <OnlineNow onOpen={openWorld} />;
    case "feed":
      return <ActivityFeed max={100} />;
    case "notes":
      return <NotificationList max={60} />;
    case "here":
      return (
        <div className="win-here">
          <WhereCard />
          <Overview />
        </div>
      );
    default:
      return <ViewBody view={kind} />;
  }
}
