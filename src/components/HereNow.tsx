// "Here now": everyone in your VRChat instance, from the live game log.
// Friends first, then people who aren't friends yet; one click opens them.
import { useEffect, useMemo, useState } from "react";
import { imgSrc } from "../backend";
import { othersHere } from "../live";
import { iconUrl } from "../model";
import { wantProfiles } from "../people";
import { setState, updateMap, useApp } from "../store";
import { Icon } from "./Icon";

const PROFILE_LIMIT = 25;

export function HereNow() {
  const here = useApp((s) => s.here);
  const cache = useApp((s) => s.cache);
  const selectedId = useApp((s) => s.selectedId);
  const showOthers = useApp((s) => s.settings.map.showOthers);
  const view = useApp((s) => s.view);
  const [open, setOpen] = useState(true);

  const people = useMemo(() => {
    const list = othersHere(here, cache.me?.id);
    const friends = list.filter((p) => cache.friends[p.id]);
    const others = list.filter((p) => !cache.friends[p.id]);
    return { friends, others };
  }, [here, cache.friends, cache.me]);

  // Names come from the log; pictures for people who aren't friends load slowly.
  useEffect(() => {
    if (open) wantProfiles(people.others.slice(0, PROFILE_LIMIT).map((p) => p.id));
  }, [open, people.others]);

  if (!here?.active) return null;
  const count = people.friends.length + people.others.length;
  const world = here.worldName || cache.worlds?.[here.worldId]?.name || "this instance";
  const chip = (id: string, name: string, friend: boolean) => {
    const f = cache.friends[id] ?? cache.others?.[id];
    const pic = f ? imgSrc(iconUrl(f)) : undefined;
    return (
      <button
        key={id}
        className={`here-chip ${friend ? "friend" : "other"} ${selectedId === id ? "on" : ""}`}
        onClick={() => setState({ selectedId: id })}
        title={friend ? name : `${name} (not a friend yet)`}
      >
        {pic ? <img src={pic} alt="" loading="lazy" /> : <span className="here-initial">{name.slice(0, 1).toUpperCase()}</span>}
        <span className="here-name">{f?.displayName ?? name}</span>
      </button>
    );
  };

  return (
    <div className={`here-now ${open ? "" : "closed"} ${view === "graph" ? "" : "docked"}`} role="region" aria-label="People in your instance">
      <button className="here-head" onClick={() => setOpen(!open)} aria-expanded={open} title={open ? "Hide" : "Show who's here"}>
        <span className="here-dot" />
        <b>{world}</b>
        <span className="muted">
          {count === 0 ? "just you" : `${count} with you`}
          {people.friends.length > 0 && count > 0 ? ` · ${people.friends.length} friend${people.friends.length === 1 ? "" : "s"}` : ""}
        </span>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={14} />
      </button>
      {open && people.others.length > 0 && view === "graph" && (
        <label className="here-toggle check small" title="Show people who aren't friends yet on the map">
          <input type="checkbox" checked={showOthers !== "off"} onChange={(e) => updateMap({ showOthers: e.target.checked ? "here" : "off" })} />
          Show the {people.others.length} who aren't friends on the map
        </label>
      )}
      {open && count > 0 && (
        <div className="here-list">
          {people.friends.map((p) => chip(p.id, p.name, true))}
          {people.friends.length > 0 && people.others.length > 0 && <span className="here-sep" />}
          {people.others.map((p) => chip(p.id, p.name, false))}
        </div>
      )}
    </div>
  );
}
