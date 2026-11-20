// Layout "Dashboard" (a bento grid): a home screen of cards (a greeting, a live map, where you
// are, the numbers, Online now, Activity, notifications, popular worlds). A card's button opens
// that view full size; the tabs on top switch between Home and every view.
import { useEffect, useMemo, useState } from "react";
import { setState, useApp } from "../../store";
import { popularWorlds, useHistory } from "../../history";
import { loadWorld } from "../../sync";
import { GraphView } from "../../components/GraphView";
import { Icon } from "../../components/Icon";
import { useUnreadMissed } from "../../components/InsightsView";
import { Bell, FilterButton, LayoutPicker, MeButton, NotificationList, RAIL, SearchField, ViewBody, useOpenWorld } from "../parts";
import { ServerMenu } from "../ServerStatus";
import { ActivityFeed, Overview, WhereCard } from "../SidePanel";
import { OnlineNow, useSpots } from "../OnlineNow";

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function DashboardLayout({ onPalette }: { onPalette: () => void }) {
  const view = useApp((s) => s.view);
  const me = useApp((s) => s.cache.me);
  const [home, setHome] = useState(true);
  const unread = useUnreadMissed();
  const go = (v: (typeof RAIL)[number]["key"]) => {
    setHome(false);
    setState({ view: v });
  };
  // Ctrl+1…7 (and other ways of changing the view) leave the home screen.
  const [lastView, setLastView] = useState(view);
  useEffect(() => {
    if (view !== lastView) {
      setLastView(view);
      setHome(false);
    }
  }, [view, lastView]);
  return (
    <div className="lay-dash">
      <header className="dash-head">
        <MeButton />
        <div className="dash-hello">
          <h1>
            {greeting()}
            {me ? `, ${me.displayName}` : ""}
          </h1>
          <span className="muted">{new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
        <span className="ui2-grow" />
        <SearchField className="dash-search" />
        <button className="ui2-top-icon" title="Search everything (Ctrl+K)" aria-label="Search everything" onClick={onPalette}>
          <Icon name="search" size={18} />
        </button>
        <ServerMenu />
        <Bell />
        <LayoutPicker />
        <button className="ui2-top-icon" title="Settings (Ctrl+,)" aria-label="Settings" onClick={() => setState({ settingsOpen: true })}>
          <Icon name="settings" size={18} />
        </button>
      </header>
      <nav className="dash-tabs" aria-label="Views">
        <button className={`dash-tab ${home ? "on" : ""}`} aria-current={home ? "page" : undefined} onClick={() => setHome(true)}>
          <Icon name="cards" size={16} /> Home
        </button>
        {RAIL.map((r) => (
          <button key={r.key} className={`dash-tab ${!home && view === r.key ? "on" : ""}`} aria-current={!home && view === r.key ? "page" : undefined} onClick={() => go(r.key)}>
            <Icon name={r.icon} size={16} /> {r.label}
            {r.key === "insights" && unread > 0 && <span className="dash-badge">{unread}</span>}
          </button>
        ))}
        <span className="ui2-grow" />
        {!home && (view === "graph" || view === "cards") && <FilterButton />}
      </nav>
      {home ? (
        <Home go={go} />
      ) : (
        <div className="dash-view">
          <div className="ui2-view" key={view}>
            <ViewBody view={view} />
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, icon, action, className = "", children }: { title: string; icon: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`dash-card ${className}`}>
      <header>
        <span className="dash-card-icon">
          <Icon name={icon} size={16} />
        </span>
        <b>{title}</b>
        <span className="ui2-grow" />
        {action}
      </header>
      <div className="dash-card-body">{children}</div>
    </section>
  );
}

function Open({ onClick, label = "Open" }: { onClick: () => void; label?: string }) {
  return (
    <button className="dash-open" onClick={onClick}>
      {label} <Icon name="chevron-right" size={14} />
    </button>
  );
}

function Home({ go }: { go: (v: (typeof RAIL)[number]["key"]) => void }) {
  const openWorld = useOpenWorld();
  const spots = useSpots();
  const inGame = spots.filter((s) => s.key !== "web").reduce((n, s) => n + s.people.length, 0);
  return (
    <div className="dash-grid">
      <Card title="Map" icon="graph" className="dash-map" action={<Open onClick={() => go("graph")} label="Full screen" />}>
        <GraphView />
      </Card>
      <Card title="Where you are" icon="pin" className="dash-where">
        <WhereCard />
      </Card>
      <Card title="At a glance" icon="chart" className="dash-stats">
        <Overview />
      </Card>
      <Card title={`Online now · ${inGame}`} icon="world" className="dash-online" action={<Open onClick={() => go("cards")} label="People" />}>
        <OnlineNow onOpen={openWorld} />
      </Card>
      <Card title="Activity" icon="clock" className="dash-activity" action={<Open onClick={() => go("activity")} label="See all" />}>
        <ActivityFeed max={50} />
      </Card>
      <Card title="Notifications" icon="bell" className="dash-notes" action={<Open onClick={() => go("insights")} label="Insights" />}>
        <NotificationList max={15} />
      </Card>
      <Card title="Popular this week" icon="star" className="dash-popular" action={<Open onClick={() => go("logbook")} label="Logbook" />}>
        <PopularWorlds />
      </Card>
    </div>
  );
}

/** Worlds your friends spent the most time in this week. */
function PopularWorlds() {
  useHistory((h) => h.worlds);
  const list = useMemo(() => popularWorlds(7).slice(0, 6), []);
  const worlds = useApp((s) => s.cache.worlds);
  useEffect(() => {
    for (const w of list) loadWorld(w.world);
  }, [list]);
  if (!list.length) return <p className="small muted ui2-side-empty">Shows up after a few days of friends being online.</p>;
  const max = list[0].minutes || 1;
  return (
    <ul className="dash-popular-list">
      {list.map((w) => (
        <li key={w.world}>
          <span className="ui2-ellipsis">{worlds?.[w.world]?.name ?? "Loading…"}</span>
          <span className="dash-bar">
            <span style={{ width: `${Math.max(6, (w.minutes / max) * 100)}%` }} />
          </span>
          <span className="small muted">{Math.round(w.minutes / 60)} h</span>
        </li>
      ))}
    </ul>
  );
}
