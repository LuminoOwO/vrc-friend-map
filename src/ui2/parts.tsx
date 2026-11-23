// Pieces every desktop layout of the new interface uses: the views, the bell, filters, you,
// the profile popup, the layout picker, and the keys that work everywhere.
import { t as tr } from "../i18n";
import { createContext, useContext, useEffect, useState } from "react";
import { t } from "../i18n";
import { imgSrc } from "../backend";
import { useDerived } from "../derived";
import { iconUrl, STATUS_LABEL, statusColor } from "../model";
import { getState, setState, useApp, type View } from "../store";
import { capturePicture } from "../flip";
import { ServerMenu } from "./ServerStatus";
import { ActivityView } from "../components/ActivityView";
import { CardsView } from "../components/CardsView";
import { DetailPanel } from "../components/DetailPanel";
import { GraphView } from "../components/GraphView";
import { Icon } from "../components/Icon";
import { InsightsView } from "../components/InsightsView";
import { LogbookView } from "../components/LogbookView";
import { SharedLists } from "../components/SharedLists";
import { FilterPopover } from "../components/TopBar";
import { VrchatView } from "../components/VrchatView";
import { TimesView } from "../components/TimesView";

// `label` is read in the current language each time (components re-render with useT()).
const rail = (key: View, text: string, icon: string) => ({
  key,
  icon,
  get label() {
    return t(text);
  },
});
export const RAIL: { key: View; label: string; icon: string }[] = [
  rail("graph", "menu.map", "graph"),
  rail("cards", "menu.people", "users"),
  rail("activity", "menu.activity", "clock"),
  rail("insights", "menu.insights", "bulb"),
  rail("times", "menu.times", "chart"),
  rail("logbook", "menu.logbook", "calendar"),
  rail("vrchat", "menu.groups", "flag"),
  rail("media", "menu.media", "image"),
  rail("lists", "menu.lists", "share"),
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
      {view === "vrchat" && <VrchatView section="groups" />}
      {view === "media" && <VrchatView section="media" />}
      {view === "times" && <TimesView />}
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

/** Map and People filters behind one button; a dot shows when any filter is on. */
export function FilterButton() {
  const [open, setOpen] = useState(false);
  const { matched, friends } = useDerived();
  const filtering = matched.size !== friends.length;
  return (
    <div className="filter-wrap ui2-drop-wrap">
      <button className={`ui2-top-icon ${open ? "on" : ""}`} title={filtering ? tr("parts.filtersShowingSizeOfLength", { size: matched.size, length: friends.length }) : "Filters"} aria-label={tr("parts.filters")} aria-expanded={open} onClick={() => setOpen(!open)}>
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
      title={tr("parts.yourProfile")}
      aria-label={tr("parts.yourProfile")}
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


/** The usual buttons: search everything, filters (Map and People), servers, settings (the notification center is apart, top left). */
export function ToolCluster({ onPalette, className = "", filters = true }: { onPalette?: () => void; className?: string; filters?: boolean }) {
  const view = useApp((s) => s.view);
  return (
    <div className={`ui2-tools ${className}`}>
      {onPalette && (
        <button className="ui2-top-icon" title={tr("parts.searchEverythingCtrlK")} aria-label={tr("parts.searchEverything")} onClick={onPalette}>
          <Icon name="search" size={18} />
        </button>
      )}
      {filters && (view === "graph" || view === "cards") && <FilterButton />}
      <ServerMenu />
      <button className="ui2-top-icon" title={tr("parts.settingsCtrl")} aria-label={tr("parts.settings")} onClick={() => setState({ settingsOpen: true })}>
        <Icon name="settings" size={18} />
      </button>
    </div>
  );
}
