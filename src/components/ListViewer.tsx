// Friend lists shared with you: look through one, compare two (or one with yours), and the
// legend for lists shown on your map (src/listoverlay.ts).
import { useT } from "../i18n";
import { useMemo, useState } from "react";
import { listMemberIds } from "../derived";
import { LIST_COLORS, listAllIds, toggleMapList, type OverlayList } from "../listoverlay";
import { setState, useApp } from "../store";
import type { Cache, ImportedList } from "../types";
import { Icon } from "./Icon";

/** A name for anyone on any list: your friends' names first, then what a full list says. */
function useNamer(): (id: string) => string {
  const cache = useApp((s) => s.cache);
  const imports = useApp((s) => s.local.imports);
  return useMemo(() => {
    const fromLists = new Map<string, string>();
    for (const l of imports) for (const f of l.friends ?? []) if (f.displayName && !fromLists.has(f.id)) fromLists.set(f.id, f.displayName);
    return (id: string) => cache.friends[id]?.displayName ?? cache.others?.[id]?.displayName ?? fromLists.get(id) ?? (cache.me?.id === id ? cache.me.displayName : id);
  }, [cache, imports]);
}

/** Who's on the map's colour legend: the lists shown, with a way to take one off. */
export function ListOverlayLegend({ lists }: { lists: OverlayList[] }) {
  const t = useT();
  const strangers = useApp((s) => s.mapListStrangers);
  if (!lists.length) return null;
  const anyFull = lists.some((x) => x.list.mode === "full");
  return (
    <div className="list-legend" role="group" aria-label={t("listView.onMap")}>
      {lists.map(({ list, color }) => (
        <span key={list.id} className="list-legend-item">
          <span className="list-dot" style={{ background: color }} />
          {list.owner.displayName}
          <button aria-label={t("listView.takeOff", { name: list.owner.displayName })} onClick={() => toggleMapList(list.id, false)}>
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
      {anyFull && (
        <label className="list-legend-check" title={t("listView.strangersHelp")}>
          <input type="checkbox" checked={strangers} onChange={(e) => setState({ mapListStrangers: e.target.checked })} />
          {t("listView.strangers")}
        </label>
      )}
    </div>
  );
}

type Who = "friend" | "me" | "other";

/** One shared list, to look through: everyone on it (full lists) or the people you both know. */
export function ListViewer({ list, onClose }: { list: ImportedList; onClose: () => void }) {
  const t = useT();
  const cache = useApp((s) => s.cache);
  const name = useNamer();
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "friend" | "other">("all");
  const rows = useMemo(() => {
    const ids = listAllIds(list, cache);
    const who = (id: string): Who => (cache.friends[id] ? "friend" : cache.me?.id === id ? "me" : "other");
    return ids.map((id) => ({ id, name: name(id), who: who(id) })).sort((a, b) => Number(b.who === "friend") - Number(a.who === "friend") || a.name.localeCompare(b.name));
  }, [list, cache, name]);
  const query = q.trim().toLowerCase();
  const shown = rows.filter((r) => (only === "all" || r.who === only || (only === "friend" && r.who === "me")) && (!query || r.name.toLowerCase().includes(query)));
  const known = rows.filter((r) => r.who === "friend").length;
  return (
    <section className="panel list-viewer">
      <div className="section-head">
        <h3>{t("listView.title", { name: list.owner.displayName })}</h3>
        <button className="icon-btn small" aria-label={t("common.close")} onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <p className="small muted">
        {list.mode === "full" ? t("listView.fullAbout", { count: rows.length, known }) : t("listView.hashedAbout", { known })}
      </p>
      <div className="row">
        <input type="search" value={q} placeholder={t("listView.search")} aria-label={t("listView.search")} onChange={(e) => setQ(e.target.value)} />
        <div className="seg" role="group">
          {(
            [
              ["all", t("listView.all")],
              ["friend", t("listView.yourFriends")],
              ["other", t("listView.notYourFriends")],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={only === k ? "on" : ""} aria-pressed={only === k} onClick={() => setOnly(k)} disabled={k === "other" && list.mode !== "full"}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <ul className="list-viewer-rows">
        {shown.slice(0, 500).map((r) => (
          <li key={r.id}>
            <button className={`list-viewer-row ${r.who}`} onClick={() => setState({ selectedId: r.id })}>
              <span className="list-viewer-name">{r.name}</span>
              <span className="small muted">{r.who === "friend" ? t("listView.yourFriend") : r.who === "me" ? t("listView.you") : ""}</span>
            </button>
          </li>
        ))}
        {shown.length > 500 && <li className="small muted">{t("listView.more", { count: shown.length - 500 })}</li>}
        {!shown.length && <li className="small muted">{t("listView.none")}</li>}
      </ul>
    </section>
  );
}

const YOU = "__you__";

function membersOf(key: string, imports: ImportedList[], cache: Cache): { ids: Set<string>; partial: boolean } {
  if (key === YOU) return { ids: new Set(Object.keys(cache.friends)), partial: false };
  const list = imports.find((l) => l.id === key);
  if (!list) return { ids: new Set(), partial: false };
  return list.mode === "full" ? { ids: new Set(listAllIds(list, cache)), partial: false } : { ids: new Set(listMemberIds(list, cache)), partial: true };
}

/** Two lists side by side (yours counts as one): in both, only in one, only in the other. */
export function CompareLists() {
  const t = useT();
  const imports = useApp((s) => s.local.imports);
  const cache = useApp((s) => s.cache);
  const name = useNamer();
  const [a, setA] = useState(YOU);
  const [b, setB] = useState(imports[0]?.id ?? YOU);
  const label = (k: string) => (k === YOU ? t("listView.yourList") : (imports.find((l) => l.id === k)?.owner.displayName ?? "?"));
  const res = useMemo(() => {
    const A = membersOf(a, imports, cache);
    const B = membersOf(b, imports, cache);
    const both = [...A.ids].filter((x) => B.ids.has(x));
    const onlyA = [...A.ids].filter((x) => !B.ids.has(x));
    const onlyB = [...B.ids].filter((x) => !A.ids.has(x));
    const sort = (l: string[]) => l.map((id) => ({ id, name: name(id) })).sort((x, y) => x.name.localeCompare(y.name));
    return { both: sort(both), onlyA: sort(onlyA), onlyB: sort(onlyB), partial: A.partial || B.partial };
  }, [a, b, imports, cache, name]);
  if (!imports.length) return null;
  const pick = (v: string, set: (v: string) => void, aria: string) => (
    <select value={v} onChange={(e) => set(e.target.value)} aria-label={aria}>
      <option value={YOU}>{t("listView.yourList")}</option>
      {imports.map((l) => (
        <option key={l.id} value={l.id}>
          {l.owner.displayName}
        </option>
      ))}
    </select>
  );
  const col = (title: string, rows: { id: string; name: string }[], color?: string) => (
    <div className="compare-col">
      <h4>
        {color && <span className="list-dot" style={{ background: color }} />}
        {title} <span className="muted">{rows.length}</span>
      </h4>
      <ul>
        {rows.slice(0, 300).map((r) => (
          <li key={r.id}>
            <button className="link-btn" onClick={() => setState({ selectedId: r.id })}>
              {r.name}
            </button>
          </li>
        ))}
        {rows.length > 300 && <li className="small muted">{t("listView.more", { count: rows.length - 300 })}</li>}
      </ul>
    </div>
  );
  return (
    <section className="panel compare-lists">
      <h3>{t("listView.compare")}</h3>
      <div className="row">
        {pick(a, setA, t("listView.first"))}
        <span className="muted">{t("listView.and")}</span>
        {pick(b, setB, t("listView.second"))}
        <button
          className="btn small"
          title={t("listView.bothOnMapHelp")}
          onClick={() => {
            for (const k of [a, b]) if (k !== YOU) toggleMapList(k, true);
            setState({ view: "graph" });
          }}
        >
          <Icon name="graph" size={14} /> {t("listView.bothOnMap")}
        </button>
      </div>
      {res.partial && <p className="small muted">{t("listView.partial")}</p>}
      {a === b ? (
        <p className="small muted">{t("listView.pickTwo")}</p>
      ) : (
        <div className="compare-cols3">
          {col(t("listView.inBoth"), res.both)}
          {col(t("listView.onlyIn", { name: label(a) }), res.onlyA, LIST_COLORS[0])}
          {col(t("listView.onlyIn", { name: label(b) }), res.onlyB, LIST_COLORS[1])}
        </div>
      )}
    </section>
  );
}

