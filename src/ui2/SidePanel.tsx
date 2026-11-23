// The side panel (new interface, computers): a card beside the map with where you are, the
// overview tiles, Online now and Activity. Right or left (swap button), resizable (snaps back to
// its default width, dragged very narrow it folds away), folds to a small "wing" on the edge.
// Overview, Online now and Activity fold too. The layout is remembered on this device.
import { language } from "../i18n";
import { t } from "../i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { imgSrc } from "../backend";
import { useDerived } from "../derived";
import { IN_GAME_STATUSES, iconUrl, presenceOf } from "../model";
import { setState, showToast, useApp } from "../store";
import { inviteTo } from "../invites";
import { loadWorld } from "../sync";
import type { ActivityEntry } from "../activity";
import { ActivityText, friendLogEntries, useActivityLoaded } from "../components/ActivityView";
import { parseLocation } from "../components/DetailPanel";
import { FilterChip, clearAll, statusToggle } from "../components/FilterChip";
import { since, useInstanceSlots } from "../components/HereNow";
import { filterHere, HereFilters, HereList, useHerePeople, type HereFilter } from "./HereBar";
import { Icon } from "../components/Icon";
import { OnlineNow, useSpots } from "./OnlineNow";
import { useSmooth } from "./smooth";

const LS = "vfm-ui2-panel";
export const PANEL_DEFAULT = 360;
const MIN = 240;
const MAX = 600;

type Part = "overview" | "online" | "activity";
export interface PanelPrefs {
  side: "left" | "right";
  width: number;
  collapsed: boolean;
  folded: Part[];
}

function readPrefs(): PanelPrefs {
  const d: PanelPrefs = { side: "right", width: PANEL_DEFAULT, collapsed: false, folded: [] };
  try {
    const r = JSON.parse(localStorage.getItem(LS) ?? "{}") as Partial<PanelPrefs>;
    return {
      side: r.side === "left" ? "left" : "right",
      width: typeof r.width === "number" ? Math.min(MAX, Math.max(MIN, r.width)) : d.width,
      collapsed: r.collapsed === true,
      folded: Array.isArray(r.folded) ? r.folded.filter((x): x is Part => ["overview", "online", "activity"].includes(x)) : [],
    };
  } catch {
    return d;
  }
}

/** The panel's layout, saved on this device only. */
export function usePanelPrefs() {
  const [prefs, setPrefs] = useState(readPrefs);
  const update = useCallback((patch: Partial<PanelPrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(LS, JSON.stringify(next));
      } catch {
        /* private window: just not remembered */
      }
      return next;
    });
  }, []);
  return [prefs, update] as const;
}

/** What the side panel holds: where you are, overview, Online now, Activity (each foldable). */
export function PanelSections({ prefs, update, onWorld }: { prefs: PanelPrefs; update: (p: Partial<PanelPrefs>) => void; onWorld: (key: string) => void }) {
  const fold = (p: Part) => update({ folded: prefs.folded.includes(p) ? prefs.folded.filter((x) => x !== p) : [...prefs.folded, p] });
  const open = (p: Part) => !prefs.folded.includes(p);
  const spots = useSpots();
  const inGame = spots.filter((s) => s.key !== "web");
  const friendsInGame = inGame.reduce((n, s) => n + s.people.length, 0);
  return (
    <>
      <WhereCard />

      <section className={`ui2-part ${open("overview") ? "open" : "shut"}`}>
        <PartHead title={t("party.overview")} open={open("overview")} onFold={() => fold("overview")} />
        {/* Kept mounted and folded with a height transition, so folding is animated. */}
        <div className="ui2-fold" aria-hidden={!open("overview")} inert={!open("overview")}>
          <div className="ui2-fold-in">
            <Overview />
          </div>
        </div>
      </section>

      <section className={`ui2-part growable ${open("online") ? "open" : "shut"}`} style={{ flexGrow: open("online") ? 1 : 0 }}>
        <PartHead
          title={t("party.onlineNow")}
          extra={friendsInGame ? t("party.onlineExtra", { friends: t("common.friends", { count: friendsInGame }), worlds: t("party.worlds", { count: inGame.length }) }) : undefined}
          open={open("online")}
          onFold={() => fold("online")}
        />
        <div className="ui2-part-content" aria-hidden={!open("online")} inert={!open("online")}>
          <OnlineNow onOpen={onWorld} side={prefs.side} />
        </div>
      </section>

      <SideActivity open={open("activity")} onFold={() => fold("activity")} />
    </>
  );
}

function PartHead({ title, extra, open, onFold, action, dot }: { title: string; extra?: string; open: boolean; onFold: () => void; action?: React.ReactNode; dot?: boolean }) {
  return (
    <div className="ui2-part-head">
      <button className="ui2-part-title" aria-expanded={open} onClick={onFold}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true" style={{ transform: open ? undefined : "rotate(-90deg)" }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
        {title}
        {extra && <span className="ui2-part-extra">{extra}</span>}
        {dot && <span className="ui2-new-dot" />}
      </button>
      {action}
    </div>
  );
}

// ---------- where you are ----------

/** Your instance as a card: the world's picture, its name, the instance, and everyone there. */
export function WhereCard() {
  const smoothCard = useSmooth();
  const here = useApp((s) => s.here);
  const friends = useApp((s) => s.cache.friends);
  const others = useApp((s) => s.cache.others);
  const myId = useApp((s) => s.cache.me?.id);
  const active = !!here?.active && !here.closed;
  const loc = active && here.location.startsWith("wrld_") ? parseLocation(here.location) : null;
  const world = useApp((s) => (loc ? s.cache.worlds?.[loc.world] : undefined));
  const slots = useInstanceSlots(here?.location, active);
  const [list, setList] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (loc) loadWorld(loc.world);
  }, [loc?.world]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!active) {
    return (
      <section className="ui2-where empty">
        <Icon name="pin" size={18} />
        <span className="small muted">{t("party.notInVrchat")}</span>
      </section>
    );
  }
  const players = here.players.filter((p) => p.id !== (myId ?? here.localId));
  const isFriend = (id: string) => !!friends[id];
  const sorted = [...players].sort((a, b) => Number(isFriend(b.id)) - Number(isFriend(a.id)));
  const faceOf = (id: string) => {
    const f = friends[id] ?? others?.[id];
    return f ? imgSrc(iconUrl(f)) : undefined;
  };
  const pic = imgSrc(world?.imageUrl || world?.thumbnailImageUrl);
  const shown = sorted.slice(0, 5);
  return (
    <section className="ui2-where">
      <div className="ui2-where-pic" style={pic ? { backgroundImage: `url("${pic}")` } : undefined}>
        <span className="ui2-tag">{t("party.youAreHere")}</span>
      </div>
      <div className="ui2-where-body" ref={smoothCard}>
        <div className="ui2-where-name">{here.worldName || world?.name || t("party.aWorld")}</div>
        <div className="ui2-where-sub">
          <span className="ui2-type-dot" />
          {loc?.type ?? t("party.instance")}
          {` · ${(slots?.users ?? players.length + 1)}${slots?.capacity ? ` / ${slots.capacity}` : ""}`}
          {here.since ? ` · ${since(here.since, now)}` : ""}
        </div>
        <div className="ui2-where-row">
          {shown.map((p) => {
            const src = faceOf(p.id);
            return (
              <button key={p.id} className="ui2-face-btn" title={p.name} aria-label={p.name} onClick={() => setState({ selectedId: p.id })}>
                <span className="ui2-avatar" style={{ width: 28, height: 28 }}>
                  {src ? <img src={src} alt="" /> : p.name[0]}
                </span>
              </button>
            );
          })}
          {sorted.length > shown.length && (
            <button className="ui2-where-more" title={t("party.everyoneHere")} onClick={() => setList(true)}>
              +{sorted.length - shown.length}
            </button>
          )}
          <span className="ui2-grow" />
          <button className={`ui2-square ${list ? "on" : ""}`} aria-pressed={list} title={t("party.everyoneHere")} aria-label={t("party.everyoneHere")} onClick={() => setList(!list)}>
            <Icon name="users" size={18} />
          </button>
          <button className={`ui2-square ${inviting ? "on" : ""}`} aria-pressed={inviting} title={t("party.inviteHere")} aria-label={t("party.inviteHere")} onClick={() => setInviting(!inviting)}>
            <Icon name="user-plus" size={18} />
          </button>
        </div>
        {list && <WhereList />}
        {inviting && <InviteHere location={here.location} here={new Set(players.map((p) => p.id))} />}
      </div>
    </section>
  );
}

/** Everyone here, with the All / Friends / Mutual friends filter (src/ui2/HereBar.tsx). */
function WhereList() {
  const { people } = useHerePeople();
  const [filter, setFilter] = useState<HereFilter>("all");
  return (
    <div className="ui2-where-here">
      <HereFilters people={people} value={filter} onChange={setFilter} />
      <HereList people={filterHere(people, filter)} />
    </div>
  );
}

/** Online friends who aren't in your instance, each with an Invite button. */
function InviteHere({ location, here }: { location: string; here: Set<string> }) {
  const smooth = useSmooth<HTMLUListElement>();
  const friends = useApp((s) => s.cache.friends);
  const presence = useApp((s) => s.cache.presence);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const list = useMemo(
    () =>
      Object.values(friends)
        .filter((f) => presenceOf(f, presence) === "online" && !here.has(f.id))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [friends, presence, here],
  );
  if (!location.startsWith("wrld_")) return <p className="small muted">{t("party.invitesNeedWorld")}</p>;
  return (
    <ul className="ui2-where-list" ref={smooth}>
      {list.map((f) => (
        <li key={f.id}>
          <div className="ui2-where-invite">
            <span className="ui2-grow ui2-ellipsis">{f.displayName}</span>
            <button
              className="btn small"
              disabled={sent.has(f.id)}
              onClick={async () => {
                const err = await inviteTo(f.id, location);
                if (err) showToast(t("party.couldntInvite", { name: f.displayName, error: String(err) }));
                else setSent(new Set([...sent, f.id]));
              }}
            >
              {sent.has(f.id) ? t("party.invited") : t("party.invite")}
            </button>
          </div>
        </li>
      ))}
      {list.length === 0 && <li className="small muted">{t("party.noOtherFriends")}</li>}
    </ul>
  );
}

// ---------- overview ----------

export function Overview() {
  const filters = useApp((s) => s.filters);
  const presence = useApp((s) => s.cache.presence);
  const { friends, edges } = useDerived();
  const [hint, setHint] = useState<{ text: string; x: number; y: number } | null>(null);
  const stats = useMemo(() => {
    let online = 0;
    let web = 0;
    for (const f of friends) {
      const p = presence[f.id];
      if (p === "online") online++;
      else if (p === "web") web++;
    }
    return { online, web };
  }, [friends, presence]);
  const inGame = IN_GAME_STATUSES.every((k) => filters.statuses.includes(k)) && filters.statuses.length === IN_GAME_STATUSES.length;
  const webOnly = filters.statuses.length === 1 && filters.statuses[0] === "web";
  // A small tooltip next to the mouse (it used to be a line under the tiles, which pushed everything down).
  const tile = (text: string) => ({
    onMouseMove: (e: React.MouseEvent) => setHint({ text, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setHint(null),
  });
  const filtering = inGame || webOnly;
  return (
    <>
      <div className="ui2-tiles">
        <span {...tile(t("party.tileAll"))}>
          <FilterChip patch={clearAll} active={false}>
            <b>{friends.length}</b>
            <span>{t("party.friends")}</span>
          </FilterChip>
        </span>
        <span {...tile(inGame ? t("party.tileAgain") : t("party.tileInGame"))}>
          <FilterChip patch={() => statusToggle(IN_GAME_STATUSES, "set")} active={inGame}>
            <b className="online">{stats.online}</b>
            <span>{t("party.inVrchat")}</span>
          </FilterChip>
        </span>
        <span {...tile(webOnly ? t("party.tileAgain") : t("party.tileWeb"))}>
          <FilterChip patch={() => statusToggle(["web"], "set")} active={webOnly}>
            <b className="web">{stats.web}</b>
            <span>{t("party.webApp")}</span>
          </FilterChip>
        </span>
        <span {...tile(t("party.tileLines"))}>
          <div className="stat-static">
            <b>{edges.length}</b>
            <span>{t("party.connections")}</span>
          </div>
        </span>
      </div>
      {hint && (
        <span className="ui2-mouse-tip" role="tooltip" style={{ left: hint.x + 14, top: hint.y + 16 }}>
          {filtering ? t("party.filtering") : hint.text}
        </span>
      )}
    </>
  );
}

// ---------- activity ----------

const KIND_COLOR: Record<string, string> = {
  join: "#51e57e",
  leave: "#e8a33d",
  world: "var(--accent)",
  left: "#e8a33d",
  online: "#42caff",
  offline: "#6f8291",
  location: "#c4a7e7",
  "friend-add": "#51e57e",
  "friend-remove": "#f05a6a",
  invite: "#42caff",
  "request-invite": "#e8a33d",
  "friend-blocked": "#f05a6a",
  quit: "#6f8291",
  crash: "#f05a6a",
};
const KIND_ICONS: Record<string, string> = {
  join: "plus",
  leave: "logout",
  world: "pin",
  left: "logout",
  online: "play",
  offline: "pause",
  location: "pin",
  "friend-add": "user-plus",
  "friend-remove": "trash",
  invite: "share",
  "request-invite": "user-plus",
  "friend-blocked": "flag",
  quit: "close",
  crash: "close",
};

const hhmm = (t: number) => new Date(t).toLocaleTimeString(language(), { hour: "2-digit", minute: "2-digit" });

/** Recent activity in its own scroll area: new entries light up and get counted, "back to top" says how many. */
function SideActivity({ open, onFold }: { open: boolean; onFold: () => void }) {
  const [fresh, setFresh] = useState(0);
  return (
    <section className={`ui2-part growable ${open ? "open" : "shut"}`} style={{ flexGrow: open ? 1.3 : 0 }}>
      <PartHead
        title={t("party.activity")}
        open={open}
        onFold={onFold}
        dot={fresh > 0}
        action={
          <button className="ui2-see-all" onClick={() => setState({ view: "activity" })}>
            {t("party.seeAll")}
          </button>
        }
      />
      <div className="ui2-part-content" aria-hidden={!open} inert={!open}>
        <ActivityFeed onFresh={setFresh} />
      </div>
    </section>
  );
}

/** The latest activity in its own scroll area: new entries light up and get counted, "back to top" says how many. */
export function ActivityFeed({ onFresh, max = 80 }: { onFresh?: (n: number) => void; max?: number }) {
  useActivityLoaded();
  const activity = useApp((s) => s.activity);
  const friendLog = useApp((s) => s.local.friendLog);
  const list: ActivityEntry[] = useMemo(
    () =>
      [...activity.filter((e) => !e.initial && e.kind !== "friend-add" && e.kind !== "friend-remove"), ...friendLogEntries(friendLog.slice(-30))]
        .sort((a, b) => b.t - a.t)
        .slice(0, max),
    [activity, friendLog, max],
  );
  const box = useRef<HTMLDivElement>(null);
  const smoothRows = useSmooth();
  const [scrolled, setScrolled] = useState(false);
  // Everything up to this time has been seen (shown while you were at the top).
  const [seenUntil, setSeenUntil] = useState(() => Date.now());
  const newest = list[0]?.t ?? 0;
  useEffect(() => {
    if (scrolled || newest <= seenUntil) return;
    // At the top: new entries stay lit for a few seconds, then count as seen.
    const t = setTimeout(() => setSeenUntil(newest), 2500);
    return () => clearTimeout(t);
  }, [scrolled, newest, seenUntil]);
  const fresh = list.filter((e) => e.t > seenUntil).length;
  useEffect(() => onFresh?.(fresh), [fresh, onFresh]);
  return (
    <div className="ui2-act-wrap">
      <div className="ui2-scroll" ref={box} onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 8)}>
        <div ref={smoothRows}>
        {list.length === 0 && <p className="muted small ui2-side-empty">{t("party.activityEmpty")}</p>}
        {list.map((e) => (
          <div key={e.key} className={`ui2-act-row ${e.t > seenUntil ? "fresh" : ""}`} title={new Date(e.t).toLocaleString(language())}>
            <span className="ui2-act-time">{hhmm(e.t)}</span>
            <span className="ui2-act-icon" style={{ ["--k" as string]: KIND_COLOR[e.kind] ?? "var(--muted)" }}>
              <Icon name={KIND_ICONS[e.kind] ?? "info"} size={13} />
            </span>
            <span className="ui2-act-text">
              <ActivityText e={e} />
            </span>
          </div>
        ))}
        </div>
      </div>
      {scrolled && (
        <button className="ui2-jump" onClick={() => box.current?.scrollTo({ top: 0, behavior: "smooth" })}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
          {fresh > 0 ? t("party.newBackToTop", { count: fresh }) : t("party.backToTop")}
        </button>
      )}
    </div>
  );
}
