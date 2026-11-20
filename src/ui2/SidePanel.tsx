// The side panel (beta UI, computers): where you are, overview tiles, online now, activity.
// Sits left or right (swap button), can be resized (snaps back near its default width) and
// folds away to a small "wing" on the edge. Each part can be folded. Remembered per device.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDerived } from "../derived";
import { IN_GAME_STATUSES, relTime } from "../model";
import { setState, useApp } from "../store";
import { ActivityText, KIND_ICON, friendLogEntries, useActivityLoaded } from "../components/ActivityView";
import { FilterChip, clearAll, statusToggle } from "../components/FilterChip";
import { HereNow } from "../components/HereNow";
import { Icon } from "../components/Icon";
import { OnlineNow } from "./OnlineNow";

const LS = "vfm-ui2-panel";
export const PANEL_DEFAULT = 340;
const MIN = 260;
const MAX = 600;
const SNAP = 28;

type Part = "here" | "overview" | "online" | "activity";
export interface PanelPrefs {
  side: "left" | "right";
  width: number;
  collapsed: boolean;
  folded: Part[];
}

function readPrefs(): PanelPrefs {
  const d: PanelPrefs = { side: "left", width: PANEL_DEFAULT, collapsed: false, folded: [] };
  try {
    const r = JSON.parse(localStorage.getItem(LS) ?? "{}") as Partial<PanelPrefs>;
    return {
      side: r.side === "right" ? "right" : "left",
      width: typeof r.width === "number" ? Math.min(MAX, Math.max(MIN, r.width)) : d.width,
      collapsed: r.collapsed === true,
      folded: Array.isArray(r.folded) ? r.folded.filter((x): x is Part => ["here", "overview", "online", "activity"].includes(x)) : [],
    };
  } catch {
    return d;
  }
}

/** The panel's layout, saved on this device only. */
export function usePanelPrefs() {
  const [prefs, setPrefs] = useState(readPrefs);
  const update = useCallback((patch: Partial<PanelPrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(LS, JSON.stringify(next));
      } catch {
        /* private window: just not remembered */
      }
      return next;
    });
  }, []);
  return [prefs, update] as const;
}

export function SidePanel({ prefs, update, onWorld }: { prefs: PanelPrefs; update: (p: Partial<PanelPrefs>) => void; onWorld: (key: string) => void }) {
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ x: number; w: number } | null>(null);
  const width = drag ?? prefs.width;
  const fold = (p: Part) => update({ folded: prefs.folded.includes(p) ? prefs.folded.filter((x) => x !== p) : [...prefs.folded, p] });
  const open = (p: Part) => !prefs.folded.includes(p);
  const here = useApp((s) => s.here);
  return (
    <aside className={`ui2-side ${prefs.side}`} style={{ width }} aria-label="Side panel">
      <div className="ui2-side-tools">
        <button className="icon-btn small" title={`Move to the ${prefs.side === "left" ? "right" : "left"}`} aria-label="Swap side" onClick={() => update({ side: prefs.side === "left" ? "right" : "left" })}>
          <Icon name={prefs.side === "left" ? "chevron-right" : "chevron-left"} size={14} />
          <Icon name={prefs.side === "left" ? "chevron-right" : "chevron-left"} size={14} />
        </button>
        <span className="ui2-grow" />
        <button className="icon-btn small" title="Fold the panel away (Ctrl+B)" aria-label="Fold the panel away" onClick={() => update({ collapsed: true })}>
          <Icon name={prefs.side === "left" ? "chevron-left" : "chevron-right"} size={16} />
        </button>
      </div>
      <Part title="Where you are" icon="pin" open={open("here")} onFold={() => fold("here")}>
        {here?.active ? <HereNow inSidebar /> : <p className="small muted ui2-side-empty">Shows your instance and everyone in it while VRChat runs on this PC (game logs).</p>}
      </Part>
      <Part title="Overview" icon="chart" open={open("overview")} onFold={() => fold("overview")}>
        <Overview />
      </Part>
      <Part title="Online now" icon="world" open={open("online")} onFold={() => fold("online")} grow>
        <OnlineNow onOpen={onWorld} />
      </Part>
      <Part title="Activity" icon="clock" open={open("activity")} onFold={() => fold("activity")} grow action={<button className="btn link small" onClick={() => setState({ view: "activity" })}>See all</button>}>
        <SideActivity />
      </Part>
      <div
        className="ui2-side-grip"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the panel (double-click: default width)"
        onDoubleClick={() => update({ width: PANEL_DEFAULT })}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          start.current = { x: e.clientX, w: prefs.width };
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const dx = (e.clientX - start.current.x) * (prefs.side === "left" ? 1 : -1);
          let w = Math.min(MAX, Math.max(MIN, start.current.w + dx));
          if (Math.abs(w - PANEL_DEFAULT) < SNAP) w = PANEL_DEFAULT;
          setDrag(w);
        }}
        onPointerUp={() => {
          if (!start.current) return;
          start.current = null;
          if (drag !== null) update({ width: drag });
          setDrag(null);
        }}
      />
    </aside>
  );
}

/** The folded panel: a small tab on the window's edge that brings it back. */
export function PanelWing({ side, onOpen }: { side: "left" | "right"; onOpen: () => void }) {
  return (
    <button className={`ui2-wing ${side}`} title="Show the side panel (Ctrl+B)" aria-label="Show the side panel" onClick={onOpen}>
      <Icon name={side === "left" ? "chevron-right" : "chevron-left"} size={16} />
    </button>
  );
}

function Part({ title, icon, open, onFold, grow, action, children }: { title: string; icon: string; open: boolean; onFold: () => void; grow?: boolean; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`ui2-part ${open ? "open" : ""} ${grow && open ? "grow" : ""}`}>
      <div className="ui2-part-head">
        <button className="ui2-part-title" aria-expanded={open} onClick={onFold}>
          <Icon name={open ? "chevron-down" : "chevron-right"} size={14} />
          <Icon name={icon} size={15} />
          <span>{title}</span>
        </button>
        {open && action}
      </div>
      {open && <div className="ui2-part-body">{children}</div>}
    </section>
  );
}

function Overview() {
  const filters = useApp((s) => s.filters);
  const presence = useApp((s) => s.cache.presence);
  const { friends, edges } = useDerived();
  const [hint, setHint] = useState("");
  const stats = useMemo(() => {
    let online = 0;
    let web = 0;
    for (const f of friends) {
      const p = presence[f.id];
      if (p === "online") online++;
      else if (p === "web") web++;
    }
    return { online, web };
  }, [friends, presence]);
  const inGame = IN_GAME_STATUSES.every((k) => filters.statuses.includes(k)) && filters.statuses.length === IN_GAME_STATUSES.length;
  const webOnly = filters.statuses.length === 1 && filters.statuses[0] === "web";
  const tile = (text: string) => ({ onMouseEnter: () => setHint(text), onMouseLeave: () => setHint("") });
  return (
    <>
      <div className="ui2-tiles">
        <span {...tile("Click: show everyone (clears all filters)")}>
          <FilterChip patch={clearAll} active={false} title="Show everyone (clears all filters)">
            <b>{friends.length}</b>
            <span>friends</span>
          </FilterChip>
        </span>
        <span {...tile(inGame ? "Click: show everyone again" : "Click: only people in VRChat on the map")}>
          <FilterChip patch={() => statusToggle(IN_GAME_STATUSES, "set")} active={inGame} title="Only people in VRChat right now (click again to undo)">
            <b className="online">{stats.online}</b>
            <span>in VRChat</span>
          </FilterChip>
        </span>
        <span {...tile(webOnly ? "Click: show everyone again" : "Click: only people on the website or app")}>
          <FilterChip patch={() => statusToggle(["web"], "set")} active={webOnly} title="Only people on the website or app (click again to undo)">
            <b>{stats.web}</b>
            <span>web / app</span>
          </FilterChip>
        </span>
        <span {...tile("Lines between friends who know each other")}>
          <div className="stat-static">
            <b>{edges.length}</b>
            <span>connections</span>
          </div>
        </span>
      </div>
      <p className="small muted ui2-tile-hint">{hint || "Hover a tile to see what a click does."}</p>
    </>
  );
}

/** Recent activity in its own scroll area: new entries get a dot, and "back to top" says how many are new. */
function SideActivity() {
  useActivityLoaded();
  const activity = useApp((s) => s.activity);
  const friendLog = useApp((s) => s.local.friendLog);
  const list = useMemo(
    () =>
      [...activity.filter((e) => !e.initial && e.kind !== "friend-add" && e.kind !== "friend-remove"), ...friendLogEntries(friendLog.slice(-30))]
        .sort((a, b) => b.t - a.t)
        .slice(0, 80),
    [activity, friendLog],
  );
  const box = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  // Everything up to this time has been seen (shown while you were at the top).
  const [seenUntil, setSeenUntil] = useState(() => Date.now());
  const newest = list[0]?.t ?? 0;
  useEffect(() => {
    if (scrolled || newest <= seenUntil) return;
    // At the top: new entries keep their dot for a few seconds, then count as seen.
    const t = setTimeout(() => setSeenUntil(newest), 6000);
    return () => clearTimeout(t);
  }, [scrolled, newest, seenUntil]);
  const fresh = list.filter((e) => e.t > seenUntil).length;
  if (!list.length) return <p className="muted small ui2-side-empty">Nothing yet. Friends coming online, joining your world, being added or removed show up here.</p>;
  return (
    <div className="ui2-scroll" ref={box} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 40)}>
      <ul className="log side-activity ui2-act">
        {list.map((e) => (
          <li key={e.key} className={`act-${e.kind} ${e.t > seenUntil ? "fresh" : ""}`} title={new Date(e.t).toLocaleString()}>
            <Icon name={KIND_ICON[e.kind]} size={13} />
            <span className="act-text">
              <ActivityText e={e} />
            </span>
            <span className="muted small">{relTime(e.t)}</span>
          </li>
        ))}
      </ul>
      {scrolled && (
        <button className="ui2-top-btn" onClick={() => box.current?.scrollTo({ top: 0, behavior: "smooth" })}>
          <Icon name="chevron-up" size={14} /> {fresh > 0 ? `${fresh} new` : "Back to top"}
        </button>
      )}
    </div>
  );
}
