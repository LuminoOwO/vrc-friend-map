import { useEffect, useMemo, useState } from "react";
import { clearActivity, demoActivity, loadActivity, type ActivityEntry, type ActivityKind } from "../activity";
import { isBlocked, wantProfiles } from "../people";
import { getState, setState, useApp } from "../store";
import { Icon } from "./Icon";

type Group = "instance" | "online" | "moving" | "list";

const GROUPS: { key: Group; label: string; kinds: ActivityKind[] }[] = [
  { key: "instance", label: "My instance", kinds: ["world", "join", "leave", "left", "quit", "crash"] },
  { key: "online", label: "Friends online / offline", kinds: ["online", "offline"] },
  { key: "moving", label: "Friends changing worlds", kinds: ["location"] },
  { key: "list", label: "Friends added / removed", kinds: ["friend-add", "friend-remove"] },
];

const KIND_ICON: Record<ActivityKind, string> = {
  world: "pin",
  join: "plus",
  leave: "logout",
  left: "logout",
  quit: "close",
  crash: "close",
  online: "play",
  offline: "pause",
  location: "pin",
  "friend-add": "user",
  "friend-remove": "trash",
};

function timeOf(t: number) {
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function dayOf(t: number) {
  const d = new Date(t);
  const today = new Date();
  const yest = new Date(Date.now() - 86400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

/** The Activity tab: a readable log of what happened around you. */
export function ActivityView() {
  const activity = useApp((s) => s.activity);
  const friends = useApp((s) => s.cache.friends);
  const myId = useApp((s) => s.cache.me?.id);
  const cache = useApp((s) => s.cache);
  const showBlocked = useApp((s) => s.settings.people.showBlocked);
  const demo = useApp((s) => s.demo);
  const liveOn = useApp((s) => s.settings.logs.enabled && s.settings.logs.live);
  const [groups, setGroups] = useState<Set<Group>>(() => new Set<Group>(["instance", "online", "list"]));
  const [arrivals, setArrivals] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void loadActivity();
    const s = getState();
    if (s.demo && !s.activity.length) {
      const ids = Object.keys(s.cache.friends);
      const names = Object.fromEntries(ids.map((id) => [id, s.cache.friends[id].displayName]));
      setState({ activity: demoActivity(names, ids) });
    }
  }, [demo]);

  const kinds = useMemo(() => new Set(GROUPS.filter((g) => groups.has(g.key)).flatMap((g) => g.kinds)), [groups]);

  const days = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = activity
      .filter((e) => kinds.has(e.kind))
      .filter((e) => arrivals || !e.initial)
      .filter((e) => showBlocked || !e.userId || friends[e.userId] || !isBlocked(cache, e.userId))
      .filter((e) => !q || (e.name ?? "").toLowerCase().includes(q) || (e.worldName ?? "").toLowerCase().includes(q))
      .slice()
      .reverse();
    const out: { day: string; items: ActivityEntry[] }[] = [];
    for (const e of list) {
      const day = dayOf(e.t);
      if (!out.length || out[out.length - 1].day !== day) out.push({ day, items: [] });
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [activity, kinds, arrivals, search, showBlocked, cache, friends]);

  const toggle = (g: Group) =>
    setGroups((cur) => {
      const next = new Set(cur);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

  const open = (id?: string) => {
    if (!id || id === myId) return;
    if (!friends[id]) wantProfiles([id]);
    setState({ selectedId: id });
  };

  const who = (e: ActivityEntry) =>
    e.userId ? (
      <button className={`link-btn act-name ${e.userId && friends[e.userId] ? "friend" : ""}`} onClick={() => open(e.userId)}>
        {e.name ?? e.userId}
      </button>
    ) : null;

  const world = (e: ActivityEntry) => <b>{e.worldName || e.worldId || "a world"}</b>;

  const text = (e: ActivityEntry) => {
    switch (e.kind) {
      case "world":
        return <>You joined {world(e)}</>;
      case "join":
        return <>{who(e)} {e.initial ? "was here when you arrived" : "joined"}</>;
      case "leave":
        return <>{who(e)} left</>;
      case "left":
        return <>You left {world(e)}</>;
      case "quit":
        return <>VRChat closed</>;
      case "crash":
        return <>VRChat stopped without closing properly</>;
      case "online":
        return <>{who(e)} came online</>;
      case "offline":
        return <>{who(e)} went offline</>;
      case "location":
        return <>{who(e)} went to {world(e)}</>;
      case "friend-add":
        return <>{who(e)} is now your friend</>;
      case "friend-remove":
        return <>{who(e)} is no longer your friend</>;
    }
  };

  return (
    <div className="activity-view">
      <div className="activity-bar">
        {GROUPS.map((g) => (
          <button key={g.key} className={`chip-btn ${groups.has(g.key) ? "on" : ""}`} onClick={() => toggle(g.key)}>
            {g.label}
          </button>
        ))}
        <label className="check small">
          <input type="checkbox" checked={arrivals} onChange={(e) => setArrivals(e.target.checked)} />
          People already there when I arrived
        </label>
        <input className="activity-search" value={search} placeholder="Find a name or world" onChange={(e) => setSearch(e.target.value)} />
        {activity.length > 0 && (
          <button className="btn small" onClick={() => confirm("Clear the activity log on this device?") && clearActivity()}>
            Clear
          </button>
        )}
      </div>
      {!liveOn && !demo && (
        <p className="small muted activity-note">
          Joins, leaves and world changes need the game log (Settings → Game logs, “Show who's in my instance right now”), on the PC that
          runs VRChat. Friends coming online and going offline show up either way.
        </p>
      )}
      {days.length === 0 ? (
        <p className="muted activity-empty">Nothing yet. Things show up here as they happen, and stay for {4} days.</p>
      ) : (
        days.map((d) => (
          <section key={d.day} className="activity-day">
            <h3>{d.day}</h3>
            <ul>
              {d.items.map((e) => (
                <li key={e.key} className={`act act-${e.kind} ${e.initial ? "initial" : ""}`}>
                  <span className="act-time">{timeOf(e.t)}</span>
                  <Icon name={KIND_ICON[e.kind]} size={14} />
                  <span className="act-text">{text(e)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
