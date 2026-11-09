import { useState } from "react";
import { imgSrc } from "../backend";
import { listMemberIds } from "../derived";
import {
  PLATFORM_LABEL,
  bannerUrl,
  duration,
  fmtDate,
  iconUrl,
  lastSeen,
  platformKey,
  presenceLabel,
  presenceOf,
  relTime,
  statusColor,
  toTime,
  trustRank,
} from "../model";
import { addToCircle, createCircle, removeFromCircle, setState, useApp } from "../store";
import { refreshPerson } from "../sync";
import { Icon } from "./Icon";

export function DetailPanel({ id }: { id: string }) {
  const cache = useApp((s) => s.cache);
  const local = useApp((s) => s.local);
  const demo = useApp((s) => s.demo);
  const [newCircle, setNewCircle] = useState("");
  const f = cache.friends[id];
  if (!f) return null;

  const p = presenceOf(f, cache.presence);
  const detail = cache.details[id];
  const mutual = cache.mutuals[id];
  const trust = trustRank(detail?.tags, f.developerType);
  const banner = imgSrc(bannerUrl(f));
  const icon = imgSrc(iconUrl(f));
  const now = Date.now();
  const plat = platformKey(f);
  const supporter = detail?.tags.includes("system_supporter");
  const mutualFriends = (mutual?.ids ?? []).map((m) => cache.friends[m]).filter(Boolean);
  const inLists = local.imports.filter((l) => listMemberIds(l, cache).includes(id));

  const close = () => setState({ selectedId: null });

  return (
    <aside className="detail" aria-label={`Details for ${f.displayName}`}>
      <div className="detail-banner" style={{ background: f.bannerColor || "#1e2a33" }}>
        {banner && <img src={banner} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />}
        <button className="icon-btn close" title="Close" onClick={close}>
          <Icon name="close" />
        </button>
      </div>
      <div className="detail-head">
        <div className="detail-icon" style={{ borderColor: statusColor(f, p) }}>
          {icon ? <img src={icon} alt="" /> : <span>{f.displayName.slice(0, 1)}</span>}
        </div>
        <div>
          <h2 style={{ color: trust.color }}>{f.displayName}</h2>
          <div className="detail-status">
            <span className="dot" style={{ background: statusColor(f, p) }} />
            {presenceLabel(f, p)}
            {f.statusDescription && <span className="muted">— {f.statusDescription}</span>}
          </div>
        </div>
      </div>

      <dl className="facts">
        <dt>Trust rank</dt>
        <dd>
          <span className="trust-pill" style={{ ["--trust" as string]: trust.color }}>
            {trust.label}
          </span>
          {supporter && <span className="pill vrcplus">VRC+</span>}
        </dd>
        {detail?.pronouns && (
          <>
            <dt>Pronouns</dt>
            <dd>{detail.pronouns}</dd>
          </>
        )}
        <dt>Platform</dt>
        <dd>{PLATFORM_LABEL[plat]}</dd>
        {p !== "offline" ? (
          <>
            <dt>Online for</dt>
            <dd>{toTime(f.last_login) ? `about ${duration(now - toTime(f.last_login))}` : "unknown"}</dd>
          </>
        ) : (
          <>
            <dt>Last online</dt>
            <dd title={new Date(lastSeen(f)).toLocaleString()}>{relTime(lastSeen(f), now)}</dd>
          </>
        )}
        <dt>Last login</dt>
        <dd>{toTime(f.last_login) ? new Date(toTime(f.last_login)).toLocaleString() : "unknown"}</dd>
        <dt>Account created</dt>
        <dd>{detail?.date_joined ? fmtDate(detail.date_joined) : "loading…"}</dd>
        <dt>Mutual friends</dt>
        <dd>{mutual ? (mutual.hidden ? "hidden by them" : mutual.count) : "loading…"}</dd>
        {cache.favorites[id]?.length ? (
          <>
            <dt>Favorite group</dt>
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

      {detail?.note && (
        <div className="note-box">
          <div className="muted small">Your VRChat note</div>
          {detail.note}
        </div>
      )}
      {detail?.bio && <p className="bio">{detail.bio}</p>}

      <section className="detail-section">
        <h3>Circles</h3>
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

      {mutualFriends.length > 0 && (
        <section className="detail-section">
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

      <div className="detail-actions">
        {!demo && (
          <button className="btn" onClick={() => refreshPerson(id)}>
            <Icon name="refresh" size={16} /> Refresh this person
          </button>
        )}
        <span className="muted small">
          {detail ? `Profile updated ${relTime(detail.fetchedAt, now)}` : ""}
          {mutual ? ` · mutuals ${relTime(mutual.fetchedAt, now)}` : ""}
        </span>
      </div>
    </aside>
  );
}
