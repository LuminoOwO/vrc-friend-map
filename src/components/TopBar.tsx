import { useEffect, useRef, useState } from "react";
import { useDerived } from "../derived";
import { STATUS_COLORS, PLATFORM_LABEL, TRUST_RANKS } from "../model";
import { exitDemo } from "../session";
import { defaultFilters, setState, updateFilters, useApp, type View } from "../store";
import { syncAll, togglePause } from "../sync";
import { Icon } from "./Icon";

const VIEWS: { key: View; label: string; icon: string }[] = [
  { key: "graph", label: "Map", icon: "graph" },
  { key: "cards", label: "Cards", icon: "cards" },
  { key: "lists", label: "Shared lists", icon: "share" },
  { key: "activity", label: "Activity", icon: "clock" },
];

function activeFilterCount(f: ReturnType<typeof defaultFilters>): number {
  let n = 0;
  if (f.presence !== "all") n++;
  if (f.lastSeen !== "any") n++;
  if (f.trust.length) n++;
  if (f.statuses.length) n++;
  if (f.platform.length) n++;
  if (f.circleId) n++;
  if (f.favoritesOnly) n++;
  if (f.listId) n++;
  return n;
}

export function TopBar() {
  const view = useApp((s) => s.view);
  const filters = useApp((s) => s.filters);
  const demo = useApp((s) => s.demo);
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { matched, friends } = useDerived();
  const count = activeFilterCount(filters);

  return (
    <header className="topbar">
      <button className="icon-btn" title="Toggle sidebar" onClick={() => setState({ sidebarOpen: !sidebarOpen })}>
        <Icon name="menu" />
      </button>
      <div className="brand small">
        <span className="brand-mark" />
        <span className="brand-name">VRC Friend Map</span>
        {demo && (
          <button className="pill demo" title="Leave demo mode" onClick={exitDemo}>
            Demo<span className="hide-sm"> · exit</span>
          </button>
        )}
      </div>
      <nav className="tabs" role="tablist">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            role="tab"
            aria-selected={view === v.key}
            className={`tab ${view === v.key ? "active" : ""}`}
            onClick={() => setState({ view: v.key })}
          >
            <Icon name={v.icon} />
            <span className="tab-label">{v.label}</span>
          </button>
        ))}
      </nav>
      <div className="search">
        <Icon name="search" size={16} />
        <input
          value={filters.search}
          placeholder="Search friends"
          onChange={(e) => updateFilters({ search: e.target.value })}
        />
        {filters.search && (
          <button className="icon-btn tiny" title="Clear search" onClick={() => updateFilters({ search: "" })}>
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
      <div className="filter-wrap">
        <button className={`btn ${count ? "accent" : ""}`} onClick={() => setFiltersOpen(!filtersOpen)}>
          <Icon name="filter" size={16} /> <span className="hide-sm">Filters</span>
          {count > 0 && <span className="badge">{count}</span>}
        </button>
        {filtersOpen && <FilterPopover onClose={() => setFiltersOpen(false)} />}
      </div>
      <span className="match-count hide-sm" title="Friends matching the filters">
        {matched.size}/{friends.length}
      </span>
      <SyncPill />
      <button className="icon-btn" title="Settings" onClick={() => setState({ settingsOpen: true })}>
        <Icon name="settings" />
      </button>
    </header>
  );
}

function SyncPill() {
  const sync = useApp((s) => s.sync);
  const demo = useApp((s) => s.demo);
  const live = useApp((s) => s.live);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!sync.backoffUntil) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [sync.backoffUntil]);

  if (demo) return null;
  const wait = sync.backoffUntil ? Math.max(0, Math.round((sync.backoffUntil - Date.now()) / 1000)) : 0;
  return (
    <div className={`sync ${sync.error ? "error" : ""}`} title={sync.error || sync.message}>
      <span
        className={`live ${live.connected ? "on" : ""}`}
        title={live.connected ? "Live: friend changes and online status update instantly" : live.message || "Live updates not connected"}
      >
        {live.connected ? "Live" : "Offline"}
      </span>
      {sync.running ? (
        <>
          <span className="spinner" aria-hidden />
          <span className="sync-text">
            {sync.phase}
            {sync.total > 0 && ` ${sync.done}/${sync.total}`}
            {wait > 0 && ` · waiting ${wait}s`}
            {sync.paused && " · paused"}
          </span>
          {sync.total > 0 && (
            <button className="icon-btn tiny" title={sync.paused ? "Resume" : "Pause"} onClick={togglePause}>
              <Icon name={sync.paused ? "play" : "pause"} size={14} />
            </button>
          )}
        </>
      ) : (
        <>
          <span className="sync-text">{sync.error ? "Sync failed" : sync.message || "Not synced yet"}</span>
          <button className="icon-btn tiny" title="Refresh now" onClick={() => syncAll()}>
            <Icon name="refresh" size={14} />
          </button>
        </>
      )}
    </div>
  );
}

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function toggleIn(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function FilterPopover({ onClose }: { onClose: () => void }) {
  const f = useApp((s) => s.filters);
  const circles = useApp((s) => s.local.circles);
  const imports = useApp((s) => s.local.imports);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest(".filter-wrap")) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  return (
    <div className="popover filters" ref={ref}>
      <div className="frow">
        <span className="flabel">Status</span>
        <Toggle
          value={f.presence}
          options={[
            ["all", "All"],
            ["online", "Online"],
            ["offline", "Offline"],
          ]}
          onChange={(presence) => updateFilters({ presence })}
        />
      </div>
      <div className="frow">
        <span className="flabel">Last online</span>
        <select value={f.lastSeen} onChange={(e) => updateFilters({ lastSeen: e.target.value as typeof f.lastSeen })}>
          <option value="any">Any time</option>
          <option value="24h">Within 24 hours</option>
          <option value="7d">Within 7 days</option>
          <option value="30d">Within 30 days</option>
          <option value="90d">Within 90 days</option>
          <option value="older">More than 90 days ago</option>
        </select>
      </div>
      <div className="frow">
        <span className="flabel">Status</span>
        <div className="chips">
          {(
            [
              ["join me", "Join me"],
              ["active", "Online"],
              ["ask me", "Ask me"],
              ["busy", "Busy"],
              ["web", "Website/app"],
              ["offline", "Offline"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`chip ${f.statuses.includes(key) ? "on" : ""}`}
              style={{ ["--chip" as string]: STATUS_COLORS[key as keyof typeof STATUS_COLORS] }}
              onClick={() => updateFilters({ statuses: toggleIn(f.statuses, key) })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="frow">
        <span className="flabel">Trust rank</span>
        <div className="chips">
          {TRUST_RANKS.map((t) => (
            <button
              key={t.key}
              className={`chip ${f.trust.includes(t.key) ? "on" : ""}`}
              style={{ ["--chip" as string]: t.color }}
              onClick={() => updateFilters({ trust: toggleIn(f.trust, t.key) })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="frow">
        <span className="flabel">Platform</span>
        <div className="chips">
          {["pc", "android", "ios"].map((p) => (
            <button key={p} className={`chip ${f.platform.includes(p) ? "on" : ""}`} onClick={() => updateFilters({ platform: toggleIn(f.platform, p) })}>
              {PLATFORM_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="frow">
        <span className="flabel">Circle</span>
        <select value={f.circleId ?? ""} onChange={(e) => updateFilters({ circleId: e.target.value || null })}>
          <option value="">Any</option>
          {circles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {imports.length > 0 && (
        <div className="frow">
          <span className="flabel">Also in list</span>
          <select value={f.listId ?? ""} onChange={(e) => updateFilters({ listId: e.target.value || null })}>
            <option value="">Any</option>
            {imports.map((l) => (
              <option key={l.id} value={l.id}>
                {l.owner.displayName}
              </option>
            ))}
          </select>
        </div>
      )}
      <label className="frow check">
        <input type="checkbox" checked={f.favoritesOnly} onChange={(e) => updateFilters({ favoritesOnly: e.target.checked })} />
        <span>Only VRChat favorites</span>
      </label>
      <div className="frow end">
        <button className="btn ghost" onClick={() => updateFilters({ ...defaultFilters(), search: f.search })}>
          Reset filters
        </button>
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
