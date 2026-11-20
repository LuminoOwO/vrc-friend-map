// Layout "Explorer" (like VS Code): an icon bar on the far left, a side bar with a tree of your
// friends (your instance, every world, your circles, offline), and an editor area with tabs:
// views and profiles open as tabs side by side. A status bar along the bottom.
import { useMemo, useState } from "react";
import { imgSrc } from "../../backend";
import { iconUrl, presenceOf, statusColor } from "../../model";
import { setState, useApp, type View } from "../../store";
import type { Friend } from "../../types";
import { DetailPanel } from "../../components/DetailPanel";
import { Icon } from "../../components/Icon";
import { Bell, LayoutPicker, RAIL, ViewBody, useOpenWorld } from "../parts";
import { ServerMenu } from "../ServerStatus";
import { spotTitle, useSpots } from "../OnlineNow";
import { parseLocation } from "../../components/DetailPanel";

type Tab = { kind: "view"; view: View } | { kind: "person"; id: string };
const tabKey = (t: Tab) => (t.kind === "view" ? `v:${t.view}` : `p:${t.id}`);

export function ExplorerLayout({ onPalette }: { onPalette: () => void }) {
  const [tabs, setTabs] = useState<Tab[]>([{ kind: "view", view: "graph" }]);
  const [cur, setCur] = useState("v:graph");
  const [side, setSide] = useState<"friends" | "views">("friends");
  const friends = useApp((s) => s.cache.friends);
  const presence = useApp((s) => s.cache.presence);
  const online = useMemo(() => Object.values(friends).filter((f) => presenceOf(f, presence) !== "offline").length, [friends, presence]);
  const openTab = (t: Tab) => {
    const k = tabKey(t);
    if (!tabs.some((x) => tabKey(x) === k)) setTabs([...tabs, t]);
    setCur(k);
    if (t.kind === "view") setState({ view: t.view });
  };
  const closeTab = (k: string) => {
    const i = tabs.findIndex((x) => tabKey(x) === k);
    const next = tabs.filter((x) => tabKey(x) !== k);
    setTabs(next);
    if (cur === k) setCur(next.length ? tabKey(next[Math.max(0, i - 1)]) : "");
  };
  const current = tabs.find((t) => tabKey(t) === cur);
  return (
    <div className="lay-ide">
      <nav className="ide-act" aria-label="Side bar">
        <button className={`ide-act-btn ${side === "friends" ? "on" : ""}`} title="Friends" onClick={() => setSide("friends")}>
          <Icon name="users" size={22} />
        </button>
        <button className={`ide-act-btn ${side === "views" ? "on" : ""}`} title="Views" onClick={() => setSide("views")}>
          <Icon name="cards" size={22} />
        </button>
        <button className="ide-act-btn" title="Search everything (Ctrl+K)" onClick={onPalette}>
          <Icon name="search" size={22} />
        </button>
        <span className="ui2-grow" />
        <button className="ide-act-btn" title="Settings (Ctrl+,)" onClick={() => setState({ settingsOpen: true })}>
          <Icon name="settings" size={22} />
        </button>
      </nav>
      <aside className="ide-side">
        <div className="ide-side-title">{side === "friends" ? "Friends" : "Views"}</div>
        {side === "friends" ? <FriendTree onOpen={(id) => openTab({ kind: "person", id })} /> : <ViewTree onOpen={(v) => openTab({ kind: "view", view: v })} />}
      </aside>
      <main className="ide-main">
        <div className="ide-tabs" role="tablist">
          {tabs.map((t) => {
            const k = tabKey(t);
            return <TabButton key={k} tab={t} on={k === cur} onPick={() => openTab(t)} onClose={() => closeTab(k)} />;
          })}
        </div>
        <div className="ide-editor">
          {current?.kind === "view" && (
            <div className="ui2-view" key={cur}>
              <ViewBody view={current.view} />
            </div>
          )}
          {current?.kind === "person" && (
            <div className="ide-person" key={cur}>
              <DetailPanel id={current.id} />
            </div>
          )}
          {!current && (
            <div className="ide-welcome">
              <Icon name="graph" size={48} />
              <h2>Friend Map</h2>
              <p className="muted">Open a view or a friend from the side bar.</p>
            </div>
          )}
        </div>
      </main>
      <footer className="ide-status">
        <span className="ide-status-item">
          <span className="ide-dot" /> {online} online
        </span>
        <ServerMenu />
        <span className="ui2-grow" />
        <Bell />
        <LayoutPicker />
      </footer>
    </div>
  );
}

function TabButton({ tab, on, onPick, onClose }: { tab: Tab; on: boolean; onPick: () => void; onClose: () => void }) {
  const name = useApp((s) => (tab.kind === "person" ? (s.cache.friends[tab.id]?.displayName ?? s.cache.others?.[tab.id]?.displayName ?? "Profile") : ""));
  const r = tab.kind === "view" ? RAIL.find((x) => x.key === tab.view) : undefined;
  return (
    <div className={`ide-tab ${on ? "on" : ""}`} role="tab" aria-selected={on}>
      <button className="ide-tab-main" onClick={onPick} onAuxClick={(e) => e.button === 1 && onClose()}>
        <Icon name={r?.icon ?? "user"} size={14} />
        <span>{r?.label ?? name}</span>
      </button>
      <button className="ide-tab-x" aria-label="Close tab" onClick={onClose}>
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

function ViewTree({ onOpen }: { onOpen: (v: View) => void }) {
  return (
    <ul className="ide-tree">
      {RAIL.map((r) => (
        <li key={r.key}>
          <button className="ide-node" onClick={() => onOpen(r.key)}>
            <Icon name={r.icon} size={15} /> {r.label}
          </button>
        </li>
      ))}
    </ul>
  );
}

function FriendTree({ onOpen }: { onOpen: (id: string) => void }) {
  const spots = useSpots();
  const circles = useApp((s) => s.local.circles);
  const friends = useApp((s) => s.cache.friends);
  const presence = useApp((s) => s.cache.presence);
  const offline = useMemo(() => Object.values(friends).filter((f) => presenceOf(f, presence) === "offline").sort((a, b) => a.displayName.localeCompare(b.displayName)), [friends, presence]);
  return (
    <div className="ide-tree-wrap">
      <Folder label="Online" defaultOpen>
        {spots.map((s) => (
          <SpotFolder key={s.key} spotKey={s.key} people={s.people} onOpen={onOpen} />
        ))}
      </Folder>
      <Folder label="Circles">
        {circles.map((c) => (
          <Folder key={c.id} label={c.name} color={c.color} count={c.members.filter((m) => friends[m]).length}>
            {c.members
              .map((m) => friends[m])
              .filter(Boolean)
              .map((f) => (
                <Leaf key={f.id} f={f} onOpen={onOpen} />
              ))}
          </Folder>
        ))}
      </Folder>
      <Folder label="Offline" count={offline.length}>
        {offline.slice(0, 300).map((f) => (
          <Leaf key={f.id} f={f} onOpen={onOpen} />
        ))}
      </Folder>
    </div>
  );
}

function SpotFolder({ spotKey, people, onOpen }: { spotKey: string; people: Friend[]; onOpen: (id: string) => void }) {
  const loc = spotKey.startsWith("wrld_") ? parseLocation(spotKey) : null;
  const world = useApp((s) => (loc ? s.cache.worlds?.[loc.world] : undefined));
  const openWorld = useOpenWorld();
  return (
    <Folder label={spotTitle(spotKey, world?.name)} count={people.length} onInfo={spotKey !== "web" ? () => openWorld(spotKey) : undefined} defaultOpen>
      {people.map((f) => (
        <Leaf key={f.id} f={f} onOpen={onOpen} />
      ))}
    </Folder>
  );
}

function Folder({ label, count, color, onInfo, defaultOpen = false, children }: { label: string; count?: number; color?: string; onInfo?: () => void; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="ide-folder">
      <div className="ide-folder-row">
        <button className="ide-node folder" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name={open ? "chevron-down" : "chevron-right"} size={14} />
          {color ? <span className="ide-swatch" style={{ background: color }} /> : <Icon name={open ? "folder" : "folder"} size={14} />}
          <span className="ui2-ellipsis">{label}</span>
          {count !== undefined && <span className="ide-count">{count}</span>}
        </button>
        {onInfo && (
          <button className="ide-info" title="World overview" onClick={onInfo}>
            <Icon name="info" size={13} />
          </button>
        )}
      </div>
      {open && <div className="ide-children">{children}</div>}
    </div>
  );
}

function Leaf({ f, onOpen }: { f: Friend; onOpen: (id: string) => void }) {
  const presence = useApp((s) => s.cache.presence);
  const src = imgSrc(iconUrl(f));
  return (
    <button className="ide-node leaf" onClick={() => onOpen(f.id)} title={f.statusDescription || f.displayName}>
      <span className="ui2-avatar" style={{ width: 18, height: 18, fontSize: 9 }}>
        {src ? <img src={src} alt="" loading="lazy" /> : f.displayName[0]}
      </span>
      <span className="ui2-ellipsis">{f.displayName}</span>
      <span className="ide-leaf-dot" style={{ background: statusColor(f, presenceOf(f, presence)) }} />
    </button>
  );
}
