// Layout "Magazine": an editorial front page. The masthead with the date, a big hero for the
// world where most of your friends are, "Right now" cards for the next ones, the activity as
// headlines, and your corner (where you are, the numbers). The sections in the masthead open
// every view as a full page.
import { useEffect, useMemo, useState } from "react";
import { imgSrc } from "../../backend";
import { iconUrl } from "../../model";
import { setState, useApp } from "../../store";
import { loadWorld } from "../../sync";
import { ActivityText, friendLogEntries, useActivityLoaded } from "../../components/ActivityView";
import { parseLocation } from "../../components/DetailPanel";
import { Icon } from "../../components/Icon";
import type { Friend } from "../../types";
import { RAIL, ToolCluster, ViewBody, useOpenWorld } from "../parts";
import { Overview, WhereCard } from "../SidePanel";
import { spotTitle, useSpots, type Spot } from "../OnlineNow";

export function MagazineLayout({ onPalette }: { onPalette: () => void }) {
  const view = useApp((s) => s.view);
  const [front, setFront] = useState(true);
  return (
    <div className="lay-mag">
      <header className="mag-mast">
        <div className="mag-title">
          <button className="mag-name" onClick={() => setFront(true)}>
            The Friend Map
          </button>
          <span>{new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
        </div>
        <ToolCluster onPalette={onPalette} />
        <nav className="mag-sections" aria-label="Sections">
          <button className={front ? "on" : ""} onClick={() => setFront(true)}>
            Front page
          </button>
          {RAIL.map((r) => (
            <button
              key={r.key}
              className={!front && view === r.key ? "on" : ""}
              onClick={() => {
                setFront(false);
                setState({ view: r.key });
              }}
            >
              {r.label}
            </button>
          ))}
        </nav>
      </header>
      {front ? (
        <FrontPage />
      ) : (
        <div className="mag-page">
          <div className="ui2-view" key={view}>
            <ViewBody view={view} />
          </div>
        </div>
      )}
    </div>
  );
}

function useWorld(key: string) {
  const loc = key.startsWith("wrld_") ? parseLocation(key) : null;
  const world = useApp((s) => (loc ? s.cache.worlds?.[loc.world] : undefined));
  useEffect(() => {
    if (loc) loadWorld(loc.world);
  }, [loc?.world]); // eslint-disable-line react-hooks/exhaustive-deps
  return { loc, world };
}

function Faces({ people, size = 30 }: { people: Friend[]; size?: number }) {
  return (
    <span className="mag-faces">
      {people.slice(0, 6).map((f) => {
        const src = imgSrc(iconUrl(f));
        return (
          <span key={f.id} className="ui2-avatar" style={{ width: size, height: size }} title={f.displayName}>
            {src ? <img src={src} alt="" loading="lazy" /> : f.displayName[0]}
          </span>
        );
      })}
    </span>
  );
}

function FrontPage() {
  const spots = useSpots().filter((s) => s.key.startsWith("wrld_"));
  const [hero, ...rest] = spots;
  useActivityLoaded();
  const activity = useApp((s) => s.activity);
  const friendLog = useApp((s) => s.local.friendLog);
  const stories = useMemo(
    () =>
      [...activity.filter((e) => !e.initial), ...friendLogEntries(friendLog.slice(-20))]
        .sort((a, b) => b.t - a.t)
        .slice(0, 12),
    [activity, friendLog],
  );
  return (
    <div className="mag-front">
      {hero ? <Hero spot={hero} /> : <div className="mag-hero empty"><h2>Quiet right now</h2><p>None of your friends are in a public world at the moment.</p></div>}
      {rest.length > 0 && (
        <section className="mag-section">
          <h3>Right now</h3>
          <div className="mag-now">
            {rest.slice(0, 4).map((s) => (
              <NowCard key={s.key} spot={s} />
            ))}
          </div>
        </section>
      )}
      <div className="mag-cols">
        <section className="mag-section">
          <h3>Headlines</h3>
          <ol className="mag-stories">
            {stories.map((e, i) => (
              <li key={e.key} className={i === 0 ? "lead" : ""}>
                <span className="mag-time">{new Date(e.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <span>
                  <ActivityText e={e} />
                </span>
              </li>
            ))}
            {stories.length === 0 && <li className="muted">No news yet.</li>}
          </ol>
        </section>
        <section className="mag-section">
          <h3>Your corner</h3>
          <WhereCard />
          <div style={{ height: 14 }} />
          <Overview />
        </section>
      </div>
    </div>
  );
}

function Hero({ spot }: { spot: Spot }) {
  const { loc, world } = useWorld(spot.key);
  const openWorld = useOpenWorld();
  const pic = imgSrc(world?.imageUrl || world?.thumbnailImageUrl);
  return (
    <section className="mag-hero" style={pic ? { backgroundImage: `url("${pic}")` } : undefined}>
      <div className="mag-hero-text">
        <span className="mag-kicker">Where the party is</span>
        <h2>{spotTitle(spot.key, world?.name)}</h2>
        <p>
          {spot.people.length} of your friends are here{loc ? ` · ${loc.type} · ${loc.flag}` : ""}: {spot.people.slice(0, 4).map((f) => f.displayName).join(", ")}
          {spot.people.length > 4 ? " and more" : ""}.
        </p>
        <div className="mag-hero-row">
          <Faces people={spot.people} size={38} />
          <button className="mag-read" onClick={() => openWorld(spot.key)}>
            Read more <Icon name="chevron-right" size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

function NowCard({ spot }: { spot: Spot }) {
  const { world } = useWorld(spot.key);
  const openWorld = useOpenWorld();
  const pic = imgSrc(world?.thumbnailImageUrl || world?.imageUrl);
  return (
    <button className="mag-card" onClick={() => openWorld(spot.key)}>
      <span className="mag-card-pic" style={pic ? { backgroundImage: `url("${pic}")` } : undefined} />
      <b>{spotTitle(spot.key, world?.name)}</b>
      <span className="muted small">
        {spot.people.length} {spot.people.length === 1 ? "friend" : "friends"}
      </span>
      <Faces people={spot.people} size={24} />
    </button>
  );
}
