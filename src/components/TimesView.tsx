// "Online times": when your friends are online, three ways. Timeline: exact sessions on a calendar
// you drag (src/components/TimesTimeline.tsx), with the times nobody was watching striped and
// short disconnects joined. Typical week: usual hours per hour of the day, how many friends are
// usually on, sorted by overlap with you. List: the sessions as text.
import { language, useT, weekdayNames } from "../i18n";
import { Fragment, useEffect, useMemo, useState } from "react";
import { backend, imgSrc } from "../backend";
import { useHistory } from "../history";
import { iconUrl, presenceOf } from "../model";
import { clipSpans, dayShares, demoSeen, demoSessions, gapsIn, joinShortGaps, overlapMs, totalMs, unionSpans, usualCounts, USUAL, weeklyOverlap, type Day, type Span } from "../onlinetimes";
import { ME, onSessions, sessionsData, sessionsVersion } from "../sessions";
import { fmtDuration, TimesTimeline, type TimelineRow, type TimelineView } from "./TimesTimeline";
import { shownName } from "../personal";
import { setState, useApp } from "../store";
import { Icon } from "./Icon";
import { openServers } from "./ServersModal";

type Sort = "overlap" | "online" | "name";

/** "Typical week": usual online hours per hour of the day, from the hourly totals. */
function TypicalWeek() {
  const t = useT();
  const friends = useApp((s) => s.cache.friends);
  const presence = useApp((s) => s.cache.presence);
  const demo = useApp((s) => s.demo);
  const seenAll = useHistory((h) => h.seen);
  const meSeenReal = useHistory((h) => h.me);
  const version = useHistory((h) => h.me.total + Object.keys(h.seen).length);
  const [day, setDay] = useState<Day>(new Date().getDay());
  const [sort, setSort] = useState<Sort>("overlap");
  const [q, setQ] = useState("");
  const [hour, setHour] = useState<number | null>(null);
  const [nowH, setNowH] = useState(new Date().getHours());
  useEffect(() => {
    const id = setInterval(() => setNowH(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, []);
  const days = weekdayNames("short");
  const today = new Date().getDay();

  const meSeen = demo ? demoSeen("me") : meSeenReal;
  const mine = dayShares(meSeen, day);
  const rows = useMemo(() => {
    const seenOf = (id: string) => (demo ? demoSeen(id) : seenAll[id]);
    return Object.values(friends).map((f) => {
      const s = seenOf(f.id);
      return { f, shares: dayShares(s, day), overlap: weeklyOverlap(meSeen, s), online: presenceOf(f, presence) === "online" };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friends, presence, day, demo, version]);
  const withData = rows.filter((r) => r.shares);
  const without = rows.length - withData.length;
  const counts = usualCounts(withData.map((r) => r.shares));
  const max = Math.max(1, ...counts);
  const query = q.trim().toLowerCase();
  const shown = withData
    .filter((r) => (hour === null || r.shares![hour] >= USUAL) && (!query || shownName(r.f.id, r.f.displayName).toLowerCase().includes(query)))
    .sort((a, b) =>
      sort === "name"
        ? shownName(a.f.id, a.f.displayName).localeCompare(shownName(b.f.id, b.f.displayName))
        : sort === "online"
          ? Number(b.online) - Number(a.online) || b.overlap - a.overlap
          : b.overlap - a.overlap || Number(b.online) - Number(a.online),
    );
  const showNow = day === "week" || day === today;
  const meProfile = useApp((s) => s.cache.me?.profile);
  // The same rows as the timeline: picture, name, and a band shaded by how often they're on.
  const weekRows: TimelineRow[] = [
    { id: ME, name: t("times.you"), me: true, spans: [], joined: [], heat: mine ?? new Array(24).fill(0), pic: meProfile ? imgSrc(iconUrl(meProfile)) : undefined },
    ...shown.map(({ f, shares, online }) => ({
      id: f.id,
      name: shownName(f.id, f.displayName),
      spans: [],
      joined: [],
      online,
      heat: shares!,
      shared: shares!.map((v, h) => v >= USUAL && (mine?.[h] ?? 0) >= USUAL),
      pic: imgSrc(iconUrl(f)),
    })),
  ];


  return (
    <div className="times-week">
      <div className="row times-controls">
        <div className="seg" role="group" aria-label={t("times.day")}>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button key={d} className={day === d ? "on" : ""} aria-pressed={day === d} onClick={() => setDay(d)}>
              {days[d]}
              {d === today ? " •" : ""}
            </button>
          ))}
          <button className={day === "week" ? "on" : ""} aria-pressed={day === "week"} onClick={() => setDay("week")}>
            {t("times.week")}
          </button>
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t("times.sort")}>
          <option value="overlap">{t("times.sortOverlap")}</option>
          <option value="online">{t("times.sortOnline")}</option>
          <option value="name">{t("times.sortName")}</option>
        </select>
        <input type="search" value={q} placeholder={t("times.search")} aria-label={t("times.search")} onChange={(e) => setQ(e.target.value)} />
      </div>

      <section className="times-summary" aria-label={t("times.summary")}>
        <div className="times-bars">
          {counts.map((c, h) => (
            <button
              key={h}
              className={`times-bar ${(mine?.[h] ?? 0) >= USUAL ? "mine" : ""} ${hour === h ? "picked" : ""} ${showNow && h === nowH ? "now" : ""}`}
              title={t("times.barTitle", { hour: h, count: c })}
              aria-pressed={hour === h}
              onClick={() => setHour(hour === h ? null : h)}
            >
              <span className="times-bar-fill" style={{ height: `${(c / max) * 100}%` }} />
              <span className="times-bar-n">{c || ""}</span>
            </button>
          ))}
        </div>
        <div className="times-axis">
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h}>{h % 3 === 0 ? h : ""}</span>
          ))}
        </div>
        <p className="small muted">
          {hour === null ? t("times.summaryHelp") : t("times.pickedHour", { hour, count: shown.length })}{" "}
          {hour !== null && (
            <button className="btn link small" onClick={() => setHour(null)}>
              {t("times.showAll")}
            </button>
          )}
        </p>
      </section>

      <TimesTimeline
        rows={weekRows}
        gaps={[]}
        view={{ start: 0, end: 864e5 }}
        onView={() => {}}
        rowH={28}
        day={{ label: day === "week" ? t("times.week") : days[day], isToday: day === "week" || day === today }}
        onOpen={(id) => setState({ selectedId: id })}
      />
      <p className="small muted">
        {without > 0 && t("times.without", { count: without })} {t("times.about")}
      </p>
    </div>
  );
}

// ---------- the page: timeline (exact times), typical week, list of sessions ----------

type Mode = "timeline" | "week" | "list";
type TSort = "time" | "overlap" | "online" | "name";

const PRESETS: [string, number][] = [
  ["timeline.day", 864e5],
  ["timeline.days3", 3 * 864e5],
  ["timeline.week", 7 * 864e5],
  ["timeline.weeks2", 14 * 864e5],
];

/** Exact sessions and watched times for a range: this device, plus your servers' loggers. */
function useSessions(view: TimelineView) {
  const demo = useApp((s) => s.demo);
  const friends = useApp((s) => s.cache.friends);
  const allServers = useApp((s) => s.settings.sharing.servers);
  const servers = useMemo(() => allServers.filter((x) => x.loggerOwner && x.registered), [allServers]);
  const [version, setVersion] = useState(sessionsVersion());
  useEffect(() => onSessions(() => setVersion(sessionsVersion())), []);
  const [remote, setRemote] = useState<{ sessions: Record<string, Span[]>; coverage: Span[] } | null>(null);
  const [remoteErr, setRemoteErr] = useState("");
  const [remoteBusy, setRemoteBusy] = useState(false);
  // Ask the servers for whole days around what's shown, a moment after you stop dragging.
  const from = Math.floor(view.start / 864e5) * 864e5 - 864e5;
  const to = Math.ceil(view.end / 864e5) * 864e5;
  const urls = servers.map((x) => x.url).join(" ");
  useEffect(() => {
    if (demo || !urls) return setRemote(null);
    let stop = false;
    setRemoteBusy(true);
    const tm = setTimeout(async () => {
      const merged: { sessions: Record<string, Span[]>; coverage: Span[] } = { sessions: {}, coverage: [] };
      const errs: string[] = [];
      for (const url of urls.split(" ")) {
        try {
          const r = await backend.share.loggerPresence(url, Math.floor(from / 1000), Math.ceil(to / 1000));
          merged.coverage.push(...r.coverage.map(([a, b]) => [a * 1000, b * 1000] as Span));
          for (const [id, l] of Object.entries(r.sessions)) (merged.sessions[id] ??= []).push(...l.map(([a, b]) => [a * 1000, b * 1000] as Span));
        } catch (e) {
          errs.push(String(e instanceof Error ? e.message : e));
        }
      }
      if (!stop) {
        setRemote(merged);
        setRemoteErr(errs.join("; "));
        setRemoteBusy(false);
      }
    }, 500);
    return () => {
      stop = true;
      clearTimeout(tm);
    };
  }, [demo, urls, from, to]);
  return useMemo(() => {
    if (demo) {
      const d = demoSessions([...Object.keys(friends), ME]);
      return { ...d, servers: 0, remoteErr: "", remoteBusy: false };
    }
    const local = sessionsData();
    const ids = new Set([...Object.keys(local.sessions), ...Object.keys(remote?.sessions ?? {})]);
    const sessions: Record<string, Span[]> = {};
    for (const id of ids) sessions[id] = unionSpans(local.sessions[id] ?? [], remote?.sessions[id] ?? []);
    return { sessions, coverage: unionSpans(local.coverage, remote?.coverage ?? []), servers: servers.length, remoteErr, remoteBusy };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, friends, remote, version, remoteErr, remoteBusy]);
}

/**
 * Online times are only complete if something watched all the time: your vfm-server's logger
 * (around the clock), or this app never closed. Said plainly, with how much of the shown range
 * has data. `servers`: how many loggers fill in (-1: not known here, e.g. Typical week).
 */
export function DataNote({ servers, covered }: { servers: number; covered?: number }) {
  const t = useT();
  const loggers = useApp((s) => s.settings.sharing.servers.filter((x) => x.loggerOwner).length);
  const n = servers >= 0 ? servers : loggers;
  const pct = covered === undefined ? null : Math.round(covered * 100);
  const low = pct !== null && pct < 90;
  return (
    <div className={`times-note ${n ? "ok" : "warn"} ${low ? "low" : ""}`} role="note">
      <Icon name={n ? "server" : "warn"} size={16} />
      <div>
        <p>
          {n ? t("timeline.noteServer") : t("timeline.noteNoServer")}
          {pct !== null && (
            <>
              {" "}
              <b>{t("timeline.coverage", { pct })}</b>
            </>
          )}
        </p>
        {!n && (
          <button className="btn small" onClick={() => openServers()}>
            <Icon name="server" size={14} /> {t("timeline.setUpServer")}
          </button>
        )}
      </div>
    </div>
  );
}

export function TimesView() {
  const t = useT();
  const [mode, setMode] = useState<Mode>("timeline");
  return (
    <div className="activity-view times-view">
      <div className="seg times-modes" role="tablist" aria-label={t("timeline.show")}>
        {(
          [
            ["timeline", t("timeline.modeTimeline")],
            ["week", t("timeline.modeWeek")],
            ["list", t("timeline.modeList")],
          ] as [Mode, string][]
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}>
            {l}
          </button>
        ))}
      </div>
      {mode === "week" ? (
        <>
          <DataNote servers={-1} />
          <TypicalWeek />
        </>
      ) : (
        <ExactTimes list={mode === "list"} />
      )}
    </div>
  );
}

function ExactTimes({ list }: { list: boolean }) {
  const t = useT();
  const meProfile = useApp((s) => s.cache.me?.profile);
  const friends = useApp((s) => s.cache.friends);
  const presence = useApp((s) => s.cache.presence);
  const [view, setView] = useState<TimelineView>(() => ({ start: Date.now() - 3 * 864e5 + 3 * 3600e3, end: Date.now() + 3 * 3600e3 }));
  const [joinMin, setJoinMin] = useState(5);
  // The marks for joined disconnects: off unless you turn them on (remembered on this device).
  const [showJoins, setShowJoinsState] = useState(() => {
    try {
      return localStorage.getItem("vfm.times.showJoins") === "1";
    } catch {
      return false;
    }
  });
  const setShowJoins = (v: boolean) => {
    setShowJoinsState(v);
    try {
      localStorage.setItem("vfm.times.showJoins", v ? "1" : "0");
    } catch {
      /* only for this session */
    }
  };
  const [density, setDensity] = useState<"comfy" | "compact" | "dense">("comfy");
  const [sort, setSort] = useState<TSort>("time");
  const [q, setQ] = useState("");
  const [showOpts, setShowOpts] = useState(false);
  const [hideIdle, setHideIdle] = useState(true);
  const data = useSessions(view);
  // Missing data only up to now (the future isn't "missing").
  const gapEnd = Math.min(view.end, Date.now());
  const gaps = useMemo(() => (gapEnd > view.start ? gapsIn(data.coverage, view.start, gapEnd) : []), [data.coverage, view.start, gapEnd]);
  const covered = gapEnd > view.start ? 1 - totalMs(gaps) / (gapEnd - view.start) : 1;
  const rowH = density === "comfy" ? 30 : density === "compact" ? 20 : 10;

  const rows = useMemo(() => {
    const join = joinMin * 60e3;
    const make = (id: string, name: string, me = false): TimelineRow => {
      const { spans, joined } = joinShortGaps(data.sessions[id] ?? [], join);
      const f = friends[id];
      const pic = me ? (meProfile ? imgSrc(iconUrl(meProfile)) : undefined) : f ? imgSrc(iconUrl(f)) : undefined;
      return { id, name, spans, joined, me, pic, online: me ? false : presenceOf(f, presence) === "online" };
    };
    const me = make(ME, t("times.you"), true);
    const mine = clipSpans(me.spans, view.start, view.end);
    const query = q.trim().toLowerCase();
    const list = Object.values(friends)
      .map((f) => make(f.id, shownName(f.id, f.displayName)))
      .filter((r) => !query || r.name.toLowerCase().includes(query))
      .map((r) => {
        const inView = clipSpans(r.spans, view.start, view.end);
        return { r, time: totalMs(inView), overlap: overlapMs(inView, mine) };
      })
      .filter((x) => !hideIdle || x.time > 0 || x.r.online || query)
      .sort((a, b) =>
        sort === "name"
          ? a.r.name.localeCompare(b.r.name)
          : sort === "online"
            ? Number(b.r.online) - Number(a.r.online) || b.time - a.time
            : sort === "overlap"
              ? b.overlap - a.overlap || b.time - a.time
              : b.time - a.time,
      );
    return { me, all: [me, ...list.map((x) => x.r)], count: Object.keys(friends).length, shown: list.length };
    // Re-sorting on every drag would make rows jump: sort by the range only when it settles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, friends, presence, joinMin, q, sort, hideIdle, Math.round(view.start / 3600e3), Math.round(view.end / 3600e3)]);

  const goto = (len: number) => setView({ start: Date.now() - len + 2 * 3600e3, end: Date.now() + 2 * 3600e3 });
  const noData = data.coverage.length === 0;

  return (
    <>
      <div className="row times-controls">
        <div className="seg" role="group" aria-label={t("timeline.range")}>
          {PRESETS.map(([k, len]) => (
            <button key={k} onClick={() => goto(len)}>
              {t(k)}
            </button>
          ))}
        </div>
        <button className="btn small" onClick={() => goto(view.end - view.start)} title={t("timeline.nowHelp")}>
          {t("timeline.now")}
        </button>
        <select value={sort} onChange={(e) => setSort(e.target.value as TSort)} aria-label={t("times.sort")}>
          <option value="time">{t("timeline.sortTime")}</option>
          <option value="overlap">{t("times.sortOverlap")}</option>
          <option value="online">{t("times.sortOnline")}</option>
          <option value="name">{t("times.sortName")}</option>
        </select>
        <input type="search" value={q} placeholder={t("times.search")} aria-label={t("times.search")} onChange={(e) => setQ(e.target.value)} />
        <button className={`btn small ${showOpts ? "active" : ""}`} aria-expanded={showOpts} onClick={() => setShowOpts(!showOpts)}>
          <Icon name="sliders" size={14} /> {t("timeline.options")}
        </button>
      </div>
      {showOpts && (
        <div className="row times-controls times-options">
        <label className="times-opt">
          <span>{t("timeline.join")}</span>
          <select value={joinMin} onChange={(e) => setJoinMin(Number(e.target.value))} title={t("timeline.joinHelp")}>
            {[0, 1, 2, 3, 5, 10].map((m) => (
              <option key={m} value={m}>
                {m ? t("timeline.upTo", { count: m }) : t("timeline.joinOff")}
              </option>
            ))}
          </select>
        </label>
        {joinMin > 0 && (
          <label className="check small" title={t("timeline.showJoinsHelp")}>
            <input type="checkbox" checked={showJoins} onChange={(e) => setShowJoins(e.target.checked)} /> {t("timeline.showJoins")}
          </label>
        )}
        {!list && (
          <select value={density} onChange={(e) => setDensity(e.target.value as typeof density)} aria-label={t("timeline.density")}>
            <option value="comfy">{t("timeline.comfy")}</option>
            <option value="compact">{t("timeline.compact")}</option>
            <option value="dense">{t("timeline.dense")}</option>
          </select>
        )}
        <label className="check small">
          <input type="checkbox" checked={hideIdle} onChange={(e) => setHideIdle(e.target.checked)} /> {t("timeline.hideIdle")}
        </label>
        </div>
      )}
      <DataNote servers={data.servers} covered={covered} />
      <p className="small muted times-legend">
        <span>
          <span className="tl-key bar" /> {t("timeline.keyOnline")}
        </span>
        <span>
          <span className="tl-key gap" /> {t("timeline.keyGap")}
        </span>
        {showJoins && joinMin > 0 && (
          <span>
            <span className="tl-key join" /> {t("timeline.keyJoin")}
          </span>
        )}
        <span className="times-counts">
          {t("timeline.counts", { shown: rows.shown, count: rows.count })}
          {data.servers > 0 ? ` · ${t("timeline.withServer", { count: data.servers })}` : ` · ${t("timeline.noServer")}`}
          {data.remoteErr && <span className="warn"> · {data.remoteErr}</span>}
          {data.remoteBusy && (
            <span className="times-busy">
              {" "}
              · <span className="skel" style={{ width: 10, height: 10, borderRadius: 5 }} /> {t("timeline.serverLoading")}
            </span>
          )}
        </span>
      </p>
      {noData && <p className="small muted">{t("timeline.empty")}</p>}
      {list ? (
        <SessionList rows={rows.all} view={view} onView={setView} />
      ) : (
        <TimesTimeline rows={rows.all} gaps={gaps} view={view} onView={setView} rowH={rowH} showJoins={showJoins} gapText={t(data.servers === 0 ? "timeline.noDataApp" : data.remoteErr ? "timeline.noDataUnreached" : "timeline.noDataBoth")} onOpen={(id) => setState({ selectedId: id })} />
      )}
      {!list && <p className="small muted">{t("timeline.help")}</p>}
    </>
  );
}

/** The same sessions as text, newest first: "20:14 – 23:52 (3 h 38 min)". */
function SessionList({ rows, view, onView }: { rows: TimelineRow[]; view: TimelineView; onView: (v: TimelineView) => void }) {
  const t = useT();
  const [limit, setLimit] = useState(200);
  const items = useMemo(() => {
    const out: { row: TimelineRow; s: Span; joins: number }[] = [];
    for (const r of rows) for (const s of r.spans) if (s[1] > view.start && s[0] < view.end) out.push({ row: r, s, joins: r.joined.filter((j) => j >= s[0] && j <= s[1]).length });
    return out.sort((a, b) => b.s[1] - a.s[1]);
  }, [rows, view]);
  let lastDay = "";
  return (
    <div className="times-list">
      <p className="small muted">
        {t("timeline.listAbout", { from: new Date(view.start).toLocaleDateString(language()), to: new Date(view.end).toLocaleDateString(language()), count: items.length })}{" "}
        <button className="btn link small" onClick={() => onView({ start: view.start - 7 * 864e5, end: view.end })}>
          {t("timeline.earlier")}
        </button>
      </p>
      <ul>
        {items.slice(0, limit).map(({ row, s, joins }) => {
          const day = new Date(s[1]).toLocaleDateString(language(), { weekday: "long", day: "numeric", month: "long" });
          const head = day !== lastDay ? <li className="times-list-day">{day}</li> : null;
          lastDay = day;
          return (
            <Fragment key={`${row.id}-${s[0]}`}>
              {head}
              <li className={`times-list-row ${row.me ? "me" : ""}`}>
                <button className="link-btn" onClick={() => !row.me && setState({ selectedId: row.id })}>
                  {row.name}
                </button>
                <span className="times-list-time">
                  {new Date(s[0]).toLocaleTimeString(language(), { hour: "2-digit", minute: "2-digit" })} – {new Date(s[1]).toLocaleTimeString(language(), { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="small muted">
                  {fmtDuration(s[1] - s[0])}
                  {joins ? ` · ${t("timeline.disconnects", { count: joins })}` : ""}
                </span>
              </li>
            </Fragment>
          );
        })}
      </ul>
      {items.length > limit && (
        <button className="btn small" onClick={() => setLimit(limit + 300)}>
          {t("listView.more", { count: items.length - limit })}
        </button>
      )}
    </div>
  );
}
