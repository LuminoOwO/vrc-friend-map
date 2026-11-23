import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { useDerived } from "../derived";
import { imgSrc } from "../backend";
import { STATUS_COLORS, PLATFORM_LABEL, TRUST_RANKS, iconUrl } from "../model";
import { exitDemo } from "../session";
import { defaultFilters, setState, updateFilters, useApp, type View } from "../store";
import { syncAll, togglePause } from "../sync";
import { Icon } from "./Icon";
import { SyncLogDialog } from "./SyncLogDialog";
import { useUnreadMissed } from "./InsightsView";

const VIEWS: { key: View; label: string; icon: string }[] = [
  { key: "graph", get label() { return t("menu.map"); }, icon: "graph" },
  { key: "cards", get label() { return t("menu.cards"); }, icon: "cards" },
  { key: "lists", get label() { return t("menu.lists"); }, icon: "share" },
  { key: "activity", get label() { return t("menu.activity"); }, icon: "clock" },
  { key: "insights", get label() { return t("menu.insights"); }, icon: "bulb" },
  { key: "logbook", get label() { return t("menu.logbook"); }, icon: "calendar" },
  { key: "vrchat", get label() { return t("menu.groups"); }, icon: "flag" },
  { key: "media", get label() { return t("menu.media"); }, icon: "image" },
  { key: "times", get label() { return t("menu.times"); }, icon: "chart" },
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
  if (f.favoriteGroup) n++;
  if (f.starredOnly) n++;
  if (f.account) n++;
  if (f.listId) n++;
  if (f.who !== "all") n++;
  return n;
}

export function TopBar() {
  const view = useApp((s) => s.view);
  const filters = useApp((s) => s.filters);
  const demo = useApp((s) => s.demo);
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { matched, friends } = useDerived();
  const unread = useUnreadMissed();
  const count = activeFilterCount(filters);

  return (
    <header className="topbar">
      <button className="icon-btn" title={t("topbar.toggleSidebar")} onClick={() => setState({ sidebarOpen: !sidebarOpen })}>
        <Icon name="menu" />
      </button>
      <div className="brand small">
        <MeButton />
        <span className="brand-name">VRC Friend Map</span>
        {demo && (
          <button className="pill demo" title={t("topbar.leaveDemo")} onClick={exitDemo}>
            {t("topbar.demo")}<span className="hide-sm">{t("topbar.demoExit")}</span>
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
            {v.key === "insights" && unread > 0 && <span className="badge tab-badge">{unread}</span>}
          </button>
        ))}
      </nav>
      <div className="search">
        <Icon name="search" size={16} />
        <input
          value={filters.search}
          placeholder={t("phone.searchFriends")}
          onChange={(e) => updateFilters({ search: e.target.value })}
        />
        {filters.search && (
          <button className="icon-btn tiny" title={t("topbar.clearSearch")} onClick={() => updateFilters({ search: "" })}>
            <Icon name="close" size={14} />
          </button>
        )}
      </div>
      <div className="filter-wrap">
        <button className={`btn ${count ? "accent" : ""}`} onClick={() => setFiltersOpen(!filtersOpen)}>
          <Icon name="filter" size={16} /> <span className="hide-sm">{t("phone.filters")}</span>
          {count > 0 && <span className="badge">{count}</span>}
        </button>
        {filtersOpen && <FilterPopover onClose={() => setFiltersOpen(false)} />}
      </div>
      <span className="match-count hide-sm" title={t("topbar.matching")}>
        {matched.size}/{friends.length}
      </span>
      <SyncPill />
      <button className="icon-btn settings-btn" title={t("menu.settings")} aria-label={t("menu.settings")} onClick={() => setState({ settingsOpen: true })}>
        <Icon name="settings" />
      </button>
    </header>
  );
}

export function SyncPill() {
  const sync = useApp((s) => s.sync);
  const demo = useApp((s) => s.demo);
  const live = useApp((s) => s.live);
  const [, tick] = useState(0);
  const [logOpen, setLogOpen] = useState(false);
  useEffect(() => {
    if (!sync.backoffUntil) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [sync.backoffUntil]);

  if (demo) return null;
  const logBtn = (
    <button className="icon-btn tiny" title={t("topbar.syncLogHint")} aria-label={t("menu.syncLog")} onClick={() => setLogOpen(true)}>
      <Icon name="info" size={14} />
    </button>
  );
  const wait = sync.backoffUntil ? Math.max(0, Math.round((sync.backoffUntil - Date.now()) / 1000)) : 0;
  return (
    <div className={`sync ${sync.error ? "error" : ""}`} title={sync.error || sync.message}>
      <span
        className={`live ${live.connected ? "on" : ""}`}
        title={live.connected ? t("topbar.liveOn") : live.message || t("topbar.liveOff")}
      >
        {live.connected ? t("topbar.live") : t("topbar.offline")}
      </span>
      {sync.running ? (
        <>
          <span className="spinner" aria-hidden />
          <span className="sync-text">
            {sync.phase}
            {sync.total > 0 && ` ${sync.done}/${sync.total}`}
            {wait > 0 && t("topbar.waiting", { s: wait })}
            {sync.paused && t("topbar.paused")}
          </span>
          {sync.total > 0 && (
            <button className="icon-btn tiny" title={sync.paused ? t("topbar.resume") : t("topbar.pause")} onClick={togglePause}>
              <Icon name={sync.paused ? "play" : "pause"} size={14} />
            </button>
          )}
        </>
      ) : (
        <>
          <button className="sync-text linkish" title={t("topbar.openSyncLog")} onClick={() => setLogOpen(true)}>
            {sync.error ? t("topbar.syncFailed") : sync.message || t("topbar.notSynced")}
          </button>
          <button className="icon-btn tiny" title={t("topbar.refreshNow")} onClick={() => syncAll()}>
            <Icon name="refresh" size={14} />
          </button>
          {logBtn}
        </>
      )}
      {logOpen && <SyncLogDialog onClose={() => setLogOpen(false)} />}
    </div>
  );
}

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} className={value === v ? "on" : ""} aria-pressed={value === v} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function toggleIn(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** Shift a popover back inside the window if it sticks out left or right. */
export function useKeepOnScreen(ref: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.transform = "";
      const r = el.getBoundingClientRect();
      const margin = 8;
      let dx = 0;
      if (r.left < margin) dx = margin - r.left;
      else if (r.right > window.innerWidth - margin) dx = window.innerWidth - margin - r.right;
      if (dx) el.style.transform = `translateX(${dx}px)`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [ref]);
}

export function FilterPopover({ onClose }: { onClose: () => void }) {
  const f = useApp((s) => s.filters);
  const circles = useApp((s) => s.local.circles);
  const imports = useApp((s) => s.local.imports);
  const favorites = useApp((s) => s.cache.favorites);
  const favGroups = [...new Set(Object.values(favorites).flat())].sort();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest(".filter-wrap")) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);
  useKeepOnScreen(ref);

  return (
    <div className="popover filters" ref={ref}>
      <div className="frow">
        <span className="flabel">{t("filters.who")}</span>
        <select value={f.who} onChange={(e) => updateFilters({ who: e.target.value as typeof f.who })}>
          <option value="all">{t("filters.whoAll")}</option>
          <option value="friends">{t("filters.whoFriends")}</option>
          <option value="potential">{t("filters.whoPotential")}</option>
        </select>
      </div>
      {f.who === "potential" && (
        <p className="small muted frow-note">
          {t("filters.potentialNote")}
        </p>
      )}
      <div className="frow">
        <span className="flabel">{t("filters.show")}</span>
        <Toggle
          value={f.presence}
          options={[
            ["all", t("filters.all")],
            ["online", t("filters.online")],
            ["offline", t("filters.offline")],
          ]}
          onChange={(presence) => updateFilters({ presence })}
        />
      </div>
      <div className="frow">
        <span className="flabel">{t("filters.lastOnline")}</span>
        <select value={f.lastSeen} onChange={(e) => updateFilters({ lastSeen: e.target.value as typeof f.lastSeen })}>
          <option value="any">{t("filters.anyTime")}</option>
          <option value="24h">{t("filters.within24h")}</option>
          <option value="7d">{t("filters.within7d")}</option>
          <option value="30d">{t("filters.within30d")}</option>
          <option value="90d">{t("filters.within90d")}</option>
          <option value="older">{t("filters.older")}</option>
        </select>
      </div>
      <div className="frow">
        <span className="flabel">{t("filters.status")}</span>
        <div className="chips">
          {(
            [
              ["join me", t("filters.joinMe")],
              ["active", t("filters.online")],
              ["ask me", t("filters.askMe")],
              ["busy", t("filters.busy")],
              ["web", t("filters.web")],
              ["offline", t("filters.offline")],
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
        <span className="flabel">{t("filters.trustRank")}</span>
        <div className="chips">
          {TRUST_RANKS.map((r) => (
            <button
              key={r.key}
              className={`chip ${f.trust.includes(r.key) ? "on" : ""}`}
              style={{ ["--chip" as string]: r.color }}
              onClick={() => updateFilters({ trust: toggleIn(f.trust, r.key) })}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="frow">
        <span className="flabel">{t("filters.platform")}</span>
        <div className="chips">
          {["pc", "android", "ios"].map((p) => (
            <button key={p} className={`chip ${f.platform.includes(p) ? "on" : ""}`} onClick={() => updateFilters({ platform: toggleIn(f.platform, p) })}>
              {PLATFORM_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="frow">
        <span className="flabel">{t("filters.circle")}</span>
        <select value={f.circleId ?? ""} onChange={(e) => updateFilters({ circleId: e.target.value || null })}>
          <option value="">{t("filters.any")}</option>
          {circles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {imports.length > 0 && (
        <div className="frow">
          <span className="flabel">{t("filters.alsoInList")}</span>
          <select value={f.listId ?? ""} onChange={(e) => updateFilters({ listId: e.target.value || null })}>
            <option value="">{t("filters.any")}</option>
            {imports.map((l) => (
              <option key={l.id} value={l.id}>
                {l.owner.displayName}
              </option>
            ))}
          </select>
        </div>
      )}
      {favGroups.length > 0 && (
        <div className="frow">
          <span className="flabel">{t("filters.favoriteGroup")}</span>
          <select value={f.favoriteGroup ?? ""} onChange={(e) => updateFilters({ favoriteGroup: e.target.value || null })}>
            <option value="">{t("filters.any")}</option>
            {favGroups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      )}
      <label className="frow check">
        <input type="checkbox" checked={!!f.starredOnly} onChange={(e) => updateFilters({ starredOnly: e.target.checked })} />
        <span>{t("filters.starredOnly")}</span>
      </label>
      <AccountFilter />
      <label className="frow check">
        <input type="checkbox" checked={f.favoritesOnly} onChange={(e) => updateFilters({ favoritesOnly: e.target.checked })} />
        <span>{t("filters.favoritesOnly")}</span>
      </label>
      <div className="frow end">
        <button className="btn ghost" onClick={() => updateFilters({ ...defaultFilters(), search: f.search })}>
          {t("filters.reset")}
        </button>
        <button className="btn" onClick={onClose}>
          {t("filters.done")}
        </button>
      </div>
    </div>
  );
}

/** Your own picture: opens your profile (and its status). */
function MeButton() {
  const me = useApp((s) => s.cache.me);
  const selectedId = useApp((s) => s.selectedId);
  if (!me) return <span className="brand-mark" />;
  const pic = imgSrc(me.profile ? iconUrl(me.profile) : me.iconUrl);
  const status = me.profile?.status;
  return (
    <button
      className={`me-btn ${selectedId === me.id ? "on" : ""}`}
      title={t("topbar.openProfile", { name: me.displayName })}
      onClick={() => setState({ selectedId: selectedId === me.id ? null : me.id })}
    >
      {pic ? <img src={pic} alt="" /> : <span>{me.displayName.slice(0, 1).toUpperCase()}</span>}
      {status && <i className="me-dot" style={{ background: STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? "#8b949e" }} />}
    </button>
  );
}

/** Filter by which of your accounts someone is friends with (only with more than one account). */
function AccountFilter() {
  const list = useApp((s) => s.settings.accounts.list);
  const value = useApp((s) => s.filters.account ?? "");
  const me = useApp((s) => s.cache.me?.displayName ?? t("topbar.mainAccount"));
  if (!list.some((a) => a.show)) return null;
  return (
    <div className="frow">
      <label htmlFor="filter-account">{t("topbar.account")}</label>
      <select id="filter-account" value={value} onChange={(e) => updateFilters({ account: e.target.value || null })}>
        <option value="">{t("topbar.allAccounts")}</option>
        <option value="main">{t("topbar.mainSuffix", { name: me })}</option>
        {list
          .filter((a) => a.show)
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        <option value="crossover">{t("topbar.crossover")}</option>
      </select>
    </div>
  );
}
