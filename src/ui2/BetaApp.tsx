// The new interface (Settings → Appearance → Interface). Same data, views and dialogs as the
// classic one; a different shell:
//  - computers: the "Lobby" layout (src/ui2/layouts/Lobby.tsx): the map like a game's main
//    menu, a menu of icons on the left, your party (where you are, overview, online now,
//    activity) on the right, views in a frame between; profiles and worlds as popups;
//    Ctrl+K for the command palette. Other layouts that were tried are on the branch
//    archive/ui-layouts;
//  - phones: the same look in a bottom tab bar (Map, People, Party, Insights, Menu); profiles,
//    settings and filters full screen.
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { isMobile } from "../backend";
import { setState, updateFilters, updateUi, useApp, type View } from "../store";
import { openServers } from "../components/ServersModal";
import { useServersSummary } from "./ServerStatus";
import { WorldPopup } from "./OnlineNow";
import { syncAll } from "../sync";
import { Icon } from "../components/Icon";
import { useUnreadMissed } from "../components/InsightsView";
import { SyncLogDialog } from "../components/SyncLogDialog";
import { FilterPopover } from "../components/TopBar";
import { CommandPalette } from "./CommandPalette";
import "./ui2.css";
import "./lobby.css";
import "./views.css";
import "./motion.css";
import { ProfilePopup, ViewBody, WorldOpener, useViewKeys } from "./parts";
import { LobbyLayout, MeCard } from "./layouts/Lobby";
import { PanelSections, usePanelPrefs } from "./SidePanel";
import { AppLogo } from "./AppLogo";




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
// Same look as on computers: the frame's title bar (italic uppercase, an accent line), the
// party (you, where you are, overview, online now, activity) and the big menu, as tabs.

type PhoneTab = "graph" | "cards" | "party" | "insights" | "menu";
// Tab names and titles are text keys (src/i18n/locales).
const PHONE_TABS: [PhoneTab, string, string][] = [
  ["graph", "menu.map", "graph"],
  ["cards", "menu.people", "users"],
  ["party", "menu.party", "pin"],
  ["insights", "menu.insights", "bulb"],
  ["menu", "menu.menu", "menu"],
];
const SUB_TITLES: Partial<Record<View, string>> = { activity: "menu.activity", logbook: "menu.logbook", vrchat: "menu.vrchat", lists: "menu.lists" };

/** The back gesture runs `onBack` while `active` (one history entry; left another way, the entry
 *  stays but is neutralized, which is safer than calling history.back() ourselves). */
function useBackGesture(active: boolean, onBack: () => void, key: string) {
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => {
    if (!active) return;
    if (!history.state?.[key]) history.pushState({ [key]: true }, "");
    const onPop = () => back.current();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (history.state?.[key]) history.replaceState(null, "");
    };
  }, [active, key]);
}

function PhoneShell() {
  const t = useT();
  const view = useApp((s) => s.view);
  const selectedId = useApp((s) => s.selectedId);
  const unread = useUnreadMissed();
  const [page, setPage] = useState<"party" | "menu" | null>(null);
  const [world, setWorld] = useState<string | null>(null);
  const closeWorld = useCallback(() => setWorld(null), []);
  // A view opened from inside a page (e.g. Activity's "See all") shows that view.
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) firstView.current = false;
    else setPage(null);
  }, [view]);
  const tab: PhoneTab = page ?? (view === "cards" ? "cards" : view === "insights" ? "insights" : view === "graph" ? "graph" : "menu");
  const sub = !page && tab === "menu" ? view : null;
  const go = (t: PhoneTab | View) => {
    if (t === "party" || t === "menu") setPage(t);
    else {
      setPage(null);
      setState({ view: t as View });
    }
  };
  useBackGesture(!!sub, () => go("menu"), "vfmSub");
  const titleKey = sub ? SUB_TITLES[sub] : PHONE_TABS.find(([k]) => k === tab)?.[1];
  const title = titleKey ? t(titleKey) : "";
  return (
    <WorldOpener.Provider value={setWorld}>
      <div className="ui2-phone-shell">
        <PhoneTop title={title} onBack={sub ? () => go("menu") : undefined} search={tab === "graph" || tab === "cards"} />
        <main className="ui2-phone-main">
          {page === "party" ? (
            <PartyPage onWorld={setWorld} />
          ) : page === "menu" ? (
            <MenuPage onOpen={go} />
          ) : (
            <div className="ui2-phone-view" key={view}>
              <ViewBody view={view} />
            </div>
          )}
        </main>
        <nav className="ui2-tabs" aria-label={t("menu.views")} data-arrows="h">
          {PHONE_TABS.map(([k, l, i]) => (
            <button key={k} className={`ui2-tab ${tab === k ? "on" : ""}`} aria-current={tab === k} onClick={() => go(k)}>
              <Icon name={i} size={22} />
              <span>{t(l)}</span>
              {k === "insights" && unread > 0 && <span className="ui2-dot">{unread}</span>}
            </button>
          ))}
        </nav>
        {world && <WorldPopup spotKey={world} onClose={closeWorld} />}
        {selectedId && <PersonFull id={selectedId} />}
      </div>
    </WorldOpener.Provider>
  );
}

/** The title bar, like a view's frame on computers. Search and filters on Map and People. */
function PhoneTop({ title, onBack, search }: { title: string; onBack?: () => void; search: boolean }) {
  const t = useT();
  const text = useApp((s) => s.filters.search);
  const [searching, setSearching] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const finding = search && (searching || !!text);
  return (
    <>
      <header className="ui2-phone-top">
        {onBack && (
          <button className="ui2-top-btn back" aria-label={t("common.back")} onClick={onBack}>
            <Icon name="chevron-left" size={22} />
          </button>
        )}
        {finding ? (
          <div className="ui2-phone-find">
            <Icon name="search" size={16} />
            <input autoFocus value={text} placeholder={t("phone.searchFriends")} onChange={(e) => updateFilters({ search: e.target.value })} />
            <button
              aria-label={t("phone.closeSearch")}
              onClick={() => {
                updateFilters({ search: "" });
                setSearching(false);
              }}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        ) : (
          <h1>{title}</h1>
        )}
        {search && !finding && (
          <button className="ui2-top-btn" aria-label={t("phone.searchFriends")} onClick={() => setSearching(true)}>
            <Icon name="search" size={20} />
          </button>
        )}
        {search && (
          <button className="ui2-top-btn" aria-label={t("phone.filters")} onClick={() => setFiltersOpen(true)}>
            <Icon name="filter" size={20} />
          </button>
        )}
        <button className="ui2-top-btn" aria-label={t("menu.settings")} onClick={() => setState({ settingsOpen: true })}>
          <Icon name="settings" size={20} />
        </button>
      </header>
      {filtersOpen && (
        <div className="ui2-fullsheet" role="dialog" aria-label={t("phone.filters")}>
          <div className="ui2-fullsheet-head">
            <h2>{t("phone.filters")}</h2>
            <button className="icon-btn" aria-label={t("common.close")} onClick={() => setFiltersOpen(false)}>
              <Icon name="close" />
            </button>
          </div>
          <div className="filter-wrap ui2-filters-inline">
            <FilterPopover onClose={() => setFiltersOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}

/** The party, as on computers: you, where you are, overview, online now, activity. */
function PartyPage({ onWorld }: { onWorld: (key: string) => void }) {
  const [prefs, update] = usePanelPrefs();
  return (
    <div className="ui2-page ui2-phone-party">
      <MeCard />
      <PanelSections prefs={prefs} update={update} onWorld={onWorld} />
    </div>
  );
}

/** The big menu, as on computers (uppercase names, an accent bar on the left). */
function MenuPage({ onOpen }: { onOpen: (v: View) => void }) {
  const t = useT();
  const [logOpen, setLogOpen] = useState(false);
  const servers = useServersSummary();
  const items: [string, string, () => void, React.ReactNode?][] = [
    [t("menu.activity"), "clock", () => onOpen("activity")],
    [t("menu.logbook"), "calendar", () => onOpen("logbook")],
    [t("menu.vrchat"), "world", () => onOpen("vrchat")],
    [t("menu.lists"), "share", () => onOpen("lists")],
    [
      t("menu.servers"),
      "server",
      openServers,
      servers && (
        <span className="ui2-menu-status">
          <span className={`ui2-srv-dot ${servers.tone}`} /> {servers.text}
        </span>
      ),
    ],
    [t("menu.settings"), "settings", () => setState({ settingsOpen: true })],
  ];
  return (
    <div className="ui2-page ui2-phone-menu">
      <div className="lob-logo ui2-menu-logo">
        <AppLogo size={44} />
        <span className="lob-logo-text">
          <span>VRC</span>
          <b>FRIEND MAP</b>
        </span>
      </div>
      <nav className="ui2-bigmenu" aria-label="Menu">
        {items.map(([l, i, f, extra]) => (
          <button key={l} className="ui2-big-item" onClick={f}>
            <Icon name={i} size={26} />
            <span className="ui2-grow">{l}</span>
            {extra}
          </button>
        ))}
      </nav>
      <div className="ui2-menu-foot">
        <button className="ui2-pill-btn" onClick={() => syncAll()}>
          <Icon name="refresh" size={15} /> {t("menu.syncNow")}
        </button>
        <button className="ui2-pill-btn" onClick={() => setLogOpen(true)}>
          <Icon name="info" size={15} /> {t("menu.syncLog")}
        </button>
        <button className="ui2-link" onClick={() => updateUi({ beta: false })}>
          {t("menu.classic")}
        </button>
      </div>
      {logOpen && <SyncLogDialog onClose={() => setLogOpen(false)} />}
    </div>
  );
}

/** A person, full screen (the same profile as on computers); the back gesture closes it. */
function PersonFull({ id }: { id: string }) {
  useBackGesture(true, () => setState({ selectedId: null }), "vfmSheet");
  return <ProfilePopup id={id} />;
}
