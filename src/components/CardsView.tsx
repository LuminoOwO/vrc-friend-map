import { useMemo, useState } from "react";
import { useDerived } from "../derived";
import { lastSeen, presenceOf, presenceRank, toTime } from "../model";
import { setState, useApp } from "../store";
import type { Circle, Friend } from "../types";
import { FriendCard } from "./FriendCard";

type SortKey = "status" | "lastSeen" | "name" | "mutuals" | "accountAge";

const SORTS: [SortKey, string][] = [
  ["status", "Status"],
  ["lastSeen", "Last online"],
  ["name", "Name"],
  ["mutuals", "Most mutuals"],
  ["accountAge", "Account age"],
];

export function CardsView() {
  const fresh = useApp((s) => s.fresh);
  const cache = useApp((s) => s.cache);
  const local = useApp((s) => s.local);
  const selectedId = useApp((s) => s.selectedId);
  const dimMode = useApp((s) => s.settings.dimMode);
  const { friends, matched } = useDerived();
  const [sort, setSort] = useState<SortKey>("status");
  const [grouped, setGrouped] = useState(true);
  const now = Date.now();

  const circlesByUser = useMemo(() => {
    const m = new Map<string, Circle[]>();
    for (const c of local.circles) for (const id of c.members) m.set(id, [...(m.get(id) ?? []), c]);
    return m;
  }, [local.circles]);

  const sorted = useMemo(() => {
    const list = friends.filter((f) => dimMode === "dim" || matched.has(f.id));
    const pres = (f: Friend) => presenceOf(f, cache.presence);
    const cmp: Record<SortKey, (a: Friend, b: Friend) => number> = {
      status: (a, b) => presenceRank(a, pres(a)) - presenceRank(b, pres(b)) || lastSeen(b) - lastSeen(a),
      lastSeen: (a, b) => (pres(b) !== "offline" ? now : lastSeen(b)) - (pres(a) !== "offline" ? now : lastSeen(a)),
      name: (a, b) => a.displayName.localeCompare(b.displayName),
      mutuals: (a, b) => (cache.mutuals[b.id]?.count ?? -1) - (cache.mutuals[a.id]?.count ?? -1),
      accountAge: (a, b) => (toTime(cache.details[a.id]?.date_joined) || Infinity) - (toTime(cache.details[b.id]?.date_joined) || Infinity),
    };
    const byMatch = (a: Friend, b: Friend) => Number(matched.has(b.id)) - Number(matched.has(a.id));
    return [...list].sort((a, b) => byMatch(a, b) || cmp[sort](a, b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friends, matched, sort, cache.presence, cache.mutuals, cache.details, dimMode]);

  const groups = useMemo(() => {
    if (!grouped) return [{ key: "all", label: "Everyone", items: sorted }];
    const g = { online: [] as Friend[], web: [] as Friend[], offline: [] as Friend[] };
    for (const f of sorted) g[presenceOf(f, cache.presence)].push(f);
    return [
      { key: "online", label: "In VRChat", items: g.online },
      { key: "web", label: "On the website or app", items: g.web },
      { key: "offline", label: "Offline", items: g.offline },
    ].filter((x) => x.items.length);
  }, [sorted, grouped, cache.presence]);

  const select = (id: string) => setState({ selectedId: id });

  if (!friends.length) return <div className="empty">No friends loaded yet.</div>;

  return (
    <div className="cards-view">
      <div className="cards-toolbar">
        <label>
          Sort by{" "}
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORTS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> Group by online status
        </label>
        <span className="muted">Drag a card onto a circle in the sidebar to add them.</span>
      </div>
      {groups.map((g) => (
        <section key={g.key} className="card-group">
          <h3>
            {g.label} <span className="muted">{g.items.length}</span>
          </h3>
          <div className="card-grid">
            {g.items.map((f) => (
              <FriendCard
                key={f.id}
                friend={f}
                presence={presenceOf(f, cache.presence)}
                detail={cache.details[f.id]}
                mutual={cache.mutuals[f.id]}
                favorite={cache.favorites[f.id]}
                circles={circlesByUser.get(f.id) ?? []}
                dimmed={!matched.has(f.id)}
                selected={selectedId === f.id}
                fresh={!!fresh[f.id]}
                now={now}
                onSelect={select}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
