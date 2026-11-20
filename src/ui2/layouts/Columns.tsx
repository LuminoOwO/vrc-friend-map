// Layout "Columns" (like Steam or Discord): a labeled nav sidebar on the left with you at the
// bottom, the view in the middle under a title bar, and a Steam-style friends list on the right,
// grouped by world.
import { useEffect, useMemo, useState } from "react";
import { imgSrc } from "../../backend";
import { iconUrl, presenceOf, statusColor, STATUS_LABEL } from "../../model";
import { setState, useApp } from "../../store";
import type { Friend } from "../../types";
import { Icon } from "../../components/Icon";
import { useUnreadMissed } from "../../components/InsightsView";
import { Bell, FilterButton, LayoutPicker, RAIL, SearchField, ViewBody, useOpenWorld } from "../parts";
import { ServerMenu } from "../ServerStatus";
import { WhereCard } from "../SidePanel";
import { spotTitle, useSpots } from "../OnlineNow";
import { loadWorld } from "../../sync";
import { parseLocation } from "../../components/DetailPanel";

export function ColumnsLayout({ onPalette }: { onPalette: () => void }) {
  const view = useApp((s) => s.view);
  const unread = useUnreadMissed();
  const current = RAIL.find((r) => r.key === view) ?? RAIL[0];
  return (
    <div className="lay-cols">
      <nav className="lc-nav" aria-label="Views">
        <div className="lc-brand">
          <span className="lc-logo">
            <Icon name="graph" size={18} />
          </span>
          Friend Map
        </div>
        <button className="lc-search" onClick={onPalette} title="Search everything (Ctrl+K)">
          <Icon name="search" size={15} /> Search <kbd>Ctrl K</kbd>
        </button>
        <div className="lc-items">
          {RAIL.map((r, i) => (
            <button key={r.key} className={`lc-item ${view === r.key ? "on" : ""}`} aria-current={view === r.key ? "page" : undefined} title={`Ctrl+${i + 1}`} onClick={() => setState({ view: r.key })}>
              <Icon name={r.icon} size={19} />
              <span>{r.label}</span>
              {r.key === "insights" && unread > 0 && <span className="lc-badge">{unread}</span>}
            </button>
          ))}
        </div>
        <span className="ui2-grow" />
        <div className="lc-bottom">
          <ServerMenu />
          <MeCard />
        </div>
      </nav>
      <main className="lc-main">
        <header className="lc-head">
          <Icon name={current.icon} size={20} />
          <h1>{current.label}</h1>
          <span className="ui2-grow" />
          {(view === "graph" || view === "cards") && <SearchField className="lc-head-search" />}
          {(view === "graph" || view === "cards") && <FilterButton />}
          <Bell />
          <LayoutPicker />
        </header>
        <div className="lc-view">
          <div className="ui2-view" key={view}>
            <ViewBody view={view} />
          </div>
        </div>
      </main>
      <FriendsList />
    </div>
  );
}

/** You, bottom left: picture, name, status, and the settings cog. */
function MeCard() {
  const me = useApp((s) => s.cache.me);
  const f = me?.profile;
  const color = f ? statusColor(f, "online") : "var(--muted)";
  const src = f ? imgSrc(iconUrl(f)) : undefined;
  return (
    <div className="lc-me">
      <button className="lc-me-btn" onClick={() => me && setState({ selectedId: me.id })} title="Your profile">
        <span className="ui2-avatar" style={{ width: 36, height: 36, boxShadow: `0 0 0 2px var(--panel), 0 0 0 4px ${color}` }}>
          {src ? <img src={src} alt="" /> : (me?.displayName?.[0] ?? "?")}
        </span>
        <span className="lc-me-text">
          <b>{me?.displayName ?? "You"}</b>
          <span style={{ color }}>{f ? (STATUS_LABEL[f.status] ?? "Online") : ""}</span>
        </span>
      </button>
      <button className="lc-cog" title="Settings (Ctrl+,)" aria-label="Settings" onClick={() => setState({ settingsOpen: true })}>
        <Icon name="settings" size={18} />
      </button>
    </div>
  );
}

/** Steam-style friends list: you are here, then online friends grouped by world, then offline. */
function FriendsList() {
  const spots = useSpots();
  const friends = useApp((s) => s.cache.friends);
  const presence = useApp((s) => s.cache.presence);
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set(["offline"]));
  const openWorld = useOpenWorld();
  const match = (f: Friend) => !q || f.displayName.toLowerCase().includes(q.toLowerCase());
  const offline = useMemo(
    () =>
      Object.values(friends)
        .filter((f) => presenceOf(f, presence) === "offline")
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [friends, presence],
  );
  const online = spots.reduce((n, s) => n + s.people.length, 0);
  const toggle = (k: string) => setClosed((c) => (c.has(k) ? new Set([...c].filter((x) => x !== k)) : new Set([...c, k])));
  return (
    <aside className="lc-friends" aria-label="Friends">
      <div className="lc-friends-head">
        <b>Friends</b>
        <span className="muted">{online} online</span>
      </div>
      <label className="ui2-field lc-friends-search">
        <Icon name="search" size={14} />
        <input value={q} placeholder="Find a friend" aria-label="Find a friend" onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="lc-friends-list">
        <div className="lc-where">
          <WhereCard />
        </div>
        {spots.map((s) => {
          const people = s.people.filter(match);
          if (!people.length) return null;
          return <Group key={s.key} spot={s.key} people={people} open={!closed.has(s.key)} onToggle={() => toggle(s.key)} onWorld={() => openWorld(s.key)} />;
        })}
        <Group spot="offline" people={offline.filter(match).slice(0, 200)} count={offline.filter(match).length} open={!closed.has("offline")} onToggle={() => toggle("offline")} />
      </div>
    </aside>
  );
}

function Group({ spot, people, count, open, onToggle, onWorld }: { spot: string; people: Friend[]; count?: number; open: boolean; onToggle: () => void; onWorld?: () => void }) {
  const loc = spot.startsWith("wrld_") ? parseLocation(spot) : null;
  const world = useApp((s) => (loc ? s.cache.worlds?.[loc.world] : undefined));
  useEffect(() => {
    if (loc) loadWorld(loc.world);
  }, [loc?.world]); // eslint-disable-line react-hooks/exhaustive-deps
  const title = spot === "offline" ? "Offline" : spotTitle(spot, world?.name);
  return (
    <section className="lc-group">
      <div className="lc-group-head">
        <button className="lc-group-toggle" aria-expanded={open} onClick={onToggle}>
          <Icon name={open ? "chevron-down" : "chevron-right"} size={14} />
          <span className="ui2-ellipsis">{title}</span>
          <span className="lc-count">{count ?? people.length}</span>
        </button>
        {onWorld && (
          <button className="lc-group-world" title="World overview" aria-label={`${title}: world overview`} onClick={onWorld}>
            <Icon name="info" size={14} />
          </button>
        )}
      </div>
      {open && (
        <ul>
          {people.map((f) => (
            <FriendRow key={f.id} f={f} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FriendRow({ f }: { f: Friend }) {
  const presence = useApp((s) => s.cache.presence);
  const p = presenceOf(f, presence);
  const src = imgSrc(iconUrl(f));
  const color = statusColor(f, p);
  return (
    <li>
      <button className={`lc-friend ${p}`} onClick={() => setState({ selectedId: f.id })}>
        <span className="lc-friend-pic">
          <span className="ui2-avatar" style={{ width: 32, height: 32 }}>
            {src ? <img src={src} alt="" loading="lazy" /> : f.displayName[0]}
          </span>
          <span className="lc-friend-dot" style={{ background: color }} />
        </span>
        <span className="lc-friend-text">
          <b style={p !== "offline" ? { color } : undefined}>{f.displayName}</b>
          <span>{p === "offline" ? "Offline" : p === "web" ? "Website or app" : f.statusDescription || STATUS_LABEL[f.status] || "Online"}</span>
        </span>
      </button>
    </li>
  );
}
