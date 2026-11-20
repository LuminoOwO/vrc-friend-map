// Layout "Zen": the map and nothing else. A thin line along the bottom with you, a ticker of
// what just happened, and a few small buttons. Move to the left edge (or press Tab on the map)
// and a drawer slides in with the views and who's online.
import { useEffect, useMemo, useState } from "react";
import { imgSrc } from "../../backend";
import { iconUrl, STATUS_LABEL, statusColor } from "../../model";
import { setState, useApp } from "../../store";
import { ActivityText, friendLogEntries, useActivityLoaded } from "../../components/ActivityView";
import { Icon } from "../../components/Icon";
import { RAIL, ToolCluster, ViewBody, useOpenWorld } from "../parts";
import { OnlineNow } from "../OnlineNow";

export function ZenLayout({ onPalette }: { onPalette: () => void }) {
  const view = useApp((s) => s.view);
  const me = useApp((s) => s.cache.me);
  const [drawer, setDrawer] = useState(false);
  const openWorld = useOpenWorld();
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
      if (e.key === "Tab" && e.target === document.body) {
        e.preventDefault();
        setDrawer((d) => !d);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const f = me?.profile;
  const color = f ? statusColor(f, "online") : "var(--muted)";
  const src = f ? imgSrc(iconUrl(f)) : undefined;
  return (
    <div className="lay-zen">
      <div className="zen-stage">
        <div className="ui2-view" key={view}>
          <ViewBody view={view} />
        </div>
        {view !== "graph" && (
          <button className="zen-back" onClick={() => setState({ view: "graph" })}>
            <Icon name="chevron-left" size={16} /> Map
          </button>
        )}
      </div>
      <div className="zen-edge" onMouseEnter={() => setDrawer(true)} aria-hidden="true" />
      <aside className={`zen-drawer ${drawer ? "open" : ""}`} onMouseLeave={() => setDrawer(false)} aria-hidden={!drawer}>
        <nav className="zen-nav">
          {RAIL.map((r) => (
            <button
              key={r.key}
              className={view === r.key ? "on" : ""}
              tabIndex={drawer ? 0 : -1}
              onClick={() => {
                setState({ view: r.key });
                setDrawer(false);
              }}
            >
              <Icon name={r.icon} size={18} /> {r.label}
            </button>
          ))}
        </nav>
        <h3>Online now</h3>
        <OnlineNow onOpen={openWorld} side="left" />
      </aside>
      <footer className="zen-line">
        <button className="zen-me" onClick={() => me && setState({ selectedId: me.id })}>
          <span className="ui2-avatar" style={{ width: 22, height: 22, boxShadow: `0 0 0 2px ${color}` }}>
            {src ? <img src={src} alt="" /> : (me?.displayName?.[0] ?? "?")}
          </span>
          <span>{me?.displayName}</span>
          <span style={{ color }}>{f ? STATUS_LABEL[f.status] : ""}</span>
        </button>
        <Ticker />
        <ToolCluster onPalette={onPalette} className="zen-tools" />
      </footer>
    </div>
  );
}

/** The latest activity, scrolling slowly along the bottom line. */
function Ticker() {
  useActivityLoaded();
  const activity = useApp((s) => s.activity);
  const friendLog = useApp((s) => s.local.friendLog);
  const items = useMemo(
    () =>
      [...activity.filter((e) => !e.initial), ...friendLogEntries(friendLog.slice(-10))]
        .sort((a, b) => b.t - a.t)
        .slice(0, 12),
    [activity, friendLog],
  );
  if (!items.length) return <div className="zen-ticker" />;
  const row = items.map((e) => (
    <span key={e.key} className="zen-tick">
      <span className="zen-time">{new Date(e.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
      <ActivityText e={e} />
    </span>
  ));
  return (
    <div className="zen-ticker">
      <div className="zen-ticker-move" style={{ animationDuration: `${Math.max(30, items.length * 7)}s` }}>
        {row}
        <span aria-hidden="true" className="zen-ticker-copy">
          {items.map((e) => (
            <span key={e.key} className="zen-tick">
              <span className="zen-time">{new Date(e.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              <ActivityText e={e} />
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}
