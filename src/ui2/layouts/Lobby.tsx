// Layout "Lobby" (a video game's main menu), the new interface on computers: the map fills the
// window; a menu on the left (icons only; the names slide out while you point at it); your party
// on the right (you with your banner, where you are, the overview, Online now and Activity; it
// folds away to a tab on the edge); who's in your instance along the bottom. A view (or Settings)
// opens in a big frame; the map fades out and stops drawing behind it.
import { t as tr } from "../../i18n";
import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { imgSrc } from "../../backend";
import { bannerUrl } from "../../model";
import { setState, useApp, type View } from "../../store";
import { GraphView } from "../../components/GraphView";
import { Icon } from "../../components/Icon";
import { AppLogo } from "../AppLogo";
import { Inbox } from "../Inbox";
import { HereBar } from "../HereBar";
import { FriendGroupsPanel, MapOptionsPanel } from "../FriendGroups";
import { MeButton, RAIL, ToolCluster, ViewBody, useOpenWorld } from "../parts";
import { PanelSections, usePanelPrefs } from "../SidePanel";

export function LobbyLayout({ onPalette }: { onPalette: () => void }) {
  const t = useT();
  const view = useApp((s) => s.view);
  const settingsOpen = useApp((s) => s.settingsOpen);
  const sidePanel = useApp((s) => s.sidePanel);
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
  // A temporary side-panel page (friend groups) needs the panel out and the map uncovered.
  useEffect(() => {
    if (sidePanel && prefs.collapsed) updatePrefs({ collapsed: false });
  }, [sidePanel]); // eslint-disable-line react-hooks/exhaustive-deps
  // The map's "Overview" button brings the folded panel back.
  useEffect(() => {
    const show = () => prefs.collapsed && updatePrefs({ collapsed: false });
    window.addEventListener("vfm-show-panel", show);
    return () => window.removeEventListener("vfm-show-panel", show);
  }, [prefs.collapsed, updatePrefs]);
  // Folding plays a slide-out first, then the panel goes away.
  const [leaving, setLeaving] = useState(false);
  // The menu opens while the pointer is on it. Not CSS :hover: WebKitGTK keeps :hover when the
  // pointer leaves the window over the menu, so it stayed open over the map.
  const [pointed, setPointed] = useState(false);
  useEffect(() => {
    const off = () => setPointed(false);
    const out = (e: MouseEvent) => !e.relatedTarget && off();
    document.addEventListener("mouseout", out);
    document.documentElement.addEventListener("mouseleave", off);
    window.addEventListener("blur", off);
    return () => {
      document.removeEventListener("mouseout", out);
      document.documentElement.removeEventListener("mouseleave", off);
      window.removeEventListener("blur", off);
    };
  }, []);
  return (
    <div className={`lay-lobby ${covered ? "covered" : ""} ${prefs.collapsed ? "party-folded" : ""}`}>
      <h1 className="sr-only">{tr("lobby.vrcFriendMap")}</h1>
      <div className="lob-bg" aria-hidden={covered} role="main" aria-label={t("party.friendMap")}>
        <GraphView />
      </div>
      <div className="lob-shade" />
      <Inbox className="lob-inbox" />
      <div
        className={`lob-left ${pointed ? "pointed" : ""}`}
        onPointerEnter={(e) => e.pointerType !== "touch" && setPointed(true)}
        onPointerMove={(e) => !pointed && e.pointerType !== "touch" && setPointed(true)}
        onPointerLeave={() => setPointed(false)}
      >
        <div className="lob-logo">
          <AppLogo size={48} />
          <span className="lob-logo-text">
            <span>{tr("lobby.vrc")}</span>
            <b>{tr("lobby.friendMap")}</b>
          </span>
        </div>
        <nav className="lob-menu" aria-label={t("menu.menu")} data-arrows="v">
          {RAIL.map((r) => (
            <button key={r.key} className={`lob-item ${!settingsOpen && (open ?? "graph") === r.key ? "on" : ""}`} title={r.label} onClick={() => pick(r.key)}>
              <Icon name={r.icon} size={26} />
              <span>{r.label}</span>
            </button>
          ))}
          <button className={`lob-item lob-settings ${settingsOpen ? "on" : ""}`} title={t("menu.settings")} onClick={() => setState({ settingsOpen: !settingsOpen })}>
            <Icon name="settings" size={26} />
            <span>{t("menu.settings")}</span>
          </button>
        </nav>
      </div>
      {open && !settingsOpen && <Frame view={open} onClose={() => setOpen(null)} />}
      {prefs.collapsed ? (
        <button className="lob-party-tab" title={t("party.showPanel")} aria-label={t("party.showPanel")} onClick={() => updatePrefs({ collapsed: false })}>
          <Icon name="chevron-left" size={18} />
          <Icon name="users" size={18} />
        </button>
      ) : (
        <aside className={`lob-party ${leaving ? "leaving" : ""}`} onAnimationEnd={(e) => leaving && e.target === e.currentTarget && (setLeaving(false), updatePrefs({ collapsed: true }))}>
          <div className="lob-party-head">
            <ToolCluster onPalette={onPalette} className="lob-tools" filters={false} />
            <button className="lob-fold" title={t("party.foldPanel")} aria-label={t("party.foldPanel")} onClick={() => setLeaving(true)}>
              <Icon name="chevron-right" size={18} />
            </button>
          </div>
          <MeCard />
          <div className="lob-party-body">
            {sidePanel === "groups" ? (
              <FriendGroupsPanel />
            ) : sidePanel === "mapOptions" ? (
              <MapOptionsPanel />
            ) : (
              <PanelSections prefs={{ ...prefs, side: "right" }} update={updatePrefs} onWorld={openWorld} />
            )}
          </div>
        </aside>
      )}
      <HereBar />
    </div>
  );
}

/** A view in the big frame. Its contents mount a moment after the frame starts sliding in, so
 *  building a heavy view doesn't hold up the animation. */
function Frame({ view, onClose }: { view: View; onClose: () => void }) {
  const t = useT();
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
    <div className="lob-frame" key={view} role="region" aria-label={RAIL.find((r) => r.key === view)?.label}>
      <header>
        <h1>{RAIL.find((r) => r.key === view)?.label}</h1>
        <span className="ui2-grow" />
        <button className="ui2-pill-btn" onClick={onClose}>
          <Icon name="chevron-left" size={14} /> {t("common.back")} <kbd>{tr("lobby.esc")}</kbd>
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

