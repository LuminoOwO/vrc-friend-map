// Layout "Timeline": views as a slim icon column on the left, the view in the middle, and a time
// river along the bottom: the last hours of activity laid out on a clock, with a "now" line and
// who's online right now along the top of it.
import { useEffect, useMemo, useRef, useState } from "react";
import { imgSrc } from "../../backend";
import { iconUrl, presenceOf } from "../../model";
import { setState, useApp } from "../../store";
import { ActivityText, friendLogEntries, useActivityLoaded } from "../../components/ActivityView";
import { Icon } from "../../components/Icon";
import { RAIL, ToolCluster, ViewBody } from "../parts";

const HOURS = 8;
const PX_PER_HOUR = 260;

export function TimelineLayout({ onPalette }: { onPalette: () => void }) {
  const view = useApp((s) => s.view);
  return (
    <div className="lay-time">
      <nav className="tl-rail" aria-label="Views">
        {RAIL.map((r) => (
          <button key={r.key} className={`tl-rail-btn ${view === r.key ? "on" : ""}`} title={r.label} aria-label={r.label} onClick={() => setState({ view: r.key })}>
            <Icon name={r.icon} size={20} />
          </button>
        ))}
      </nav>
      <div className="tl-main">
        <ToolCluster onPalette={onPalette} className="tl-tools" />
        <div className="tl-view">
          <div className="ui2-view" key={view}>
            <ViewBody view={view} />
          </div>
        </div>
        <River />
      </div>
    </div>
  );
}

function River() {
  useActivityLoaded();
  const activity = useApp((s) => s.activity);
  const friendLog = useApp((s) => s.local.friendLog);
  const friends = useApp((s) => s.cache.friends);
  const presence = useApp((s) => s.cache.presence);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const start = now - HOURS * 3600_000;
  const width = HOURS * PX_PER_HOUR;
  const events = useMemo(
    () =>
      [...activity.filter((e) => !e.initial), ...friendLogEntries(friendLog.slice(-30))]
        .filter((e) => e.t >= start)
        .sort((a, b) => a.t - b.t),
    [activity, friendLog, start],
  );
  const online = useMemo(() => Object.values(friends).filter((f) => presenceOf(f, presence) === "online"), [friends, presence]);
  const box = useRef<HTMLDivElement>(null);
  // Start scrolled to "now" (the right end).
  useEffect(() => {
    box.current?.scrollTo({ left: width });
  }, [width]);
  const x = (t: number) => ((t - start) / (now - start)) * width;
  const hours = Array.from({ length: HOURS + 1 }, (_, i) => start + i * 3600_000 - (start % 3600_000) + 3600_000).filter((t) => t <= now);
  // Lanes so cards close in time don't sit on top of each other.
  const laneEnds = [0, 0, 0];
  const placed = events.map((e) => {
    const px = x(e.t);
    let lane = laneEnds.findIndex((end) => end < px);
    if (lane < 0) lane = laneEnds.indexOf(Math.min(...laneEnds));
    laneEnds[lane] = px + 210;
    return { e, px, lane };
  });
  return (
    <section className="tl-river" aria-label="Activity over time">
      <div className="tl-online">
        <b>Online · {online.length}</b>
        <div className="tl-faces">
          {online.slice(0, 40).map((f) => {
            const src = imgSrc(iconUrl(f));
            return (
              <button key={f.id} className="tl-face" title={f.displayName} onClick={() => setState({ selectedId: f.id })}>
                <span className="ui2-avatar" style={{ width: 30, height: 30 }}>
                  {src ? <img src={src} alt="" loading="lazy" /> : f.displayName[0]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="tl-scroll" ref={box}>
        <div className="tl-track" style={{ width: width + 220 }}>
          {hours.map((t) => (
            <span key={t} className="tl-hour" style={{ left: x(t) }}>
              {new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          ))}
          <span className="tl-now" style={{ left: x(now) }}>
            <span>now</span>
          </span>
          {placed.map(({ e, px, lane }) => (
            <div key={e.key} className={`tl-event act-${e.kind}`} style={{ left: px, top: 34 + lane * 46 }} title={new Date(e.t).toLocaleString()}>
              <span className="tl-dot" />
              <span className="tl-text">
                <ActivityText e={e} />
              </span>
            </div>
          ))}
          {placed.length === 0 && <p className="tl-empty muted small">Nothing in the last {HOURS} hours.</p>}
        </div>
      </div>
    </section>
  );
}
