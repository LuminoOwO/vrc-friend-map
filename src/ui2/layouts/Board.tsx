// Layout "Board" (Kanban): your friends as cards in lanes by status (Join me, Online, Ask me,
// Busy, Website or app, Offline). Click a card for the profile, the world line for the world.
// The other views open from the Views button as a large sheet.
import { useCallback, useEffect, useMemo, useState } from "react";
import { imgSrc } from "../../backend";
import { iconUrl, presenceOf } from "../../model";
import { setState, useApp, type View } from "../../store";
import type { Friend } from "../../types";
import { parseLocation } from "../../components/DetailPanel";
import { Icon } from "../../components/Icon";
import { MeButton, RAIL, SearchField, ToolCluster, ViewSheet, useOpenWorld } from "../parts";
import { useDismiss } from "../dismiss";

const LANES: { id: string; label: string; color: string }[] = [
  { id: "join me", label: "Join me", color: "#42caff" },
  { id: "active", label: "Online", color: "#51e57e" },
  { id: "ask me", label: "Ask me", color: "#e8a33d" },
  { id: "busy", label: "Busy", color: "#f05a6a" },
  { id: "web", label: "Website or app", color: "#e6c35c" },
  { id: "offline", label: "Offline", color: "#6f8291" },
];

export function BoardLayout({ onPalette }: { onPalette: () => void }) {
  const view = useApp((s) => s.view);
  const friends = useApp((s) => s.cache.friends);
  const presence = useApp((s) => s.cache.presence);
  const search = useApp((s) => s.filters.search);
  const worlds = useApp((s) => s.cache.worlds);
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  const menuRef = useDismiss(menu, closeMenu);
  const [showOffline, setShowOffline] = useState(false);
  // The board is home; a view opens as a sheet over it (also with Ctrl+1…7).
  const [sheet, setSheet] = useState<View | null>(null);
  const [lastView, setLastView] = useState(view);
  useEffect(() => {
    if (view !== lastView) {
      setLastView(view);
      setSheet(view);
    }
  }, [view, lastView]);
  const openWorld = useOpenWorld();
  const lanes = useMemo(() => {
    const by: Record<string, Friend[]> = Object.fromEntries(LANES.map((l) => [l.id, []]));
    const q = search.toLowerCase();
    for (const f of Object.values(friends)) {
      if (q && !f.displayName.toLowerCase().includes(q)) continue;
      const p = presenceOf(f, presence);
      const lane = p === "offline" ? "offline" : p === "web" ? "web" : by[f.status] ? f.status : "active";
      by[lane].push(f);
    }
    for (const k of Object.keys(by)) by[k].sort((a, b) => a.displayName.localeCompare(b.displayName));
    return by;
  }, [friends, presence, search]);
  return (
    <div className="lay-board">
      <header className="bd-head">
        <MeButton />
        <h1>Board</h1>
        <SearchField className="bd-search" />
        <div className="bd-views" ref={menuRef}>
          <button className={`ui2-pill-btn ${menu ? "on" : ""}`} aria-expanded={menu} onClick={() => setMenu(!menu)}>
            <Icon name="cards" size={15} /> Views <Icon name="chevron-down" size={13} />
          </button>
          {menu && (
            <div className="ui2-drop bd-menu">
              {RAIL.map((r) => (
                <button
                  key={r.key}
                  onClick={() => {
                    setSheet(r.key);
                    setMenu(false);
                  }}
                >
                  <Icon name={r.icon} size={16} /> {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="ui2-grow" />
        <ToolCluster onPalette={onPalette} filters={false} />
      </header>
      <div className="bd-lanes">
        {LANES.map((l) => {
          const list = lanes[l.id];
          const folded = l.id === "offline" && !showOffline;
          return (
            <section key={l.id} className={`bd-lane ${folded ? "folded" : ""}`} style={{ ["--lane" as string]: l.color }}>
              <header>
                <span className="bd-lane-dot" />
                <b>{l.label}</b>
                <span className="bd-lane-count">{list.length}</span>
                {l.id === "offline" && (
                  <button className="bd-lane-toggle" onClick={() => setShowOffline(!showOffline)}>
                    {showOffline ? "Hide" : "Show"}
                  </button>
                )}
              </header>
              {!folded && (
                <div className="bd-cards">
                  {list.slice(0, 200).map((f) => {
                    const loc = f.location?.startsWith("wrld_") ? parseLocation(f.location) : null;
                    const wname = loc ? worlds?.[loc.world]?.name : undefined;
                    const src = imgSrc(iconUrl(f));
                    return (
                      <article key={f.id} className="bd-card">
                        <button className="bd-card-main" onClick={() => setState({ selectedId: f.id })}>
                          <span className="ui2-avatar" style={{ width: 40, height: 40 }}>
                            {src ? <img src={src} alt="" loading="lazy" /> : f.displayName[0]}
                          </span>
                          <span className="bd-card-text">
                            <b>{f.displayName}</b>
                            {f.statusDescription && <span>{f.statusDescription}</span>}
                          </span>
                        </button>
                        {loc && (
                          <button className="bd-card-world" onClick={() => openWorld(f.location)}>
                            <Icon name="pin" size={12} /> {wname ?? "A world"}
                          </button>
                        )}
                      </article>
                    );
                  })}
                  {list.length === 0 && <p className="bd-empty">Nobody</p>}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {sheet && <ViewSheet view={sheet} onClose={() => setSheet(null)} closeLabel="Back to the board" className="bd-sheet" />}
    </div>
  );
}
