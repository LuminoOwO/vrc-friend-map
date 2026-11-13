// Pick a set of friends: all of them, the members of some circles, or by hand
// (with "add new friends to this automatically"). Used for what you share and
// who you share it with.
import { useMemo, useState } from "react";
import { useApp } from "../store";
import type { PeopleSelection } from "../types";

export function PeopleChooser({
  value,
  onChange,
  allLabel = "All my friends",
  autoLabel = "Add new friends to this list automatically",
}: {
  value: PeopleSelection;
  onChange: (v: PeopleSelection) => void;
  allLabel?: string;
  autoLabel?: string;
}) {
  const circles = useApp((s) => s.local.circles);
  const friends = useApp((s) => s.cache.friends);
  const [q, setQ] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const set = (patch: Partial<PeopleSelection>) => onChange({ ...value, ...patch });
  const picked = useMemo(() => new Set(value.picked), [value.picked]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Object.values(friends)
      .filter((f) => (!onlyPicked || picked.has(f.id)) && (!needle || f.displayName.toLowerCase().includes(needle)))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [friends, q, onlyPicked, picked]);

  const count = value.who === "picked" ? value.picked.filter((id) => friends[id]).length : null;
  const toggle = (id: string) => set({ picked: picked.has(id) ? value.picked.filter((x) => x !== id) : [...value.picked, id] });

  return (
    <div className="people-chooser">
      <div className="seg" role="radiogroup">
        {(
          [
            ["all", allLabel],
            ["circles", "Some circles"],
            ["picked", "People I pick"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="radio" aria-checked={value.who === k} className={value.who === k ? "on" : ""} onClick={() => set({ who: k })}>
            {label}
          </button>
        ))}
      </div>
      {value.who === "circles" && (
        <div className="chips">
          {circles.length === 0 && <span className="small muted">Make circles first (on the map or in the sidebar).</span>}
          {circles.map((c) => {
            const on = value.circleIds.includes(c.id);
            return (
              <button
                key={c.id}
                className={`chip ${on ? "on" : ""}`}
                style={{ "--chip": c.color } as React.CSSProperties}
                onClick={() => set({ circleIds: on ? value.circleIds.filter((x) => x !== c.id) : [...value.circleIds, c.id] })}
              >
                {c.name} ({c.members.length})
              </button>
            );
          })}
        </div>
      )}
      {value.who === "picked" && (
        <div className="picker">
          <div className="row tight">
            <input value={q} placeholder="Find a friend" onChange={(e) => setQ(e.target.value)} />
            <span className="small muted">
              {count} of {Object.keys(friends).length}
            </span>
          </div>
          <div className="row tight">
            <button className="btn small" onClick={() => set({ picked: [...new Set([...value.picked, ...list.map((f) => f.id)])] })}>
              {q ? "Pick these" : "Pick all"}
            </button>
            <button className="btn small" onClick={() => set({ picked: q ? value.picked.filter((id) => !list.some((f) => f.id === id)) : [] })}>
              {q ? "Unpick these" : "Pick none"}
            </button>
            <label className="check small">
              <input type="checkbox" checked={onlyPicked} onChange={(e) => setOnlyPicked(e.target.checked)} />
              Only show picked
            </label>
          </div>
          <ul className="picker-list">
            {list.slice(0, 300).map((f) => (
              <li key={f.id}>
                <label className="check">
                  <input type="checkbox" checked={picked.has(f.id)} onChange={() => toggle(f.id)} />
                  {f.displayName}
                </label>
              </li>
            ))}
            {list.length > 300 && <li className="small muted">…and {list.length - 300} more. Search to narrow it down.</li>}
            {list.length === 0 && <li className="small muted">Nobody here.</li>}
          </ul>
          <label className="check">
            <input type="checkbox" checked={value.autoAdd} onChange={(e) => set({ autoAdd: e.target.checked })} />
            {autoLabel}
          </label>
        </div>
      )}
    </div>
  );
}
