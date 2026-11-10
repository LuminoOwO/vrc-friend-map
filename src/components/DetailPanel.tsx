// Profile view, laid out like a VRChat profile page: banner, big picture with
// a status pill, name, status and trust rank, then "About me", languages and
// links on the left, and status, badges, groups and this app's own info
// (circles, time together, shared friends) on the right. One column on
// narrow screens.
import { useEffect, useState } from "react";
import { imgSrc } from "../backend";
import { listMemberIds } from "../derived";
import { fmtHours, naiveToDate, personTime } from "../logs";
import {
  PLATFORM_LABEL,
  bannerUrl,
  duration,
  fmtDate,
  iconUrl,
  languagesOf,
  lastSeen,
  platformKey,
  presenceLabel,
  presenceOf,
  relTime,
  shortLink,
  statusColor,
  toTime,
  trustRank,
} from "../model";
import { addToCircle, createCircle, removeFromCircle, setState, showToast, useApp } from "../store";
import { loadGroups, refreshPerson } from "../sync";
import type { Friend, Presence } from "../types";
import { Icon } from "./Icon";

function locationText(f: Friend, p: Presence, now: number): { icon: string; text: string; sub?: string } {
  if (p === "offline") {
    const seen = lastSeen(f);
    return { icon: "moon", text: seen ? `Offline for ${duration(now - seen)}` : "Offline" };
  }
  if (p === "web") return { icon: "globe", text: "Active on the website or app", sub: "Not in VRChat right now" };
  const since = toTime(f.last_login);
  const sub = since ? `Online for ${duration(now - since)}` : undefined;
  const loc = f.location || "";
  if (loc === "private") return { icon: "lock", text: "In a private world", sub };
  if (loc === "traveling") return { icon: "plane", text: "Traveling to a world", sub };
  if (loc.startsWith("wrld_")) return { icon: "globe", text: "In a world", sub };
  return { icon: "globe", text: "Online", sub };
}

function StatusArt({ kind }: { kind: string }) {
  // Simple line drawings in the spirit of VRChat's status card.
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "moon")
    return (
      <svg viewBox="0 0 120 100" className="status-art" aria-hidden>
        <path {...common} d="M52 18a34 34 0 1 0 36 46a28 28 0 1 1 -36 -46z" />
        <path fill="currentColor" d="M78 12l3 9l9 3l-9 3l-3 9l-3 -9l-9 -3l9 -3z M96 30l2 5l5 2l-5 2l-2 5l-2 -5l-5 -2l5 -2z" />
        <path fill="currentColor" opacity="0.8" d="M74 84a12 12 0 0 1 2 -24a16 16 0 0 1 30 4a10 10 0 0 1 -2 20z" />
      </svg>
    );
  if (kind === "lock")
    return (
      <svg viewBox="0 0 120 100" className="status-art" aria-hidden>
        <rect {...common} x="38" y="44" width="44" height="38" rx="6" />
        <path {...common} d="M48 44v-10a12 12 0 0 1 24 0v10" />
      </svg>
    );
  if (kind === "plane")
    return (
      <svg viewBox="0 0 120 100" className="status-art" aria-hidden>
        <path {...common} d="M20 56l80 -30l-30 60l-10 -24z M60 62l40 -36" />
      </svg>
    );
  return (
    <svg viewBox="0 0 120 100" className="status-art" aria-hidden>
      <circle {...common} cx="60" cy="50" r="32" />
      <path {...common} d="M28 50h64 M60 18c-14 16 -14 48 0 64 M60 18c14 16 14 48 0 64" />
    </svg>
  );
}

export function DetailPanel({ id, popup = false }: { id: string; popup?: boolean }) {
  const cache = useApp((s) => s.cache);
  const local = useApp((s) => s.local);
  const demo = useApp((s) => s.demo);
  const stats = useApp((s) => s.logs.stats);
  const [newCircle, setNewCircle] = useState("");
  const [allGroups, setAllGroups] = useState(false);
  const f = cache.friends[id];

  useEffect(() => {
    setAllGroups(false);
    if (f) loadGroups(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement)?.closest?.("input, textarea, select")) setState({ selectedId: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!f) return null;

  const p = presenceOf(f, cache.presence);
  const detail = cache.details[id];
  const mutual = cache.mutuals[id];
  const groups = cache.groups?.[id];
  const trust = trustRank(detail?.tags, f.developerType);
  const banner = imgSrc(bannerUrl(f));
  const icon = imgSrc(iconUrl(f));
  const now = Date.now();
  const plat = platformKey(f);
  const supporter = detail?.tags.includes("system_supporter");
  const languages = languagesOf(detail?.tags);
  const links = detail?.bioLinks ?? [];
  const badges = detail?.badges ?? [];
  const representing = groups?.list.find((g) => g.isRepresenting);
  const mutualFriends = (mutual?.ids ?? []).map((m) => cache.friends[m]).filter(Boolean);
  const inLists = local.imports.filter((l) => listMemberIds(l, cache).includes(id));
  const time = personTime(stats, id);
  const oftenWith = (stats?.pairs ?? [])
    .filter((x) => (x.a === id || x.b === id) && cache.friends[x.a === id ? x.b : x.a])
    .sort((a, b) => b.secs - a.secs)
    .slice(0, 8);
  const loc = locationText(f, p, now);
  const sColor = statusColor(f, p);
  const close = () => setState({ selectedId: null });
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => showToast("Link copied"),
      () => showToast("Couldn't copy the link"),
    );
  };

  const shownGroups = groups ? (allGroups ? groups.list : groups.list.slice(0, 5)) : [];

  return (
    <aside className={`profile ${popup ? "popup" : ""}`} role={popup ? "dialog" : undefined} aria-label={`Profile of ${f.displayName}`}>
      <button className="icon-btn profile-close" title="Close (Esc)" onClick={close}>
        <Icon name="close" />
      </button>
      <div className="profile-cols">
        <div className="profile-col">
          <section className="pcard profile-main">
            <div className="profile-banner" style={{ background: f.bannerColor || "#2a9fcc" }}>
              {banner && <img src={banner} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />}
            </div>
            <div className="profile-id">
              <div className="profile-icon" style={{ borderColor: sColor }}>
                {icon ? <img src={icon} alt="" /> : <span>{f.displayName.slice(0, 1).toUpperCase()}</span>}
              </div>
              <span className="status-pill">
                <span className="dot" style={{ background: sColor }} />
                {presenceLabel(f, p)}
              </span>
            </div>
            <div className="profile-text">
              <h2>{f.displayName}</h2>
              <div className="profile-sub">
                {f.statusDescription && <span className="muted">{f.statusDescription}</span>}
                <span className="trust" style={{ color: trust.color }}>
                  <Icon name="shield" size={14} /> {trust.label}
                </span>
                {representing && (
                  <span className="group-pill">
                    {representing.iconUrl && <img src={imgSrc(representing.iconUrl)} alt="" />}
                    {representing.name}
                  </span>
                )}
                {supporter && <span className="pill vrcplus">VRC+</span>}
                {detail?.pronouns && <span className="muted">{detail.pronouns}</span>}
              </div>
              <div className="profile-actions">
                {!demo && (
                  <button className="btn" onClick={() => refreshPerson(id).then(() => loadGroups(id, true))} title="Load this profile again from VRChat">
                    <Icon name="refresh" size={16} /> Refresh
                  </button>
                )}
                <button className="btn" onClick={() => copy(`https://vrchat.com/home/user/${id}`)} title="Copy the vrchat.com link to this profile">
                  <Icon name="link" size={16} /> Copy profile link
                </button>
              </div>

              <div className="profile-block">
                <h3>About me</h3>
                {detail?.bio ? <p className="bio">{detail.bio}</p> : <p className="muted small">{detail ? "Nothing written." : "Loading…"}</p>}
              </div>
              {languages.length > 0 && (
                <div className="profile-block">
                  <h3>Languages</h3>
                  <div className="chips">
                    {languages.map((l) => (
                      <span key={l} className="lang">
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {links.length > 0 && (
                <div className="profile-block">
                  <h3>Links</h3>
                  <ul className="link-list">
                    {links.map((l) => (
                      <li key={l}>
                        <button className="btn link small" title="Copy link" onClick={() => copy(l)}>
                          <Icon name="link" size={13} /> {shortLink(l)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {detail?.note && (
                <div className="profile-block">
                  <h3>Your note</h3>
                  <p className="note-text">{detail.note}</p>
                </div>
              )}
              <div className="profile-block">
                <h3>Profile</h3>
                <dl className="facts">
                  <dt>Platform</dt>
                  <dd>{PLATFORM_LABEL[plat]}</dd>
                  <dt>Last login</dt>
                  <dd>{toTime(f.last_login) ? new Date(toTime(f.last_login)).toLocaleString() : "unknown"}</dd>
                  <dt>Joined VRChat</dt>
                  <dd>{detail?.date_joined ? fmtDate(detail.date_joined) : "loading…"}</dd>
                  <dt>Mutual friends</dt>
                  <dd>{mutual ? (mutual.hidden ? "hidden by them" : mutual.count) : "loading…"}</dd>
                  {cache.favorites[id]?.length ? (
                    <>
                      <dt>Your favorites</dt>
                      <dd>{cache.favorites[id].join(", ")}</dd>
                    </>
                  ) : null}
                  {inLists.length > 0 && (
                    <>
                      <dt>Also in lists of</dt>
                      <dd>{inLists.map((l) => l.owner.displayName).join(", ")}</dd>
                    </>
                  )}
                </dl>
              </div>
            </div>
          </section>
        </div>

        <div className="profile-col">
          <section className={`pcard status-card ${p}`}>
            <StatusArt kind={loc.icon} />
            <div className="status-text">{loc.text}</div>
            {loc.sub && <div className="muted small">{loc.sub}</div>}
          </section>

          {badges.length > 0 && (
            <section className="pcard">
              <h3>Badges</h3>
              <div className="badges">
                {badges.map((b) => (
                  <img key={b.id} src={imgSrc(b.imageUrl)} alt={b.name} title={b.description ? `${b.name}: ${b.description}` : b.name} />
                ))}
              </div>
            </section>
          )}

          {groups && groups.list.length > 0 && (
            <section className="pcard">
              <h3>Groups</h3>
              <ul className="group-list">
                {shownGroups.map((g) => (
                  <li key={g.groupId}>
                    <span className="group-icon">{g.iconUrl ? <img src={imgSrc(g.iconUrl)} alt="" /> : g.name.slice(0, 1)}</span>
                    <span className="group-name">{g.name}</span>
                    {g.isRepresenting && (
                      <span className="rep" title="Representing">
                        <Icon name="bookmark" size={16} />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {groups.list.length > 5 && (
                <button className="btn wide" onClick={() => setAllGroups(!allGroups)}>
                  {allGroups ? "Show fewer" : `View all ${groups.list.length}`}
                </button>
              )}
            </section>
          )}

          <section className="pcard">
            <h3>Your circles</h3>
            <div className="circle-toggles">
              {local.circles.map((c) => {
                const on = c.members.includes(id);
                return (
                  <label key={c.id} className={`circle-toggle ${on ? "on" : ""}`} style={{ ["--c" as string]: c.color }}>
                    <input type="checkbox" checked={on} onChange={() => (on ? removeFromCircle(c.id, id) : addToCircle(c.id, id))} />
                    {c.name}
                  </label>
                );
              })}
            </div>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newCircle.trim()) return;
                createCircle(newCircle, [id]);
                setNewCircle("");
              }}
            >
              <input value={newCircle} placeholder="New circle with this person" onChange={(e) => setNewCircle(e.target.value)} />
              <button className="btn" type="submit" disabled={!newCircle.trim()}>
                <Icon name="plus" size={16} />
              </button>
            </form>
          </section>

          {(time || oftenWith.length > 0) && (
            <section className="pcard">
              <h3>
                Time together <span className="muted small">from your game logs</span>
              </h3>
              {time && (
                <p className="small">
                  {fmtHours(time.secs)} on {time.days} day{time.days === 1 ? "" : "s"}
                  <span className="muted"> · last {naiveToDate(time.last).toLocaleDateString()}</span>
                </p>
              )}
              {oftenWith.length > 0 && (
                <>
                  <div className="muted small">Often with</div>
                  <div className="mini-list">
                    {oftenWith.map((x) => {
                      const other = cache.friends[x.a === id ? x.b : x.a];
                      return (
                        <button key={other.id} className="mini" onClick={() => setState({ selectedId: other.id })} title={`${x.days} day${x.days === 1 ? "" : "s"}`}>
                          <span className="dot" style={{ background: statusColor(other, presenceOf(other, cache.presence)) }} />
                          {other.displayName}
                          <span className="muted" style={{ marginLeft: 5 }}>
                            {fmtHours(x.secs)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          )}

          {mutualFriends.length > 0 && (
            <section className="pcard">
              <h3>
                Friends you share <span className="muted">{mutualFriends.length}</span>
              </h3>
              <div className="mini-list">
                {mutualFriends
                  .sort((a, b) => a.displayName.localeCompare(b.displayName))
                  .map((m) => (
                    <button key={m.id} className="mini" onClick={() => setState({ selectedId: m.id })}>
                      <span className="dot" style={{ background: statusColor(m, presenceOf(m, cache.presence)) }} />
                      {m.displayName}
                    </button>
                  ))}
              </div>
            </section>
          )}

          <p className="muted small profile-updated">
            {detail ? `Profile loaded ${relTime(detail.fetchedAt, now)}` : ""}
            {mutual ? ` · mutuals ${relTime(mutual.fetchedAt, now)}` : ""}
          </p>
        </div>
      </div>
    </aside>
  );
}
