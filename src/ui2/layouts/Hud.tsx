// Layout "HUD" (like VRChat's quick menu): the map fills the whole window and everything else
// floats on it. You and where you are top left, a status cluster top right, Online now on the
// right, recent activity bottom left, and a dock of big icons at the bottom. Other views open
// as a large sheet that slides up over the map. "Hide widgets" shows just the map.
import { useState } from "react";
import { setState, useApp } from "../../store";
import { GraphView } from "../../components/GraphView";
import { Icon } from "../../components/Icon";
import { useUnreadMissed } from "../../components/InsightsView";
import { Bell, FilterButton, LayoutPicker, MeButton, RAIL, SearchField, ViewBody, useOpenWorld } from "../parts";
import { ServerMenu } from "../ServerStatus";
import { ActivityFeed, WhereCard } from "../SidePanel";
import { OnlineNow, useSpots } from "../OnlineNow";

export function HudLayout({ onPalette }: { onPalette: () => void }) {
  const view = useApp((s) => s.view);
  const unread = useUnreadMissed();
  const [clean, setClean] = useState(false);
  const [onlineOpen, setOnlineOpen] = useState(true);
  const spots = useSpots();
  const openWorld = useOpenWorld();
  const inGame = spots.filter((s) => s.key !== "web").reduce((n, s) => n + s.people.length, 0);
  const sheet = view !== "graph" ? RAIL.find((r) => r.key === view) : undefined;
  return (
    <div className={`lay-hud ${clean ? "clean" : ""}`}>
      <div className="hud-map">
        <GraphView />
      </div>

      <div className="hud-tl hud-w">
        <div className="hud-glass hud-me">
          <MeButton />
        </div>
        <div className="hud-glass hud-where">
          <WhereCard />
        </div>
      </div>

      <div className="hud-tr">
        <div className="hud-glass hud-cluster">
          <SearchField className="hud-search" />
          <button className="ui2-top-icon" title="Search everything (Ctrl+K)" aria-label="Search everything" onClick={onPalette}>
            <Icon name="search" size={18} />
          </button>
          <FilterButton />
          <ServerMenu />
          <Bell />
          <LayoutPicker />
          <button className={`ui2-top-icon ${clean ? "on" : ""}`} title={clean ? "Show the widgets" : "Hide the widgets (just the map)"} aria-label="Hide widgets" onClick={() => setClean(!clean)}>
            <Icon name={clean ? "eye" : "eyeOff"} size={18} />
          </button>
          <button className="ui2-top-icon" title="Settings (Ctrl+,)" aria-label="Settings" onClick={() => setState({ settingsOpen: true })}>
            <Icon name="settings" size={18} />
          </button>
        </div>
      </div>

      <div className={`hud-glass hud-online hud-w ${onlineOpen ? "" : "folded"}`}>
        <button className="hud-card-head" aria-expanded={onlineOpen} onClick={() => setOnlineOpen(!onlineOpen)}>
          <Icon name="world" size={16} />
          <b>Online now</b>
          <span className="hud-pill">{inGame}</span>
          <span className="ui2-grow" />
          <Icon name={onlineOpen ? "chevron-up" : "chevron-down"} size={16} />
        </button>
        {onlineOpen && <OnlineNow onOpen={openWorld} side="right" />}
      </div>

      <div className="hud-glass hud-activity hud-w">
        <div className="hud-card-head">
          <Icon name="clock" size={16} />
          <b>Activity</b>
          <span className="ui2-grow" />
          <button className="ui2-see-all" onClick={() => setState({ view: "activity" })}>
            See all
          </button>
        </div>
        <ActivityFeed max={40} />
      </div>

      {sheet && (
        <div className="hud-sheet" key={sheet.key}>
          <header className="hud-sheet-head">
            <Icon name={sheet.icon} size={20} />
            <h1>{sheet.label}</h1>
            <span className="ui2-grow" />
            <button className="hud-back" onClick={() => setState({ view: "graph" })}>
              <Icon name="graph" size={16} /> Back to the map
            </button>
          </header>
          <div className="hud-sheet-body">
            <ViewBody view={view} />
          </div>
        </div>
      )}

      <nav className="hud-dock hud-glass" aria-label="Views">
        {RAIL.map((r, i) => (
          <button key={r.key} className={`hud-dock-btn ${view === r.key ? "on" : ""}`} aria-current={view === r.key ? "page" : undefined} title={`${r.label} (Ctrl+${i + 1})`} onClick={() => setState({ view: r.key === view && r.key !== "graph" ? "graph" : r.key })}>
            <Icon name={r.icon} size={24} />
            <span>{r.label}</span>
            {r.key === "insights" && unread > 0 && <span className="ui2-dot">{unread}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
