// Layout "Lobby" (a video game's main menu): huge menu items on the left over the map, your
// party on the right (you, the people in your instance, friends online), and a news ticker at
// the bottom. Picking a view opens it in a big framed panel; the menu shrinks to the side.
import { useEffect, useMemo, useState } from "react";
import { setState, useApp, type View } from "../../store";
import { ActivityText, friendLogEntries, useActivityLoaded } from "../../components/ActivityView";
import { GraphView } from "../../components/GraphView";
import { Icon } from "../../components/Icon";
import { MeButton, RAIL, ToolCluster, ViewBody, useOpenWorld } from "../parts";
import { WhereCard } from "../SidePanel";
import { OnlineNow } from "../OnlineNow";

export function LobbyLayout({ onPalette }: { onPalette: () => void }) {
  const view = useApp((s) => s.view);
  const [open, setOpen] = useState<View | null>(null);
  const openWorld = useOpenWorld();
  const [lastView, setLastView] = useState(view);
  useEffect(() => {
    if (view !== lastView) {
      setLastView(view);
      setOpen(view === "graph" ? null : view);
    }
  }, [view, lastView]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".profile-backdrop, .ui2-world-wrap, .modal-backdrop") && setOpen(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const pick = (v: View) => {
    setState({ view: v });
    setOpen(v === "graph" ? null : v);
  };
  return (
    <div className={`lay-lobby ${open ? "in-view" : ""}`}>
      <div className="lob-bg">
        <GraphView />
      </div>
      <div className="lob-shade" />
      <div className="lob-left">
        <div className="lob-logo">
          <span>VRC</span>
          <b>FRIEND MAP</b>
        </div>
        <nav className="lob-menu" aria-label="Menu">
          {RAIL.map((r) => (
            <button key={r.key} className={`lob-item ${(open ?? "graph") === r.key ? "on" : ""}`} onClick={() => pick(r.key)}>
              <Icon name={r.icon} size={open ? 20 : 26} />
              <span>{r.key === "graph" ? "Map" : r.label}</span>
            </button>
          ))}
          <button className="lob-item small" onClick={() => setState({ settingsOpen: true })}>
            <Icon name="settings" size={open ? 20 : 22} />
            <span>Settings</span>
          </button>
        </nav>
      </div>
      {open ? (
        <div className="lob-frame" key={open}>
          <header>
            <h1>{RAIL.find((r) => r.key === open)?.label}</h1>
            <span className="ui2-grow" />
            <button className="ui2-pill-btn" onClick={() => setOpen(null)}>
              <Icon name="chevron-left" size={14} /> Back <kbd>Esc</kbd>
            </button>
          </header>
          <div className="lob-frame-body">
            <ViewBody view={open} />
          </div>
        </div>
      ) : (
        <aside className="lob-party">
          <h2>Party</h2>
          <div className="lob-me">
            <MeButton />
          </div>
          <WhereCard />
          <h2>Friends online</h2>
          <OnlineNow onOpen={openWorld} />
        </aside>
      )}
      <ToolCluster onPalette={onPalette} className="lob-tools" filters={false} />
      <News />
    </div>
  );
}

function News() {
  useActivityLoaded();
  const activity = useApp((s) => s.activity);
  const friendLog = useApp((s) => s.local.friendLog);
  const items = useMemo(
    () =>
      [...activity.filter((e) => !e.initial), ...friendLogEntries(friendLog.slice(-10))]
        .sort((a, b) => b.t - a.t)
        .slice(0, 3),
    [activity, friendLog],
  );
  return (
    <footer className="lob-news">
      <span className="lob-news-tag">News</span>
      {items.map((e) => (
        <span key={e.key} className="lob-news-item">
          <ActivityText e={e} />
        </span>
      ))}
      {!items.length && <span className="lob-news-item muted">All quiet.</span>}
    </footer>
  );
}
