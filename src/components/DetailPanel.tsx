// Profile view, laid out like a profile on vrchat.com: banner, big picture with
// a status pill, name with VRC+, pronouns / 18+ / trust rank / represented
// group, mutual friends and groups, about me, links, languages; on the right
// the current world (who's there, open or launch it), badges and groups, plus
// this app's circles, time together and shared friends. One column on narrow
// screens.
import { openImage, type ViewerItem } from "./ImageViewer";
import { removedByMe } from "../notifications";
import { PERSON_MODES, setPersonMode } from "./NotificationsSection";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { backend, imgSrc } from "../backend";
import { listMemberIds } from "../derived";
import { playIntoProfile } from "../flip";
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
import { addToCircle, createCircle, getState, removeFromCircle, setState, showToast, useApp } from "../store";
import { bioKeyState } from "../share";
import { friendStatus, personOf, refreshModerations, relationOf, setFriendRequest, setModeration, unfriend } from "../people";
import { othersHere } from "../live";
import { applyPipelineEvent, freshenProfile, loadGroups, loadInstance, loadWorld, refreshPerson } from "../sync";
import type { Friend, Presence } from "../types";
import { GroupsModal } from "./GroupsModal";
import { Icon } from "./Icon";

const REGION_FLAG: Record<string, string> = { us: "🇺🇸", use: "🇺🇸", usw: "🇺🇸", eu: "🇪🇺", jp: "🇯🇵" };

/** "wrld_…:58693~hidden(usr_…)~region(us)" -> pieces for display. */
export function parseLocation(loc: string) {
  const [world, rest = ""] = loc.split(":");
  const [instance, ...tags] = rest.split("~");
  const tag = (name: string) => tags.find((t) => t.startsWith(`${name}(`))?.slice(name.length + 1, -1);
  let type = "Public";
  if (tags.some((t) => t.startsWith("hidden("))) type = "Friends+";
  else if (tags.some((t) => t.startsWith("friends("))) type = "Friends";
  else if (tags.some((t) => t.startsWith("private("))) type = tags.includes("canRequestInvite") ? "Invite+" : "Invite";
  else if (tags.some((t) => t.startsWith("group("))) {
    const access = tag("groupAccessType");
    type = access === "public" ? "Group Public" : access === "plus" ? "Group+" : "Group";
  }
  const region = tag("region") ?? "us";
  return { world, instance, type, region, flag: REGION_FLAG[region] ?? "🌐" };
}

function PlatformIcon({ plat }: { plat: string }) {
  return <Icon name={plat === "pc" ? "desktop" : plat === "android" ? "headset" : plat === "ios" ? "phone" : "globe"} size={15} />;
}

function StatusArt({ kind }: { kind: string }) {
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
  return (
    <svg viewBox="0 0 120 100" className="status-art" aria-hidden>
      <circle {...common} cx="60" cy="50" r="32" />
      <path {...common} d="M28 50h64 M60 18c-14 16 -14 48 0 64 M60 18c14 16 14 48 0 64" />
    </svg>
  );
}

function statusCard(f: Friend, p: Presence, now: number): { icon: string; text: string; sub?: string } {
  if (p === "offline") {
    const seen = lastSeen(f);
    return { icon: "moon", text: seen ? `Offline for ${duration(now - seen)}` : "Offline" };
  }
  if (p === "web") return { icon: "globe", text: "Active on the website or app", sub: "Not in VRChat right now" };
  const since = toTime(f.last_login);
  const sub = since ? `Online for ${duration(now - since)}` : undefined;
  if (f.location === "private") return { icon: "lock", text: "In a private world", sub };
  if (f.location === "traveling") return { icon: "globe", text: "Traveling to a world", sub };
  return { icon: "globe", text: "Online", sub };
}

export function DetailPanel({ id, popup = false }: { id: string; popup?: boolean }) {
  const cache = useApp((s) => s.cache);
  const local = useApp((s) => s.local);
  const demo = useApp((s) => s.demo);
  const stats = useApp((s) => s.logs.stats);
  const here = useApp((s) => s.here);
  const [newCircle, setNewCircle] = useState("");
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);
  const [instance, setInstance] = useState<{ users: number; capacity?: number } | null>(null);
  // Friends, people who aren't friends yet (instance mates, potential friends), or you.
  const f = personOf(cache, id);
  const relation = relationOf(cache, id);
  const rootRef = useRef<HTMLElement>(null);
  const location = f?.location ?? "";
  const inWorld = location.startsWith("wrld_");

  useLayoutEffect(() => {
    if (popup) playIntoProfile(id, rootRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    setGroupsOpen(false);
    setBioOpen(false);
    if (!f) return;
    freshenProfile(id).then(() => loadGroups(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    setInstance(null);
    if (!inWorld) return;
    let alive = true;
    loadWorld(location.split(":")[0]).then(() => loadInstance(location).then((i) => alive && setInstance(i)));
    return () => {
      alive = false;
    };
  }, [location, inWorld]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !getState().viewer && !(e.target as HTMLElement)?.closest?.("input, textarea, select")) setState({ selectedId: null });
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
  // Representing group first, like on vrchat.com; otherwise VRChat's order.
  const groupList = groups ? [...groups.list].sort((a, b) => Number(!!b.isRepresenting) - Number(!!a.isRepresenting)) : [];
  const representing = groupList.find((g) => g.isRepresenting);
  const mutualGroups = groupList.filter((g) => g.mutual).length;
  const mutualFriends = (mutual?.ids ?? []).map((m) => cache.friends[m]).filter(Boolean);
  const inLists = local.imports.filter((l) => listMemberIds(l, cache).includes(id));
  const time = personTime(stats, id);
  const oftenWith = (stats?.pairs ?? [])
    .filter((x) => (x.a === id || x.b === id) && cache.friends[x.a === id ? x.b : x.a])
    .sort((a, b) => b.secs - a.secs)
    .slice(0, 8);
  const status = statusCard(f, p, now);
  const sColor = statusColor(f, p);
  const loc = inWorld ? parseLocation(location) : null;
  const world = loc ? cache.worlds?.[loc.world] : undefined;
  // Everything on this profile that can be opened full size, in one list to flip through.
  const pics: ViewerItem[] = [];
  const picAt = (url: string | undefined, title: string) => {
    if (!url) return -1;
    const i = pics.findIndex((p) => p.url === url);
    if (i >= 0) return i;
    pics.push({ url, title: `${f.displayName} – ${title}` });
    return pics.length - 1;
  };
  const iconIdx = picAt(iconUrl(f), "profile picture");
  const bannerIdx = picAt(bannerUrl(f), "banner");
  picAt(f.currentAvatarImageUrl, "avatar");
  const worldPic = world?.imageUrl || world?.thumbnailImageUrl;
  const worldIdx = worldPic ? picAt(worldPic, world?.name ? `world ${world.name}` : "world") : -1;
  const show = (i: number) => (e: React.MouseEvent | React.KeyboardEvent) => {
    if ("key" in e && e.key !== "Enter" && e.key !== " ") return;
    e.stopPropagation();
    e.preventDefault();
    if (i >= 0) openImage(pics, i);
  };
  const withThem = inWorld ? Object.values(cache.friends).filter((o) => o.id !== id && o.location === location) : [];
  const isHere = othersHere(here, cache.me?.id).some((x) => x.id === id);
  const viaLists = relation === "other" ? local.imports.filter((l) => l.owner.id && cache.friends[l.owner.id] && l.mode === "full" && l.friends?.some((x) => x.id === id)) : [];
  const close = () => setState({ selectedId: null });
  const open = (url: string) => backend.openUrl(url).catch(() => showToast("Couldn't open the link"));
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => showToast("Link copied"),
      () => showToast("Couldn't copy the link"),
    );
  };
  const longBio = (detail?.bio ?? "").split("\n").length > 4 || (detail?.bio ?? "").length > 260;

  return (
    <aside ref={rootRef} className={`profile ${popup ? "popup" : ""}`} role={popup ? "dialog" : undefined} aria-label={`Profile of ${f.displayName}`}>
      <button className="icon-btn profile-close" data-flip-fade title="Close (Esc)" onClick={close}>
        <Icon name="close" />
      </button>
      <div className="profile-cols">
        <div className="profile-col">
          <section className="pcard profile-main">
            <div
              className={`profile-banner ${bannerIdx >= 0 ? "viewable" : ""}`}
              data-flip="banner"
              style={{ background: f.bannerColor || "#2a9fcc" }}
              role={bannerIdx >= 0 ? "button" : undefined}
              tabIndex={bannerIdx >= 0 ? 0 : undefined}
              title={bannerIdx >= 0 ? "View full size" : undefined}
              onClick={show(bannerIdx)}
              onKeyDown={show(bannerIdx)}
            >
              {banner && <img src={banner} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />}
            </div>
            <div className="profile-id">
              <div
                className={`profile-icon ${iconIdx >= 0 ? "viewable" : ""}`}
                data-flip="icon"
                style={{ borderColor: sColor }}
                role={iconIdx >= 0 ? "button" : undefined}
                tabIndex={iconIdx >= 0 ? 0 : undefined}
                title={iconIdx >= 0 ? "View full size" : undefined}
                onClick={show(iconIdx)}
                onKeyDown={show(iconIdx)}
              >
                {icon ? <img src={icon} alt="" /> : <span>{f.displayName.slice(0, 1).toUpperCase()}</span>}
              </div>
              <span className="status-pill" data-flip="status">
                <span className="dot" style={{ background: sColor }} />
                <span>{f.statusDescription || presenceLabel(f, p)}</span>
              </span>
            </div>
            <div className="profile-text">
              <h2>
                <span data-flip="name">{f.displayName}</span>
                {supporter && (
                  <span className="vrcplus-badge" data-flip-fade title="VRC+ supporter">
                    VRC+
                  </span>
                )}
              </h2>
              <div className="profile-sub">
                {detail?.pronouns && (
                  <span className="muted" data-flip-fade>
                    {detail.pronouns}
                  </span>
                )}
                {detail?.ageVerified && (
                  <span className="verified" data-flip-fade title="Age verified by VRChat">
                    <Icon name="idcard" size={15} /> Verified 18+
                  </span>
                )}
                <span className="trust" data-flip="trust" style={{ color: trust.color }}>
                  <Icon name="shield" size={14} /> {trust.label}
                </span>
                {representing && (
                  <button className="group-pill" data-flip-fade title="Representing this group" onClick={() => open(`https://vrchat.com/home/group/${representing.groupId}`)}>
                    {representing.iconUrl && <img src={imgSrc(representing.iconUrl)} alt="" />}
                    {representing.name}
                  </button>
                )}
              </div>
              {(mutualFriends.length > 0 || mutualGroups > 0) && (
                <div className="mutual-row">
                  <span className="face-stack" data-flip-fade>
                    {mutualFriends.slice(0, 3).map((m) => {
                      const src = imgSrc(iconUrl(m));
                      return <span key={m.id} className="face">{src ? <img src={src} alt="" /> : m.displayName.slice(0, 1)}</span>;
                    })}
                  </span>
                  {mutualFriends.length > 0 && (
                    <span data-flip="mutuals">
                      {mutualFriends.length} mutual friend{mutualFriends.length === 1 ? "" : "s"}
                    </span>
                  )}
                  {mutualGroups > 0 && (
                    <span data-flip-fade>
                      {mutualGroups} mutual group{mutualGroups === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              )}
              {relation !== "friend" && (
                <RelationBox id={id} relation={relation} here={isHere} via={viaLists.map((l) => l.owner.displayName)} />
              )}
              {relation === "friend" && isHere && (
                <p className="relation-here" data-flip-fade>
                  <span className="here-dot" /> In your instance right now
                </p>
              )}
              <div className="profile-actions" data-flip-fade>
                {!demo && (
                  <button className="btn" onClick={() => refreshPerson(id).then(() => loadGroups(id, true))} title="Load this profile again from VRChat">
                    <Icon name="refresh" size={16} /> Refresh
                  </button>
                )}
                <button className="btn" onClick={() => open(`https://vrchat.com/home/user/${id}`)} title="Open on vrchat.com in your browser">
                  <Icon name="external" size={16} /> Open on vrchat.com
                </button>
                <button className="btn" onClick={() => copy(`https://vrchat.com/home/user/${id}`)} title="Copy the profile link">
                  <Icon name="link" size={16} />
                </button>
                {relation === "friend" && <NotifyBell id={id} />}
              </div>
              {relation !== "me" && <ModerationRow id={id} name={f.displayName} friend={relation === "friend"} />}

              <div className="profile-block" data-flip-fade>
                <h3>About me</h3>
                {detail?.bio ? (
                  <>
                    <p className={`bio ${longBio && !bioOpen ? "clamped" : ""}`}>{detail.bio}</p>
                    {longBio && (
                      <button className="btn link small" onClick={() => setBioOpen(!bioOpen)}>
                        {bioOpen ? "Show less" : "Read more"}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="muted small">{detail ? "Nothing written." : "Loading…"}</p>
                )}
                <BioKey bio={detail?.bio} userId={f.id} />
                {links.length > 0 && (
                  <div className="bio-links">
                    {links.map((l) => (
                      <button key={l} className="bio-link" title={l} onClick={() => open(l)}>
                        <Icon name="link" size={14} />
                        {shortLink(l)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {languages.length > 0 && (
                <div className="profile-block" data-flip-fade>
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
              {detail?.note && (
                <div className="profile-block" data-flip-fade>
                  <h3>Your note</h3>
                  <p className="note-text">{detail.note}</p>
                </div>
              )}
              <div className="profile-block">
                <h3 data-flip-fade>Profile</h3>
                <dl className="facts with-icons">
                  <dt data-flip-fade>
                    <PlatformIcon plat={plat} /> Platform
                  </dt>
                  <dd data-flip="plat">{PLATFORM_LABEL[plat]}</dd>
                  <dt data-flip-fade>
                    <Icon name="clock" size={15} /> Last login
                  </dt>
                  <dd data-flip-fade>{toTime(f.last_login) ? new Date(toTime(f.last_login)).toLocaleString() : "unknown"}</dd>
                  <dt data-flip-fade>
                    <Icon name="calendar" size={15} /> Joined VRChat
                  </dt>
                  <dd data-flip-fade>{detail?.date_joined ? fmtDate(detail.date_joined) : "loading…"}</dd>
                  {relation !== "me" && (
                    <>
                      <dt data-flip-fade>
                        <Icon name="users" size={15} /> Mutual friends
                      </dt>
                      <dd data-flip-fade>{mutual ? (mutual.hidden ? "hidden by them" : mutual.count) : "loading…"}</dd>
                    </>
                  )}
                  {cache.favorites[id]?.length ? (
                    <>
                      <dt data-flip-fade>
                        <Icon name="star" size={15} /> Your favorites
                      </dt>
                      <dd data-flip-fade>{cache.favorites[id].join(", ")}</dd>
                    </>
                  ) : null}
                  {inLists.length > 0 && (
                    <>
                      <dt data-flip-fade>
                        <Icon name="share" size={15} /> Also in lists of
                      </dt>
                      <dd data-flip-fade>{inLists.map((l) => l.owner.displayName).join(", ")}</dd>
                    </>
                  )}
                </dl>
              </div>
            </div>
          </section>
        </div>

        <div className="profile-col" data-flip-fade>
          {loc ? (
            <section className="pcard world-card">
              <div
                className={`world-banner ${worldIdx >= 0 ? "viewable" : ""}`}
                role="button"
                tabIndex={0}
                title={worldIdx >= 0 ? "View full size" : "Open this world on vrchat.com"}
                onClick={worldIdx >= 0 ? show(worldIdx) : () => open(`https://vrchat.com/home/world/${loc.world}`)}
                onKeyDown={worldIdx >= 0 ? show(worldIdx) : undefined}
              >
                {worldPic ? <img src={imgSrc(worldPic)} alt="" /> : <StatusArt kind="globe" />}
                <span className="loc-pill">
                  <Icon name="pin" size={14} /> Current Location
                </span>
                <button
                  className="banner-link"
                  title="Open this world on vrchat.com"
                  onClick={(e) => {
                    e.stopPropagation();
                    open(`https://vrchat.com/home/world/${loc.world}`);
                  }}
                >
                  <Icon name="external" size={15} />
                </button>
              </div>
              <div className="world-info">
                <h3 className="world-name">{world?.name ?? (demo ? "Demo World" : "Loading world…")}</h3>
                <div className="world-line">
                  <span className="flag">{loc.flag}</span> {loc.instance} - {loc.type}
                </div>
                <div className="world-line">
                  <Icon name="users" size={15} /> {instance ? `${instance.users} / ${instance.capacity ?? world?.capacity ?? "?"}` : world?.capacity ? `? / ${world.capacity}` : "…"}
                  {withThem.length > 0 && (
                    <>
                      {" · "}
                      <span className="face-stack small-faces">
                        {withThem.slice(0, 5).map((o) => {
                          const src = imgSrc(iconUrl(o));
                          return <span key={o.id} className="face">{src ? <img src={src} alt="" /> : o.displayName.slice(0, 1)}</span>;
                        })}
                      </span>
                      {withThem.length} of your friends
                    </>
                  )}
                </div>
                {withThem.length > 0 && (
                  <div className="mini-list with-them">
                    {withThem.map((o) => (
                      <button key={o.id} className="mini" onClick={() => setState({ selectedId: o.id })}>
                        <span className="dot" style={{ background: statusColor(o, presenceOf(o, cache.presence)) }} />
                        {o.displayName}
                      </button>
                    ))}
                  </div>
                )}
                <div className="world-actions">
                  <button className="btn launch" onClick={() => open(`vrchat://launch?ref=vrchat.com&id=${location}`)} title="Opens VRChat on this device and goes to this instance (you may need an invite)">
                    <Icon name="rocket" size={16} /> Launch in VRChat
                  </button>
                  <button className="btn" onClick={() => open(`https://vrchat.com/home/launch?worldId=${loc.world}&instanceId=${location.split(":")[1] ?? ""}`)} title="Open the instance page on vrchat.com">
                    <Icon name="external" size={16} /> Instance page
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className={`pcard status-card ${p}`}>
              <StatusArt kind={status.icon} />
              <div className="status-text">{status.text}</div>
              {status.sub && <div className="muted small">{status.sub}</div>}
            </section>
          )}

          {badges.length > 0 && (
            <section className="pcard">
              <h3>Badges</h3>
              <div className="badges">
                {badges.map((b, i) => (
                  <img
                    key={b.id}
                    className="viewable"
                    src={imgSrc(b.imageUrl)}
                    alt={b.name}
                    title={b.description ? `${b.name}: ${b.description}` : b.name}
                    onClick={() => openImage(badges.map((x) => ({ url: x.imageUrl, title: `Badge – ${x.name}` })), i)}
                  />
                ))}
              </div>
            </section>
          )}

          {groupList.length > 0 && (
            <section className="pcard">
              <h3>Groups</h3>
              <ul className="group-list">
                {groupList.slice(0, 5).map((g) => (
                  <li key={g.groupId}>
                    <button className="group-row" onClick={() => open(`https://vrchat.com/home/group/${g.groupId}`)} title="Open the group on vrchat.com">
                      <span
                        className={`group-icon ${g.iconUrl ? "viewable" : ""}`}
                        title={g.iconUrl ? "View full size" : undefined}
                        onClick={(e) => {
                          if (!g.iconUrl) return;
                          e.stopPropagation();
                          openImage({ url: g.iconUrl, title: `Group ${g.name} – icon` });
                        }}
                      >
                        {g.iconUrl ? <img src={imgSrc(g.iconUrl)} alt="" /> : g.name.slice(0, 1)}
                      </span>
                      <span className="group-name">{g.name}</span>
                      {g.isRepresenting && (
                        <span className="rep" title="Representing">
                          <Icon name="bookmark" size={16} />
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {groupList.length > 5 && (
                <button className="btn wide" onClick={() => setGroupsOpen(true)}>
                  View all {groupList.length}
                </button>
              )}
            </section>
          )}

          {relation === "friend" && (
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
          )}

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
            {[detail && `Profile loaded ${relTime(detail.fetchedAt, now)}`, mutual && `mutuals ${relTime(mutual.fetchedAt, now)}`].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {groupsOpen && groups && <GroupsModal name={f.displayName} groups={groupList} onClose={() => setGroupsOpen(false)} />}
    </aside>
  );
}

/** A friend's "vfm-key:…" bio line checked against the key servers gave you. */
function BioKey({ bio, userId }: { bio?: string; userId: string }) {
  const pin = useApp((s) => s.keyPins?.[userId]);
  const st = bioKeyState(bio, pin);
  if (!st) return null;
  if (st === "match")
    return (
      <p className="key-check ok-text">
        <Icon name="key" size={14} /> Sharing key confirmed by their bio
      </p>
    );
  if (st === "mismatch")
    return (
      <p className="key-check warn-text">
        <Icon name="warn" size={14} /> The sharing key in their bio doesn't match the one a server gave you. Don't trust what you get from them
        through servers until this is sorted out (ask them).
      </p>
    );
  return (
    <p className="key-check muted">
      <Icon name="key" size={14} /> Has a sharing key in their bio (you haven't received anything from them yet).
    </p>
  );
}

/** For someone who isn't a friend (or you): how you're connected, and the
 *  friend-request button. One request per click, never automatic. */
function RelationBox({ id, relation, here, via }: { id: string; relation: "me" | "other"; here: boolean; via: string[] }) {
  const demo = useApp((s) => s.demo);
  const [status, setStatus] = useState<{ isFriend: boolean; outgoing: boolean; incoming: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setStatus(null);
    setError("");
    if (relation === "other") friendStatus(id).then(setStatus);
  }, [id, relation]);

  if (relation === "me") {
    return (
      <div className="relation-box me" data-flip-fade>
        <Icon name="user" size={15} /> This is you. On the map you float between the friends you spend the most time with.
      </div>
    );
  }
  const act = async (send: boolean) => {
    setBusy(true);
    setError("");
    const err = await setFriendRequest(id, send);
    setBusy(false);
    if (err) setError(err);
    else {
      setStatus((s) => ({ isFriend: false, incoming: s?.incoming ?? false, outgoing: send }));
      showToast(send ? "Friend request sent" : "Friend request cancelled");
    }
  };
  const bits = ["Not a friend yet"];
  if (here) bits.push("in your instance right now");
  if (via.length) bits.push(`in ${via.slice(0, 2).join(" and ")}${via.length > 2 ? ` and ${via.length - 2} more` : ""}'s friend list`);
  return (
    <div className="relation-box" data-flip-fade>
      <p>
        {here && <span className="here-dot" />} {bits.join(" · ")}
      </p>
      {status?.isFriend ? (
        <p className="small ok-text">You're friends now. They'll show up as a friend after the next sync.</p>
      ) : (
        <div className="row">
          {status?.outgoing ? (
            <>
              <span className="small muted">
                <Icon name="user-check" size={14} /> Request sent
              </span>
              <button className="btn small" disabled={busy || demo} onClick={() => act(false)}>
                Cancel request
              </button>
            </>
          ) : (
            <button className="btn primary small" disabled={busy || demo} onClick={() => act(true)} title={demo ? "Not in demo mode" : "Send them a friend request on VRChat"}>
              <Icon name="user-plus" size={15} /> {status?.incoming ? "Accept: send request back" : "Send friend request"}
            </button>
          )}
          {status?.incoming && !status.outgoing && <span className="small">They sent you one.</span>}
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

type Mod = "block" | "mute" | "hideAvatar";
const NO_MODS: string[] = [];

/** Unfriend, block, mute, hide avatar (and undo). Each is one click plus a
 *  confirmation for the ones that are hard to take back. */
function ModerationRow({ id, name, friend }: { id: string; name: string; friend: boolean }) {
  const demo = useApp((s) => s.demo);
  const byUser = useApp((s) => s.cache.moderations?.byUser);
  const mods = byUser?.[id] ?? NO_MODS;
  const [confirming, setConfirming] = useState<"unfriend" | "block" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setConfirming(null);
    setError("");
    void refreshModerations();
  }, [id]);

  const run = async (what: () => Promise<string | null>, done: string) => {
    setBusy(true);
    setError("");
    const err = await what();
    setBusy(false);
    setConfirming(null);
    if (err) setError(err);
    else showToast(done);
  };
  const toggle = (kind: Mod, on: boolean, done: string) => run(() => setModeration(id, kind, on), done);
  const has = (k: Mod) => mods.includes(k);
  const off = busy || demo;

  if (confirming) {
    const text =
      confirming === "unfriend"
        ? `Remove ${name} from your friends? They aren't told, but you'd have to send a new request to be friends again.`
        : `Block ${name}? You won't see or hear each other in VRChat. You can unblock them here later.`;
    return (
      <div className="mod-row confirm" data-flip-fade>
        <p className="small">{text}</p>
        <div className="row">
          <button
            className="btn danger small"
            disabled={off}
            onClick={() =>
              confirming === "unfriend"
                ? run(async () => {
                    removedByMe.add(id);
                    const err = await unfriend(id);
                    if (err) removedByMe.delete(id);
                    if (!err) applyPipelineEvent("friend-delete", { userId: id });
                    return err;
                  }, `${name} removed from your friends`)
                : toggle("block", true, `${name} blocked`)
            }
          >
            {confirming === "unfriend" ? "Unfriend" : "Block"}
          </button>
          <button className="btn small" onClick={() => setConfirming(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mod-row" data-flip-fade>
      {friend && (
        <button className="btn small" disabled={off} onClick={() => setConfirming("unfriend")} title="Remove from your friends on VRChat">
          <Icon name="user" size={14} /> Unfriend
        </button>
      )}
      {has("block") ? (
        <button className="btn small" disabled={off} onClick={() => toggle("block", false, `${name} unblocked`)}>
          Unblock
        </button>
      ) : (
        <button className="btn small" disabled={off} onClick={() => setConfirming("block")}>
          Block
        </button>
      )}
      <button className="btn small" disabled={off} onClick={() => toggle("mute", !has("mute"), has("mute") ? `${name} unmuted` : `${name} muted`)}>
        {has("mute") ? "Unmute" : "Mute"}
      </button>
      <button
        className="btn small"
        disabled={off}
        onClick={() => toggle("hideAvatar", !has("hideAvatar"), has("hideAvatar") ? "Avatar back to your safety settings" : "Avatar hidden")}
        title={has("hideAvatar") ? "Back to what your safety settings decide" : "Always hide their avatar in VRChat"}
      >
        {has("hideAvatar") ? "Stop hiding avatar" : "Hide avatar"}
      </button>
      {has("block") && <span className="small muted">You've blocked them.</span>}
      {demo && <span className="small muted">Not in demo mode.</span>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

/** Per-person notification rule: general rules / always / once / never. */
function NotifyBell({ id }: { id: string }) {
  const mode = useApp((s) => s.settings.notify.people[id]?.mode ?? "default") as (typeof PERSON_MODES)[number]["value"];
  const label = PERSON_MODES.find((m) => m.value === mode)?.label ?? "";
  return (
    <label className={`btn notify-bell ${mode !== "default" ? "on" : ""}`} title={`Notifications for this person: ${label}`}>
      <Icon name={mode === "never" ? "bell-off" : "bell"} size={16} />
      {mode === "once" ? "Next time online" : mode === "always" ? "Always" : mode === "never" ? "Muted" : ""}
      <select value={mode} onChange={(e) => setPersonMode(id, e.target.value as (typeof PERSON_MODES)[number]["value"])}>
        {PERSON_MODES.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}
