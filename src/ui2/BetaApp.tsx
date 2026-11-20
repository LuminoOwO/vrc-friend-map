// The new interface (Settings → Appearance → Interface). Same data, views and dialogs as the
// classic one; a different shell:
//  - computers: the "Lobby" layout (src/ui2/layouts/Lobby.tsx): the map like a game's main
//    menu, a menu of icons on the left, your party (where you are, overview, online now,
//    activity) on the right, views in a frame between; profiles and worlds as popups;
//    Ctrl+K for the command palette. Other layouts that were tried are on the branch
//    archive/ui-layouts;
//  - phones: a bottom tab bar (Map, People, Here, Insights, Me), a person as a bottom sheet
//    you drag between peek, half and full, settings and filters as full-screen sheets.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isMobile } from "../backend";
import { shownName } from "../personal";
import { setState, updateFilters, updateUi, useApp, type View } from "../store";
import { openServers } from "../components/ServersModal";
import { useServersSummary } from "./ServerStatus";
import { OnlineNow, WorldPopup } from "./OnlineNow";
import { syncAll } from "../sync";
import { CardsView } from "../components/CardsView";
import { DetailPanel } from "../components/DetailPanel";
import { HereNow } from "../components/HereNow";
import { Icon } from "../components/Icon";
import { useUnreadMissed } from "../components/InsightsView";
import { SyncLogDialog } from "../components/SyncLogDialog";
import { FilterPopover } from "../components/TopBar";
import { CommandPalette } from "./CommandPalette";
import "./ui2.css";
import "./lobby.css";
import "./views.css";
import { Avatar, ProfilePopup, ViewBody, WorldOpener, useViewKeys } from "./parts";
import { LobbyLayout } from "./layouts/Lobby";



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
      {isMobile ? <PhoneShell /> : <Desktop onPalette={() => setPaletteOpen(true)} />}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {children}
    </div>
  );
}

// ---------- desktop ----------

/** Computers: the chosen layout, plus the world and profile popups every layout shares. */
function Desktop({ onPalette }: { onPalette: () => void }) {
  const selectedId = useApp((s) => s.selectedId);
  const [world, setWorld] = useState<string | null>(null);
  const closeWorld = useCallback(() => setWorld(null), []);
  useViewKeys();
  return (
    <WorldOpener.Provider value={setWorld}>
      <LobbyLayout onPalette={onPalette} />
      {world && <WorldPopup spotKey={world} onClose={closeWorld} />}
      {selectedId && <ProfilePopup id={selectedId} />}
    </WorldOpener.Provider>
  );
}

// ---------- phone ----------

function PhoneShell() {
  const view = useApp((s) => s.view);
  const selectedId = useApp((s) => s.selectedId);
  const unread = useUnreadMissed();
  const [page, setPage] = useState<"here" | "me" | null>(null);
  const [world, setWorld] = useState<string | null>(null);
  const closeWorld = useCallback(() => setWorld(null), []);
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
        {page === "here" ? (
          <HerePage />
        ) : page === "me" ? (
          <MePage onOpen={(v) => go(v)} />
        ) : view === "cards" ? (
          <PhonePeople onWorld={setWorld} />
        ) : (
          <ViewBody view={view} />
        )}
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
      {world && <WorldPopup spotKey={world} onClose={closeWorld} />}
      {selectedId && <PersonSheet id={selectedId} />}
    </div>
  );
}

/** Phones: the People tab starts with who's online, one row per world (foldable), then everyone. */
function PhonePeople({ onWorld }: { onWorld: (key: string) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="ui2-phone-people">
      <section className={`ui2-part ${open ? "open" : ""}`}>
        <div className="ui2-part-head">
          <button className="ui2-part-title" aria-expanded={open} onClick={() => setOpen(!open)}>
            <Icon name={open ? "chevron-down" : "chevron-right"} size={14} />
            <Icon name="world" size={15} />
            <span>Online now</span>
          </button>
        </div>
        {open && (
          <div className="ui2-part-body">
            <OnlineNow onOpen={onWorld} />
          </div>
        )}
      </section>
      <div className="ui2-phone-cards">
        <CardsView />
      </div>
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
