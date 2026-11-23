// "Who's here" in the new interface: everyone in your VRChat instance (from the live game log),
// friends first, then people you share friends with, then everyone else. Filters: all, friends,
// or only people with mutual friends (potential friends). The Lobby shows it as the bar along the
// bottom (faces + a list that opens above it); the "You are here" card uses the same list.
import { t as tr, useT } from "../i18n";
import { useEffect, useMemo, useState } from "react";
import { imgSrc } from "../backend";
import { since } from "../components/HereNow";
import { Icon } from "../components/Icon";
import { othersHere } from "../live";
import { iconUrl, presenceOf, statusColor } from "../model";
import { isBlocked, refreshModerations, wantProfiles } from "../people";
import { setState, useApp } from "../store";
import type { Cache, LivePlayer } from "../types";
import { useDismiss } from "./dismiss";

export type HereFilter = "all" | "friends" | "mutual";

const PROFILE_LIMIT = 25;

export interface HerePerson {
  p: LivePlayer;
  name: string;
  friend: boolean;
  mutual: number;
  pic?: string;
  ring?: string;
}

const mutualOf = (cache: Cache, id: string) => {
  const m = cache.mutuals[id];
  return m && !m.hidden ? m.count : 0;
};

/** Everyone in your instance but you, sorted: friends, then most mutual friends, then the rest. */
export function useHerePeople(): { people: HerePerson[]; active: boolean; blocked: number } {
  const here = useApp((s) => s.here);
  const cache = useApp((s) => s.cache);
  const showBlocked = useApp((s) => s.settings.people.showBlocked);
  const loadEveryone = useApp((s) => s.settings.people.loadEveryone);
  const active = !!here?.active && !here.closed;
  const { people, blocked } = useMemo(() => {
    const list = active ? othersHere(here, cache.me?.id) : [];
    let blocked = 0;
    const people: HerePerson[] = [];
    for (const p of list) {
      const friend = !!cache.friends[p.id];
      if (!friend && isBlocked(cache, p.id) && !showBlocked) {
        blocked++;
        continue;
      }
      const f = cache.friends[p.id] ?? cache.others?.[p.id];
      people.push({
        p,
        name: f?.displayName ?? p.name,
        friend,
        mutual: mutualOf(cache, p.id),
        pic: f ? imgSrc(iconUrl(f)) : undefined,
        ring: friend && f ? statusColor(f, presenceOf(f, cache.presence)) : undefined,
      });
    }
    people.sort((a, b) => Number(b.friend) - Number(a.friend) || b.mutual - a.mutual || a.name.localeCompare(b.name));
    return { people, blocked };
  }, [active, here, cache, showBlocked]);

  useEffect(() => {
    if (active) void refreshModerations();
  }, [active]);
  // Pictures and mutual friends of people who aren't friends load slowly in the background.
  const strangers = people.filter((x) => !x.friend).map((x) => x.p.id);
  const key = strangers.join(",");
  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    wantProfiles(loadEveryone ? ids : ids.slice(0, PROFILE_LIMIT));
  }, [key, loadEveryone]);
  return { people, active, blocked };
}

export function filterHere(people: HerePerson[], f: HereFilter): HerePerson[] {
  return f === "friends" ? people.filter((x) => x.friend) : f === "mutual" ? people.filter((x) => !x.friend && x.mutual > 0) : people;
}

/** All · Friends · Mutual friends, with counts. */
export function HereFilters({ people, value, onChange }: { people: HerePerson[]; value: HereFilter; onChange: (f: HereFilter) => void }) {
  const t = useT();
  const opts: [HereFilter, string, number][] = [
    ["all", t("hereBar.all"), people.length],
    ["friends", t("hereBar.friends"), people.filter((x) => x.friend).length],
    ["mutual", t("hereBar.mutual"), filterHere(people, "mutual").length],
  ];
  return (
    <div className="here-filters" role="group" aria-label={t("hereBar.filter")}>
      {opts.map(([k, label, n]) => (
        <button key={k} className={`here-filter ${value === k ? "on" : ""}`} aria-pressed={value === k} title={k === "mutual" ? t("hereBar.mutualHelp") : undefined} onClick={() => onChange(k)}>
          {label} <span className="here-filter-n">{n}</span>
        </button>
      ))}
    </div>
  );
}

function Face({ x, size = 30 }: { x: HerePerson; size?: number }) {
  return (
    <span className="here-face2" style={{ width: size, height: size, borderColor: x.ring }}>
      {x.pic ? <img src={x.pic} alt="" loading="lazy" /> : <span>{x.name.slice(0, 1).toUpperCase()}</span>}
      {!x.friend && x.mutual > 0 && <span className="here-face2-badge">{x.mutual}</span>}
    </span>
  );
}

/** The list: picture, name, friend / mutual friends, time here. */
export function HereList({ people, empty }: { people: HerePerson[]; empty?: string }) {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!people.length) return <p className="small muted here-empty">{empty ?? t("party.justYou")}</p>;
  return (
    <ul className="here-list2" data-arrows="v">
      {people.map((x) => (
        <li key={x.p.id}>
          <button onClick={() => setState({ selectedId: x.p.id })}>
            <Face x={x} size={32} />
            <span className="here-list2-text">
              <span className="here-list2-name">{x.name}</span>
              <span className="small muted">
                {x.friend ? t("hereBar.friend") : x.mutual ? t("hereBar.mutualCount", { count: x.mutual }) : t("party2.notAFriend")}
              </span>
            </span>
            <span className="small muted here-list2-time">{since(x.p.since, now)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Lobby: the bar along the bottom. */
export function HereBar() {
  const t = useT();
  const here = useApp((s) => s.here);
  const worlds = useApp((s) => s.cache.worlds);
  const { people, active, blocked } = useHerePeople();
  const [filter, setFilter] = useState<HereFilter>("all");
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const shown = filterHere(people, filter);
  const world = here?.worldName || (here?.worldId ? worlds?.[here.worldId]?.name : undefined) || t("party.aWorld");
  if (!active) {
    return (
      <footer className="lob-herebar idle" aria-label={t("hereBar.title")}>
        <span className="lob-herebar-label">
          <Icon name="pin" size={15} /> {t("party.notInVrchat")}
        </span>
      </footer>
    );
  }
  return (
    <footer className="lob-herebar" aria-label={t("hereBar.title")} ref={ref}>
      <button className={`lob-herebar-label ${open ? "on" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)} title={t("hereBar.openList")}>
        <span className="lob-herebar-live" aria-hidden="true" />
        <b>{t("hereBar.title")}</b>
        <span className="lob-herebar-world">{world}</span>
        <span className="lob-herebar-count">{people.length + 1}</span>
      </button>
      <div className="lob-herebar-faces" data-arrows="h">
        {shown.slice(0, 40).map((x) => (
          <button key={x.p.id} className="lob-herebar-face" title={x.friend ? x.name : x.mutual ? `${x.name} · ${t("hereBar.mutualCount", { count: x.mutual })}` : `${x.name} · ${tr("party2.notAFriend")}`} aria-label={x.name} onClick={() => setState({ selectedId: x.p.id })}>
            <Face x={x} />
          </button>
        ))}
        {!shown.length && <span className="small muted">{filter === "all" ? t("party.justYou") : t("hereBar.noneMatch")}</span>}
      </div>
      <HereFilters people={people} value={filter} onChange={setFilter} />
      <button className={`lob-herebar-list ${open ? "on" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="users" size={15} /> {t("hereBar.list")} <Icon name={open ? "chevron-down" : "chevron-up"} size={14} />
      </button>
      {open && (
        <div className="lob-herebar-panel" role="dialog" aria-label={t("hereBar.title")}>
          <div className="lob-herebar-panel-head">
            <b>{world}</b>
            <span className="small muted">{blocked ? t("hereBar.blockedHidden", { count: blocked }) : ""}</span>
          </div>
          <HereFilters people={people} value={filter} onChange={setFilter} />
          <HereList people={shown} empty={filter === "all" ? undefined : t("hereBar.noneMatch")} />
        </div>
      )}
    </footer>
  );
}
