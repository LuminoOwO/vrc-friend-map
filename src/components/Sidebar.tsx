import { useMemo, useState } from "react";
import { useDerived } from "../derived";
import { CIRCLE_COLORS, fmtDate, relTime } from "../model";
import { addToCircle, createCircle, deleteCircle, patchCircle, setState, updateFilters, useApp } from "../store";
import { Icon } from "./Icon";

export function Sidebar() {
  const circles = useApp((s) => s.local.circles);
  const filters = useApp((s) => s.filters);
  const friendLog = useApp((s) => s.local.friendLog);
  const logSince = useApp((s) => s.local.logSince);
  const cache = useApp((s) => s.cache);
  const { friends, edges } = useDerived();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

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
      <section>
        <h3>Overview</h3>
        <div className="stat-grid">
          <div>
            <b>{friends.length}</b>
            <span>friends</span>
          </div>
          <div>
            <b className="online">{stats.online}</b>
            <span>in VRChat</span>
          </div>
          <div>
            <b>{stats.web}</b>
            <span>web / app</span>
          </div>
          <div>
            <b>{edges.length}</b>
            <span>connections</span>
          </div>
        </div>
        {friends.length > 0 && (stats.mutualsLoaded < friends.length || stats.profilesLoaded < friends.length) && (
          <p className="muted small">
            Loaded {stats.profilesLoaded}/{friends.length} profiles and {stats.mutualsLoaded}/{friends.length} mutual lists.
          </p>
        )}
      </section>

      <section>
        <div className="section-head">
          <h3>Circles</h3>
          {filters.circleId && (
            <button className="btn link small" onClick={() => updateFilters({ circleId: null })}>
              Show everyone
            </button>
          )}
        </div>
        <p className="muted small">Your own groups. They can overlap. Drag people onto a circle here, or into its outline on the map.</p>
        <ul className="circle-list">
          {circles.map((c, i) => (
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
              <button
                className="swatch"
                style={{ background: c.color }}
                title="Change color"
                onClick={() => patchCircle(c.id, { color: CIRCLE_COLORS[(CIRCLE_COLORS.indexOf(c.color) + 1) % CIRCLE_COLORS.length] ?? CIRCLE_COLORS[i % CIRCLE_COLORS.length] })}
              />
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
                  title="Show only this circle (double-click to rename)"
                  onClick={() => updateFilters({ circleId: filters.circleId === c.id ? null : c.id })}
                  onDoubleClick={() => setEditing(c.id)}
                >
                  {c.name}
                </button>
              )}
              <span className="count">{c.members.filter((m) => cache.friends[m]).length}</span>
              <button className="icon-btn tiny" title={c.hidden ? "Show outline on map" : "Hide outline on map"} onClick={() => patchCircle(c.id, { hidden: !c.hidden })}>
                <Icon name={c.hidden ? "eyeOff" : "eye"} size={14} />
              </button>
              <button className="icon-btn tiny" title="Rename" onClick={() => setEditing(c.id)}>
                <Icon name="tag" size={14} />
              </button>
              <button className="icon-btn tiny danger" title="Delete circle" onClick={() => deleteCircle(c.id)}>
                <Icon name="trash" size={14} />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createCircle(name);
            setName("");
          }}
        >
          <input value={name} placeholder="New circle name" onChange={(e) => setName(e.target.value)} />
          <button className="btn" type="submit" disabled={!name.trim()} title="Create circle">
            <Icon name="plus" size={16} />
          </button>
        </form>
      </section>

      <section>
        <h3>Friend changes</h3>
        {logSince ? <p className="muted small">Friends added or removed since {fmtDate(logSince)}.</p> : null}
        {friendLog.length === 0 ? (
          <p className="muted small">No adds or removals seen yet.</p>
        ) : (
          <ul className="log">
            {[...friendLog]
              .reverse()
              .slice(0, 30)
              .map((e, i) => (
                <li key={`${e.id}-${e.t}-${i}`}>
                  <span className={e.type === "added" ? "added" : "removed"}>{e.type === "added" ? "+" : "−"}</span>
                  <button className="btn link" disabled={!cache.friends[e.id]} onClick={() => setState({ selectedId: e.id })}>
                    {cache.friends[e.id]?.displayName ?? e.name}
                  </button>
                  <span className="muted small">{relTime(e.t)}</span>
                </li>
              ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
