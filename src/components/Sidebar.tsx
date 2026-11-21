import { t as tr } from "../i18n";
import { useMemo, useState } from "react";
import { shareCircle } from "../sharedcircles";
import { duplicateColorIds, pickCircleColor } from "../colors";
import { useDerived } from "../derived";
import { relTime } from "../model";
import { addToCircle, createCircle, deleteCircle, getState, patchCircle, setState, updateFilters, updateLocal, useApp } from "../store";
import { IN_GAME_STATUSES } from "../model";
import { ColorPicker } from "./ColorPicker";
import { FilterChip, clearAll, statusToggle } from "./FilterChip";
import { Icon } from "./Icon";
import { SuggestedGroups } from "./SuggestedGroups";
import { HereNow } from "./HereNow";
import { ActivityText, KIND_ICON, friendLogEntries, useActivityLoaded } from "./ActivityView";

export function Sidebar() {
  const circles = useApp((s) => s.local.circles);
  const herePlace = useApp((s) => s.settings.map.herePlace);
  const filters = useApp((s) => s.filters);
  const cache = useApp((s) => s.cache);
  const { friends, edges } = useDerived();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const sharedCircles = useApp((s) => s.local.sharedCircles);
  const dupes = useMemo(() => duplicateColorIds(circles), [circles]);

  const fixDuplicates = () => {
    updateLocal((l) => {
      const ids = new Set(duplicateColorIds(l.circles));
      const used = l.circles.filter((c) => !ids.has(c.id)).map((c) => c.color);
      return {
        ...l,
        circles: l.circles.map((c) => {
          if (!ids.has(c.id)) return c;
          const color = pickCircleColor(used);
          used.push(color);
          return { ...c, color };
        }),
      };
    });
  };

  const stats = useMemo(() => {
    let online = 0;
    let web = 0;
    for (const f of friends) {
      const p = cache.presence[f.id];
      if (p === "online") online++;
      else if (p === "web") web++;
    }
    const mutualsLoaded = friends.filter((f) => cache.mutuals[f.id]).length;
    const profilesLoaded = friends.filter((f) => cache.details[f.id]).length;
    return { online, web, mutualsLoaded, profilesLoaded };
  }, [friends, cache.presence, cache.mutuals, cache.details]);

  const onDrop = (circleId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove("drop-hover");
    const id = e.dataTransfer.getData("text/vrc-user");
    if (id) addToCircle(circleId, id);
  };

  return (
    <aside className="sidebar">
      {herePlace === "sidebar" && <HereNow inSidebar />}
      <section>
        <h3>{tr("sidebar.overview")}</h3>
        <div className="stat-grid">
          <FilterChip patch={clearAll} active={false} title={tr("sidebar.showEveryoneClearsAllFilters")}>
            <b>{friends.length}</b>
            <span>friends</span>
          </FilterChip>
          <FilterChip
            patch={() => statusToggle(IN_GAME_STATUSES, "set")}
            active={IN_GAME_STATUSES.every((k) => filters.statuses.includes(k)) && filters.statuses.length === IN_GAME_STATUSES.length}
            title={tr("sidebar.onlyPeopleInVrchatRight")}
          >
            <b className="online">{stats.online}</b>
            <span>{tr("sidebar.inVrchat")}</span>
          </FilterChip>
          <FilterChip
            patch={() => statusToggle(["web"], "set")}
            active={filters.statuses.length === 1 && filters.statuses[0] === "web"}
            title={tr("sidebar.onlyPeopleOnTheWebsite")}
          >
            <b>{stats.web}</b>
            <span>{tr("sidebar.webApp")}</span>
          </FilterChip>
          <div className="stat-static">
            <b>{edges.length}</b>
            <span>connections</span>
          </div>
        </div>
        {friends.length > 0 && (stats.mutualsLoaded < friends.length || stats.profilesLoaded < friends.length) && (
          <p className="muted small">
            {tr("sidebar.loadedProfilesloadedLengthProfilesAnd", { profilesLoaded: stats.profilesLoaded, length: friends.length, mutualsLoaded: stats.mutualsLoaded })}
          </p>
        )}
      </section>

      <section>
        <div className="section-head">
          <h3>{tr("sidebar.circles")}</h3>
          {filters.circleId && (
            <button className="btn link small" onClick={() => updateFilters({ circleId: null })}>
              {tr("sidebar.showEveryone")}
            </button>
          )}
        </div>
        <p className="muted small">{tr("sidebar.yourOwnGroupsTheyCan")}</p>
        {dupes.length > 0 && (
          <p className="small dupe-note">
            {dupes.length === 1 ? tr("sidebar.oneCircleShares") : tr("sidebar.lengthCirclesShare", { length: dupes.length })} a color with another.{" "}
            <button className="btn link small" onClick={fixDuplicates}>
              {tr("sidebar.giveEachItsOwnColor")}
            </button>
          </p>
        )}
        <ul className="circle-list">
          {circles.map((c) => (
            <li
              key={c.id}
              className={`circle-item ${filters.circleId === c.id ? "active" : ""}`}
              data-circle-drop={c.id}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("text/vrc-user")) {
                  e.preventDefault();
                  e.currentTarget.classList.add("drop-hover");
                }
              }}
              onDragLeave={(e) => e.currentTarget.classList.remove("drop-hover")}
              onDrop={onDrop(c.id)}
            >
              <span className="swatch-wrap">
                <button className="swatch" style={{ background: c.color }} title={tr("sidebar.changeColor")} onClick={() => setPicking(picking === c.id ? null : c.id)} />
                {picking === c.id && (
                  <ColorPicker
                    value={c.color}
                    others={getState().local.circles.filter((o) => o.id !== c.id).map((o) => o.color)}
                    onPick={(color) => patchCircle(c.id, { color })}
                    onClose={() => setPicking(null)}
                  />
                )}
              </span>
              {editing === c.id ? (
                <input
                  className="rename"
                  autoFocus
                  defaultValue={c.name}
                  onBlur={(e) => {
                    patchCircle(c.id, { name: e.target.value.trim() || c.name });
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
              ) : (
                <button
                  className="circle-name"
                  title={tr("sidebar.showOnlyThisCircleDouble")}
                  onClick={() => updateFilters({ circleId: filters.circleId === c.id ? null : c.id })}
                  onDoubleClick={() => setEditing(c.id)}
                >
                  {c.name}
                  {c.auto && (
                    <span className="auto-tag" title={tr("sidebar.madeFromYourGameLogs")}>
                      auto
                    </span>
                  )}
                </button>
              )}
              <span className="count">{c.members.filter((m) => cache.friends[m]).length}</span>
              <button className="icon-btn tiny" title={c.hidden ? tr("sidebar.showOutlineOnMap") : tr("sidebar.hideOutlineOnMap")} onClick={() => patchCircle(c.id, { hidden: !c.hidden })}>
                <Icon name={c.hidden ? "eyeOff" : "eye"} size={14} />
              </button>
              <button className="icon-btn tiny" title={tr("sidebar.rename")} onClick={() => setEditing(c.id)}>
                <Icon name="tag" size={14} />
              </button>
              <button
                className={`icon-btn tiny ${sharedCircles?.[c.id] ? "on" : ""}`}
                title={sharedCircles?.[c.id] ? tr("sidebar.sharedWithValueFriendS", { value: sharedCircles[c.id].with.length }) : tr("sidebar.shareWithFriendsToEdit")}
                onClick={() => setSharing(c.id)}
              >
                <Icon name="share" size={14} />
              </button>
              <button className="icon-btn tiny danger" title={tr("sidebar.deleteCircle")} onClick={() => deleteCircle(c.id)}>
                <Icon name="trash" size={14} />
              </button>
            </li>
          ))}
        </ul>
        {sharing && <ShareCircleDialog circleId={sharing} onClose={() => setSharing(null)} />}
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createCircle(name);
            setName("");
          }}
        >
          <input value={name} placeholder={tr("sidebar.newCircleName")} onChange={(e) => setName(e.target.value)} />
          <button className="btn" type="submit" disabled={!name.trim()} title={tr("sidebar.createCircle")}>
            <Icon name="plus" size={16} />
          </button>
        </form>
      </section>

      <SuggestedGroups />

      <RecentActivity />
    </aside>
  );
}

/** The latest things from the Activity tab (arrivals in a new instance left out). */
function RecentActivity() {
  useActivityLoaded();
  const activity = useApp((s) => s.activity);
  const friendLog = useApp((s) => s.local.friendLog);
  const recent = useMemo(
    () =>
      [...activity.filter((e) => !e.initial && e.kind !== "friend-add" && e.kind !== "friend-remove"), ...friendLogEntries(friendLog.slice(-20))]
        .sort((a, b) => b.t - a.t)
        .slice(0, 25),
    [activity, friendLog],
  );
  return (
    <section>
      <div className="row between">
        <h3>{tr("sidebar.activity")}</h3>
        <button className="btn link small" onClick={() => setState({ view: "activity" })}>
          {tr("sidebar.seeAll")}
        </button>
      </div>
      {recent.length === 0 ? (
        <p className="muted small">{tr("sidebar.nothingYetFriendsComingOnline")}</p>
      ) : (
        <ul className="log side-activity">
          {recent.map((e) => (
            <li key={e.key} className={`act-${e.kind}`} title={new Date(e.t).toLocaleString()}>
              <Icon name={KIND_ICON[e.kind]} size={13} />
              <span className="act-text">
                <ActivityText e={e} />
              </span>
              <span className="muted small">{relTime(e.t)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Pick friends to edit a circle together with. */
function ShareCircleDialog({ circleId, onClose }: { circleId: string; onClose: () => void }) {
  const circle = useApp((s) => s.local.circles.find((c) => c.id === circleId));
  const info = useApp((s) => s.local.sharedCircles?.[circleId]);
  const friends = useApp((s) => s.cache.friends);
  const me = useApp((s) => s.cache.me?.id);
  const [picked, setPicked] = useState<string[]>(info?.with ?? []);
  const [q, setQ] = useState("");
  if (!circle) return null;
  const owner = !info || info.owner === me;
  const list = Object.values(friends)
    .filter((f) => !q || f.displayName.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(picked.includes(b.id)) - Number(picked.includes(a.id)) || a.displayName.localeCompare(b.displayName))
    .slice(0, 200);
  return (
    <div className="modal-backdrop top" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-labelledby="share-circle-title">
        <h2 id="share-circle-title">{tr("sidebar.editNameTogether", { name: circle.name })}</h2>
        <p className="small muted">
          {tr("sidebar.theCircleGoesAlongWith")}
        </p>
        {!owner && <p className="small">Shared with you by {friends[info!.owner]?.displayName ?? "a friend"}.</p>}
        <input placeholder={tr("sidebar.findAFriend")} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="picker-list">
          {list.map((f) => (
            <label key={f.id} className="check">
              <input type="checkbox" checked={picked.includes(f.id)} disabled={!owner} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, f.id] : p.filter((x) => x !== f.id)))} />
              {f.displayName}
            </label>
          ))}
        </div>
        <div className="row end">
          <button className="btn" onClick={onClose}>
            {tr("sidebar.cancel")}
          </button>
          {owner && (
            <button
              className="btn primary"
              onClick={() => {
                shareCircle(circleId, picked);
                onClose();
              }}
            >
              {picked.length ? tr("sidebar.shareWithLength", { length: picked.length }) : tr("sidebar.stopSharing")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
