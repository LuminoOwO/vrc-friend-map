// Layout "Deck" (like TweetDeck): columns side by side that scroll on their own (the map, Online
// now, Activity, notifications, where you are, and any view). Add, remove and move columns;
// the set is remembered on this device. A thin icon strip on the left holds the rest.
import { useCallback, useState } from "react";
import { setState, useApp, type View } from "../../store";
import { GraphView } from "../../components/GraphView";
import { Icon } from "../../components/Icon";
import { Avatar, Bell, FilterButton, LayoutPicker, NotificationList, RAIL, SearchField, ViewBody, useOpenWorld } from "../parts";
import { ServerMenu } from "../ServerStatus";
import { ActivityFeed, Overview, WhereCard } from "../SidePanel";
import { OnlineNow } from "../OnlineNow";
import { useDismiss } from "../dismiss";

type ColKind = "map" | "online" | "feed" | "notes" | "here" | View;
const KINDS: { kind: ColKind; label: string; icon: string; wide?: boolean }[] = [
  { kind: "map", label: "Map", icon: "graph", wide: true },
  { kind: "here", label: "Where you are", icon: "pin" },
  { kind: "online", label: "Online now", icon: "world" },
  { kind: "feed", label: "Activity feed", icon: "clock" },
  { kind: "notes", label: "Notifications", icon: "bell" },
  ...RAIL.filter((r) => r.key !== "graph").map((r) => ({ kind: r.key as ColKind, label: r.label, icon: r.icon, wide: true })),
];
const LS = "vfm-ui2-deck";
const DEFAULT: ColKind[] = ["map", "online", "feed"];

function readCols(): ColKind[] {
  try {
    const r = JSON.parse(localStorage.getItem(LS) ?? "null");
    if (Array.isArray(r)) {
      const ok = r.filter((k): k is ColKind => KINDS.some((x) => x.kind === k));
      if (ok.length) return [...new Set(ok)];
    }
  } catch {
    /* not remembered */
  }
  return DEFAULT;
}

export function DeckLayout({ onPalette }: { onPalette: () => void }) {
  const me = useApp((s) => s.cache.me);
  const [cols, setColsRaw] = useState<ColKind[]>(readCols);
  const setCols = (next: ColKind[]) => {
    setColsRaw(next);
    try {
      localStorage.setItem(LS, JSON.stringify(next));
    } catch {
      /* private window */
    }
  };
  const [adding, setAdding] = useState(false);
  const closeAdd = useCallback(() => setAdding(false), []);
  const addRef = useDismiss(adding, closeAdd);
  const move = (i: number, d: -1 | 1) => {
    const next = [...cols];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setCols(next);
  };
  const missing = KINDS.filter((k) => !cols.includes(k.kind));
  return (
    <div className="lay-deck">
      <nav className="deck-strip" aria-label="Deck">
        <button className="deck-me" title="Your profile" onClick={() => me && setState({ selectedId: me.id })}>
          {me ? <Avatar id={me.id} size={38} /> : <Icon name="user" />}
        </button>
        <div className="deck-add" ref={addRef}>
          <button className={`deck-icon ${adding ? "on" : ""}`} title="Add a column" aria-label="Add a column" aria-expanded={adding} onClick={() => setAdding(!adding)}>
            <Icon name="plus" size={20} />
          </button>
          {adding && (
            <div className="ui2-drop deck-add-menu" role="menu">
              <div className="ui2-drop-head">
                <b>Add a column</b>
              </div>
              {missing.length === 0 && <p className="small muted ui2-drop-empty">Every column is on the deck.</p>}
              {missing.map((k) => (
                <button
                  key={k.kind}
                  role="menuitem"
                  className="deck-add-item"
                  onClick={() => {
                    setCols([...cols, k.kind]);
                    setAdding(false);
                  }}
                >
                  <Icon name={k.icon} size={16} /> {k.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="deck-icon" title="Search everything (Ctrl+K)" aria-label="Search everything" onClick={onPalette}>
          <Icon name="search" size={20} />
        </button>
        <span className="ui2-grow" />
        <Bell />
        <ServerMenu />
        <LayoutPicker className="deck-layout" />
        <button className="deck-icon" title="Settings (Ctrl+,)" aria-label="Settings" onClick={() => setState({ settingsOpen: true })}>
          <Icon name="settings" size={20} />
        </button>
      </nav>
      <div className="deck-cols">
        {cols.map((kind, i) => {
          const k = KINDS.find((x) => x.kind === kind)!;
          return (
            <section key={kind} className={`deck-col ${k.wide ? "wide" : ""}`}>
              <header className="deck-col-head">
                <Icon name={k.icon} size={16} />
                <b>{k.label}</b>
                <span className="ui2-grow" />
                {(kind === "map" || kind === "cards") && <FilterButton />}
                <button className="deck-mini" title="Move left" aria-label="Move left" disabled={i === 0} onClick={() => move(i, -1)}>
                  <Icon name="chevron-left" size={15} />
                </button>
                <button className="deck-mini" title="Move right" aria-label="Move right" disabled={i === cols.length - 1} onClick={() => move(i, 1)}>
                  <Icon name="chevron-right" size={15} />
                </button>
                <button className="deck-mini" title="Remove this column" aria-label="Remove this column" onClick={() => setCols(cols.filter((c) => c !== kind))}>
                  <Icon name="close" size={15} />
                </button>
              </header>
              <div className="deck-col-body">
                <ColumnBody kind={kind} />
              </div>
            </section>
          );
        })}
        <button className="deck-empty" onClick={() => setAdding(true)}>
          <Icon name="plus" size={22} />
          Add a column
        </button>
      </div>
    </div>
  );
}

function ColumnBody({ kind }: { kind: ColKind }) {
  const openWorld = useOpenWorld();
  switch (kind) {
    case "map":
      return (
        <>
          <SearchField className="deck-search" />
          <GraphView />
        </>
      );
    case "online":
      return <OnlineNow onOpen={openWorld} />;
    case "feed":
      return <ActivityFeed max={120} />;
    case "notes":
      return <NotificationList max={60} />;
    case "here":
      return (
        <div className="deck-here">
          <WhereCard />
          <Overview />
        </div>
      );
    default:
      return <ViewBody view={kind} />;
  }
}
