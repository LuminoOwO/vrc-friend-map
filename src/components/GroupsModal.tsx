// All of someone's groups as cards, like the "<name>'s Groups" dialog on vrchat.com.
import { t as tr, language } from "../i18n";
import { openImage } from "./ImageViewer";
import { useEffect, useMemo, useState } from "react";
import { imgSrc } from "../backend";
import { setState } from "../store";
import type { UserGroup } from "../types";
import { Icon } from "./Icon";
import { GroupPic } from "./GroupPic";

export function GroupsModal({ name, groups, onClose }: { name: string; groups: UserGroup[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return groups;
    return groups.filter((g) =>
      [g.name, g.shortCode && `${g.shortCode}.${g.discriminator ?? ""}`, g.description].some((x) => x && x.toLowerCase().includes(ql)),
    );
  }, [groups, q]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="groups-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="groups-modal" role="dialog" aria-label={`${name}'s groups`}>
        <div className="groups-head">
          <h2>{name}'s Groups</h2>
          <button className="icon-btn" title={tr("groupsModal.close")} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="groups-search">
          <Icon name="search" size={15} />
          <input
            type="search"
            autoFocus
            placeholder={tr("groupsModal.search")}
            aria-label={tr("groupsModal.search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && <span className="small muted">{tr("groupsModal.shownOf", { shown: shown.length, total: groups.length })}</span>}
        </div>
        {shown.length === 0 && <p className="groups-empty muted">{tr("groupsModal.noMatch", { q: q.trim() })}</p>}
        <div className="groups-grid">
          {shown.map((g) => (
            <button key={g.groupId} className="group-card" title={tr("groupsModal.openTheGroup")} onClick={() => { setState({ openGroup: g.groupId }); onClose(); }}>
              {g.bannerUrl && <img className="group-card-banner" src={imgSrc(g.bannerUrl)} alt="" loading="lazy" />}
              <span
                className={`group-card-icon ${g.iconUrl || g.bannerUrl ? "viewable" : ""}`}
                onClick={(e) => {
                  if (!g.iconUrl && !g.bannerUrl) return;
                  e.stopPropagation();
                  openImage([...(g.iconUrl ? [{ url: g.iconUrl, title: tr("groupsModal.groupNameIcon", { name: g.name }) }] : []), ...(g.bannerUrl ? [{ url: g.bannerUrl, title: tr("groupsModal.groupNameBanner", { name: g.name }) }] : [])]);
                }}
              >
                <GroupPic url={g.iconUrl} name={g.name} />
              </span>
              <span className="group-card-text">
                <span className="group-card-name">
                  <b>{g.name}</b>
                  {g.isRepresenting && (
                    <span className="rep" title={tr("groupsModal.representing")}>
                      <Icon name="bookmark" size={14} />
                    </span>
                  )}
                </span>
                {g.description && <span className="group-card-desc">{g.description}</span>}
                <span className="group-card-foot">
                  <span>
                    <Icon name="users" size={13} /> {g.memberCount?.toLocaleString(language()) ?? "?"}
                  </span>
                  {g.shortCode && <span>{`${g.shortCode}.${g.discriminator ?? ""}`}</span>}
                  {g.mutual && <span className="mutual-tag">{tr("groupsModal.youReInIt")}</span>}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
