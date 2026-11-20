// Insights: what changed since you were last here, missed notifications,
// pending friend requests, friend groups from the map (→ circles), bridges,
// drifting apart, a path between two people, comparing two friends, and the
// friend list over time.
import { useMemo, useState } from "react";
import { backend, imgSrc } from "../backend";
import { clearMissed, dismissPreviousVisit, markAllRead, previousVisit, useHistory } from "../history";
import { bridges, clusters, compare, driftingApart, friendGraph, listOverTime, shortestPath } from "../insights";
import { iconUrl } from "../model";
import { setFriendRequest } from "../people";
import { shownName } from "../personal";
import { createCircle, setState, showToast, updateSettings, useApp } from "../store";
import { EVENT_LABEL } from "../notifications";
import { Icon } from "./Icon";
import { Range } from "./Range";

export function InsightsView() {
  return (
    <div className="activity-view insights">
      <SinceLastHere />
      <Missed />
      <PendingRequests />
      <FriendGroups />
      <PathAndCompare />
      <Drifting />
      <ListOverTime />
    </div>
  );
}

function Face({ id }: { id: string }) {
  const f = useApp((s) => s.cache.friends[id] ?? s.cache.others?.[id]);
  const src = f ? imgSrc(iconUrl(f)) : "";
  return (
    <button className="face-btn" title={shownName(id, id)} onClick={() => setState({ selectedId: id })}>
      <span className="face">{src ? <img src={src} alt="" /> : (shownName(id, "?")[0] ?? "?")}</span>
      <span className="face-name">{shownName(id, id)}</span>
    </button>
  );
}

function People({ ids, max = 12 }: { ids: string[]; max?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? ids : ids.slice(0, max);
  return (
    <div className="people-row">
      {shown.map((id) => (
        <Face key={id} id={id} />
      ))}
      {ids.length > max && (
        <button className="btn small ghost" onClick={() => setAll(!all)}>
          {all ? "Less" : `+${ids.length - max} more`}
        </button>
      )}
    </div>
  );
}

function SinceLastHere() {
  useHistory((h) => h.lastOpen?.t);
  const v = previousVisit();
  if (!v) return null;
  return (
    <section className="insight-card">
      <div className="row between">
        <h3>
          <Icon name="clock" size={16} /> Since you were last here ({new Date(v.since).toLocaleString()})
        </h3>
        <button className="icon-btn small" title="Dismiss" onClick={dismissPreviousVisit}>
          <Icon name="close" size={14} />
        </button>
      </div>
      {v.added.length > 0 && (
        <>
          <p className="small">New friends ({v.added.length}):</p>
          <People ids={v.added} />
        </>
      )}
      {v.removed.length > 0 && <p className="small">No longer friends: {v.removed.map((r) => r.name).join(", ")}</p>}
      {v.renamed.length > 0 && <p className="small">Renamed: {v.renamed.map((r) => `${r.from} → ${r.to}`).join(", ")}</p>}
      {v.cameOnline.length > 0 && (
        <>
          <p className="small">Came online ({v.cameOnline.length}):</p>
          <People ids={v.cameOnline} max={10} />
        </>
      )}
    </section>
  );
}

function Missed() {
  const missed = useHistory((h) => h.missed);
  const [all, setAll] = useState(false);
  if (!missed.length) return null;
  const list = [...missed].reverse().filter((m) => all || m.why);
  const unread = missed.filter((m) => m.why && !m.read).length;
  return (
    <section className="insight-card" id="missed">
      <div className="row between">
        <h3>
          <Icon name="bell" size={16} /> Notifications {unread > 0 && <span className="badge">{unread}</span>}
        </h3>
        <div className="row tight">
          <label className="check small">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Also the ones shown
          </label>
          {unread > 0 && (
            <button className="btn small" onClick={markAllRead}>
              Mark read
            </button>
          )}
          <button className="btn small ghost" onClick={clearMissed}>
            Clear
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="small muted">Nothing missed: everything was shown when it happened.</p>
      ) : (
        <ul className="missed-list">
          {list.slice(0, 100).map((m, i) => (
            <li key={`${m.t}-${i}`} className={m.read || !m.why ? "read" : ""}>
              <span className="muted small">{new Date(m.t).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <button className="link-btn" onClick={() => setState({ selectedId: m.userId })}>
                {m.text}
              </button>
              <span className="muted small">
                {EVENT_LABEL[m.event]}
                {m.why === "quiet" ? " · during quiet hours" : m.why === "muted" ? " · while muted" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PendingRequests() {
  const demo = useApp((s) => s.demo);
  const [list, setList] = useState<{ id: string; name: string; t: number }[] | null>(null);
  const [err, setErr] = useState("");
  const load = () => {
    setErr("");
    backend
      .vrcGet("/auth/user/notifications", { type: "friendRequest", sent: true, n: 100 })
      .then((r) => {
        if (r.status !== 200 || !Array.isArray(r.data)) throw new Error(`VRChat: ${r.status}`);
        const rows = (r.data as { receiverUserId?: string; senderUserId?: string; created_at?: string; details?: unknown }[])
          .map((n) => ({ id: n.receiverUserId ?? "", name: "", t: Date.parse(n.created_at ?? "") || 0 }))
          .filter((n) => n.id.startsWith("usr_"));
        setList(rows);
      })
      .catch((e) => setErr(String(e instanceof Error ? e.message : e)));
  };
  if (demo) return null;
  return (
    <section className="insight-card">
      <div className="row between">
        <h3>
          <Icon name="user-plus" size={16} /> Friend requests you sent
        </h3>
        <button className="btn small" onClick={load}>
          {list ? "Reload" : "Load"}
        </button>
      </div>
      {err && <p className="small warn">{err}</p>}
      {list && list.length === 0 && <p className="small muted">None waiting.</p>}
      {list && list.length > 0 && (
        <ul className="missed-list">
          {list
            .sort((a, b) => a.t - b.t)
            .map((r) => (
              <li key={r.id}>
                <Face id={r.id} />
                <span className="muted small">{r.t ? `sent ${new Date(r.t).toLocaleDateString()}` : ""}</span>
                <button
                  className="btn small"
                  onClick={async () => {
                    const e = await setFriendRequest(r.id, false);
                    if (e) showToast(e);
                    else setList((l) => (l ? l.filter((x) => x.id !== r.id) : l));
                  }}
                >
                  Cancel request
                </button>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

function FriendGroups() {
  const friends = useApp((s) => s.cache.friends);
  const mutuals = useApp((s) => s.cache.mutuals);
  const circles = useApp((s) => s.local.circles);
  const [resolution, setResolution] = useState(1);
  const g = useMemo(() => friendGraph({ friends, mutuals }), [friends, mutuals]);
  const groups = useMemo(() => clusters(g, resolution, 3), [g, resolution]);
  const br = useMemo(() => bridges(g, groups).slice(0, 12), [g, groups]);
  if (!groups.length) return null;
  const covered = (m: string[]) => circles.find((c) => m.filter((x) => c.members.includes(x)).length >= m.length * 0.7);
  return (
    <section className="insight-card">
      <div className="row between">
        <h3>
          <Icon name="users" size={16} /> Friend groups on your map
        </h3>
        <label className="small row tight">
          Bigger
          <Range min={0.5} max={2} step={0.1} value={resolution} onChange={(e) => setResolution(Number(e.target.value))} />
          Smaller
        </label>
      </div>
      <p className="small muted">Found from who is friends with whom (mutual friends). Make any of them a circle with one click.</p>
      <div className="group-list">
        {groups.slice(0, 12).map((m, i) => {
          const c = covered(m);
          return (
            <div key={i} className="group-item">
              <div className="row between">
                <b>
                  Group {i + 1} · {m.length} people
                </b>
                {c ? (
                  <span className="small muted">mostly your circle “{c.name}”</span>
                ) : (
                  <button
                    className="btn small"
                    onClick={() => {
                      const name = window.prompt("Name for the new circle", `${shownName(m[0])}'s group`);
                      if (name) createCircle(name, m);
                    }}
                  >
                    <Icon name="plus" size={14} /> Make a circle
                  </button>
                )}
              </div>
              <People ids={m} max={8} />
            </div>
          );
        })}
      </div>
      {br.length > 0 && (
        <>
          <h4>Bridges</h4>
          <p className="small muted">People who connect two or more of these groups.</p>
          <ul className="missed-list">
            {br.map((b) => (
              <li key={b.id}>
                <Face id={b.id} />
                <span className="small muted">connects {b.groups.map((x) => `group ${x.index + 1} (${x.links})`).join(", ")}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function PersonSelect({ value, onChange, label }: { value: string | null; onChange: (id: string | null) => void; label: string }) {
  const friends = useApp((s) => s.cache.friends);
  const me = useApp((s) => s.cache.me);
  const list = useMemo(() => Object.values(friends).sort((a, b) => a.displayName.localeCompare(b.displayName)), [friends]);
  return (
    <label className="field narrow">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Pick someone…</option>
        {me && <option value={me.id}>You ({me.displayName})</option>}
        {list.map((f) => (
          <option key={f.id} value={f.id}>
            {shownName(f.id, f.displayName)}
          </option>
        ))}
      </select>
    </label>
  );
}

function PathAndCompare() {
  const friends = useApp((s) => s.cache.friends);
  const mutuals = useApp((s) => s.cache.mutuals);
  const me = useApp((s) => s.cache.me?.id);
  const [a, b] = useApp((s) => s.pickPair);
  const set = (i: 0 | 1, v: string | null) => setState((s) => ({ pickPair: (i === 0 ? [v, s.pickPair[1]] : [s.pickPair[0], v]) as [string | null, string | null] }));
  const g = useMemo(() => {
    const graph = friendGraph({ friends, mutuals });
    // You're connected to every friend.
    if (me) {
      graph.set(me, new Set(Object.keys(friends)));
      for (const id of Object.keys(friends)) graph.get(id)!.add(me);
    }
    return graph;
  }, [friends, mutuals, me]);
  const path = a && b ? shortestPath(g, a, b) : null;
  const cmp = a && b && a !== me && b !== me ? compare(g, a, b) : null;
  return (
    <section className="insight-card">
      <h3>
        <Icon name="route" size={16} /> Two people
      </h3>
      <div className="row">
        <PersonSelect label="First" value={a} onChange={(v) => set(0, v)} />
        <PersonSelect label="Second" value={b} onChange={(v) => set(1, v)} />
      </div>
      {a && b && (
        <>
          <h4>Path between them</h4>
          {path ? (
            <div className="path-row">
              {path.map((id, i) => (
                <span key={id} className="path-step">
                  {i > 0 && <Icon name="chevron-right" size={14} />}
                  <Face id={id} />
                </span>
              ))}
            </div>
          ) : (
            <p className="small muted">No chain of friends found (mutuals may be hidden).</p>
          )}
          {cmp && (
            <>
              <h4>Friends in common: {cmp.both.length}</h4>
              <People ids={cmp.both} />
              <div className="compare-cols">
                <div>
                  <h4>Only {shownName(a)}: {cmp.onlyA.length}</h4>
                  <People ids={cmp.onlyA} max={8} />
                </div>
                <div>
                  <h4>Only {shownName(b)}: {cmp.onlyB.length}</h4>
                  <People ids={cmp.onlyB} max={8} />
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function Drifting() {
  const on = useApp((s) => s.settings.insights.drifting);
  const stats = useApp((s) => s.logs.stats);
  const friends = useApp((s) => s.cache.friends);
  const list = useMemo(() => (on && stats ? driftingApart(stats.people.filter((p) => friends[p.id])).slice(0, 20) : []), [on, stats, friends]);
  return (
    <section className="insight-card">
      <div className="row between">
        <h3>
          <Icon name="heart" size={16} /> Drifting apart
        </h3>
        <label className="check small">
          <input type="checkbox" checked={on} onChange={(e) => updateSettings({ insights: { drifting: e.target.checked } })} /> Show
        </label>
      </div>
      {!on ? (
        <p className="small muted">Off by default. When on: friends you spent a lot of time with (from your game logs) but haven't been with for over 6 weeks, so you can reconnect. Only on this device, never shared.</p>
      ) : list.length ? (
        <ul className="missed-list">
          {list.map((d) => (
            <li key={d.id}>
              <Face id={d.id} />
              <span className="small muted">
                {Math.round(d.hours)} h together, last {new Date(d.last).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">{stats ? "Nobody: you've seen everyone you spend time with recently." : "Needs game logs (Settings → Game logs)."}</p>
      )}
    </section>
  );
}

function ListOverTime() {
  const friends = useApp((s) => s.cache.friends);
  const log = useApp((s) => s.local.friendLog);
  const since = useApp((s) => s.local.logSince);
  const months = useMemo(() => listOverTime(Object.keys(friends), log, since).slice(-24), [friends, log, since]);
  if (months.length < 2) return null;
  const max = Math.max(...months.map((m) => m.size), 1);
  const maxChange = Math.max(...months.map((m) => Math.max(m.added, m.removed)), 1);
  return (
    <section className="insight-card">
      <h3>
        <Icon name="chart" size={16} /> Your friend list over time
      </h3>
      <div className="month-chart" role="img" aria-label="Friend list size per month">
        {months.map((m) => (
          <div key={m.month} className="month" title={`${m.month}: ${m.size} friends, +${m.added} / −${m.removed}`}>
            <span className="month-size">{m.size}</span>
            <span className="month-bar" style={{ height: `${(m.size / max) * 100}%` }} />
            <span className="month-change">
              <span className="plus" style={{ height: `${(m.added / maxChange) * 24}px` }} />
              <span className="minus" style={{ height: `${(m.removed / maxChange) * 24}px` }} />
            </span>
            <span className="month-label">{m.month.slice(2)}</span>
          </div>
        ))}
      </div>
      <p className="small muted">Bars: friends at the end of each month. Green / red: added / removed that month. Since the app started keeping the log ({new Date(since).toLocaleDateString()}).</p>
    </section>
  );
}

/** Missed notification count for the top bar. */
export function useUnreadMissed(): number {
  return useHistory((h) => h.missed.filter((m) => m.why && !m.read).length);
}
