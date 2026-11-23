// Your own profile: when you were online the last 7 days (from the exact sessions the app
// records for you, src/sessions.ts), with totals and a link to the full Online times view.
import { useEffect, useMemo, useState } from "react";
import { t as tr, language } from "../i18n";
import { clipSpans, demoSessions, gapsIn, totalMs, type Span } from "../onlinetimes";
import { ME, onSessions, sessionsData } from "../sessions";
import { setState, useApp } from "../store";
import { Icon } from "./Icon";

const DAY = 86400_000;
const fmtH = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? tr("myTimes.minutes", { n: m }) : tr("myTimes.hours", { n: (m / 60).toFixed(m < 600 ? 1 : 0) });
};

export function MyOnlineTimes() {
  const demo = useApp((s) => s.demo);
  const [version, setVersion] = useState(0);
  useEffect(() => onSessions(() => setVersion((v) => v + 1)), []);
  // Re-read once a minute so "now" and a running session move along.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const spans: Span[] = useMemo(() => {
    const list = demo ? (demoSessions([ME], now).sessions[ME] ?? []) : (sessionsData().sessions[ME] ?? []);
    // A session still running ends now.
    return list.map(([a, b]) => [a, Math.min(b, now)] as Span).filter(([a, b]) => b > a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, version, Math.floor(now / 60_000)]);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const from = today.getTime() - (6 - i) * DAY;
    return { from, to: from + DAY, spans: clipSpans(spans, from, from + DAY) };
  });
  const week = days.reduce((n, d) => n + totalMs(d.spans), 0);
  const todayMs = totalMs(days[6].spans);
  const longest = spans.filter(([, b]) => b > now - 7 * DAY).reduce((m, [a, b]) => Math.max(m, b - a), 0);
  const nowPos = ((now - today.getTime()) / DAY) * 100;
  const wd = new Intl.DateTimeFormat(language(), { weekday: "short" });

  return (
    <div className="profile-block mytimes" data-flip-fade>
      <h3>{tr("myTimes.title")}</h3>
      <MyCoverage now={now} />
      {!spans.length ? (
        <p className="small muted">{tr("myTimes.empty")}</p>
      ) : (
        <>
          <div className="mytimes-stats">
            <span>
              <b>{fmtH(week)}</b>
              <small>{tr("myTimes.last7")}</small>
            </span>
            <span>
              <b>{fmtH(todayMs)}</b>
              <small>{tr("myTimes.today")}</small>
            </span>
            <span>
              <b>{fmtH(longest)}</b>
              <small>{tr("myTimes.longest")}</small>
            </span>
          </div>
          <div className="mytimes-days" role="img" aria-label={tr("myTimes.chart")}>
            {days.map((d, i) => (
              <div key={d.from} className={`mytimes-row ${i === 6 ? "today" : ""}`}>
                <span className="mytimes-day">{i === 6 ? tr("myTimes.todayShort") : wd.format(d.from)}</span>
                <span className="mytimes-track">
                  {d.spans.map(([a, b]) => (
                    <span
                      key={a}
                      className="mytimes-bar"
                      style={{ left: `${((a - d.from) / DAY) * 100}%`, width: `max(3px, ${((b - a) / DAY) * 100}%)` }}
                      title={`${new Date(a).toLocaleTimeString(language(), { hour: "2-digit", minute: "2-digit" })} – ${new Date(b).toLocaleTimeString(language(), { hour: "2-digit", minute: "2-digit" })}`}
                    />
                  ))}
                  {i === 6 && <span className="mytimes-now" style={{ left: `${nowPos}%` }} />}
                </span>
                <span className="mytimes-sum">{totalMs(d.spans) ? fmtH(totalMs(d.spans)) : ""}</span>
              </div>
            ))}
            <div className="mytimes-row mytimes-axis" aria-hidden>
              <span className="mytimes-day" />
              <span className="mytimes-track">
                {[0, 6, 12, 18].map((h) => (
                  <span key={h} style={{ left: `${(h / 24) * 100}%` }}>
                    {new Date(2000, 0, 1, h).toLocaleTimeString(language(), { hour: "numeric" })}
                  </span>
                ))}
              </span>
              <span className="mytimes-sum" />
            </div>
          </div>
        </>
      )}
      <button className="btn small" onClick={() => setState({ view: "times", selectedId: null })}>
        <Icon name="chart" size={14} /> {tr("myTimes.open")}
      </button>
    </div>
  );
}

/** How much of the last 7 days anything was watching (this device; a server logger fills in
 *  more, see Online times). Online times are only complete when something watches all the time. */
function MyCoverage({ now }: { now: number }) {
  const demo = useApp((s) => s.demo);
  const loggers = useApp((s) => s.settings.sharing.servers.filter((x) => x.loggerOwner).length);
  const from = now - 7 * DAY;
  const cov = demo ? demoSessions([ME], now).coverage : sessionsData().coverage;
  const pct = Math.round((1 - totalMs(gapsIn(cov, from, now)) / (now - from)) * 100);
  return (
    <p className={`small mytimes-cover ${pct < 90 ? "low" : ""}`}>
      {tr("myTimes.coverage", { pct })} {loggers ? tr("myTimes.coverageServer") : tr("myTimes.coverageNoServer")}
    </p>
  );
}
