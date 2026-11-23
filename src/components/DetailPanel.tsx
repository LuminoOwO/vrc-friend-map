// Profile view, laid out like a profile on vrchat.com: banner, big picture with
// a status pill, name with VRC+, pronouns / 18+ / trust rank / represented
// group, mutual friends and groups, about me, links, languages; on the right
// the current world (who's there, open or launch it), badges and groups, plus
// this app's circles, time together and shared friends. One column on narrow
// screens.
import { listJoin, t as tr, language } from "../i18n";
import { openImage, type ViewerItem } from "./ImageViewer";
import { betaActive } from "../ui2/active";
import { removedByMe } from "../notifications";
import { AgePanel } from "./AgePanel";
import { ProfileEditor } from "./ProfileEditor";
import { PronounsEdit, StatusEdit } from "./QuickEdit";
import { concernAbout } from "../age";
import { PERSON_MODES, setPersonMode } from "./NotificationsSection";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDismiss } from "../ui2/dismiss";
import { Skel, useSmooth } from "../ui2/smooth";
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
import { accountModerations, friendStatus, isBlocked, personOf, refreshModerations, relationOf, setFriendRequest, setModeration, unfriend } from "../people";
import { MAIN } from "../accountmerge";
import { othersHere } from "../live";
import { applyPipelineEvent, fetchAccountFriends, freshenProfile, loadGroups, loadInstance, loadWorld, refreshPerson } from "../sync";
import type { Friend, Presence } from "../types";
import { GroupsModal } from "./GroupsModal";
import { Icon } from "./Icon";
import { GroupPic } from "./GroupPic";
import { customSounds, onCustomSounds, previewEvent } from "../notifications";
import { SOUNDS } from "../notify";
import { updateNotify } from "../store";
import { BlockFlags, InviteActions, LocalTime, NicknameAndSnooze, OnlineHistory, PersonLog, SafetyCode, StarButton, VrcNote } from "./PersonExtras";
import { inviteMyself } from "../invites";

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
    type = access === "public" ? tr("profile.groupPublic") : access === "plus" ? "Group+" : "Group";
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
    return { icon: "moon", text: seen ? tr("profile.offlineForValue", { value: duration(now - seen) }) : tr("status.offline") };
  }
  if (p === "web") return { icon: "globe", text: tr("profile.activeOnTheWebsiteOr"), sub: tr("profile.notInVrchatRightNow") };
  const since = toTime(f.last_login);
  const sub = since ? tr("profile.onlineForValue", { value: duration(now - since) }) : undefined;
  if (f.location === "private") return { icon: "lock", text: tr("profile.inAPrivateWorld"), sub };
  if (f.location === "traveling") return { icon: "globe", text: tr("profile.travelingToAWorld"), sub };
  return { icon: "globe", text: tr("status.online"), sub };
}

export function DetailPanel({ id, popup = false }: { id: string; popup?: boolean }) {
  // Cards that appear once their data has loaded slide in, and the rest move smoothly.
  const smoothMain = useSmooth();
  const smoothSide = useSmooth();
  const cache = useApp((s) => s.cache);
  const local = useApp((s) => s.local);
  const [editing, setEditing] = useState(false);
  const demo = useApp((s) => s.demo);
  const stats = useApp((s) => s.logs.stats);
  const here = useApp((s) => s.here);
  const [newCircle, setNewCircle] = useState("");
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [quick, setQuick] = useState<"status" | "pronouns" | null>(null);
  const [bioOpen, setBioOpen] = useState(false);
  const [instance, setInstance] = useState<{ users: number; capacity?: number } | null>(null);
  // Friends, people who aren't friends yet (instance mates, potential friends), or you.
  const f = personOf(cache, id);
  const relation = relationOf(cache, id);
  // Your accounts: which know them, and which one profile actions run as.
  const accounts = useApp((s) => s.settings.accounts);
  const knownBy = relation === "friend" ? (cache.friendOf?.[id] ?? [MAIN]) : [];
  const [acting, setActing] = useState<string | undefined>(undefined);
  useEffect(() => {
    const of = getState().cache.friendOf?.[id];
    setActing(of && !of.includes(MAIN) ? of[0] : undefined);
  }, [id]);
  const actingAs = accounts.actAs ? acting : undefined;
  const friendForActing = knownBy.includes(actingAs ?? MAIN);
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
  const languages = languagesOf(detail?.tags, detail?.languages);
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
    pics.push({ url, title: tr("profile.nameTitle", { name: f.displayName, title }) });
    return pics.length - 1;
  };
  const iconIdx = picAt(iconUrl(f), "profile picture");
  const bannerIdx = picAt(bannerUrl(f), "banner");
  picAt(f.currentAvatarImageUrl, "avatar");
  const worldPic = world?.imageUrl || world?.thumbnailImageUrl;
  const worldIdx = worldPic ? picAt(worldPic, world?.name ? tr("profile.worldName", { name: world.name }) : "world") : -1;
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
  const open = (url: string) => backend.openUrl(url).catch(() => showToast(tr("profile.couldnTOpenTheLink")));
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(
      () => showToast(tr("profile.linkCopied")),
      () => showToast(tr("profile.couldnTCopyTheLink")),
    );
  };
  const longBio = (detail?.bio ?? "").split("\n").length > 4 || (detail?.bio ?? "").length > 260;

  // New interface (popup): banner, picture, name and details as one header across the top.
  const hero = popup && betaActive();
  const bannerEl = (
    <div
      className={`profile-banner ${bannerIdx >= 0 ? "viewable" : ""}`}
      data-flip="banner"
      style={{ background: f.bannerColor || "#2a9fcc" }}
      role={bannerIdx >= 0 ? "button" : undefined}
      tabIndex={bannerIdx >= 0 ? 0 : undefined}
      title={bannerIdx >= 0 ? tr("profile.viewFullSize") : undefined}
      onClick={show(bannerIdx)}
      onKeyDown={show(bannerIdx)}
    >
      {banner && <img src={banner} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />}
    </div>
  );
  const idEl = (
    <div className="profile-id">
      <div
        className={`profile-icon ${iconIdx >= 0 ? "viewable" : ""}`}
        data-flip="icon"
        style={{ borderColor: sColor }}
        role={iconIdx >= 0 ? "button" : undefined}
        tabIndex={iconIdx >= 0 ? 0 : undefined}
        title={iconIdx >= 0 ? tr("profile.viewFullSize") : undefined}
        onClick={show(iconIdx)}
        onKeyDown={show(iconIdx)}
      >
        {icon ? <img src={icon} alt="" /> : <span>{f.displayName.slice(0, 1).toUpperCase()}</span>}
      </div>
      {relation === "me" ? (
        <span className="qe-wrap">
          <button
            className="status-pill qe-anchor editable"
            data-flip="status"
            title={tr("quickEdit.clickToChange")}
            aria-expanded={quick === "status"}
            onClick={() => setQuick(quick === "status" ? null : "status")}
          >
            <span className="dot" style={{ background: sColor }} />
            <span>{f.statusDescription || presenceLabel(f, p)}</span>
            <Icon name="edit" size={12} />
          </button>
          {quick === "status" && <StatusEdit id={id} status={f.status} text={f.statusDescription ?? ""} onClose={() => setQuick(null)} />}
        </span>
      ) : (
        <span className="status-pill" data-flip="status">
          <span className="dot" style={{ background: sColor }} />
          <span>{f.statusDescription || presenceLabel(f, p)}</span>
        </span>
      )}
    </div>
  );
  const nameEl = (
    <h2>
      <span data-flip="name">{f.displayName}</span>
      {supporter && (
        <span className="vrcplus-badge" data-flip-fade title={tr("profile.vrcSupporter")}>
          {tr("profile.vrc")}
        </span>
      )}
    </h2>
  );
  const subEl = (
    <div className="profile-sub">
      {relation === "me" ? (
        <span className="qe-wrap">
          <button
            className="qe-anchor qe-pronouns muted"
            data-flip-fade
            title={tr("quickEdit.clickToChange")}
            aria-expanded={quick === "pronouns"}
            onClick={() => setQuick(quick === "pronouns" ? null : "pronouns")}
          >
            {detail?.pronouns || (
              <>
                <Icon name="plus" size={12} /> {tr("quickEdit.addPronouns")}
              </>
            )}
          </button>
          {quick === "pronouns" && <PronounsEdit id={id} value={detail?.pronouns ?? ""} onClose={() => setQuick(null)} />}
        </span>
      ) : (
        detail?.pronouns && (
          <span className="muted" data-flip-fade>
            {detail.pronouns}
          </span>
        )
      )}
      {detail?.ageVerified && (
        <span className="verified" data-flip-fade title={tr("profile.ageVerifiedByVrchat")}>
          <Icon name="idcard" size={15} /> {tr("profile.verified18")}
        </span>
      )}
      <span className="trust" data-flip="trust" style={{ color: trust.color }}>
        <Icon name="shield" size={14} /> {trust.label}
      </span>
      {representing && (
        <button className="group-pill" data-flip-fade title={tr("profile.representingThisGroup")} onClick={() => open(`https://vrchat.com/home/group/${representing.groupId}`)}>
          <GroupPic url={representing.iconUrl} name={representing.name} />
          {representing.name}
        </button>
      )}
    </div>
  );
  return (
    <aside ref={rootRef} className={`profile ${popup ? "popup" : ""} ${hero ? "ui2-profile" : ""}`} role={popup ? "dialog" : undefined} aria-label={`Profile of ${f.displayName}`}>
      {hero ? (
        <button className="ui2-close" data-flip-fade title={tr("profile.closeEsc")} aria-label={tr("profile.closeProfile")} onClick={close}>
          <span className="ui2-close-x">
            <Icon name="close" size={20} />
          </span>
          <span className="ui2-close-esc">{tr("profile.esc")}</span>
        </button>
      ) : (
        <button className="icon-btn profile-close" data-flip-fade title={tr("profile.closeEsc")} onClick={close}>
          <Icon name="close" />
        </button>
      )}
      {hero && (
        <header className="profile-hero">
          {bannerEl}
          <div className="profile-hero-row">
            {idEl}
            <div className="profile-hero-text">
              {nameEl}
              {subEl}
            </div>
          </div>
        </header>
      )}
      <div className="profile-cols">
        <div className="profile-col" ref={smoothMain}>
          <section className="pcard profile-main">
            {!hero && bannerEl}
            {!hero && idEl}
            <div className="profile-text">
              {!hero && nameEl}
              {!hero && subEl}
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
              {knownBy.some((a) => a !== MAIN) && <KnownBy ids={knownBy} />}
              {accounts.actAs && accounts.list.length > 0 && relation !== "me" && <ActAs value={actingAs} onChange={setActing} />}
              {(relation !== "friend" || !friendForActing) && (
                <RelationBox id={id} relation={relation === "me" ? "me" : "other"} here={isHere} via={viaLists.map((l) => l.owner.displayName)} account={actingAs} />
              )}
              {relation === "friend" && isHere && (
                <p className="relation-here" data-flip-fade>
                  <span className="here-dot" /> {tr("profile.inYourInstanceRightNow2")}
                </p>
              )}
              <div className="profile-actions" data-flip-fade>
                {!demo && (
                  <button className="btn" onClick={() => refreshPerson(id).then(() => loadGroups(id, true))} title={tr("profile.loadThisProfileAgainFrom")}>
                    <Icon name="refresh" size={16} /> {tr("profile.refresh")}
                  </button>
                )}
                <button className="btn" onClick={() => open(`https://vrchat.com/home/user/${id}`)} title={tr("profile.openOnVrchatComIn")}>
                  <Icon name="external" size={16} /> {tr("profile.openOnVrchatCom")}
                </button>
                <button className="btn" onClick={() => copy(`https://vrchat.com/home/user/${id}`)} title={tr("profile.copyTheProfileLink")}>
                  <Icon name="link" size={16} />
                </button>
                {relation === "friend" && <StarButton id={id} />}
                {relation === "friend" && <PersonMore id={id} />}
                {relation === "me" && (
                  <button className="btn" onClick={() => setEditing(true)} title={tr("profile.changeYourStatusBioLinks")}>
                    <Icon name="settings" size={16} /> {tr("profile.editProfile")}
                  </button>
                )}
              </div>
              {editing && <ProfileEditor id={id} onClose={() => setEditing(false)} />}
              {relation !== "me" && <ModerationRow id={id} name={f.displayName} friend={relation === "friend" && friendForActing} account={actingAs} />}
              {relation === "friend" && <NicknameAndSnooze id={id} name={f.displayName} />}
              {relation !== "me" && <RedFlags id={id} />}
              {relation !== "me" && <BlockFlags id={id} blocked={isBlocked(cache, id)} />}

              <div className="profile-block" data-flip-fade>
                <h3>{tr("profile.aboutMe")}</h3>
                {detail?.bio ? (
                  <>
                    <p className={`bio ${longBio && !bioOpen ? "clamped" : ""}`}>{detail.bio}</p>
                    {longBio && (
                      <button className="btn link small" onClick={() => setBioOpen(!bioOpen)}>
                        {bioOpen ? tr("profile.showLess") : tr("profile.readMore")}
                      </button>
                    )}
                  </>
                ) : detail && (detail.profileFetchedAt || demo) ? (
                  <p className="muted small">{tr("profile.nothingWritten")}</p>
                ) : (
                  <p className="skel-lines">
                    <Skel w="92%" block />
                    <Skel w="78%" block />
                    <Skel w="55%" block />
                  </p>
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
                  <h3>{tr("profile.languages")}</h3>
                  <div className="chips">
                    {languages.map((l) => (
                      <span key={l} className="lang">
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {relation !== "me" && <AgePanel id={id} />}
              {relation === "friend" && <LocalTime id={id} name={f.displayName} />}
              {relation === "friend" && <OnlineHistory id={id} name={f.displayName} online={p === "online"} />}
              {relation !== "me" && <VrcNote id={id} />}
              {relation !== "me" && !demo && <PersonLog id={id} name={f.displayName} />}
              {relation === "friend" && !demo && <SafetyCode id={id} name={f.displayName} />}
              <div className="profile-block">
                <h3 data-flip-fade>{tr("profile.profile")}</h3>
                <dl className="facts with-icons">
                  <dt data-flip-fade>
                    <PlatformIcon plat={plat} /> {tr("profile.platform")}
                  </dt>
                  <dd data-flip="plat">{PLATFORM_LABEL[plat]}</dd>
                  <dt data-flip-fade>
                    <Icon name="clock" size={15} /> {tr("profile.lastLogin")}
                  </dt>
                  <dd data-flip-fade>{toTime(f.last_login) ? new Date(toTime(f.last_login)).toLocaleString(language()) : "unknown"}</dd>
                  <dt data-flip-fade>
                    <Icon name="calendar" size={15} /> {tr("profile.joinedVrchat")}
                  </dt>
                  <dd data-flip-fade>{detail?.date_joined ? fmtDate(detail.date_joined) : <Skel w="7em" />}</dd>
                  {relation !== "me" && (
                    <>
                      <dt data-flip-fade>
                        <Icon name="users" size={15} /> {tr("profile.mutualFriends")}
                      </dt>
                      <dd data-flip-fade>{mutual ? (mutual.hidden ? tr("profile.hiddenByThem") : mutual.count) : <Skel w="2.5em" />}</dd>
                    </>
                  )}
                  {cache.favorites[id]?.length ? (
                    <>
                      <dt data-flip-fade>
                        <Icon name="star" size={15} /> {tr("profile.yourFavorites")}
                      </dt>
                      <dd data-flip-fade>{cache.favorites[id].join(", ")}</dd>
                    </>
                  ) : null}
                  {inLists.length > 0 && (
                    <>
                      <dt data-flip-fade>
                        <Icon name="share" size={15} /> {tr("profile.alsoInListsOf")}
                      </dt>
                      <dd data-flip-fade>{inLists.map((l) => l.owner.displayName).join(", ")}</dd>
                    </>
                  )}
                </dl>
              </div>
            </div>
          </section>
        </div>

        <div className="profile-col" data-flip-fade ref={smoothSide}>
          {loc ? (
            <section className="pcard world-card">
              <div
                className={`world-banner ${worldIdx >= 0 ? "viewable" : ""}`}
                role="button"
                tabIndex={0}
                title={worldIdx >= 0 ? tr("profile.viewFullSize") : tr("profile.openThisWorldOnVrchat")}
                onClick={worldIdx >= 0 ? show(worldIdx) : () => open(`https://vrchat.com/home/world/${loc.world}`)}
                onKeyDown={worldIdx >= 0 ? show(worldIdx) : undefined}
              >
                {worldPic ? <img src={imgSrc(worldPic)} alt="" /> : <StatusArt kind="globe" />}
                <span className="loc-pill">
                  <Icon name="pin" size={14} /> {tr("profile.currentLocation")}
                </span>
                <button
                  className="banner-link"
                  title={tr("profile.openThisWorldOnVrchat")}
                  onClick={(e) => {
                    e.stopPropagation();
                    open(`https://vrchat.com/home/world/${loc.world}`);
                  }}
                >
                  <Icon name="external" size={15} />
                </button>
              </div>
              <div className="world-info">
                <h3 className="world-name">
                  <button className="link-btn" onClick={() => setState({ openWorld: loc.world })} title={tr("profile.worldDetailsYourNotes")}>
                    {world?.name ?? (demo ? tr("profile.demoWorld") : <Skel w="11em" h="1em" />)}
                  </button>
                </h3>
                <div className="world-line">
                  <span className="flag">{loc.flag}</span> {loc.instance} - {loc.type}
                </div>
                <div className="world-line clickable" role="button" title={tr("profile.whoSInThisInstance")} onClick={() => setState({ openInstance: location })}>
                  <Icon name="users" size={15} /> {instance ? tr("profile.usersValue", { users: instance.users, value: instance.capacity ?? world?.capacity ?? "?" }) : world?.capacity ? `? / ${world.capacity}` : "…"}
                  {withThem.length > 0 && (
                    <>
                      {" · "}
                      <span className="face-stack small-faces clickable" role="button" title={tr("profile.whoSInThisInstance")} onClick={() => setState({ openInstance: location })}>
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
                {relation === "friend" && (
                  <InviteActions
                    id={id}
                    name={f.displayName}
                    location={location}
                    worldName={world?.name ?? ""}
                    full={!!instance && !!(instance.capacity ?? world?.capacity) && instance.users >= (instance.capacity ?? world?.capacity ?? Infinity)}
                  />
                )}
                <div className="world-actions">
                  <button
                    className="btn"
                    disabled={demo}
                    title={tr("profile.inviteMeTitle")}
                    onClick={() => inviteMyself(location).then((err) => showToast(err ? tr("profile.couldnTInviteYouError", { error: err }) : tr("profile.inviteSentToYouAccept")))}
                  >
                    <Icon name="user-check" size={16} /> {tr("profile.inviteMe")}
                  </button>
                  <button className="btn launch" onClick={() => open(`vrchat://launch?ref=vrchat.com&id=${location}`)} title={tr("profile.opensVrchatOnThisDevice")}>
                    <Icon name="rocket" size={16} /> {tr("profile.launchInVrchat")}
                  </button>
                  <button className="btn" onClick={() => open(`https://vrchat.com/home/launch?worldId=${loc.world}&instanceId=${location.split(":")[1] ?? ""}`)} title={tr("profile.openTheInstancePageOn")}>
                    <Icon name="external" size={16} /> {tr("profile.instancePage")}
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
              <h3>{tr("profile.badges")}</h3>
              <div className="badges">
                {badges.map((b, i) => (
                  <img
                    key={b.id}
                    className="viewable"
                    src={imgSrc(b.imageUrl)}
                    alt={b.name}
                    title={b.description ? tr("profile.nameDescription", { name: b.name, description: b.description }) : b.name}
                    onClick={() => openImage(badges.map((x) => ({ url: x.imageUrl, title: tr("profile.badgeName", { name: x.name }) })), i)}
                  />
                ))}
              </div>
            </section>
          )}

          {groupList.length > 0 && (
            <section className="pcard">
              <h3>{tr("profile.groups")}</h3>
              <ul className="group-list">
                {groupList.slice(0, 5).map((g) => (
                  <li key={g.groupId}>
                    <button className="group-row" onClick={() => setState({ openGroup: g.groupId })} title={tr("profile.openTheGroup")}>
                      <span
                        className={`group-icon ${g.iconUrl ? "viewable" : ""}`}
                        title={g.iconUrl ? tr("profile.viewFullSize") : undefined}
                        onClick={(e) => {
                          if (!g.iconUrl) return;
                          e.stopPropagation();
                          openImage({ url: g.iconUrl, title: tr("profile.groupNameIcon", { name: g.name }) });
                        }}
                      >
                        <GroupPic url={g.iconUrl} name={g.name} />
                      </span>
                      <span className="group-name">{g.name}</span>
                      {g.isRepresenting && (
                        <span className="rep" title={tr("profile.representing")}>
                          <Icon name="bookmark" size={16} />
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {groupList.length > 5 && (
                <button className="btn wide" onClick={() => setGroupsOpen(true)}>
                  {tr("profile.viewAll", { count: groupList.length })}
                </button>
              )}
            </section>
          )}

          {relation === "friend" && (
          <section className="pcard">
            <h3>{tr("profile.yourCircles")}</h3>
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
              <input value={newCircle} placeholder={tr("profile.newCircleWithThisPerson")} onChange={(e) => setNewCircle(e.target.value)} />
              <button className="btn" type="submit" disabled={!newCircle.trim()}>
                <Icon name="plus" size={16} />
              </button>
            </form>
          </section>
          )}

          {(time || oftenWith.length > 0) && (
            <section className="pcard">
              <h3>
                Time together <span className="muted small">{tr("profile.fromYourGameLogs")}</span>
              </h3>
              {time && (
                <p className="small">
                  {fmtHours(time.secs)} on {time.days} day{time.days === 1 ? "" : "s"}
                  <span className="muted"> {tr("profile.lastValue", { value: naiveToDate(time.last).toLocaleDateString(language()) })}</span>
                </p>
              )}
              {oftenWith.length > 0 && (
                <>
                  <div className="muted small">{tr("profile.oftenWith")}</div>
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
        <Icon name="key" size={14} /> {tr("profile.sharingKeyConfirmedByTheir")}
      </p>
    );
  if (st === "mismatch")
    return (
      <p className="key-check warn-text">
        <Icon name="warn" size={14} /> {tr("profile.keyMismatch")}
      </p>
    );
  return (
    <p className="key-check muted">
      <Icon name="key" size={14} /> {tr("profile.hasASharingKeyIn")}
    </p>
  );
}

/** For someone who isn't a friend (or you): how you're connected, and the
 *  friend-request button. One request per click, never automatic. */
/** Which of your accounts are friends with them (shown when it's more than just the main one). */
function KnownBy({ ids }: { ids: string[] }) {
  const list = useApp((s) => s.settings.accounts.list);
  const me = useApp((s) => s.cache.me?.displayName ?? tr("profile.mainAccount"));
  const names = ids.map((a) => (a === MAIN ? me : (list.find((l) => l.id === a)?.name ?? tr("profile.otherAccount"))));
  return (
    <p className="small known-by" data-flip-fade>
      <Icon name="users" size={14} /> {tr("card.friendsWith", { names: listJoin(names) })}
      {ids.length >= 2 && <span className="chip">{tr("profile.crossover")}</span>}
    </p>
  );
}

/** Pick which of your accounts profile actions run as. */
function ActAs({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
  const list = useApp((s) => s.settings.accounts.list);
  const me = useApp((s) => s.cache.me?.displayName ?? tr("profile.mainAccount"));
  return (
    <label className="field narrow act-as" data-flip-fade>
      <span>{tr("profile.actAs")}</span>
      <select id="act-as" value={value ?? MAIN} onChange={(e) => onChange(e.target.value === MAIN ? undefined : e.target.value)}>
        <option value={MAIN}>{me} (main)</option>
        {list.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function RelationBox({ id, relation, here, via, account }: { id: string; relation: "me" | "other"; here: boolean; via: string[]; account?: string }) {
  const demo = useApp((s) => s.demo);
  const [status, setStatus] = useState<{ isFriend: boolean; outgoing: boolean; incoming: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [concern, setConcern] = useState<string | null>(null);

  useEffect(() => {
    setStatus(null);
    setError("");
    setConcern(null);
    if (relation === "other") friendStatus(id, account).then(setStatus);
  }, [id, relation, account]);

  if (relation === "me") {
    return (
      <div className="relation-box me" data-flip-fade>
        <Icon name="user" size={15} /> {tr("profile.thisIsYouOnThe")}
      </div>
    );
  }
  const act = async (send: boolean, checked = false) => {
    // Think twice when your notes, their profile or friends point to a concern.
    if (send && !checked) {
      const why = concernAbout(id);
      if (why) {
        setConcern(why);
        return;
      }
    }
    setConcern(null);
    setBusy(true);
    setError("");
    const err = await setFriendRequest(id, send, account);
    setBusy(false);
    if (err) setError(err);
    else {
      setStatus((s) => ({ isFriend: false, incoming: s?.incoming ?? false, outgoing: send }));
      showToast(send ? tr("profile.friendRequestSent") : tr("profile.friendRequestCancelled"));
    }
  };
  const bits = [tr("map.notFriendYet")];
  if (here) bits.push(tr("profile.inYourInstanceRightNow"));
  if (via.length) bits.push(via.length > 2 ? tr("profile.inFriendListMore", { names: via.slice(0, 2).join(", "), count: via.length - 2 }) : tr("profile.inFriendList", { names: listJoin(via) }));
  return (
    <div className="relation-box" data-flip-fade>
      <p>
        {here && <span className="here-dot" />} {bits.join(" · ")}
      </p>
      {status?.isFriend ? (
        <p className="small ok-text">{tr("profile.youReFriendsNowThey")}</p>
      ) : (
        <div className="row">
          {status?.outgoing ? (
            <>
              <span className="small muted">
                <Icon name="user-check" size={14} /> {tr("profile.requestSent")}
              </span>
              <button className="btn small" disabled={busy || demo} onClick={() => act(false)}>
                {tr("profile.cancelRequest")}
              </button>
            </>
          ) : (
            <button className="btn primary small" disabled={busy || demo} onClick={() => act(true)} title={demo ? tr("profile.notInDemoMode2") : tr("profile.sendThemAFriendRequest")}>
              <Icon name="user-plus" size={15} /> {status?.incoming ? tr("profile.acceptSendRequestBack") : tr("profile.sendFriendRequest")}
            </button>
          )}
          {status?.incoming && !status.outgoing && <span className="small">{tr("profile.theySentYouOne")}</span>}
        </div>
      )}
      {concern && (
        <div className="age-confirm">
          <p>
            <Icon name="warn" size={15} /> {tr("profile.thinkTwice", { reason: concern })}
          </p>
          <div className="row">
            <button className="btn small" onClick={() => setConcern(null)} autoFocus>
              {tr("profile.donTSend")}
            </button>
            <button className="btn small danger" onClick={() => act(true, true)}>
              {status?.incoming ? tr("profile.acceptAnyway") : tr("profile.sendAnyway")}
            </button>
          </div>
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
function ModerationRow({ id, name, friend, account }: { id: string; name: string; friend: boolean; account?: string }) {
  const demo = useApp((s) => s.demo);
  const byUser = useApp((s) => s.cache.moderations?.byUser);
  // Acting as another account: its own blocks and mutes (loaded when picked).
  const [altMods, setAltMods] = useState<Record<string, string[]> | null>(null);
  useEffect(() => {
    setAltMods(null);
    if (account) void accountModerations(account).then(setAltMods, () => setAltMods({}));
  }, [account]);
  const mods = (account ? altMods?.[id] : byUser?.[id]) ?? NO_MODS;
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
  const toggle = (kind: Mod, on: boolean, done: string) =>
    run(async () => {
      const err = await setModeration(id, kind, on, account);
      if (!err && account)
        setAltMods((m) => {
          const cur = new Set(m?.[id] ?? []);
          if (on) cur.add(kind);
          else cur.delete(kind);
          return { ...(m ?? {}), [id]: [...cur] };
        });
      return err;
    }, done);
  const has = (k: Mod) => mods.includes(k);
  const off = busy || demo;

  if (confirming) {
    const text =
      confirming === "unfriend"
        ? tr("profile.removeNameFromYourFriends", { name })
        : tr("profile.blockNameYouWonT", { name });
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
                    if (account) {
                      const err = await unfriend(id, account);
                      if (!err) void fetchAccountFriends(account).catch(() => {});
                      return err;
                    }
                    removedByMe.add(id);
                    const err = await unfriend(id);
                    if (err) removedByMe.delete(id);
                    if (!err) applyPipelineEvent("friend-delete", { userId: id });
                    return err;
                  }, tr("profile.removedFromFriends", { name }))
                : toggle("block", true, tr("profile.blocked", { name }))
            }
          >
            {confirming === "unfriend" ? "Unfriend" : "Block"}
          </button>
          <button className="btn small" onClick={() => setConfirming(null)}>
            {tr("profile.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mod-row" data-flip-fade>
      {friend && (
        <button className="btn small" disabled={off} onClick={() => setConfirming("unfriend")} title={tr("profile.removeFromYourFriendsOn")}>
          <Icon name="user" size={14} /> {tr("profile.unfriend")}
        </button>
      )}
      {has("block") ? (
        <button className="btn small" disabled={off} onClick={() => toggle("block", false, `${name} unblocked`)}>
          {tr("profile.unblock")}
        </button>
      ) : (
        <button className="btn small" disabled={off} onClick={() => setConfirming("block")}>
          {tr("profile.block")}
        </button>
      )}
      <button className="btn small" disabled={off} onClick={() => toggle("mute", !has("mute"), has("mute") ? tr("profile.nameUnmuted", { name }) : tr("profile.nameMuted", { name }))}>
        {has("mute") ? "Unmute" : "Mute"}
      </button>
      <button
        className="btn small"
        disabled={off}
        onClick={() => toggle("hideAvatar", !has("hideAvatar"), has("hideAvatar") ? tr("profile.avatarBackToYourSafety") : tr("profile.avatarHidden"))}
        title={has("hideAvatar") ? tr("profile.backToWhatYourSafety") : tr("profile.alwaysHideTheirAvatarIn")}
      >
        {has("hideAvatar") ? tr("profile.stopHidingAvatar") : tr("profile.hideAvatar")}
      </button>
      {has("block") && <span className="small muted">{tr("profile.youVeBlockedThem")}</span>}
      {demo && <span className="small muted">{tr("profile.notInDemoMode")}</span>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

/** Per-person notification rule: general rules / always / once / never. */
/** Notifications and sound for this person, behind a "⋯" button (they're set once and rarely
 *  looked at, so they don't need to sit in the row all the time). The button lights up when
 *  either differs from the default. */
function PersonMore({ id }: { id: string }) {
  const mode = useApp((s) => s.settings.notify.people[id]?.mode ?? "default") as (typeof PERSON_MODES)[number]["value"];
  const n = useApp((s) => s.settings.notify);
  const name = useApp((s) => s.cache.friends[id]?.displayName ?? "");
  const own = n.personSounds?.[id] ?? "";
  const [customs, setCustoms] = useState(customSounds());
  useEffect(() => onCustomSounds(() => setCustoms([...customSounds()])), []);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const changed = mode !== "default" || !!own;
  return (
    <div className="person-more" ref={ref}>
      <button
        className={`btn ${changed ? "on" : ""}`}
        title={tr("profile.notificationsAndSoundForThis")}
        aria-label={tr("profile.notificationsAndSoundForThis")}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="more" size={18} />
        {changed && <span className="person-more-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="person-more-menu" role="dialog" aria-label={tr("profile.notificationsAndSound")}>
          <label className="field">
            <span>
              <Icon name={mode === "never" ? "bell-off" : "bell"} size={14} /> {tr("profile.notifyMe")}
            </span>
            <select value={mode} onChange={(e) => setPersonMode(id, e.target.value as (typeof PERSON_MODES)[number]["value"])}>
              {PERSON_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              <Icon name="sound" size={14} /> {tr("profile.sound")}
            </span>
            <select
              value={own}
              onChange={(e) => {
                const personSounds = { ...(n.personSounds ?? {}) };
                if (e.target.value) personSounds[id] = e.target.value;
                else delete personSounds[id];
                updateNotify({ personSounds });
                if (e.target.value) setTimeout(() => previewEvent("online", name, id), 50);
              }}
            >
              <option value="">{tr("profile.theirTuneFromTheirName")}</option>
              {SOUNDS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
              {customs.map((c) => (
                <option key={c.id} value={`custom:${c.id}`}>
                  {c.name} (your file)
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

/** Friends who shared that they stopped being friends with this person (their own app recorded it). */
function RedFlags({ id }: { id: string }) {
  const imports = useApp((s) => s.local.imports);
  const friends = useApp((s) => s.cache.friends);
  const notes = imports.flatMap((l) =>
    (l.removals ?? [])
      .filter((r) => r.id === id && l.owner.id !== id)
      .map((r) => ({ ...r, by: (l.owner.id && friends[l.owner.id]?.displayName) || l.owner.displayName, byId: l.owner.id })),
  );
  if (!notes.length) return null;
  return (
    <div className="red-flags" data-flip-fade>
      {notes
        .sort((a, b) => b.t - a.t)
        .map((n) => {
          const who = (
            <button className="link-btn" disabled={!n.byId || !friends[n.byId]} onClick={() => n.byId && setState({ selectedId: n.byId })}>
              {n.by}
            </button>
          );
          const what = n.byMe
            ? n.together
              ? <>{who} removed them as a friend while they were in the same instance</>
              : <>{who} removed them as a friend</>
            : n.together
              ? <>{who} and they stopped being friends while they were in the same instance</>
              : <>{who} and they stopped being friends</>;
          return (
            <p key={`${n.byId}-${n.t}`} className={`red-flag ${n.together ? "strong" : ""}`}>
              <Icon name="flag" size={15} />
              <span>
                {what} ({fmtDate(n.t)}). You could ask {n.by} why.
              </span>
            </p>
          );
        })}
    </div>
  );
}
