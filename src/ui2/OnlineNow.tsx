// "Online now" (new interface): your online friends, one row per instance (and one for the
// website or app). Hover a row for a quick look at who's there; click it for the world overview.
import { useEffect, useMemo, useState } from "react";
import { backend, imgSrc } from "../backend";
import { iconUrl, presenceOf, statusColor } from "../model";
import { setState, showToast, useApp } from "../store";
import { inviteMyself, requestInvite } from "../invites";
import { loadWorld } from "../sync";
import { setWorldNote } from "../worldnotes";
import type { Friend } from "../types";
import { parseLocation } from "../components/DetailPanel";
import { Icon } from "../components/Icon";
import { useSmooth } from "./smooth";

export interface Spot {
  /** The full location ("wrld_…:123~…"), or "private", "traveling" or "web". */
  key: string;
  people: Friend[];
}

/** Online friends grouped by where they are; the fullest first, private, traveling and the website last. */
export function useSpots(): Spot[] {
  const friends = useApp((s) => s.cache.friends);
  const presence = useApp((s) => s.cache.presence);
  return useMemo(() => {
    const by = new Map<string, Friend[]>();
    for (const f of Object.values(friends)) {
      const p = presenceOf(f, presence);
      if (p === "offline") continue;
      const key = p === "web" ? "web" : f.location?.startsWith("wrld_") ? f.location : f.location === "traveling" ? "traveling" : "private";
      const list = by.get(key) ?? [];
      list.push(f);
      by.set(key, list);
    }
    const rank = (k: string) => (k === "web" ? 3 : k === "private" ? 2 : k === "traveling" ? 1 : 0);
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
  if (key === "private") return "Private world";
  if (key === "traveling") return "Traveling";
  if (key === "web") return "On the website or app";
  return worldName ?? "Loading world…";
}

function Face({ f, size = 28 }: { f: Friend; size?: number }) {
  const src = imgSrc(iconUrl(f));
  return (
    <span className="ui2-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} title={f.displayName}>
      {src ? <img src={src} alt="" loading="lazy" /> : f.displayName[0]}
    </span>
  );
}

function StatusDot({ f }: { f: Friend }) {
  const presence = useApp((s) => s.cache.presence);
  return <span className="ui2-status-dot" style={{ background: statusColor(f, presenceOf(f, presence)) }} />;
}

export function OnlineNow({ onOpen, side = "right" }: { onOpen: (key: string) => void; side?: "left" | "right" }) {
  const spots = useSpots();
  const smooth = useSmooth();
  // World names and pictures for the first rows (cached for a week, so this is cheap).
  useEffect(() => {
    for (const s of spots.slice(0, 15)) if (s.key.startsWith("wrld_")) loadWorld(parseLocation(s.key).world);
  }, [spots]);
  if (!spots.length) return <p className="small muted ui2-side-empty">Nobody is online right now.</p>;
  return (
    <div className="ui2-spots" ref={smooth} data-arrows="v">
      {spots.map((s) => (
        <SpotRow key={s.key} spot={s} side={side} onOpen={() => onOpen(s.key)} />
      ))}
    </div>
  );
}

function SpotRow({ spot, side, onOpen }: { spot: Spot; side: "left" | "right"; onOpen: () => void }) {
  const { loc, world } = useWorldOf(spot.key);
  // The quick look sits beside the panel, at the row's height.
  const [peek, setPeek] = useState<{ top: number; x: number } | null>(null);
  const show = (el: HTMLElement) => {
    const panel = el.closest("aside")?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!panel) return;
    setPeek({ top: Math.min(r.top, window.innerHeight - 300), x: side === "right" ? window.innerWidth - panel.left + 12 : panel.right + 12 });
  };
  const thumb = imgSrc(world?.thumbnailImageUrl || world?.imageUrl);
  const n = spot.people.length;
  const kind = loc ? loc.type : spot.key === "private" ? "invite only" : "";
  return (
    <div className="ui2-spot-wrap" onMouseEnter={(e) => show(e.currentTarget)} onMouseLeave={() => setPeek(null)}>
      <button className="ui2-spot" onClick={onOpen} aria-label={`${spotTitle(spot.key, world?.name)}: open the world overview`}>
        <span className="ui2-spot-pic">{thumb ? <img src={thumb} alt="" loading="lazy" /> : <Icon name={spot.key === "private" ? "lock" : spot.key === "web" ? "globe" : "world"} size={16} />}</span>
        <span className="ui2-spot-text">
          <b>{spotTitle(spot.key, world?.name)}</b>
          <span>
            {n} {n === 1 ? "friend" : "friends"}
            {kind ? ` · ${kind.toLowerCase()}` : ""}
          </span>
        </span>
        <span className="ui2-spot-faces">
          {spot.people.slice(0, 3).map((f) => (
            <Face key={f.id} f={f} size={24} />
          ))}
        </span>
        <Icon name="chevron-right" size={14} />
      </button>
      {peek && (
        <div className="ui2-peek" role="tooltip" style={{ top: Math.max(8, peek.top), ...(side === "right" ? { right: peek.x } : { left: peek.x }) }}>
          <b>{spotTitle(spot.key, world?.name)}</b>
          {spot.people.slice(0, 10).map((f) => (
            <span key={f.id} className="ui2-peek-row">
              <Face f={f} size={28} />
              <span className="ui2-grow ui2-ellipsis">{f.displayName}</span>
              <StatusDot f={f} />
            </span>
          ))}
          {n > 10 && <span className="small muted">and {n - 10} more</span>}
          <span className="small muted">Click for the world overview</span>
        </div>
      )}
    </div>
  );
}

/** A world (or the private / traveling / website group) in the middle of the window. */
export function WorldPopup({ spotKey, onClose }: { spotKey: string; onClose: () => void }) {
  const spots = useSpots();
  const spot = spots.find((s) => s.key === spotKey);
  const { loc, world } = useWorldOf(spotKey);
  const note = useApp((s) => (loc ? s.local.worldNotes?.[loc.world] : undefined));
  const [draft, setDraft] = useState(note?.text ?? "");
  useEffect(() => setDraft(note?.text ?? ""), [note?.text]);
  useEffect(() => {
    if (loc) loadWorld(loc.world);
  }, [loc?.world]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const title = spotTitle(spotKey, world?.name);
  const join = async () => {
    const err = await inviteMyself(spotKey);
    showToast(err ? `Couldn't join: ${err}` : "Invite sent to you in VRChat");
  };
  const ask = async (f: Friend) => {
    const err = await requestInvite(f.id);
    showToast(err ? `Couldn't ask ${f.displayName}: ${err}` : `Asked ${f.displayName} for an invite`);
  };
  const saveNote = () => {
    if (loc && draft !== (note?.text ?? "")) setWorldNote(loc.world, draft, (note?.tags ?? []).join(", "));
  };
  return (
    <div className="ui2-world-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ui2-world" role="dialog" aria-label={title}>
        <div className="ui2-world-hero" style={pic ? { backgroundImage: `url("${pic}")` } : undefined}>
          <button className="ui2-close" title="Close (Esc)" aria-label="Close world" onClick={onClose}>
            <span className="ui2-close-x">
              <Icon name="close" size={20} />
            </span>
            <span className="ui2-close-esc">ESC</span>
          </button>
          <span className="ui2-world-tags">
            {loc && <span className="ui2-tag">{loc.type}</span>}
            <span className="ui2-tag">
              {people.length} {people.length === 1 ? "friend" : "friends"}
              {world?.capacity ? ` · up to ${world.capacity}` : ""}
            </span>
          </span>
        </div>
        <div className="ui2-world-title">
          <span className="ui2-grow">
            <h2>{title}</h2>
            <span className="muted">
              {world?.authorName ? `by ${world.authorName}` : spotKey === "private" ? "Where they are isn't shown to friends." : ""}
              {loc ? `${world?.authorName ? " · " : ""}${loc.flag} ${loc.region.toUpperCase()}` : ""}
            </span>
          </span>
          {loc && (
            <span className="ui2-world-actions">
              <button className="btn primary" onClick={join}>
                Join
              </button>
              <button className="btn" onClick={() => setState({ openWorld: loc.world })}>
                World details
              </button>
            </span>
          )}
        </div>
        <div className="ui2-world-cards">
          <div className="ui2-card">
            <div className="ui2-card-title">Friends here</div>
            {people.length === 0 && <p className="small muted">Nobody you know is here any more.</p>}
            {people.map((f) => (
              <div key={f.id} className="ui2-world-person">
                <button
                  onClick={() => {
                    onClose();
                    setState({ selectedId: f.id });
                  }}
                >
                  <Face f={f} size={28} />
                  <span className="ui2-grow ui2-ellipsis">{f.displayName}</span>
                  <StatusDot f={f} />
                </button>
                {spotKey !== "web" && (
                  <button className="ui2-link" title={`Ask ${f.displayName} for an invite`} onClick={() => ask(f)}>
                    Ask
                  </button>
                )}
              </div>
            ))}
          </div>
          {loc && (
            <label className="ui2-card ui2-card-note">
              <span className="ui2-card-title">Your note on this world</span>
              <textarea rows={3} value={draft} placeholder="Only on your devices" onChange={(e) => setDraft(e.target.value)} onBlur={saveNote} />
            </label>
          )}
          {loc && (
            <div className="ui2-card">
              <div className="ui2-card-title">Links</div>
              <button className="ui2-link" onClick={() => backend.openUrl(`https://vrchat.com/home/world/${loc.world}`).catch(() => showToast("Couldn't open the link"))}>
                World page on vrchat.com
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
