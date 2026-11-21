// Layout "Lobby" (a video game's main menu), the new interface on computers: the map fills the
// window; a menu on the left (icons only; the names slide out while you point at it); your party
// on the right (you with your banner, where you are, the overview, Online now and Activity; it
// folds away to a tab on the edge); the latest activity along the bottom. A view (or Settings)
// opens in a big frame; the map fades out and stops drawing behind it.
import { useEffect, useMemo, useState } from "react";
import { imgSrc } from "../../backend";
import { bannerUrl } from "../../model";
import { setState, useApp, type View } from "../../store";
import { ActivityText, friendLogEntries, useActivityLoaded } from "../../components/ActivityView";
import { GraphView } from "../../components/GraphView";
import { Icon } from "../../components/Icon";
import { AppLogo } from "../AppLogo";
import { MeButton, RAIL, ToolCluster, ViewBody, useOpenWorld } from "../parts";
import { PanelSections, usePanelPrefs } from "../SidePanel";
import { useSmooth } from "../smooth";

export function LobbyLayout({ onPalette }: { onPalette: () => void }) {
  const view = useApp((s) => s.view);
  const settingsOpen = useApp((s) => s.settingsOpen);
  const [open, setOpen] = useState<View | null>(null);
  const openWorld = useOpenWorld();
  const [prefs, updatePrefs] = usePanelPrefs();
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
    if (settingsOpen) setState({ settingsOpen: false });
    setState({ view: v });
    setOpen(v === "graph" ? null : v);
  };
  const covered = !!open || settingsOpen;
  // Folding plays a slide-out first, then the panel goes away.
  const [leaving, setLeaving] = useState(false);
  return (
    <div className={`lay-lobby ${covered ? "covered" : ""} ${prefs.collapsed ? "party-folded" : ""}`}>
      <div className="lob-bg" aria-hidden={covered}>
        <GraphView />
      </div>
      <div className="lob-shade" />
      <div className="lob-left">
        <div className="lob-logo">
          <AppLogo size={48} />
          <span className="lob-logo-text">
            <span>VRC</span>
            <b>FRIEND MAP</b>
          </span>
        </div>
        <nav className="lob-menu" aria-label="Menu" data-arrows="v">
          {RAIL.map((r) => (
            <button key={r.key} className={`lob-item ${!settingsOpen && (open ?? "graph") === r.key ? "on" : ""}`} title={r.label} onClick={() => pick(r.key)}>
              <Icon name={r.icon} size={26} />
              <span>{r.key === "graph" ? "Map" : r.label}</span>
            </button>
          ))}
          <button className={`lob-item lob-settings ${settingsOpen ? "on" : ""}`} title="Settings" onClick={() => setState({ settingsOpen: !settingsOpen })}>
            <Icon name="settings" size={26} />
            <span>Settings</span>
          </button>
        </nav>
      </div>
      {open && !settingsOpen && <Frame view={open} onClose={() => setOpen(null)} />}
      {prefs.collapsed ? (
        <button className="lob-party-tab" title="Show the side panel" aria-label="Show the side panel" onClick={() => updatePrefs({ collapsed: false })}>
          <Icon name="chevron-left" size={18} />
          <Icon name="users" size={18} />
        </button>
      ) : (
        <aside className={`lob-party ${leaving ? "leaving" : ""}`} onAnimationEnd={(e) => leaving && e.target === e.currentTarget && (setLeaving(false), updatePrefs({ collapsed: true }))}>
          <div className="lob-party-head">
            <ToolCluster onPalette={onPalette} className="lob-tools" filters={false} />
            <button className="lob-fold" title="Fold the side panel away" aria-label="Fold the side panel away" onClick={() => setLeaving(true)}>
              <Icon name="chevron-right" size={18} />
            </button>
          </div>
          <MeCard />
          <div className="lob-party-body">
            <PanelSections prefs={{ ...prefs, side: "right" }} update={updatePrefs} onWorld={openWorld} />
          </div>
        </aside>
      )}
      <News />
    </div>
  );
}

/** A view in the big frame. Its contents mount a moment after the frame starts sliding in, so
 *  building a heavy view doesn't hold up the animation. */
function Frame({ view, onClose }: { view: View; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => (raf2 = requestAnimationFrame(() => setReady(true))));
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [view]);
  return (
    <div className="lob-frame" key={view}>
      <header>
        <h1>{RAIL.find((r) => r.key === view)?.label}</h1>
        <span className="ui2-grow" />
        <button className="ui2-pill-btn" onClick={onClose}>
          <Icon name="chevron-left" size={14} /> Back <kbd>Esc</kbd>
        </button>
      </header>
      <div className="lob-frame-body">{ready && <ViewBody view={view} />}</div>
    </div>
  );
}

/** You at the top of the party, with your banner fading in from the right. */
export function MeCard() {
  const banner = useApp((s) => (s.cache.me?.profile ? imgSrc(bannerUrl(s.cache.me.profile)) : undefined));
  return (
    <div className="lob-me">
      {banner && <span className="lob-me-banner" style={{ backgroundImage: `url("${banner}")` }} aria-hidden="true" />}
      <MeButton />
    </div>
  );
}

/** The latest few things that happened, along the bottom. */
function News() {
  useActivityLoaded();
  const smooth = useSmooth(400);
  const activity = useApp((s) => s.activity);
  const friendLog = useApp((s) => s.local.friendLog);
  const items = useMemo(
    () =>
      [...activity.filter((e) => !e.initial), ...friendLogEntries(friendLog.slice(-10))]
        .sort((a, b) => b.t - a.t)
        .slice(0, 4),
    [activity, friendLog],
  );
  return (
    <footer className="lob-news" aria-label="Latest activity">
      <span className="lob-news-live" aria-hidden="true" />
      {/* Items that don't fit wrap onto a hidden second line: never cut off mid-word. */}
      <div className="lob-news-items" ref={smooth}>
        {items.map((e) => (
          <span key={e.key} className="lob-news-item">
            <span className="lob-news-time">{new Date(e.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            <ActivityText e={e} />
          </span>
        ))}
        {!items.length && <span className="lob-news-item muted">All quiet.</span>}
      </div>
      <button className="lob-news-all" onClick={() => setState({ view: "activity" })}>
        All activity <Icon name="chevron-right" size={14} />
      </button>
    </footer>
  );
}
