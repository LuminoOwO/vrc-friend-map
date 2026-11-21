import { memo } from "react";
import { listJoin, t } from "../i18n";
import { imgSrc } from "../backend";
import { captureCard } from "../flip";
import { Icon } from "./Icon";
import { useApp } from "../store";
import { accountColor, MAIN } from "../accountmerge";
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
  /** Just became a friend: plays the pop-in animation. */
  fresh?: boolean;
  /** Trust-rank shield before the name. */
  shield?: boolean;
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
      ? t("card.onlineFor", { time: duration(p.now - toTime(f.last_login)) })
      : t("card.online")
    : t("card.lastSeen", { when: relTime(lastSeen(f), p.now) });

  return (
    <div
      className={`fcard ${p.dimmed ? "dimmed" : ""} ${p.selected ? "selected" : ""} ${online ? "" : "offline"} ${p.fresh ? "fresh" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/vrc-user", f.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={(e) => {
        captureCard(f.id, e.currentTarget);
        p.onSelect(f.id);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") p.onSelect(f.id);
      }}
      style={{ ["--trust" as string]: trust.color }}
    >
      <div className="fcard-banner" data-flip="banner" style={{ background: f.bannerColor || "#1e2a33" }}>
        {banner && <img src={banner} alt="" loading="lazy" draggable={false} onError={(e) => (e.currentTarget.style.display = "none")} />}
        {p.favorite?.length ? (
          <span className="fav" title={`Favorite: ${p.favorite.join(", ")}`}>
            ★
          </span>
        ) : null}
        <span className="plat" data-flip="plat" title={PLATFORM_LABEL[plat]}>
          {plat === "pc" ? "PC" : plat === "android" ? t("card.platQuest") : plat === "ios" ? "iOS" : plat === "web" ? t("card.platWeb") : ""}
        </span>
      </div>
      <div className="fcard-body">
        <div className="fcard-icon" data-flip="icon" style={{ borderColor: sColor }}>
          {icon ? (
            <img src={icon} alt="" loading="lazy" draggable={false} onError={(e) => (e.currentTarget.style.display = "none")} />
          ) : (
            <span>{f.displayName.slice(0, 1).toUpperCase()}</span>
          )}
          <span className="status-dot" style={{ background: sColor }} />
        </div>
        <div className="fcard-text">
          <div className="fcard-name" title={`${f.displayName} · ${trust.label}`}>
            {p.shield && (
              <span className="trust-shield" style={{ color: trust.color }} aria-label={trust.label}>
                <Icon name="shield" size={13} />
              </span>
            )}
            <span data-flip="name">{f.displayName}</span>
            <AccountDots id={f.id} />
          </div>
          <div className="fcard-status" data-flip="status" title={f.statusDescription}>
            {f.statusDescription || presenceLabel(f, p.presence)}
          </div>
        </div>
      </div>
      <div className="fcard-meta">
        <span className="trust-tag" data-flip="trust">
          {trust.label}
        </span>
        <span>{timeText}</span>
      </div>
      <div className="fcard-foot">
        <span title={t("card.mutualFriends")} data-flip="mutuals">
          {p.mutual ? (p.mutual.hidden ? t("card.mutualsHidden") : t("card.mutuals", { count: p.mutual.count })) : t("card.mutualsLoading")}
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

/** Which of your other accounts are friends with them (a dot each). */
function AccountDots({ id }: { id: string }) {
  const of = useApp((s) => s.cache.friendOf?.[id]);
  const list = useApp((s) => s.settings.accounts.list);
  if (!of) return null;
  const alts = of.filter((a) => a !== MAIN);
  const names = alts.map((a) => list.find((l) => l.id === a)?.name ?? t("card.anotherAccount"));
  return (
    <span className="account-dots" title={t("card.friendsWith", { names: listJoin([...(of.includes(MAIN) ? [t("card.yourMain")] : []), ...names]) })}>
      {alts.map((a) => (
        <span key={a} className="account-dot" style={{ background: accountColor(list, a) }} />
      ))}
    </span>
  );
}
