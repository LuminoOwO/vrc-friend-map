// The new beta UI (Settings → Appearance → Interface → New beta UI). Same
// data, same views and dialogs as the classic UI; a different shell:
//  - computers: an icon rail on the left, the map nearly full-window under a
//    slim floating search bar with filter chips, the person in a panel on the
//    right with section tabs, who's here as a floating card, Ctrl+K for the
//    command palette;
//  - phones: a bottom tab bar (Map, People, Here, Insights, Me), a person as
//    a bottom sheet you drag between peek, half and full, settings and
//    filters as full-screen sheets, bigger touch targets.
// The classic UI stays the default; "Back to classic UI" is always one click
// away (and `--classic-ui` at start).
import { useEffect, useMemo, useRef, useState } from "react";
import { imgSrc, isMobile } from "../backend";
import { useDerived } from "../derived";
import { iconUrl } from "../model";
import { shownName } from "../personal";
import { setState, updateFilters, updateUi, useApp, type View } from "../store";
import { openServers } from "../components/ServersModal";
import { ServerStatusChip, useServersSummary } from "./ServerStatus";
import { syncAll } from "../sync";
import { ActivityView } from "../components/ActivityView";
import { CardsView } from "../components/CardsView";
import { DetailPanel } from "../components/DetailPanel";
import { GraphView } from "../components/GraphView";
import { HereNow } from "../components/HereNow";
import { Icon } from "../components/Icon";
import { InsightsView, useUnreadMissed } from "../components/InsightsView";
import { LogbookView } from "../components/LogbookView";
import { SharedLists } from "../components/SharedLists";
import { SyncLogDialog } from "../components/SyncLogDialog";
import { FilterPopover, SyncPill } from "../components/TopBar";
import { VrchatView } from "../components/VrchatView";
import { CommandPalette } from "./CommandPalette";
import "./ui2.css";

const RAIL: { key: View; label: string; icon: string }[] = [
  { key: "graph", label: "Map", icon: "graph" },
  { key: "cards", label: "People", icon: "users" },
  { key: "activity", label: "Activity", icon: "clock" },
  { key: "insights", label: "Insights", icon: "bulb" },
  { key: "logbook", label: "Logbook", icon: "calendar" },
  { key: "vrchat", label: "VRChat", icon: "world" },
  { key: "lists", label: "Shared lists", icon: "share" },
];

/** Phones: "here" and "me" are pages of the beta shell, the rest are views. */
const NONE: string[] = [];

type PhoneTab = "graph" | "cards" | "here" | "insights" | "me";

export function BetaApp({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className={`ui2 ${isMobile ? "ui2-phone" : "ui2-desktop"}`}>
      {isMobile ? <PhoneShell /> : <DesktopShell onPalette={() => setPaletteOpen(true)} />}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {children}
    </div>
  );
}

function ViewBody({ view }: { view: View }) {
  return (
    <>
      {view === "graph" && <GraphView />}
      {view === "cards" && <CardsView />}
      {view === "lists" && <SharedLists />}
      {view === "activity" && <ActivityView />}
      {view === "insights" && <InsightsView />}
      {view === "logbook" && <LogbookView />}
      {view === "vrchat" && <VrchatView />}
    </>
  );
}

function Avatar({ id, size = 34 }: { id: string; size?: number }) {
  const f = useApp((s) => (s.cache.me?.id === id ? s.cache.me?.profile : (s.cache.friends[id] ?? s.cache.others?.[id])));
  const src = f ? imgSrc(iconUrl(f)) : undefined;
  return (
    <span className="ui2-avatar" style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" /> : (f?.displayName?.[0] ?? "?")}
    </span>
  );
}

// ---------- desktop ----------

function DesktopShell({ onPalette }: { onPalette: () => void }) {
  const view = useApp((s) => s.view);
  const selectedId = useApp((s) => s.selectedId);
  const me = useApp((s) => s.cache.me);
  const unread = useUnreadMissed();
  return (
    <div className="ui2-desk">
      <nav className="ui2-rail" aria-label="Views">
        <button className="ui2-rail-me" title="Your profile" onClick={() => me && setState({ selectedId: me.id })}>
          {me ? <Avatar id={me.id} size={36} /> : <Icon name="user" />}
        </button>
        {RAIL.map((r) => (
          <button key={r.key} className={`ui2-rail-btn ${view === r.key ? "on" : ""}`} title={r.label} aria-label={r.label} aria-current={view === r.key} onClick={() => setState({ view: r.key })}>
            <Icon name={r.icon} />
            {r.key === "insights" && unread > 0 && <span className="ui2-dot">{unread}</span>}
            <span className="ui2-rail-label">{r.label}</span>
          </button>
        ))}
        <span className="ui2-grow" />
        <button className="ui2-rail-btn" title="Search everything (Ctrl+K)" aria-label="Search everything" onClick={onPalette}>
          <Icon name="search" />
          <span className="ui2-rail-label">Search</span>
        </button>
        <button className="ui2-rail-btn" title="Settings" aria-label="Settings" onClick={() => setState({ settingsOpen: true })}>
          <Icon name="settings" />
          <span className="ui2-rail-label">Settings</span>
        </button>
      </nav>
      <main className="ui2-main">
        <FloatingBar onPalette={onPalette} />
        <div className="ui2-content">
          {view === "graph" && <div className="ui2-here-float"><HereNow /></div>}
          <ViewBody view={view} />
        </div>
      </main>
      {selectedId && <PersonPanel id={selectedId} />}
    </div>
  );
}

/** Search and the most used filters as chips; the full filter menu behind "More". */
function FloatingBar({ onPalette }: { onPalette: () => void }) {
  const filters = useApp((s) => s.filters);
  const circles = useApp((s) => s.local.circles);
  const starred = useApp((s) => s.local.starred ?? NONE);
  const [more, setMore] = useState(false);
  const { matched, friends } = useDerived();
  const onlineOnly = filters.presence === "online";
  return (
    <div className="ui2-bar">
      <div className="ui2-search">
        <Icon name="search" size={16} />
        <input value={filters.search} placeholder="Search friends…" onChange={(e) => updateFilters({ search: e.target.value })} />
        <kbd title="Search everything" onClick={onPalette}>
          Ctrl K
        </kbd>
      </div>
      <div className="ui2-chips">
        <button className={`ui2-chip ${onlineOnly ? "on" : ""}`} onClick={() => updateFilters({ presence: onlineOnly ? "all" : "online" })}>
          Online
        </button>
        {starred.length > 0 && (
          <button className={`ui2-chip ${filters.starredOnly ? "on" : ""}`} title="Only starred friends" onClick={() => updateFilters({ starredOnly: !filters.starredOnly })}>
            <Icon name="star" size={13} /> Starred
          </button>
        )}
        {circles.slice(0, 4).map((c) => (
          <button key={c.id} className={`ui2-chip ${filters.circleId === c.id ? "on" : ""}`} style={{ ["--chip" as string]: c.color }} onClick={() => updateFilters({ circleId: filters.circleId === c.id ? null : c.id })}>
            <span className="ui2-chip-dot" /> {c.name}
          </button>
        ))}
        <div className="filter-wrap">
          <button className={`ui2-chip ${more ? "on" : ""}`} onClick={() => setMore(!more)}>
            <Icon name="filter" size={14} /> More
          </button>
          {more && <FilterPopover onClose={() => setMore(false)} />}
        </div>
      </div>
      <span className="ui2-count" title="Friends matching the filters">
        {matched.size}/{friends.length}
      </span>
      <ServerStatusChip />
      <SyncPill />
    </div>
  );
}

const SECTIONS: [string, string][] = [
  ["Overview", ""],
  ["About", "About me"],
  ["Age", "Age"],
  ["Time", "Local time"],
  ["Online", "Online"],
  ["Note", "Your note"],
  ["Logs", "From your game logs"],
  ["Groups", "Groups"],
];

/** The person on the right (desktop), with section tabs that jump within the profile. */
function PersonPanel({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const jump = (label: string) => {
    const root = ref.current;
    if (!root) return;
    if (!label) return root.querySelector(".profile")?.scrollTo({ top: 0, behavior: "smooth" });
    const h = [...root.querySelectorAll("h3")].find((x) => x.textContent?.trim().startsWith(label));
    h?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <aside className="ui2-person" ref={ref}>
      <div className="ui2-person-tabs">
        {SECTIONS.map(([t, h]) => (
          <button key={t} onClick={() => jump(h)}>
            {t}
          </button>
        ))}
        <span className="ui2-grow" />
        <button className="icon-btn" aria-label="Close" onClick={() => setState({ selectedId: null })}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <DetailPanel id={id} />
    </aside>
  );
}

// ---------- phone ----------

function PhoneShell() {
  const view = useApp((s) => s.view);
  const selectedId = useApp((s) => s.selectedId);
  const unread = useUnreadMissed();
  const [page, setPage] = useState<"here" | "me" | null>(null);
  const tab: PhoneTab = page ?? (view === "cards" ? "cards" : view === "insights" ? "insights" : view === "graph" ? "graph" : "me");
  const go = (t: PhoneTab | View) => {
    if (t === "here" || t === "me") setPage(t);
    else {
      setPage(null);
      setState({ view: t as View });
    }
  };
  return (
    <div className="ui2-phone-shell">
      <header className="ui2-phone-top">
        <PhoneSearch />
        <button className="icon-btn" aria-label="Settings" onClick={() => setState({ settingsOpen: true })}>
          <Icon name="settings" />
        </button>
      </header>
      <main className="ui2-phone-main">
        {page === "here" ? <HerePage /> : page === "me" ? <MePage onOpen={(v) => go(v)} /> : <ViewBody view={view} />}
      </main>
      <nav className="ui2-tabs" aria-label="Views">
        {(
          [
            ["graph", "Map", "graph"],
            ["cards", "People", "users"],
            ["here", "Here", "pin"],
            ["insights", "Insights", "bulb"],
            ["me", "Me", "user"],
          ] as [PhoneTab, string, string][]
        ).map(([k, l, i]) => (
          <button key={k} className={`ui2-tab ${tab === k ? "on" : ""}`} aria-current={tab === k} onClick={() => go(k)}>
            <Icon name={i} size={24} />
            <span>{l}</span>
            {k === "insights" && unread > 0 && <span className="ui2-dot">{unread}</span>}
          </button>
        ))}
      </nav>
      {selectedId && <PersonSheet id={selectedId} />}
    </div>
  );
}

function PhoneSearch() {
  const filters = useApp((s) => s.filters);
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="ui2-search phone">
        <Icon name="search" size={16} />
        <input value={filters.search} placeholder="Search friends" onChange={(e) => updateFilters({ search: e.target.value })} />
        <button className="icon-btn small" aria-label="Filters" onClick={() => setOpen(true)}>
          <Icon name="filter" size={16} />
        </button>
      </div>
      {open && (
        <div className="ui2-fullsheet" role="dialog" aria-label="Filters">
          <div className="ui2-fullsheet-head">
            <h2>Filters</h2>
            <button className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}>
              <Icon name="close" />
            </button>
          </div>
          <div className="filter-wrap ui2-filters-inline">
            <FilterPopover onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}

function HerePage() {
  const here = useApp((s) => s.here);
  return (
    <div className="ui2-page">
      {here?.active ? <HereNow inSidebar /> : <p className="muted">Who's in your instance shows here while VRChat runs on this device or your PC shares it (game logs).</p>}
    </div>
  );
}

function MePage({ onOpen }: { onOpen: (v: View) => void }) {
  const me = useApp((s) => s.cache.me);
  const [logOpen, setLogOpen] = useState(false);
  const servers = useServersSummary();
  const links: [string, string, () => void][] = [
    ["Activity", "clock", () => onOpen("activity")],
    ["Logbook", "calendar", () => onOpen("logbook")],
    ["VRChat", "world", () => onOpen("vrchat")],
    ["Shared lists", "share", () => onOpen("lists")],
    ["Servers and sharing", "server", openServers],
    ["Sync log", "info", () => setLogOpen(true)],
    ["Settings", "settings", () => setState({ settingsOpen: true })],
  ];
  return (
    <div className="ui2-page">
      {me && (
        <button className="ui2-me-card" onClick={() => setState({ selectedId: me.id })}>
          <Avatar id={me.id} size={56} />
          <span>
            <b>{me.displayName}</b>
            <br />
            <span className="muted small">Your profile, status and bio</span>
          </span>
        </button>
      )}
      <ul className="ui2-list">
        {links.map(([l, i, f]) => (
          <li key={l}>
            <button onClick={f}>
              <Icon name={i} /> <span className="ui2-grow">{l}</span>
              {l === "Servers and sharing" && servers && (
                <span className="small muted ui2-me-status">
                  <span className={`ui2-srv-dot ${servers.tone}`} /> {servers.text}
                </span>
              )}
              <Icon name="chevron-right" size={16} />
            </button>
          </li>
        ))}
      </ul>
      <button className="btn wide" onClick={() => syncAll()}>
        <Icon name="refresh" size={16} /> Sync now
      </button>
      <button className="btn wide ghost" onClick={() => updateUi({ beta: false })}>
        Back to the classic UI
      </button>
      {logOpen && <SyncLogDialog onClose={() => setLogOpen(false)} />}
    </div>
  );
}

type Snap = "peek" | "half" | "full";

/** A person as a bottom sheet: drag the handle between peek, half and full; down from peek closes. */
function PersonSheet({ id }: { id: string }) {
  const [snap, setSnap] = useState<Snap>("half");
  const [drag, setDrag] = useState<number | null>(null);
  const start = useRef<{ y: number; h: number } | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const heights = useMemo(() => ({ peek: 0.3, half: 0.62, full: 0.96 }), []);
  useEffect(() => setSnap("half"), [id]);
  // The back gesture closes it: one history entry while the sheet is open.
  // Closed another way, the entry stays but is neutralized (going back to it
  // changes nothing), which is safer than calling history.back() ourselves.
  useEffect(() => {
    if (!history.state?.vfmSheet) history.pushState({ vfmSheet: true }, "");
    const onPop = () => setState({ selectedId: null });
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (history.state?.vfmSheet) history.replaceState(null, "");
    };
  }, []);
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const h = drag ?? heights[snap] * vh;
  const name = useApp((s) => shownName(id, s.cache.me?.id === id ? (s.cache.me?.displayName ?? "") : ""));
  return (
    <div className="ui2-sheet-wrap" onMouseDown={(e) => e.target === e.currentTarget && setState({ selectedId: null })}>
      <div ref={sheet} className={`ui2-sheet ${drag !== null ? "dragging" : ""}`} style={{ height: h }} role="dialog" aria-label={name || "Profile"}>
        <div
          className="ui2-handle"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            start.current = { y: e.clientY, h };
          }}
          onPointerMove={(e) => {
            if (!start.current) return;
            setDrag(Math.max(80, Math.min(vh * 0.98, start.current.h + (start.current.y - e.clientY))));
          }}
          onPointerUp={() => {
            if (!start.current) return;
            const cur = drag ?? h;
            start.current = null;
            setDrag(null);
            const frac = cur / vh;
            if (frac < 0.18) return setState({ selectedId: null });
            setSnap(frac > 0.8 ? "full" : frac > 0.45 ? "half" : "peek");
          }}
          onClick={() => setSnap(snap === "full" ? "half" : "full")}
        >
          <span />
        </div>
        <div className="ui2-sheet-body">
          <DetailPanel id={id} />
        </div>
      </div>
    </div>
  );
}
