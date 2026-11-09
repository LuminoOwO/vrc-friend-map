import { memo } from "react";
import { imgSrc } from "../backend";
import {
  PLATFORM_LABEL,
  bannerUrl,
  duration,
  iconUrl,
  lastSeen,
  platformKey,
  presenceLabel,
  relTime,
  statusColor,
  toTime,
  trustRank,
} from "../model";
import type { Circle, Friend, MutualInfo, Presence, UserDetail } from "../types";

export interface FriendCardProps {
  friend: Friend;
  presence: Presence;
  detail?: UserDetail;
  mutual?: MutualInfo;
  favorite?: string[];
  circles: Circle[];
  dimmed?: boolean;
  selected?: boolean;
  now: number;
  onSelect: (id: string) => void;
}

/** A friend tile styled after VRChat's social menu: banner, round icon with
 *  status dot, name in trust-rank color, status line. */
export const FriendCard = memo(function FriendCard(p: FriendCardProps) {
  const f = p.friend;
  const trust = trustRank(p.detail?.tags, f.developerType);
  const sColor = statusColor(f, p.presence);
  const banner = imgSrc(bannerUrl(f));
  const icon = imgSrc(iconUrl(f));
  const plat = platformKey(f);
  const online = p.presence !== "offline";
  const timeText = online
    ? toTime(f.last_login)
      ? `online for ~${duration(p.now - toTime(f.last_login))}`
      : "online"
    : `last seen ${relTime(lastSeen(f), p.now)}`;

  return (
    <div
      className={`fcard ${p.dimmed ? "dimmed" : ""} ${p.selected ? "selected" : ""} ${online ? "" : "offline"}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/vrc-user", f.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => p.onSelect(f.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") p.onSelect(f.id);
      }}
      style={{ ["--trust" as string]: trust.color }}
    >
      <div className="fcard-banner" style={{ background: f.bannerColor || "#1e2a33" }}>
        {banner && <img src={banner} alt="" loading="lazy" draggable={false} onError={(e) => (e.currentTarget.style.display = "none")} />}
        {p.favorite?.length ? (
          <span className="fav" title={`Favorite: ${p.favorite.join(", ")}`}>
            ★
          </span>
        ) : null}
        <span className="plat" title={PLATFORM_LABEL[plat]}>
          {plat === "pc" ? "PC" : plat === "android" ? "Quest" : plat === "ios" ? "iOS" : plat === "web" ? "Web" : ""}
        </span>
      </div>
      <div className="fcard-body">
        <div className="fcard-icon" style={{ borderColor: sColor }}>
          {icon ? (
            <img src={icon} alt="" loading="lazy" draggable={false} onError={(e) => (e.currentTarget.style.display = "none")} />
          ) : (
            <span>{f.displayName.slice(0, 1).toUpperCase()}</span>
          )}
          <span className="status-dot" style={{ background: sColor }} />
        </div>
        <div className="fcard-text">
          <div className="fcard-name" title={`${f.displayName} · ${trust.label}`}>
            {f.displayName}
          </div>
          <div className="fcard-status" title={f.statusDescription}>
            {f.statusDescription || presenceLabel(f, p.presence)}
          </div>
        </div>
      </div>
      <div className="fcard-meta">
        <span className="trust-tag">{trust.label}</span>
        <span>{timeText}</span>
      </div>
      <div className="fcard-foot">
        <span title="Mutual friends">
          {p.mutual ? (p.mutual.hidden ? "mutuals hidden" : `${p.mutual.count} mutual${p.mutual.count === 1 ? "" : "s"}`) : "mutuals …"}
        </span>
        <span className="circle-dots">
          {p.circles.map((c) => (
            <span key={c.id} className="cdot" style={{ background: c.color }} title={c.name} />
          ))}
        </span>
      </div>
    </div>
  );
});
