// All of someone's groups as cards, like the "<name>'s Groups" dialog on vrchat.com.
import { useEffect } from "react";
import { backend, imgSrc } from "../backend";
import type { UserGroup } from "../types";
import { Icon } from "./Icon";

export function GroupsModal({ name, groups, onClose }: { name: string; groups: UserGroup[]; onClose: () => void }) {
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
          <button className="icon-btn" title="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="groups-grid">
          {groups.map((g) => (
            <button key={g.groupId} className="group-card" title="Open the group on vrchat.com" onClick={() => backend.openUrl(`https://vrchat.com/home/group/${g.groupId}`)}>
              <div className="group-card-banner">{g.bannerUrl && <img src={imgSrc(g.bannerUrl)} alt="" loading="lazy" />}</div>
              <div className="group-card-id">
                <span className="group-card-icon">{g.iconUrl ? <img src={imgSrc(g.iconUrl)} alt="" loading="lazy" /> : g.name.slice(0, 1)}</span>
                <span className="group-card-name">{g.name}</span>
                {g.isRepresenting && (
                  <span className="rep" title="Representing">
                    <Icon name="bookmark" size={15} />
                  </span>
                )}
              </div>
              <p className="group-card-desc">{g.description || " "}</p>
              <div className="group-card-foot">
                <span>
                  <Icon name="users" size={14} /> {g.memberCount?.toLocaleString() ?? "?"}
                  {g.mutual && <span className="mutual-tag">you're in it</span>}
                </span>
                <span>{g.shortCode ? `${g.shortCode}.${g.discriminator ?? ""}` : ""}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
