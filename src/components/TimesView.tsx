// "Online times": when all your friends are usually online, side by side with you. A bar per hour
// says how many friends are usually on (your own usual hours marked); below, every friend's day as
// 24 cells, the hours you share highlighted. Sorted by how much your times overlap.
import { useT, weekdayNames } from "../i18n";
import { useEffect, useMemo, useState } from "react";
import { imgSrc } from "../backend";
import { useHistory } from "../history";
import { iconUrl, presenceOf, statusColor } from "../model";
import { dayShares, demoSeen, usualCounts, USUAL, weeklyOverlap, type Day } from "../onlinetimes";
import { shownName } from "../personal";
import { setState, useApp } from "../store";
import { Icon } from "./Icon";

type Sort = "overlap" | "online" | "name";

export function TimesView() {
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

  const strip = (shares: number[] | null, me = false) => (
    <div className={`times-strip ${me ? "me" : ""}`}>
      {Array.from({ length: 24 }, (_, h) => {
        const v = shares?.[h] ?? 0;
        const both = !me && v >= USUAL && (mine?.[h] ?? 0) >= USUAL;
        return <span key={h} className={`times-cell ${both ? "both" : ""} ${h === hour ? "picked" : ""}`} style={{ opacity: v ? 0.12 + v * 0.88 : 0.06 }} />;
      })}
      {showNow && <span className="times-now" style={{ left: `calc(${(nowH + new Date().getMinutes() / 60) / 24} * 100%)` }} aria-hidden="true" />}
    </div>
  );

  return (
    <div className="activity-view times-view">
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

      <ul className="times-rows">
        <li className="times-row me">
          <span className="times-who">
            <Icon name="user" size={16} /> <b>{t("times.you")}</b>
          </span>
          <span className="times-score" />
          {mine ? strip(mine, true) : <span className="small muted">{t("times.youNoData")}</span>}
        </li>
        {shown.map(({ f, shares, overlap, online }) => {
          const pic = imgSrc(iconUrl(f));
          return (
            <li key={f.id} className="times-row">
              <button className="times-who" onClick={() => setState({ selectedId: f.id })}>
                <span className="times-pic" style={{ borderColor: online ? statusColor(f, "online") : "transparent" }}>
                  {pic ? <img src={pic} alt="" loading="lazy" /> : shownName(f.id, f.displayName).slice(0, 1)}
                </span>
                <span className="times-name">{shownName(f.id, f.displayName)}</span>
              </button>
              <span className="times-score" title={t("times.overlapTitle")}>
                {overlap ? t("times.hoursWeek", { count: overlap }) : ""}
              </span>
              {strip(shares)}
            </li>
          );
        })}
      </ul>
      <p className="small muted">
        {without > 0 && t("times.without", { count: without })} {t("times.about")}
      </p>
    </div>
  );
}
