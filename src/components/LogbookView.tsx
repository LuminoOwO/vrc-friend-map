// Logbook (from your game logs): a day's timeline with who joined and left,
// video links, pictures and avatars, your diary note, "on this day a year
// ago" and an instance replay; rankings and stats; all video links; the
// picture gallery tagged with world and people; a year in review.
import { t as tr, weekdayNames } from "../i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { backend, isTauri } from "../backend";
import { popularWorlds, setDiary, useHistory } from "../history";
import {
  allVideos,
  allVisits,
  avatarAt,
  dayKey,
  dayStart,
  fmtClock,
  fmtDuration,
  pictureSrc,
  presentAt,
  rankings,
  sessions,
  shiftDay,
  tagPictures,
  todayKey,
  visitsOnDay,
  type Picture,
  type TaggedPicture,
  type TimelineVisit,
} from "../logbook";
import { naiveToDate } from "../logs";
import { shownName } from "../personal";
import { loadSteamDays, steamDay } from "../steamdays";
import { setState, showToast, useApp } from "../store";
import { Icon } from "./Icon";
import { Range } from "./Range";
import { SkelBlock } from "../ui2/smooth";

type Tab = "day" | "stats" | "videos" | "pictures" | "year";

export function LogbookView() {
  const [tab, setTab] = useState<Tab>("day");
  const [visits, setVisits] = useState<TimelineVisit[] | null>(null);
  const [err, setErr] = useState("");
  const lastScan = useApp((s) => s.logs.lastScan);
  useEffect(() => {
    allVisits(true).then(setVisits, (e) => setErr(String(e)));
  }, [lastScan]);
  return (
    <div className="activity-view logbook">
      <div className="seg logbook-tabs" role="tablist">
        {(
          [
            ["day", tr("logbook.dayByDay")],
            ["stats", tr("logbook.rankings")],
            ["videos", tr("logbook.videoLinks")],
            ["pictures", tr("logbook.pictures")],
            ["year", tr("logbook.yearInReview")],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {err && <p className="warn small">{err}</p>}
      {!visits ? (
        <SkelBlock lines={4} label={tr("logbook.loadingYourGameLogs")} />
      ) : !visits.length ? (
        <p className="muted">
          {tr("logbook.nothingYetTheLogbookComes")}
        </p>
      ) : (
        <>
          {tab === "day" && <DayView visits={visits} />}
          {tab === "stats" && <Stats visits={visits} />}
          {tab === "videos" && <Videos visits={visits} />}
          {tab === "pictures" && <Pictures visits={visits} />}
          {tab === "year" && <YearInReview visits={visits} />}
        </>
      )}
    </div>
  );
}

function Person({ id, name }: { id: string; name: string }) {
  const friend = useApp((s) => !!s.cache.friends[id]);
  return (
    <button className={`mini ${friend ? "friend" : ""}`} onClick={() => setState({ selectedId: id })} title={friend ? "Friend" : tr("logbook.notAFriend")}>
      {shownName(id, name || id)}
    </button>
  );
}

// ---------- day by day ----------

function DayView({ visits }: { visits: TimelineVisit[] }) {
  const [day, setDay] = useState(() => {
    const last = visits[visits.length - 1];
    return last ? dayKey(last.start) : todayKey();
  });
  const list = useMemo(() => visitsOnDay(visits, day), [visits, day]);
  const sess = useMemo(() => sessions(list), [list]);
  const yearAgo = useMemo(() => visitsOnDay(visits, shiftDay(day, -365)), [visits, day]);
  const diary = useHistory((h) => h.diary[day] ?? "");
  const [draft, setDraft] = useState(diary);
  useEffect(() => setDraft(diary), [day, diary]);
  const total = list.reduce((a, v) => a + Math.min(v.end, dayStart(day) + 86400) - Math.max(v.start, dayStart(day)), 0);
  const people = new Map<string, string>();
  list.forEach((v) => v.players.forEach((p) => people.set(p.id, p.name)));
  const daysWithPlay = useMemo(() => new Set(visits.map((v) => dayKey(v.start))), [visits]);
  const steam = useMemo(() => steamDay(loadSteamDays(), day), [day]);
  return (
    <>
      <div className="row day-nav">
        <button className="icon-btn" title={tr("logbook.dayBefore")} onClick={() => setDay(shiftDay(day, -1))}>
          <Icon name="chevron-left" />
        </button>
        <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <button className="icon-btn" title={tr("logbook.nextDay")} onClick={() => setDay(shiftDay(day, 1))}>
          <Icon name="chevron-right" />
        </button>
        <button className="btn small" onClick={() => setDay(todayKey())}>
          {tr("logbook.today")}
        </button>
        <button
          className="btn small ghost"
          title={tr("logbook.theLastDayYouPlayed")}
          onClick={() => {
            for (let k = shiftDay(day, -1), i = 0; i < 3650; k = shiftDay(k, -1), i++) if (daysWithPlay.has(k)) return setDay(k);
          }}
        >
          {tr("logbook.previousPlayDay")}
        </button>
      </div>
      <section className="insight-card">
        <h3>{naiveToDate(dayStart(day)).toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</h3>
        {list.length ? (
          <p className="small">
            Played {fmtDuration(total)} in {sess.length} session{sess.length === 1 ? "" : "s"} ({sess.map((s) => `${fmtClock(s.start)}–${fmtClock(s.end)}`).join(", ")}), {list.length} instance
            {list.length === 1 ? "" : "s"}, {people.size} people.
          </p>
        ) : (
          <p className="small muted">{tr("logbook.youDidnTPlayThis")}</p>
        )}
        {steam && steam.minutes > 0 && (
          <p className="small muted" title={tr("logbook.fromSteamSOwnPlay")}>
            Steam counted {fmtDuration(steam.minutes * 60)}
            {steam.spans ? ` since ${naiveToDate(dayStart(steam.since)).toLocaleDateString([], { month: "short", day: "numeric" })}` : tr("logbook.thisDay")}.
          </p>
        )}
        <label className="field">
          <span>{tr("logbook.diaryOnlyOnThisDevice")}</span>
          <textarea rows={2} value={draft} placeholder={tr("logbook.aFewWordsAboutThis")} onChange={(e) => setDraft(e.target.value)} onBlur={() => draft !== diary && setDiary(day, draft)} />
        </label>
        {yearAgo.length > 0 && (
          <p className="small">
            <Icon name="calendar" size={13} /> A year ago: {yearAgo.map((v) => v.world_name || v.world).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4).join(", ")}{" "}
            <button className="btn link small" onClick={() => setDay(shiftDay(day, -365))}>
              {tr("logbook.goThere")}
            </button>
          </p>
        )}
      </section>
      {list.map((v, i) => (
        <VisitCard key={`${v.world}-${v.start}-${i}`} v={v} />
      ))}
    </>
  );
}

function VisitCard({ v }: { v: TimelineVisit }) {
  const [replay, setReplay] = useState(false);
  const [t, setT] = useState(v.start);
  const events = useMemo(() => {
    const out: { t: number; text: React.ReactNode; kind: string }[] = [];
    for (const p of v.players) {
      if (p.from > v.start + 30) out.push({ t: p.from, kind: "join", text: <><Person id={p.id} name={p.name} /> joined</> });
      if (p.to < v.end - 30) out.push({ t: p.to, kind: "leave", text: <><Person id={p.id} name={p.name} /> left</> });
    }
    for (const x of v.videos) out.push({ t: x.t, kind: "video", text: <><Icon name="video" size={13} /> <VideoLink url={x.url} />{x.by ? tr("logbook.byBy", { by: x.by }) : ""}</> });
    for (const x of v.shots) out.push({ t: x.t, kind: "shot", text: <><Icon name="image" size={13} /> {tr("logbook.pictureTaken")}</> });
    return out.sort((a, b) => a.t - b.t);
  }, [v]);
  const atStart = v.players.filter((p) => p.from <= v.start + 30);
  const here = replay ? presentAt(v, t) : [];
  return (
    <section className="insight-card visit">
      <div className="row between">
        <h3>
          <Icon name="world" size={16} /> {v.world_name || v.world}
        </h3>
        <span className="small muted">
          {fmtClock(v.start)}–{fmtClock(v.end)} · {fmtDuration(v.end - v.start)} · {v.access}
        </span>
      </div>
      {atStart.length > 0 && (
        <div className="small">
          There when you came: <span className="mini-list">{atStart.map((p) => <Person key={p.id} id={p.id} name={p.name} />)}</span>
        </div>
      )}
      {events.length > 0 && (
        <ul className="visit-events">
          {events.slice(0, 200).map((e, i) => (
            <li key={i} className={e.kind}>
              <span className="muted small">{fmtClock(e.t)}</span> {e.text}
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <button className="btn small ghost" onClick={() => setReplay(!replay)}>
          <Icon name="play" size={13} /> {replay ? tr("logbook.closeReplay") : "Replay"}
        </button>
        <button className="btn small ghost" onClick={() => setState({ openWorld: v.world })}>
          <Icon name="external" size={13} /> {tr("logbook.world")}
        </button>
      </div>
      {replay && (
        <div className="replay">
          <Range pct={false} min={v.start} max={v.end} step={30} value={t} onChange={(e) => setT(Number(e.target.value))} />
          <p className="small">
            <b>{fmtClock(t)}</b>: {here.length} {here.length === 1 ? "person" : "people"} besides you
          </p>
          <div className="replay-people">
            {here.map((p) => (
              <span key={p.id} className="replay-person">
                <Person id={p.id} name={p.name} />
                {avatarAt(v, p, t) && <span className="muted small"> as {avatarAt(v, p, t)}</span>}
              </span>
            ))}
          </div>
          <button className="btn small" onClick={() => setState({ view: "graph", previewFilters: null, selectedId: null })} title={tr("logbook.backToTheMap")}>
            {tr("logbook.map")}
          </button>
        </div>
      )}
    </section>
  );
}

function videoTitle(url: string): string {
  try {
    const u = new URL(url);
    const yt = u.searchParams.get("v") ?? (u.hostname === "youtu.be" ? u.pathname.slice(1) : "");
    if (yt) return tr("logbook.youtubeYt", { yt });
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.length > 1 ? u.pathname.slice(0, 40) : ""}`;
  } catch {
    return url;
  }
}

function VideoLink({ url }: { url: string }) {
  return (
    <button className="link-btn" title={url} onClick={() => backend.openUrl(url).catch(() => showToast(tr("logbook.couldnTOpenTheLink")))}>
      {videoTitle(url)}
    </button>
  );
}

// ---------- rankings ----------

const RANGES: [string, number][] = [
  ["logbook.last7", 7],
  ["logbook.last30", 30],
  ["logbook.last90", 90],
  ["logbook.lastYear", 365],
  ["logbook.allTime", 0],
];

function Stats({ visits }: { visits: TimelineVisit[] }) {
  const [days, setDays] = useState(30);
  const from = days ? dayStart(shiftDay(todayKey(), -days + 1)) : 0;
  const r = useMemo(() => rankings(visits, from), [visits, from]);
  const [pickWorld, setPickWorld] = useState<string | null>(null);
  const cache = useApp((s) => s.cache);
  useHistory((h) => Object.keys(h.worlds).length);
  const popular = popularWorlds(7).slice(0, 10);
  const maxHeat = Math.max(...r.heat, 1);
  return (
    <>
      <div className="row">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {RANGES.map(([l, d]) => (
            <option key={d} value={d}>
              {tr(l)}
            </option>
          ))}
        </select>
        <span className="small">
          {fmtDuration(r.totalSecs)} on {r.days} days · streak: {r.streak.current} day{r.streak.current === 1 ? "" : "s"} now, best {r.streak.best}
          {r.busiestDay ? tr("logbook.busiestDayKeyValue", { key: r.busiestDay.key, value: fmtDuration(r.busiestDay.secs) }) : ""}
        </span>
      </div>
      <div className="insights">
        <section className="insight-card">
          <h3>
            <Icon name="world" size={16} /> {tr("logbook.worldsByTime")}
          </h3>
          <ol className="rank-list">
            {r.worlds.slice(0, 15).map((w) => (
              <li key={w.world}>
                <button className="link-btn" onClick={() => setPickWorld(pickWorld === w.world ? null : w.world)}>
                  {w.name}
                </button>{" "}
                <span className="muted small">
                  {fmtDuration(w.secs)} · {w.visits}×
                </span>
                {pickWorld === w.world && (
                  <div className="small">
                    Most often with you there: {(r.worldPeople.get(w.world) ?? []).map((p) => <Person key={p.id} id={p.id} name={p.name} />)}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
        <section className="insight-card">
          <h3>
            <Icon name="users" size={16} /> {tr("logbook.peopleByTimeTogether")}
          </h3>
          <ol className="rank-list">
            {r.people.slice(0, 20).map((p) => (
              <li key={p.id}>
                <Person id={p.id} name={p.name} />{" "}
                <span className="muted small">
                  {fmtDuration(p.secs)} · {p.days} day{p.days === 1 ? "" : "s"} · first met {naiveToDate(p.first).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section className="insight-card">
          <h3>
            <Icon name="clock" size={16} /> {tr("logbook.whenYouPlay")}
          </h3>
          <div className="heatmap">
            {weekdayNames("short").map((d, day) => (
              <div key={d} className="heat-row">
                <span className="heat-day">{d}</span>
                {Array.from({ length: 24 }, (_, h) => (
                  <span key={h} className="heat-cell" style={{ opacity: 0.06 + (r.heat[day * 24 + h] / maxHeat) * 0.94 }} title={`${d} ${h}:00: ${fmtDuration(r.heat[day * 24 + h])}`} />
                ))}
              </div>
            ))}
          </div>
          <h4>{tr("logbook.longestSessions")}</h4>
          <ul className="missed-list">
            {r.longest.map((s) => (
              <li key={s.start}>
                {naiveToDate(s.start).toLocaleDateString()} {fmtClock(s.start)}–{fmtClock(s.end)} <span className="muted small">{fmtDuration(s.end - s.start)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="insight-card">
          <h3>
            <Icon name="star" size={16} /> {tr("logbook.popularAmongYourFriends7")}
          </h3>
          {popular.length ? (
            <ol className="rank-list">
              {popular.map((p) => (
                <li key={p.world}>
                  <button className="link-btn" onClick={() => backend.openUrl(`https://vrchat.com/home/world/${p.world}`).catch(() => {})}>
                    {cache.worlds?.[p.world]?.name ?? r.worlds.find((w) => w.world === p.world)?.name ?? p.world}
                  </button>{" "}
                  <span className="muted small">{fmtDuration(p.minutes * 60)} of friend time</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="small muted">{tr("logbook.buildsUpWhileTheApp")}</p>
          )}
        </section>
      </div>
    </>
  );
}

// ---------- videos ----------

function Videos({ visits }: { visits: TimelineVisit[] }) {
  const [q, setQ] = useState("");
  const all = useMemo(() => allVideos(visits), [visits]);
  const list = all.filter((v) => !q || `${v.url} ${v.worldName} ${v.by ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const exportCsv = () => {
    const rows = [["time", "world", "url", "requested by"], ...list.map((v) => [naiveToDate(v.t).toISOString(), v.worldName, v.url, v.by ?? ""])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "vrchat-video-links.csv";
    a.click();
  };
  return (
    <section className="insight-card">
      <div className="row between">
        <h3>
          <Icon name="video" size={16} /> Video links ({all.length})
        </h3>
        <div className="row tight">
          <input placeholder={tr("logbook.searchLinksWorldsPeople")} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn small" onClick={exportCsv} disabled={!list.length}>
            <Icon name="download" size={14} /> CSV
          </button>
        </div>
      </div>
      <ul className="video-list">
        {list.slice(0, 500).map((v, i) => (
          <li key={`${v.t}-${i}`}>
            <span className="muted small">{naiveToDate(v.t).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
            <VideoLink url={v.url} />
            <button className="icon-btn tiny" title={tr("logbook.copyLink")} onClick={() => navigator.clipboard?.writeText(v.url).then(() => showToast(tr("logbook.linkCopied")))}>
              <Icon name="copy" size={13} />
            </button>
            <span className="muted small">
              {v.worldName}
              {v.by ? tr("logbook.byBy2", { by: v.by }) : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- pictures ----------

function Pictures({ visits }: { visits: TimelineVisit[] }) {
  const extra = useApp((s) => s.settings.logs.pictureDirs);
  const [pics, setPics] = useState<TaggedPicture[] | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<TaggedPicture | null>(null);
  useEffect(() => {
    if (!isTauri) return setPics([]);
    (async () => {
      const found = await backend.picturesDetect();
      const list: Picture[] = await backend.picturesList([...found, ...extra]);
      setPics(tagPictures(list, visits));
    })().catch((e) => {
      showToast(tr("logbook.couldnTReadThePictures", { error: e }));
      setPics([]);
    });
  }, [extra, visits]);
  if (!pics) return <p className="muted">{tr("logbook.lookingForYourVrchatPictures")}</p>;
  if (!pics.length)
    return (
      <p className="muted">
        No VRChat pictures found. They're looked for in Pictures/VRChat (Windows) and the Proton folder (Linux); add your own folder in Settings → Game logs.
      </p>
    );
  const ql = q.toLowerCase();
  const list = pics.filter((p) => !q || (p.worldName ?? "").toLowerCase().includes(ql) || p.people.some((x) => shownName(x.id, x.name).toLowerCase().includes(ql)));
  return (
    <>
      <div className="row">
        <input placeholder={tr("logbook.findAWorldOrA")} value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="small muted">
          {list.length} of {pics.length} pictures
        </span>
      </div>
      <div className="pic-grid">
        {list.slice(0, 400).map((p) => (
          <button key={p.path} className="pic" onClick={() => setOpen(p)} title={`${p.worldName ?? ""} ${naiveToDate(p.t).toLocaleString()}`}>
            <img src={pictureSrc(p.path)} alt="" loading="lazy" />
            <span className="pic-meta small">
              {p.worldName ?? "?"} · {p.people.length} people
            </span>
          </button>
        ))}
      </div>
      {open && <PictureViewer p={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function PictureViewer({ p, onClose }: { p: TaggedPicture; onClose: () => void }) {
  return (
    <div className="modal-backdrop top" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal pic-view" role="dialog" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="row between">
          <h2>{p.worldName ?? "Picture"}</h2>
          <button className="icon-btn" aria-label={tr("logbook.close")} onClick={onClose} autoFocus>
            <Icon name="close" />
          </button>
        </div>
        <img className="pic-full" src={pictureSrc(p.path)} alt="" />
        <p className="small muted">
          {naiveToDate(p.t).toLocaleString()} · {p.width && p.height ? tr("logbook.widthHeight", { width: p.width, height: p.height }) : ""}
          {(p.size / 1024 / 1024).toFixed(1)} MB
        </p>
        {p.people.length > 0 && (
          <div className="small">
            With: <span className="mini-list">{p.people.map((x) => <Person key={x.id} id={x.id} name={x.name} />)}</span>
          </div>
        )}
        <div className="row">
          <button className="btn small" onClick={() => backend.revealPath(p.path).catch(() => showToast(tr("logbook.couldnTOpenTheFolder")))}>
            <Icon name="folder" size={14} /> {tr("logbook.showInFolder")}
          </button>
          <a className="btn small" href={pictureSrc(p.path)} download={p.name}>
            <Icon name="download" size={14} /> {tr("logbook.saveACopy")}
          </a>
          <button className="btn small" onClick={() => navigator.clipboard?.writeText(p.path).then(() => showToast(tr("logbook.pathCopied")))}>
            <Icon name="copy" size={14} /> {tr("logbook.copyPath")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- year in review ----------

function YearInReview({ visits }: { visits: TimelineVisit[] }) {
  const years = useMemo(() => [...new Set(visits.map((v) => naiveToDate(v.start).getFullYear()))].sort((a, b) => b - a), [visits]);
  const [year, setYear] = useState(years[0] ?? new Date().getFullYear());
  const from = Date.UTC(year, 0, 1) / 1000;
  const to = Date.UTC(year + 1, 0, 1) / 1000;
  const r = useMemo(() => rankings(visits, from, to), [visits, from, to]);
  const log = useApp((s) => s.local.friendLog);
  const added = log.filter((e) => e.type === "added" && new Date(e.t).getFullYear() === year).length;
  const canvas = useRef<HTMLCanvasElement>(null);
  const lines = [
    tr("logbook.yrTime", { time: fmtDuration(r.totalSecs), days: r.days }),
    tr("logbook.yrWorld", { world: r.worlds[0]?.name ?? "–" }),
    tr("logbook.yrPeople", { names: r.people.slice(0, 3).map((p) => shownName(p.id, p.name)).join(", ") || "–" }),
    tr("logbook.yrMet", { people: r.people.length, added }),
    tr("logbook.yrLongest", { time: r.longest[0] ? fmtDuration(r.longest[0].end - r.longest[0].start) : "–", days: r.streak.best }),
    tr("logbook.yrPics", { shots: r.shots, videos: r.videos }),
  ];
  const save = () => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    c.width = 1080;
    c.height = 1080;
    const g = ctx.createLinearGradient(0, 0, 1080, 1080);
    g.addColorStop(0, "#1b2a3a");
    g.addColorStop(1, "#3a1f4d");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1080, 1080);
    ctx.fillStyle = "#fff";
    ctx.font = "700 72px system-ui, sans-serif";
    ctx.fillText(`My ${year} in VRChat`, 80, 180);
    ctx.font = "400 40px system-ui, sans-serif";
    lines.forEach((l, i) => ctx.fillText(l.length > 46 ? `${l.slice(0, 45)}…` : l, 80, 320 + i * 100));
    ctx.font = "400 28px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText("VRC Friend Map", 80, 1000);
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `vrchat-${year}.png`;
    a.click();
  };
  return (
    <section className="insight-card year">
      <div className="row between">
        <h3>
          <Icon name="crown" size={16} /> Your {year}
        </h3>
        <div className="row tight">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button className="btn small" onClick={save}>
            <Icon name="download" size={14} /> {tr("logbook.saveAsPicture")}
          </button>
        </div>
      </div>
      <ul className="year-lines">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <h4>{tr("logbook.topWorlds")}</h4>
      <ol className="rank-list">
        {r.worlds.slice(0, 5).map((w) => (
          <li key={w.world}>
            {w.name} <span className="muted small">{fmtDuration(w.secs)}</span>
          </li>
        ))}
      </ol>
      <h4>{tr("logbook.topPeople")}</h4>
      <ol className="rank-list">
        {r.people.slice(0, 5).map((p) => (
          <li key={p.id}>
            <Person id={p.id} name={p.name} /> <span className="muted small">{fmtDuration(p.secs)}</span>
          </li>
        ))}
      </ol>
      <p className="small muted">{tr("logbook.privateOnlyOnThisDevice")}</p>
      <canvas ref={canvas} hidden />
    </section>
  );
}

/** Used by the profile: pictures with someone and their avatars, from the logbook. */
export function usePersonLog(id: string, name: string) {
  const [data, setData] = useState<{ pics: TaggedPicture[]; avatars: { avatar: string; t: number; world: string }[] } | null>(null);
  const extra = useApp((s) => s.settings.logs.pictureDirs);
  useEffect(() => {
    let alive = true;
    (async () => {
      const visits = await allVisits();
      const { avatarHistory } = await import("../logbook");
      const avatars = avatarHistory(visits, id, name);
      let pics: TaggedPicture[] = [];
      if (isTauri) {
        const found = await backend.picturesDetect();
        const list = await backend.picturesList([...found, ...extra]);
        pics = tagPictures(list, visits).filter((p) => p.people.some((x) => x.id === id));
      }
      if (alive) setData({ pics, avatars });
    })().catch(() => alive && setData({ pics: [], avatars: [] }));
    return () => {
      alive = false;
    };
  }, [id, name, extra]);
  return data;
}

