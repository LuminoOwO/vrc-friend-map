// "Who's here": everyone in your VRChat instance, from the live game log.
// A readable list (friends first), one row of pictures, or just a button:
// Map options' choice, switched with the buttons in its header.
import { useEffect, useMemo, useState } from "react";
import { imgSrc } from "../backend";
import { othersHere } from "../live";
import { naiveToDate } from "../logs";
import { iconUrl, presenceLabel, presenceOf, statusColor } from "../model";
import { isBlocked, refreshModerations, wantProfiles } from "../people";
import { setState, updateMap, updatePeople, useApp } from "../store";
import type { Cache, LivePlayer } from "../types";
import { Icon } from "./Icon";

const PROFILE_LIMIT = 25;

function since(ts: number, now: number): string {
  const mins = Math.max(0, Math.round((now - naiveToDate(ts).getTime()) / 60000));
  if (mins < 1) return "just joined";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h} h ${mins % 60 ? `${mins % 60} min` : ""}`.trim();
}

function detailLine(id: string, friend: boolean, cache: Cache): string {
  const f = cache.friends[id] ?? cache.others?.[id];
  if (friend && f) {
    const mutual = cache.mutuals[id];
    const p = presenceOf(f, cache.presence);
    const bits = [f.statusDescription || presenceLabel(f, p)];
    if (mutual && !mutual.hidden) bits.push(`${mutual.count} mutual${mutual.count === 1 ? "" : "s"}`);
    return bits.filter(Boolean).join(" · ");
  }
  const mutual = cache.mutuals[id]?.count ?? 0;
  const bits = ["Not a friend yet"];
  if (mutual) bits.push(`${mutual} friend${mutual === 1 ? "" : "s"} in common`);
  if (f?.statusDescription) bits.push(f.statusDescription);
  return bits.join(" · ");
}

export function HereNow() {
  const here = useApp((s) => s.here);
  const cache = useApp((s) => s.cache);
  const selectedId = useApp((s) => s.selectedId);
  const showOthers = useApp((s) => s.settings.map.showOthers);
  const mode = useApp((s) => s.settings.map.hereView);
  const view = useApp((s) => s.view);
  const loadEveryone = useApp((s) => s.settings.people.loadEveryone);
  const showBlocked = useApp((s) => s.settings.people.showBlocked);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const people = useMemo(() => {
    const list = othersHere(here, cache.me?.id);
    const friends = list.filter((p) => cache.friends[p.id]);
    const others = list.filter((p) => !cache.friends[p.id] && (showBlocked || !isBlocked(cache, p.id)));
    const blocked = list.filter((p) => !cache.friends[p.id] && isBlocked(cache, p.id)).length;
    return { friends, others, blocked };
  }, [here, cache, showBlocked]);

  useEffect(() => {
    if (here?.active) void refreshModerations();
  }, [here?.active]);

  // Names come from the log; pictures for people who aren't friends load slowly
  // (everyone's with Settings → People → "Load everyone's profile").
  useEffect(() => {
    if (loadEveryone) wantProfiles(people.others.map((p) => p.id));
    else if (mode !== "hidden") wantProfiles(people.others.slice(0, PROFILE_LIMIT).map((p) => p.id));
  }, [mode, people.others, loadEveryone]);

  if (!here?.active) return null;
  const count = people.friends.length + people.others.length;
  const world = here.worldName || cache.worlds?.[here.worldId]?.name || "this instance";
  const setMode = (hereView: "list" | "compact" | "hidden") => updateMap({ hereView });
  const docked = view !== "graph";

  const q = query.trim().toLowerCase();
  const match = (p: LivePlayer) => !q || (cache.friends[p.id]?.displayName ?? cache.others?.[p.id]?.displayName ?? p.name).toLowerCase().includes(q);

  const summary = (
    <span className="here-summary">
      {count === 0 ? "just you" : `${count} with you`}
      {people.friends.length > 0 && count > 0 ? ` · ${people.friends.length} friend${people.friends.length === 1 ? "" : "s"}` : ""}
      {!showBlocked && people.blocked > 0 ? ` · ${people.blocked} blocked, hidden` : ""}
    </span>
  );

  if (mode === "hidden") {
    return (
      <button className={`here-pill ${docked ? "docked" : ""}`} onClick={() => setMode("list")} title="Show who's in your instance">
        <span className="here-dot" />
        <b>{world}</b>
        <span className="here-count">{count + 1}</span>
      </button>
    );
  }

  const face = (p: LivePlayer, friend: boolean) => {
    const f = cache.friends[p.id] ?? cache.others?.[p.id];
    const pic = f ? imgSrc(iconUrl(f)) : undefined;
    const name = f?.displayName ?? p.name;
    return (
      <button
        key={p.id}
        className={`here-face ${friend ? "friend" : "other"} ${selectedId === p.id ? "on" : ""}`}
        title={friend ? name : `${name} (not a friend yet)`}
        onClick={() => setState({ selectedId: p.id })}
      >
        {pic ? <img src={pic} alt="" loading="lazy" /> : <span>{name.slice(0, 1).toUpperCase()}</span>}
      </button>
    );
  };

  const row = (p: LivePlayer, friend: boolean) => {
    const f = cache.friends[p.id] ?? cache.others?.[p.id];
    const pic = f ? imgSrc(iconUrl(f)) : undefined;
    const name = f?.displayName ?? p.name;
    const blocked = !friend && isBlocked(cache, p.id);
    const ring = friend && f ? statusColor(f, presenceOf(f, cache.presence)) : undefined;
    return (
      <li key={p.id}>
        <button className={`here-row ${friend ? "friend" : "other"} ${selectedId === p.id ? "on" : ""} ${blocked ? "blocked" : ""}`} onClick={() => setState({ selectedId: p.id })}>
          <span className="here-pic" style={ring ? { borderColor: ring } : undefined}>
            {pic ? <img src={pic} alt="" loading="lazy" /> : <span>{name.slice(0, 1).toUpperCase()}</span>}
          </span>
          <span className="here-text">
            <span className="here-name">{name}</span>
            <span className="here-sub">{blocked ? "Blocked" : detailLine(p.id, friend, cache)}</span>
          </span>
          <span className="here-time" title="Time in this instance">
            {since(p.since, now)}
          </span>
        </button>
      </li>
    );
  };

  const friendsShown = people.friends.filter(match);
  const othersShown = people.others.filter(match);

  return (
    <section className={`here-now ${mode} ${docked ? "docked" : ""}`} aria-label="People in your instance">
      <header className="here-head">
        <span className="here-dot" />
        <span className="here-title">
          <b>{world}</b>
          {summary}
        </span>
        <span className="here-modes">
          <button className={`icon-btn small ${mode === "list" ? "on" : ""}`} title="Full list" onClick={() => setMode("list")}>
            <Icon name="menu" size={15} />
          </button>
          <button className={`icon-btn small ${mode === "compact" ? "on" : ""}`} title="Pictures only" onClick={() => setMode("compact")}>
            <Icon name="users" size={15} />
          </button>
          <button className="icon-btn small" title="Hide (a button stays)" onClick={() => setMode("hidden")}>
            <Icon name="chevron-up" size={15} />
          </button>
        </span>
      </header>

      {mode === "compact" && count > 0 && (
        <div className="here-faces">
          {people.friends.map((p) => face(p, true))}
          {people.friends.length > 0 && people.others.length > 0 && <span className="here-sep" />}
          {people.others.map((p) => face(p, false))}
        </div>
      )}

      {mode === "list" && (
        <>
          {count > 10 && (
            <input className="here-search" value={query} placeholder={`Find someone among ${count}`} onChange={(e) => setQuery(e.target.value)} />
          )}
          <div className="here-scroll">
            {friendsShown.length > 0 && (
              <>
                <h4>Friends · {friendsShown.length}</h4>
                <ul>{friendsShown.map((p) => row(p, true))}</ul>
              </>
            )}
            {othersShown.length > 0 && (
              <>
                <h4>Not friends yet · {othersShown.length}</h4>
                <ul>{othersShown.map((p) => row(p, false))}</ul>
              </>
            )}
            {count === 0 && <p className="small muted here-empty">Nobody else is here right now.</p>}
            {count > 0 && !friendsShown.length && !othersShown.length && <p className="small muted here-empty">Nobody here matches “{query}”.</p>}
          </div>
          {people.others.length > 0 && (
            <div className="here-options">
              {!docked && (
                <label className="check small" title="Show people who aren't friends yet on the map">
                  <input type="checkbox" checked={showOthers !== "off"} onChange={(e) => updateMap({ showOthers: e.target.checked ? "here" : "off" })} />
                  Show the {people.others.length} who aren't friends on the map
                </label>
              )}
              {people.others.length > PROFILE_LIMIT && (
                <label className="check small" title="Pictures and profiles load one by one, a few seconds apart, to go easy on VRChat">
                  <input type="checkbox" checked={loadEveryone} onChange={(e) => updatePeople({ loadEveryone: e.target.checked })} />
                  Load everyone's profile{loadEveryone ? "" : ` (now: first ${PROFILE_LIMIT})`}
                </label>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
