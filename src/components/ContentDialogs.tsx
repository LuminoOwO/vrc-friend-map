// Dialogs for VRChat content: an instance (from a world card's player
// pictures), a world, and a group (about, posts, events, instances, gallery,
// members and management as far as your roles allow).
import { t as tr, language } from "../i18n";
import { useEffect, useMemo, useState } from "react";
import { backend, imgSrc } from "../backend";
import { iconUrl } from "../model";
import { inviteMyself } from "../invites";
import { shownName } from "../personal";
import { setState, showToast, useApp } from "../store";
import {
  can,
  galleryImages,
  groupActions,
  groupAuditLogs,
  groupBans,
  groupEvents,
  groupFull,
  groupInstances,
  groupMembers,
  groupPosts,
  groupRequests,
  instanceInfo,
  worldFull,
  type GroupEvent,
  type GroupFull,
  type GroupMember,
  type GroupPost,
  type InstanceInfo,
  type WorldFull,
} from "../vrccontent";
import { parseLocation } from "./DetailPanel";
import { Icon } from "./Icon";
import { GroupPic } from "./GroupPic";
import { openImage } from "./ImageViewer";
import { setWorldNote } from "../worldnotes";
import { Skel, SkelBlock } from "../ui2/smooth";

function Modal({ title, onClose, children, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="modal-backdrop top" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal content-modal ${wide ? "wide" : ""}`} role="dialog" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="row between">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label={tr("content.close")} onClick={onClose} autoFocus>
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PersonChip({ id, name }: { id: string; name: string }) {
  const f = useApp((s) => s.cache.friends[id] ?? s.cache.others?.[id]);
  const src = f ? imgSrc(iconUrl(f)) : undefined;
  return (
    <button className="face-btn" onClick={() => setState({ selectedId: id, openInstance: null, openGroup: null, openWorld: null })}>
      <span className="face">{src ? <img src={src} alt="" /> : (name[0] ?? "?")}</span>
      <span className="face-name">{shownName(id, name)}</span>
    </button>
  );
}

const open = (url: string) => backend.openUrl(url).catch(() => showToast(tr("content.couldnTOpenTheLink")));

// ---------- instance ----------

export function InstanceDialog() {
  const location = useApp((s) => s.openInstance);
  const friends = useApp((s) => s.cache.friends);
  const here = useApp((s) => s.here);
  const worlds = useApp((s) => s.cache.worlds);
  const [info, setInfo] = useState<InstanceInfo | null | undefined>(undefined);
  useEffect(() => {
    setInfo(undefined);
    if (location) instanceInfo(location).then(setInfo, () => setInfo(null));
  }, [location]);
  if (!location) return null;
  const close = () => setState({ openInstance: null });
  const loc = parseLocation(location);
  const world = worlds?.[loc.world];
  const inside = Object.values(friends).filter((f) => f.location === location);
  const mine = here?.active && here.location === location;
  const everyone = mine ? here!.players.filter((p) => p.id !== here!.localId) : info?.people?.map((p) => ({ id: p.id, name: p.displayName, since: 0 })) ?? null;
  const others = info ? Math.max(0, info.users - inside.length - (mine ? 1 : 0)) : 0;
  return (
    <Modal title={world?.name ?? info?.name ?? "Instance"} onClose={close}>
      {world?.imageUrl && <img className="content-banner" src={imgSrc(world.imageUrl)} alt="" />}
      <p className="small">
        {loc.flag} {loc.type} · #{loc.instance} · {loc.region.toUpperCase()}
        {info && ` · ${info.users} / ${info.capacity || "?"} people`}
        {info?.queue ? tr("content.queueWaiting", { queue: info.queue }) : ""}
        {info?.ageGate ? tr("content.n18Only") : ""}
      </p>
      {info?.ownerId && (
        <p className="small">
          Owner:{" "}
          {info.ownerId.startsWith("usr_") ? (
            <PersonChip id={info.ownerId} name={friends[info.ownerId]?.displayName ?? "someone"} />
          ) : info.ownerId.startsWith("grp_") ? (
            <button className="link-btn" onClick={() => setState({ openGroup: info.ownerId!, openInstance: null })}>
              {tr("content.aGroup")}
            </button>
          ) : (
            info.ownerId
          )}
        </p>
      )}
      <h4>Your friends here ({inside.length})</h4>
      <div className="people-row">
        {inside.map((f) => (
          <PersonChip key={f.id} id={f.id} name={f.displayName} />
        ))}
      </div>
      {everyone ? (
        <>
          <h4>Everyone {mine ? tr("content.fromYourGameLog") : ""}</h4>
          <div className="people-row">
            {everyone.map((p) => (
              <PersonChip key={p.id} id={p.id} name={p.name} />
            ))}
          </div>
        </>
      ) : (
        others > 0 && <p className="small muted">{tr("content.andOthersOthersVrchatOnly", { others })}</p>
      )}
      <div className="row">
        <button className="btn" onClick={() => inviteMyself(location).then((e) => showToast(e ? tr("content.couldnTInviteYouError", { error: e }) : tr("content.inviteSentToYouAccept")))}>
          <Icon name="user-check" size={16} /> {tr("content.inviteMe")}
        </button>
        <button className="btn" onClick={() => open(`vrchat://launch?ref=vrchat.com&id=${location}`)}>
          <Icon name="rocket" size={16} /> {tr("content.launchInVrchat")}
        </button>
        <button className="btn" onClick={() => setState({ openWorld: loc.world, openInstance: null })}>
          <Icon name="world" size={16} /> {tr("content.world")}
        </button>
      </div>
    </Modal>
  );
}

// ---------- world ----------

export function WorldDialog() {
  const id = useApp((s) => s.openWorld);
  const note = useApp((s) => (id ? s.local.worldNotes?.[id] : undefined));
  const friends = useApp((s) => s.cache.friends);
  const [w, setW] = useState<WorldFull | null | undefined>(undefined);
  const [draft, setDraft] = useState({ text: "", tags: "" });
  useEffect(() => {
    setW(undefined);
    if (id) worldFull(id).then(setW, () => setW(null));
  }, [id]);
  useEffect(() => setDraft({ text: note?.text ?? "", tags: (note?.tags ?? []).join(", ") }), [note, id]);
  if (!id) return null;
  const close = () => setState({ openWorld: null });
  const friendsHere = Object.values(friends).filter((f) => f.location.startsWith(`${id}:`));
  return (
    <Modal title={w?.name ?? "World"} onClose={close} wide>
      {w === undefined && <SkelBlock />}
      {w === null && <p className="muted">{tr("content.couldnTLoadThisWorld")}</p>}
      {w && (
        <>
          {w.imageUrl && <img className="content-banner" src={imgSrc(w.imageUrl)} alt="" />}
          <p className="small">
            {tr("content.byAuthornameOccupantsInIt", { authorName: w.authorName, occupants: w.occupants, value: w.favorites.toLocaleString(language()), value2: w.visits.toLocaleString(language()), capacity: w.capacity })}
          </p>
          {w.description && <p className="bio">{w.description}</p>}
          {friendsHere.length > 0 && (
            <>
              <h4>{tr("content.friendsThereNow")}</h4>
              <div className="people-row">
                {friendsHere.map((f) => (
                  <PersonChip key={f.id} id={f.id} name={f.displayName} />
                ))}
              </div>
            </>
          )}
          {w.instances.length > 0 && (
            <>
              <h4>{tr("content.openPublicInstances")}</h4>
              <ul className="missed-list">
                {w.instances.slice(0, 30).map(([inst, n]) => (
                  <li key={inst}>
                    <button className="link-btn" onClick={() => setState({ openInstance: `${id}:${inst}`, openWorld: null })}>
                      #{inst.split("~")[0]}
                    </button>
                    <span className="muted small">{n} people</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <h4>{tr("content.yourNotesAndTags")}</h4>
      <textarea rows={2} value={draft.text} placeholder={tr("content.eGGoodForChilling")} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
      <div className="row">
        <input value={draft.tags} placeholder={tr("content.tagsCommaSeparated")} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
        <button className="btn small primary" onClick={() => setWorldNote(id, draft.text, draft.tags)}>
          {tr("content.save")}
        </button>
      </div>
      <div className="row">
        <button className="btn" onClick={() => open(`https://vrchat.com/home/world/${id}`)}>
          <Icon name="external" size={16} /> {tr("content.openOnVrchatCom")}
        </button>
      </div>
    </Modal>
  );
}


// ---------- group ----------

type GTab = "about" | "posts" | "events" | "instances" | "gallery" | "members" | "manage";

export function GroupDialog() {
  const id = useApp((s) => s.openGroup);
  const [g, setG] = useState<GroupFull | null | undefined>(undefined);
  const [tab, setTab] = useState<GTab>("about");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    setG(undefined);
    setTab("about");
    if (id) groupFull(id).then(setG, () => setG(null));
  }, [id, reload]);
  if (!id) return null;
  const close = () => setState({ openGroup: null });
  const manage = g && (can(g, "group-members-manage") || can(g, "group-bans-manage") || can(g, "group-invites-manage") || can(g, "group-data-manage") || can(g, "group-audit-view") || can(g, "group-announcement-manage"));
  const tabs: [GTab, string][] = [
    ["about", tr("content.about")],
    ["posts", tr("content.posts")],
    ["events", tr("content.events")],
    ["instances", tr("content.instances")],
    ["gallery", tr("content.gallery")],
    ["members", tr("content.members")],
    ...(manage ? ([["manage", tr("content.manage")]] as [GTab, string][]) : []),
  ];
  return (
    <Modal
      title={
        <>
          {g && <GroupPic className="group-icon" url={g.iconUrl} name={g.name} />} {g?.name ?? "Group"} {g && <span className="muted small">{g.shortCode}.{g.discriminator}</span>}
        </>
      }
      onClose={close}
      wide
    >
      {g === undefined && (
        <div aria-busy="true">
          <Skel w="100%" h={140} block />
          <Skel w="40%" h="1.4em" block />
          <SkelBlock lines={4} />
        </div>
      )}
      {g === null && <p className="muted">{tr("content.couldnTLoadThisGroup")}</p>}
      {g && (
        <>
          {g.bannerUrl && <img className="content-banner" src={imgSrc(g.bannerUrl)} alt="" />}
          <div className="seg wrap">
            {tabs.map(([k, l]) => (
              <button key={k} className={tab === k ? "on" : ""} aria-pressed={tab === k} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          {tab === "about" && <GroupAbout g={g} onChange={() => setReload((n) => n + 1)} />}
          {tab === "posts" && <GroupPosts g={g} />}
          {tab === "events" && <GroupEvents id={g.id} />}
          {tab === "instances" && <GroupInstances g={g} />}
          {tab === "gallery" && <GroupGallery g={g} />}
          {tab === "members" && <GroupMembers g={g} />}
          {tab === "manage" && <GroupManage g={g} onChange={() => setReload((n) => n + 1)} />}
        </>
      )}
    </Modal>
  );
}

function confirmDo(question: string, f: () => Promise<string | null>, done?: string) {
  if (!window.confirm(question)) return;
  void f().then((e) => showToast(e ? tr("content.vrchatSaidNoError", { error: e }) : (done ?? "Done")));
}

function GroupAbout({ g, onChange }: { g: GroupFull; onChange: () => void }) {
  return (
    <>
      <p className="small">
        {g.memberCount.toLocaleString(language())} members · {g.onlineMemberCount} online · {g.privacy} · joining: {g.joinState}
        {g.languages.length ? ` · ${g.languages.join(", ")}` : ""}
      </p>
      {g.description && <p className="bio">{g.description}</p>}
      {g.links.length > 0 && (
        <div className="bio-links">
          {g.links.map((l) => (
            <button key={l} className="bio-link" onClick={() => open(l)}>
              <Icon name="link" size={14} /> {l.replace(/^https?:\/\/(www\.)?/, "")}
            </button>
          ))}
        </div>
      )}
      {g.rules && (
        <>
          <h4>{tr("content.rules")}</h4>
          <p className="bio small">{g.rules}</p>
        </>
      )}
      <div className="row">
        {g.me ? (
          <button
            className="btn"
            onClick={() => {
              if (!window.confirm(tr("content.leaveName", { name: g.name }))) return;
              void groupActions.leave(g.id).then((e) => {
                showToast(e ? tr("content.vrchatSaidNoError", { error: e }) : tr("content.leftTheGroup"));
                onChange();
              });
            }}
          >
            {tr("content.leaveGroup")}
          </button>
        ) : (
          <button className="btn primary" onClick={() => void groupActions.join(g.id).then((e) => { showToast(e ? tr("content.vrchatSaidNoError", { error: e }) : g.joinState === "request" ? tr("content.joinRequestSent") : "Joined"); onChange(); })}>
            {g.joinState === "request" ? tr("content.askToJoin") : "Join"}
          </button>
        )}
        <button className="btn" onClick={() => open(`https://vrchat.com/home/group/${g.id}`)}>
          <Icon name="external" size={16} /> vrchat.com
        </button>
      </div>
      {g.me && (
        <p className="small muted">
          Your roles: {g.me.roleIds.map((r) => g.roles.find((x) => x.id === r)?.name ?? r).join(", ") || "member"}
        </p>
      )}
    </>
  );
}

function useLoad<T>(f: () => Promise<T>, deps: unknown[]): [T | undefined, string, () => void] {
  const [v, setV] = useState<T | undefined>(undefined);
  const [err, setErr] = useState("");
  const [n, setN] = useState(0);
  useEffect(() => {
    setV(undefined);
    setErr("");
    f().then(setV, (e) => setErr(String(e instanceof Error ? e.message : e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return [v, err, () => setN((x) => x + 1)];
}

function GroupPosts({ g }: { g: GroupFull }) {
  const [posts, err, reload] = useLoad<GroupPost[]>(() => groupPosts(g.id), [g.id]);
  const [draft, setDraft] = useState({ title: "", text: "", notify: false, visibility: "group" as "group" | "public" });
  const canPost = can(g, "group-announcement-manage");
  return (
    <>
      {err && <p className="small warn">{err}</p>}
      {canPost && (
        <details className="new-post">
          <summary className="small">{tr("content.newPost")}</summary>
          <input placeholder={tr("content.title")} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <textarea rows={3} placeholder={tr("content.text")} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          <div className="row">
            <label className="check small">
              <input type="checkbox" checked={draft.notify} onChange={(e) => setDraft({ ...draft, notify: e.target.checked })} /> {tr("content.notifyMembers")}
            </label>
            <select value={draft.visibility} onChange={(e) => setDraft({ ...draft, visibility: e.target.value as "group" | "public" })}>
              <option value="group">{tr("content.membersOnly")}</option>
              <option value="public">{tr("content.public")}</option>
            </select>
            <button
              className="btn small primary"
              disabled={!draft.title.trim() || !draft.text.trim()}
              onClick={() => confirmDo(`Post “${draft.title}” to ${g.name}?`, async () => {
                const e = await groupActions.post(g.id, draft.title, draft.text, draft.notify, draft.visibility);
                if (!e) {
                  setDraft({ title: "", text: "", notify: false, visibility: "group" });
                  reload();
                }
                return e;
              }, "Posted")}
            >
              {tr("content.post")}
            </button>
          </div>
        </details>
      )}
      {posts?.length === 0 && <p className="small muted">{tr("content.noPosts")}</p>}
      {posts?.map((p) => (
        <article key={p.id} className="group-post">
          <h4>{p.title}</h4>
          <p className="small muted">{p.createdAt ? new Date(p.createdAt).toLocaleString(language()) : ""} · {p.visibility}</p>
          {p.imageUrl && <img className="post-img" src={imgSrc(p.imageUrl)} alt="" />}
          <p className="bio small">{p.text}</p>
          {canPost && (
            <button className="btn small ghost" onClick={() => confirmDo(tr("content.deletePost"), async () => { const e = await groupActions.deletePost(g.id, p.id); if (!e) reload(); return e; }, tr("content.deleted"))}>
              <Icon name="trash" size={13} /> {tr("content.delete")}
            </button>
          )}
        </article>
      ))}
    </>
  );
}

export function EventList({ events }: { events: GroupEvent[] }) {
  const now = Date.now();
  const upcoming = events.filter((e) => Date.parse(e.endsAt || e.startsAt) >= now);
  const past = events.filter((e) => Date.parse(e.endsAt || e.startsAt) < now).reverse().slice(0, 10);
  const row = (e: GroupEvent) => (
    <li key={e.id} className="event">
      <div>
        <b>{e.title}</b> <span className="muted small">{e.category}</span>
      </div>
      <div className="small">
        {new Date(e.startsAt).toLocaleString(language(), { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} – {new Date(e.endsAt).toLocaleTimeString(language(), { hour: "2-digit", minute: "2-digit" })}
        {e.interested ? tr("content.interestedInterested", { interested: e.interested }) : ""} · {e.accessType}
      </div>
      {e.description && <p className="small muted clamp-3">{e.description}</p>}
    </li>
  );
  return (
    <>
      {upcoming.length ? <ul className="event-list">{upcoming.map(row)}</ul> : <p className="small muted">{tr("content.noUpcomingEvents")}</p>}
      {past.length > 0 && (
        <details>
          <summary className="small">{tr("content.pastEvents")}</summary>
          <ul className="event-list past">{past.map(row)}</ul>
        </details>
      )}
    </>
  );
}

function GroupEvents({ id }: { id: string }) {
  const [events, err] = useLoad<GroupEvent[]>(() => groupEvents(id), [id]);
  return (
    <>
      {err && <p className="small warn">{err}</p>}
      {events ? <EventList events={events} /> : <SkelBlock lines={2} />}
    </>
  );
}

function GroupInstances({ g }: { g: GroupFull }) {
  const [list, err, reload] = useLoad(() => groupInstances(g.id), [g.id]);
  const [make, setMake] = useState({ world: "", region: "eu", access: "members" as "members" | "plus" | "public", queue: true, age: false });
  return (
    <>
      {err && <p className="small warn">{err}</p>}
      {list?.length === 0 && <p className="small muted">{tr("content.noOpenGroupInstancesYou")}</p>}
      <ul className="missed-list">
        {list?.map((i) => (
          <li key={i.location}>
            <button className="link-btn" onClick={() => setState({ openInstance: i.location, openGroup: null })}>
              {i.worldName || i.world}
            </button>
            <span className="muted small">
              {i.users}
              {i.capacity ? ` / ${i.capacity}` : ""} people
            </span>
          </li>
        ))}
      </ul>
      {can(g, "group-instance-open-create") || can(g, "group-instance-public-create") || can(g, "group-instance-plus-create") ? (
        <details>
          <summary className="small">{tr("content.openAGroupInstance")}</summary>
          <div className="row">
            <input placeholder={tr("content.worldIdWrldOrLink")} value={make.world} onChange={(e) => setMake({ ...make, world: e.target.value })} />
            <select value={make.region} onChange={(e) => setMake({ ...make, region: e.target.value })}>
              {["us", "use", "eu", "jp"].map((r) => (
                <option key={r} value={r}>
                  {r.toUpperCase()}
                </option>
              ))}
            </select>
            <select value={make.access} onChange={(e) => setMake({ ...make, access: e.target.value as typeof make.access })}>
              <option value="members">{tr("content.membersOnly")}</option>
              <option value="plus">{tr("content.group")}</option>
              <option value="public">{tr("content.groupPublic")}</option>
            </select>
          </div>
          <div className="row">
            <label className="check small">
              <input type="checkbox" checked={make.queue} onChange={(e) => setMake({ ...make, queue: e.target.checked })} /> {tr("content.queueWhenFull")}
            </label>
            <label className="check small">
              <input type="checkbox" checked={make.age} onChange={(e) => setMake({ ...make, age: e.target.checked })} /> 18+ only
            </label>
            <button
              className="btn small primary"
              disabled={!/wrld_[0-9a-f-]{36}/i.test(make.world)}
              onClick={() => {
                const w = make.world.match(/wrld_[0-9a-f-]{36}/i)![0];
                confirmDo(tr("content.openInstance", { access: make.access, group: g.name }), async () => {
                  const e = await groupActions.createInstance(g.id, w, make.region, make.access, make.queue, make.age);
                  if (!e) reload();
                  return e;
                }, tr("content.instanceOpened"));
              }}
            >
              {tr("content.open")}
            </button>
          </div>
        </details>
      ) : null}
    </>
  );
}

function GroupGallery({ g }: { g: GroupFull }) {
  const [gal, setGal] = useState(g.galleries[0]?.id ?? "");
  const [imgs, err, reload] = useLoad(() => (gal ? galleryImages(g.id, gal) : Promise.resolve([])), [g.id, gal]);
  const canManage = can(g, "group-galleries-manage");
  if (!g.galleries.length) return <p className="small muted">{tr("content.thisGroupHasNoGallery")}</p>;
  return (
    <>
      <select value={gal} onChange={(e) => setGal(e.target.value)}>
        {g.galleries.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      {err && <p className="small warn">{err}</p>}
      <div className="pic-grid">
        {imgs?.map((i) => (
          <div key={i.id} className="pic">
            <img src={imgSrc(i.imageUrl)} alt="" loading="lazy" onClick={() => openImage({ url: i.imageUrl, title: tr("content.nameGallery", { name: g.name }) })} />
            {canManage && (
              <button className="icon-btn tiny pic-del" title={tr("content.delete")} onClick={() => confirmDo(tr("content.deletePicture"), async () => { const e = await groupActions.deleteImage(g.id, gal, i.id); if (!e) reload(); return e; }, tr("content.deleted"))}>
                <Icon name="trash" size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function GroupMembers({ g }: { g: GroupFull }) {
  const [list, err, reload] = useLoad<GroupMember[]>(() => groupMembers(g.id, 1000), [g.id]);
  const friends = useApp((s) => s.cache.friends);
  const [q, setQ] = useState("");
  const [onlyFriends, setOnlyFriends] = useState(false);
  const shown = useMemo(
    () => (list ?? []).filter((m) => (!onlyFriends || friends[m.userId]) && (!q || m.displayName.toLowerCase().includes(q.toLowerCase()))),
    [list, q, onlyFriends, friends],
  );
  const manage = can(g, "group-members-manage");
  const roles = can(g, "group-roles-assign") ? g.roles.filter((r) => !r.permissions.includes("*")) : [];
  return (
    <>
      {err && <p className="small warn">{err} (VRChat shows members only to members, for some groups only to moderators)</p>}
      <div className="row">
        <input placeholder={tr("content.findAMember")} value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check small">
          <input type="checkbox" checked={onlyFriends} onChange={(e) => setOnlyFriends(e.target.checked)} /> {tr("content.onlyMyFriends")}
        </label>
        <span className="small muted">{list ? tr("content.lengthOfLength2", { length: shown.length, length2: list.length }) : tr("content.loading")}</span>
      </div>
      <ul className="member-list">
        {!list &&
          !err &&
          [60, 45, 70, 50, 65, 40].map((w, i) => (
            <li key={`skel-${i}`} aria-busy="true">
              <Skel w={`${w}%`} h="1.5em" />
            </li>
          ))}
        {shown.slice(0, 300).map((m) => (
          <li key={m.userId}>
            <PersonChip id={m.userId} name={m.displayName} />
            <span className="small muted">{m.roleIds.map((r) => g.roles.find((x) => x.id === r)?.name).filter(Boolean).join(", ")}</span>
            {roles.length > 0 && (
              <select
                value=""
                title={tr("content.addOrRemoveARole")}
                onChange={(e) => {
                  const r = e.target.value;
                  if (!r) return;
                  const has = m.roleIds.includes(r);
                  confirmDo(`${has ? "Remove" : "Give"} the role ${g.roles.find((x) => x.id === r)?.name} ${has ? "from" : "to"} ${m.displayName}?`, async () => {
                    const err2 = has ? await groupActions.removeRole(g.id, m.userId, r) : await groupActions.addRole(g.id, m.userId, r);
                    if (!err2) reload();
                    return err2;
                  });
                }}
              >
                <option value="">{tr("content.roles")}</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {m.roleIds.includes(r.id) ? "✓ " : ""}
                    {r.name}
                  </option>
                ))}
              </select>
            )}
            {manage && m.userId !== g.ownerId && (
              <button className="btn small ghost" onClick={() => confirmDo(`Kick ${m.displayName} from ${g.name}?`, async () => { const e = await groupActions.kick(g.id, m.userId); if (!e) reload(); return e; }, "Kicked")}>
                {tr("content.kick")}
              </button>
            )}
            {can(g, "group-bans-manage") && m.userId !== g.ownerId && (
              <button className="btn small ghost danger" onClick={() => confirmDo(`Ban ${m.displayName} from ${g.name}?`, async () => { const e = await groupActions.ban(g.id, m.userId); if (!e) reload(); return e; }, "Banned")}>
                {tr("content.ban")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function GroupManage({ g, onChange }: { g: GroupFull; onChange: () => void }) {
  const [requests, , reloadReq] = useLoad(() => (can(g, "group-members-manage") ? groupRequests(g.id) : Promise.resolve([])), [g.id]);
  const [bans, , reloadBans] = useLoad(() => (can(g, "group-bans-manage") ? groupBans(g.id) : Promise.resolve([])), [g.id]);
  const [logs] = useLoad(() => (can(g, "group-audit-view") ? groupAuditLogs(g.id) : Promise.resolve([])), [g.id]);
  const [inviteId, setInviteId] = useState("");
  const [edit, setEdit] = useState({ description: g.description, rules: g.rules, joinState: g.joinState });
  return (
    <>
      {can(g, "group-members-manage") && (
        <section>
          <h4>Join requests ({requests?.length ?? "…"})</h4>
          <ul className="member-list">
            {requests?.map((m) => (
              <li key={m.userId}>
                <PersonChip id={m.userId} name={m.displayName} />
                <button className="btn small" onClick={() => void groupActions.respond(g.id, m.userId, "accept").then((e) => { showToast(e ? tr("content.vrchatSaidNoError", { error: e }) : tr("content.nameAccepted", { name: m.displayName })); reloadReq(); })}>
                  {tr("content.accept")}
                </button>
                <button className="btn small ghost" onClick={() => confirmDo(`Reject ${m.displayName}?`, async () => { const e = await groupActions.respond(g.id, m.userId, "reject"); reloadReq(); return e; }, "Rejected")}>
                  {tr("content.reject")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {can(g, "group-invites-manage") && (
        <section>
          <h4>{tr("content.inviteSomeone")}</h4>
          <div className="row">
            <input placeholder={tr("content.usrOrAProfileLink")} value={inviteId} onChange={(e) => setInviteId(e.target.value)} />
            <button
              className="btn small"
              disabled={!/usr_[0-9a-f-]{36}/i.test(inviteId)}
              onClick={() => {
                const u = inviteId.match(/usr_[0-9a-f-]{36}/i)![0];
                void groupActions.invite(g.id, u).then((e) => showToast(e ? tr("content.vrchatSaidNoError", { error: e }) : "Invited"));
              }}
            >
              {tr("content.invite")}
            </button>
          </div>
        </section>
      )}
      {can(g, "group-bans-manage") && (
        <section>
          <h4>Bans ({bans?.length ?? "…"})</h4>
          <ul className="member-list">
            {bans?.map((m) => (
              <li key={m.userId}>
                <PersonChip id={m.userId} name={m.displayName} />
                <button className="btn small ghost" onClick={() => confirmDo(`Unban ${m.displayName}?`, async () => { const e = await groupActions.unban(g.id, m.userId); reloadBans(); return e; }, "Unbanned")}>
                  {tr("content.unban")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {can(g, "group-data-manage") && (
        <section>
          <h4>{tr("content.groupSettings")}</h4>
          <label className="field">
            <span>{tr("content.description")}</span>
            <textarea rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          </label>
          <label className="field">
            <span>{tr("content.rules")}</span>
            <textarea rows={3} value={edit.rules} onChange={(e) => setEdit({ ...edit, rules: e.target.value })} />
          </label>
          <label className="field narrow">
            <span>{tr("content.whoCanJoin")}</span>
            <select value={edit.joinState} onChange={(e) => setEdit({ ...edit, joinState: e.target.value })}>
              <option value="open">{tr("content.anyone")}</option>
              <option value="request">{tr("content.onRequest")}</option>
              <option value="invite">{tr("content.inviteOnly")}</option>
              <option value="closed">{tr("content.closed")}</option>
            </select>
          </label>
          <button className="btn small primary" onClick={() => confirmDo(tr("content.saveSettingsFor", { group: g.name }), async () => { const e = await groupActions.update(g.id, edit); if (!e) onChange(); return e; }, tr("content.saved"))}>
            {tr("content.saveSettings")}
          </button>
        </section>
      )}
      {can(g, "group-audit-view") && (
        <section>
          <h4>{tr("content.auditLog")}</h4>
          <ul className="missed-list">
            {logs?.slice(0, 100).map((l, i) => (
              <li key={i}>
                <span className="muted small">{l.t ? new Date(l.t).toLocaleString(language()) : ""}</span> <b>{l.actor}</b> <span className="small">{l.description || l.type}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="small muted">{tr("content.everyChangeAsksFirstAnd")}</p>
    </>
  );
}
