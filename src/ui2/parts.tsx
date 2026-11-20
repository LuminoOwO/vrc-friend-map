// Pieces every desktop layout of the new interface uses: the views, the bell, filters, you,
// the profile popup, the layout picker, and the keys that work everywhere.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { imgSrc } from "../backend";
import { useDerived } from "../derived";
import { iconUrl, STATUS_LABEL, statusColor } from "../model";
import { getState, setState, useApp, type View } from "../store";
import { useDismiss } from "./dismiss";
import { capturePicture } from "../flip";
import { ServerMenu } from "./ServerStatus";
import { ActivityView } from "../components/ActivityView";
import { CardsView } from "../components/CardsView";
import { DetailPanel } from "../components/DetailPanel";
import { GraphView } from "../components/GraphView";
import { Icon } from "../components/Icon";
import { InsightsView, useUnreadMissed } from "../components/InsightsView";
import { markAllRead, useHistory } from "../history";
import { LogbookView } from "../components/LogbookView";
import { SharedLists } from "../components/SharedLists";
import { FilterPopover } from "../components/TopBar";
import { VrchatView } from "../components/VrchatView";

export const RAIL: { key: View; label: string; icon: string }[] = [
  { key: "graph", label: "Map", icon: "graph" },
  { key: "cards", label: "People", icon: "users" },
  { key: "activity", label: "Activity", icon: "clock" },
  { key: "insights", label: "Insights", icon: "bulb" },
  { key: "logbook", label: "Logbook", icon: "calendar" },
  { key: "vrchat", label: "VRChat", icon: "world" },
  { key: "lists", label: "Shared lists", icon: "share" },
];

/** Opens the world overview popup (provided by the shell). */
export const WorldOpener = createContext<(key: string) => void>(() => {});
export const useOpenWorld = () => useContext(WorldOpener);

export function ViewBody({ view }: { view: View }) {
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

export function Avatar({ id, size = 34 }: { id: string; size?: number }) {
  const f = useApp((s) => (s.cache.me?.id === id ? s.cache.me?.profile : (s.cache.friends[id] ?? s.cache.others?.[id])));
  const src = f ? imgSrc(iconUrl(f)) : undefined;
  return (
    <span className="ui2-avatar" style={{ width: size, height: size }}>
      {src ? <img src={src} alt="" /> : (f?.displayName?.[0] ?? "?")}
    </span>
  );
}


/** Keys for every layout: Ctrl+1…7 views, Ctrl+, settings. */
export function useViewKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = getState();
      if (s.settingsOpen || s.viewer) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && !e.shiftKey && !e.altKey && /^[1-7]$/.test(e.key)) {
        e.preventDefault();
        setState({ view: RAIL[Number(e.key) - 1].key });
      } else if (ctrl && e.key === ",") {
        e.preventDefault();
        setState({ settingsOpen: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/** Notifications bell: what you missed (muted, quiet hours) and the latest ones shown. */
export function Bell() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const unread = useUnreadMissed();
  const missed = useHistory((h) => h.missed);
  const list = useMemo(() => [...missed].reverse().slice(0, 30), [missed]);
  return (
    <div className="ui2-drop-wrap" ref={ref}>
      <button className={`ui2-top-icon ${open ? "on" : ""}`} title="Notifications" aria-label={unread ? `Notifications, ${unread} new` : "Notifications"} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="bell" size={19} />
        {unread > 0 && <span className="ui2-dot">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="ui2-drop" role="dialog" aria-label="Notifications">
          <div className="ui2-drop-head">
            <b>Notifications</b>
            <span className="ui2-grow" />
            {unread > 0 && (
              <button className="btn small" onClick={markAllRead}>
                Mark read
              </button>
            )}
          </div>
          {list.length === 0 ? (
            <p className="small muted ui2-drop-empty">Nothing yet.</p>
          ) : (
            <ul className="ui2-drop-list">
              {list.map((m, i) => (
                <li key={`${m.t}-${i}`}>
                  <button
                    className={m.why && !m.read ? "new" : ""}
                    onClick={() => {
                      setState({ selectedId: m.userId });
                      close();
                    }}
                  >
                    <span>{m.text}</span>
                    <span className="small muted">
                      {new Date(m.t).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                      {m.why === "quiet" ? " · during quiet hours" : m.why === "muted" ? " · while muted" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            className="ui2-drop-foot"
            onClick={() => {
              setState({ view: "insights" });
              close();
            }}
          >
            All notifications in Insights
          </button>
        </div>
      )}
    </div>
  );
}

/** Map and People filters behind one button; a dot shows when any filter is on. */
export function FilterButton() {
  const [open, setOpen] = useState(false);
  const { matched, friends } = useDerived();
  const filtering = matched.size !== friends.length;
  return (
    <div className="filter-wrap ui2-drop-wrap">
      <button className={`ui2-top-icon ${open ? "on" : ""}`} title={filtering ? `Filters: showing ${matched.size} of ${friends.length}` : "Filters"} aria-label="Filters" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="filter" size={19} />
        {filtering && <span className="ui2-dot small" />}
      </button>
      {open && <FilterPopover onClose={() => setOpen(false)} />}
    </div>
  );
}

/** You, top left: picture with your status ring, name and status. Opens your own profile. */
export function MeButton() {
  const me = useApp((s) => s.cache.me);
  const f = me?.profile;
  const color = f ? statusColor(f, "online") : "var(--muted)";
  const src = f ? imgSrc(iconUrl(f)) : undefined;
  return (
    <button
      className="ui2-top-me"
      title="Your profile"
      aria-label="Your profile"
      onClick={(e) => {
        if (!me) return;
        // Your picture flies into the profile's picture.
        const pic = e.currentTarget.querySelector(".ui2-avatar");
        if (pic) capturePicture(me.id, pic.getBoundingClientRect());
        setState({ selectedId: me.id });
      }}
    >
      <span className="ui2-avatar" style={{ width: 40, height: 40, boxShadow: `0 0 0 2px var(--panel), 0 0 0 4px ${color}` }}>
        {src ? <img src={src} alt="" /> : (me?.displayName?.[0] ?? <Icon name="user" />)}
      </span>
      <span className="ui2-me-text">
        <b>{me?.displayName ?? "You"}</b>
        <span style={{ color }}>{f ? (STATUS_LABEL[f.status] ?? "Online") : ""}</span>
      </span>
    </button>
  );
}

/** A profile in the middle of the window, like the classic interface. One close button (its own). */
export function ProfilePopup({ id }: { id: string }) {
  return (
    <div className="profile-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setState({ selectedId: null })}>
      <DetailPanel id={id} popup />
    </div>
  );
}


/** The usual buttons: search everything, filters (Map and People), servers, bell, layout, settings. */
export function ToolCluster({ onPalette, className = "", filters = true }: { onPalette?: () => void; className?: string; filters?: boolean }) {
  const view = useApp((s) => s.view);
  return (
    <div className={`ui2-tools ${className}`}>
      {onPalette && (
        <button className="ui2-top-icon" title="Search everything (Ctrl+K)" aria-label="Search everything" onClick={onPalette}>
          <Icon name="search" size={18} />
        </button>
      )}
      {filters && (view === "graph" || view === "cards") && <FilterButton />}
      <ServerMenu />
      <Bell />
      <button className="ui2-top-icon" title="Settings (Ctrl+,)" aria-label="Settings" onClick={() => setState({ settingsOpen: true })}>
        <Icon name="settings" size={18} />
      </button>
    </div>
  );
}
