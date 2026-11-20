// "Online now" (beta UI): your online friends, one row per instance. Hover a row for a quick
// look at who's there; click it for the world overview popup.
import { useEffect, useMemo, useState } from "react";
import { backend, imgSrc } from "../backend";
import { iconUrl, presenceOf } from "../model";
import { setState, showToast, useApp } from "../store";
import { loadWorld } from "../sync";
import type { Friend } from "../types";
import { parseLocation } from "../components/DetailPanel";
import { Icon } from "../components/Icon";

export interface Spot {
  /** The full location ("wrld_…:123~…"), or "private" / "traveling". */
  key: string;
  people: Friend[];
}

/** Online friends in VRChat grouped by where they are; the fullest first, private and traveling last. */
export function useSpots(): Spot[] {
  const friends = useApp((s) => s.cache.friends);
  const presence = useApp((s) => s.cache.presence);
  return useMemo(() => {
    const by = new Map<string, Friend[]>();
    for (const f of Object.values(friends)) {
      if (presenceOf(f, presence) !== "online") continue;
      const key = f.location?.startsWith("wrld_") ? f.location : f.location === "traveling" ? "traveling" : "private";
      const list = by.get(key) ?? [];
      list.push(f);
      by.set(key, list);
    }
    const rank = (k: string) => (k === "private" ? 2 : k === "traveling" ? 1 : 0);
    return [...by.entries()]
      .map(([key, people]) => ({ key, people: people.sort((a, b) => a.displayName.localeCompare(b.displayName)) }))
      .sort((a, b) => rank(a.key) - rank(b.key) || b.people.length - a.people.length);
  }, [friends, presence]);
}

function useWorldOf(key: string) {
  const loc = key.startsWith("wrld_") ? parseLocation(key) : null;
  const world = useApp((s) => (loc ? s.cache.worlds?.[loc.world] : undefined));
  return { loc, world };
}

export function spotTitle(key: string, worldName?: string) {
  if (key === "private") return "In a private world";
  if (key === "traveling") return "Traveling";
  return worldName ?? "Loading world…";
}

function Face({ f, size = 22 }: { f: Friend; size?: number }) {
  const src = imgSrc(iconUrl(f));
  return (
    <span className="ui2-avatar" style={{ width: size, height: size, fontSize: size * 0.45 }} title={f.displayName}>
      {src ? <img src={src} alt="" loading="lazy" /> : f.displayName[0]}
    </span>
  );
}

export function OnlineNow({ onOpen }: { onOpen: (key: string) => void }) {
  const spots = useSpots();
  // World names and pictures for the first rows (cached for a week, so this is cheap).
  useEffect(() => {
    for (const s of spots.slice(0, 15)) if (s.key.startsWith("wrld_")) loadWorld(parseLocation(s.key).world);
  }, [spots]);
  if (!spots.length) return <p className="small muted ui2-side-empty">Nobody is in VRChat right now.</p>;
  return (
    <ul className="ui2-spots">
      {spots.map((s) => (
        <SpotRow key={s.key} spot={s} onOpen={() => onOpen(s.key)} />
      ))}
    </ul>
  );
}

function SpotRow({ spot, onOpen }: { spot: Spot; onOpen: () => void }) {
  const { loc, world } = useWorldOf(spot.key);
  // Where to show the quick look: next to the row, outside the panel's scroll area.
  const [peek, setPeek] = useState<{ top: number; left: number } | null>(null);
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const left = r.right + 270 < window.innerWidth ? r.right + 8 : Math.max(8, r.left - 268);
    setPeek({ top: Math.min(r.top, window.innerHeight - 320), left });
  };
  const thumb = imgSrc(world?.thumbnailImageUrl || world?.imageUrl);
  return (
    <li onMouseEnter={(e) => show(e.currentTarget)} onMouseLeave={() => setPeek(null)}>
      <button className="ui2-spot" onClick={onOpen} onFocus={(e) => show(e.currentTarget)} onBlur={() => setPeek(null)}>
        <span className="ui2-spot-pic">{thumb ? <img src={thumb} alt="" loading="lazy" /> : <Icon name={spot.key === "private" ? "lock" : "world"} size={16} />}</span>
        <span className="ui2-spot-text">
          <b>{spotTitle(spot.key, world?.name)}</b>
          <span className="small muted">
            {loc ? `${loc.type} · ${loc.flag} · ` : ""}
            {spot.people.length} {spot.people.length === 1 ? "friend" : "friends"}
          </span>
        </span>
        <span className="ui2-spot-faces">
          {spot.people.slice(0, 3).map((f) => (
            <Face key={f.id} f={f} />
          ))}
        </span>
      </button>
      {peek && (
        <div className="ui2-peek" role="tooltip" style={{ top: Math.max(8, peek.top), left: peek.left }}>
          {spot.people.slice(0, 12).map((f) => (
            <span key={f.id}>
              <Face f={f} size={18} /> {f.displayName}
            </span>
          ))}
          {spot.people.length > 12 && <span className="small muted">and {spot.people.length - 12} more</span>}
          <span className="small muted">Click for the world overview</span>
        </div>
      )}
    </li>
  );
}

/** A world (or the private / traveling group) in the middle of the window: picture, instance, who's there. */
export function WorldPopup({ spotKey, onClose }: { spotKey: string; onClose: () => void }) {
  const spots = useSpots();
  const spot = spots.find((s) => s.key === spotKey);
  const { loc, world } = useWorldOf(spotKey);
  useEffect(() => {
    if (loc) loadWorld(loc.world);
  }, [loc?.world]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);
  const pic = imgSrc(world?.imageUrl || world?.thumbnailImageUrl);
  const people = spot?.people ?? [];
  return (
    <div className="profile-backdrop ui2-world-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ui2-world" role="dialog" aria-label={spotTitle(spotKey, world?.name)}>
        <button className="icon-btn ui2-world-close" title="Close (Esc)" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
        <div className="ui2-world-hero">{pic ? <img src={pic} alt="" /> : <Icon name={spotKey === "private" ? "lock" : "world"} size={40} />}</div>
        <div className="ui2-world-body">
          <h2>{spotTitle(spotKey, world?.name)}</h2>
          <p className="small muted">
            {loc ? `${loc.type} instance · ${loc.flag} ${loc.region.toUpperCase()}` : spotKey === "private" ? "Where they are isn't shown to friends." : "On their way to a world."}
            {world?.authorName ? ` · by ${world.authorName}` : ""}
            {world?.capacity ? ` · up to ${world.capacity} people` : ""}
          </p>
          <h3>
            {people.length} {people.length === 1 ? "friend" : "friends"} here
          </h3>
          {people.length === 0 ? (
            <p className="small muted">Nobody you know is here any more.</p>
          ) : (
            <ul className="ui2-world-people">
              {people.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => {
                      onClose();
                      setState({ selectedId: f.id });
                    }}
                  >
                    <Face f={f} size={34} />
                    <span>
                      <b>{f.displayName}</b>
                      {f.statusDescription && <span className="small muted">{f.statusDescription}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {loc && (
            <div className="row">
              <button className="btn" onClick={() => backend.openUrl(`https://vrchat.com/home/world/${loc.world}`).catch(() => showToast("Couldn't open the link"))}>
                <Icon name="external" size={15} /> World page
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
