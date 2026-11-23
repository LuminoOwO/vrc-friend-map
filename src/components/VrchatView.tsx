// "Groups & events": your groups and their upcoming events. "Media": your pictures
// (screenshots, tagged with world and people), favorites (friend groups, worlds,
// avatars), your avatars, prints / stickers / emojis / gallery pictures (with uploading
// and cropping), world notes. Both can open any VRChat link.
import { t as tr } from "../i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { imgSrc } from "../backend";
import { setState, showToast, updateFilters, useApp } from "../store";
import {
  avatarNameFromImage,
  deleteFile,
  deletePrint,
  favoriteActions,
  favoriteAvatars,
  favoriteGroups,
  favorites,
  myAvatars,
  myEvents,
  myFiles,
  myPrints,
  selectAvatar,
  uploadImage,
  UPLOAD_SHAPE,
  worldsByIds,
  type AvatarInfo,
  type Favorite,
  type FavoriteGroup,
  type FileKind,
  type GroupEvent,
  type Print,
  type VrcFile,
} from "../vrccontent";
import { openVrchatLink } from "../vrclinks";
import { EventList } from "./ContentDialogs";
import { Icon } from "./Icon";
import { openImage } from "./ImageViewer";
import { Range } from "./Range";
import { SkelBlock } from "../ui2/smooth";
import { TaggedPictures } from "./LogbookView";

type Tab = "pictures" | "favorites" | "avatars" | "files" | "worlds";

const EMPTY_OBJ: Record<string, never> = {};

/** "groups": your groups and their events. "media": pictures, favorites, avatars, prints / stickers /
 *  emojis, world notes. */
export function VrchatView({ section }: { section: "groups" | "media" }) {
  const [tab, setTab] = useState<Tab>("pictures");
  const demo = useApp((s) => s.demo);
  if (section === "groups") {
    return (
      <div className="activity-view logbook">
        <div className="row">
          <span className="ui2-grow" />
          <OpenLink />
        </div>
        {demo ? <p className="muted">{tr("vrchat.thisPartTalksToVrchat")}</p> : <MyGroups />}
      </div>
    );
  }
  return (
    <div className="activity-view logbook">
      <div className="row">
        <div className="seg logbook-tabs" role="tablist">
          {(
            [
              ["pictures", tr("logbook.pictures")],
              ["favorites", tr("vrchat.favorites")],
              ["avatars", tr("vrchat.avatars")],
              ["files", tr("vrchat.printsStickersEmojis")],
              ["worlds", tr("vrchat.worldNotes")],
            ] as [Tab, string][]
          ).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
        <OpenLink />
      </div>
      {tab === "pictures" ? (
        <TaggedPictures />
      ) : demo ? (
        <p className="muted">{tr("vrchat.thisPartTalksToVrchat")}</p>
      ) : (
        <>
          {tab === "favorites" && <Favorites />}
          {tab === "avatars" && <Avatars />}
          {tab === "files" && <Files />}
          {tab === "worlds" && <WorldNotes />}
        </>
      )}
    </div>
  );
}

function OpenLink() {
  const [v, setV] = useState("");
  return (
    <form
      className="row tight open-link"
      onSubmit={(e) => {
        e.preventDefault();
        if (!openVrchatLink(v)) showToast(tr("vrchat.thatIsnTAVrchat"));
        else setV("");
      }}
    >
      <input value={v} placeholder={tr("vrchat.pasteAVrchatLinkProfile")} onChange={(e) => setV(e.target.value)} />
      <button className="btn small" type="submit" disabled={!v.trim()}>
        {tr("vrchat.open")}
      </button>
    </form>
  );
}

function useLoad<T>(f: () => Promise<T>, deps: unknown[] = []): [T | undefined, string, () => void] {
  const [v, setV] = useState<T | undefined>(undefined);
  const [err, setErr] = useState("");
  const [n, setN] = useState(0);
  useEffect(() => {
    setErr("");
    f().then(setV, (e) => setErr(String(e instanceof Error ? e.message : e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return [v, err, () => setN((x) => x + 1)];
}

// ---------- groups ----------

function MyGroups() {
  const me = useApp((s) => s.cache.me?.id);
  const groups = useApp((s) => (me ? s.cache.groups?.[me]?.list : undefined));
  const [events, err] = useLoad<GroupEvent[]>(() => myEvents());
  useEffect(() => {
    if (me) void import("../sync").then((m) => m.loadGroups(me, true));
  }, [me]);
  return (
    <div className="insights">
      <section className="insight-card">
        <h3>
          <Icon name="users" size={16} /> Your groups ({groups?.length ?? "…"})
        </h3>
        <ul className="group-tiles">
          {groups?.map((g) => (
            <li key={g.groupId}>
              <button className="group-tile" onClick={() => setState({ openGroup: g.groupId })}>
                {g.iconUrl ? <img src={imgSrc(g.iconUrl)} alt="" /> : <span className="face">{g.name[0]}</span>}
                <span>{g.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="insight-card">
        <h3>
          <Icon name="calendar" size={16} /> {tr("vrchat.upcomingEvents")}
        </h3>
        {err && <p className="small warn">{err}</p>}
        {events ? <EventList events={events} /> : <SkelBlock lines={2} />}
      </section>
    </div>
  );
}

// ---------- favorites ----------

function Favorites() {
  const [groups, gErr, reloadGroups] = useLoad<FavoriteGroup[]>(() => favoriteGroups());
  const [kind, setKind] = useState<"friend" | "world" | "avatar">("friend");
  const [favs, fErr, reloadFavs] = useLoad<Favorite[]>(() => favorites(kind), [kind]);
  const friends = useApp((s) => s.cache.friends);
  const [names, setNames] = useState<Record<string, { name: string; imageUrl?: string; authorName?: string }>>({});
  useEffect(() => {
    if (kind === "world" && favs?.length) void worldsByIds(favs.map((f) => f.favoriteId).slice(0, 150)).then(setNames);
  }, [kind, favs]);
  const [avatars] = useLoad<AvatarInfo[]>(() => (kind === "avatar" ? favoriteAvatars() : Promise.resolve([])), [kind]);
  const byGroup = useMemo(() => {
    const m = new Map<string, Favorite[]>();
    for (const f of favs ?? []) for (const t of f.tags) m.set(t, [...(m.get(t) ?? []), f]);
    return m;
  }, [favs]);
  const myGroups = (groups ?? []).filter((g) => g.type === kind || (kind === "world" && g.type === "vrcPlusWorld"));
  const label = (f: Favorite) =>
    kind === "friend" ? (friends[f.favoriteId]?.displayName ?? f.favoriteId) : kind === "world" ? (names[f.favoriteId]?.name ?? f.favoriteId) : (avatars?.find((a) => a.id === f.favoriteId)?.name ?? f.favoriteId);
  const openIt = (f: Favorite) => (kind === "friend" ? setState({ selectedId: f.favoriteId }) : kind === "world" ? setState({ openWorld: f.favoriteId }) : undefined);
  return (
    <>
      <div className="seg">
        {(["friend", "world", "avatar"] as const).map((k) => (
          <button key={k} className={kind === k ? "on" : ""} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {k === "friend" ? "Friends" : k === "world" ? "Worlds" : "Avatars"}
          </button>
        ))}
      </div>
      {(gErr || fErr) && <p className="small warn">{gErr || fErr}</p>}
      {kind === "friend" && (
        <p className="small muted">
          Filter the map by one of these: Filters → <i>{tr("vrchat.onlyVrchatFavorites")}</i>, or click a group's name.
        </p>
      )}
      <div className="insights">
        {myGroups.map((g) => (
          <section key={g.name} className="insight-card">
            <div className="row between">
              <h3>
                <Icon name="star" size={16} />{" "}
                {kind === "friend" ? (
                  <button className="link-btn" title={tr("vrchat.showOnlyThemOnThe")} onClick={() => {
                      updateFilters({ favoriteGroup: g.displayName });
                      setState({ view: "graph" });
                    }}>
                    {g.displayName}
                  </button>
                ) : (
                  g.displayName
                )}{" "}
                <span className="muted small">({byGroup.get(g.name)?.length ?? 0})</span>
              </h3>
              <button
                className="btn small ghost"
                onClick={() => {
                  const n = window.prompt(tr("vrchat.newName"), g.displayName);
                  if (n && n !== g.displayName) void favoriteActions.rename(g, n).then((e) => { showToast(e ? tr("vrchat.vrchatSaidNoError", { error: e }) : "Renamed"); reloadGroups(); });
                }}
              >
                {tr("vrchat.rename")}
              </button>
            </div>
            <ul className="fav-list">
              {(byGroup.get(g.name) ?? []).map((f) => (
                <li key={f.id}>
                  {kind === "world" && names[f.favoriteId]?.imageUrl && <img src={imgSrc(names[f.favoriteId].imageUrl)} alt="" />}
                  <button className="link-btn" onClick={() => openIt(f)}>
                    {label(f)}
                  </button>
                  <button className="icon-btn tiny" title={tr("vrchat.removeFromFavorites")} onClick={() => window.confirm(tr("vrchat.removeValueFromName", { value: label(f), name: g.displayName })) && void favoriteActions.remove(f).then((e) => { showToast(e ? tr("vrchat.vrchatSaidNoError", { error: e }) : "Removed"); reloadFavs(); })}>
                    <Icon name="close" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

// ---------- avatars ----------

function AvatarCard({ a, onSelect }: { a: AvatarInfo; onSelect?: () => void }) {
  return (
    <div className="avatar-card">
      {a.thumbnailImageUrl && <img src={imgSrc(a.thumbnailImageUrl)} alt="" onClick={() => a.imageUrl && openImage({ url: a.imageUrl, title: a.name })} />}
      <b>{a.name}</b>
      <span className="small muted">
        {a.authorName} · {a.releaseStatus}
      </span>
      <span className="small">
        {a.platforms.map((p) => `${p === "standalonewindows" ? "PC" : p === "android" ? "Quest/Android" : p === "ios" ? "iOS" : p}${a.performance[p] ? ` (${a.performance[p]})` : ""}`).join(" · ")}
      </span>
      {onSelect && (
        <button className="btn small" onClick={onSelect}>
          {tr("vrchat.switchToIt")}
        </button>
      )}
    </div>
  );
}

function Avatars() {
  const [mine, err1] = useLoad<AvatarInfo[]>(() => myAvatars());
  const [favs, err2] = useLoad<AvatarInfo[]>(() => favoriteAvatars());
  const meProfile = useApp((s) => s.cache.me?.profile);
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    void avatarNameFromImage(meProfile?.currentAvatarImageUrl).then(setCurrent);
  }, [meProfile?.currentAvatarImageUrl]);
  const sel = (a: AvatarInfo) => window.confirm(tr("vrchat.switchToNameYouChange", { name: a.name })) && void selectAvatar(a.id).then((e) => showToast(e ? tr("vrchat.vrchatSaidNoError", { error: e }) : tr("vrchat.switchedToName", { name: a.name })));
  return (
    <>
      {current && <p className="small">You're wearing: <b>{current}</b></p>}
      {(err1 || err2) && <p className="small warn">{err1 || err2}</p>}
      <h3>Your uploaded avatars ({mine?.length ?? "…"})</h3>
      <div className="avatar-grid">
        {mine?.map((a) => (
          <AvatarCard key={a.id} a={a} onSelect={() => sel(a)} />
        ))}
      </div>
      <h3>Favorite avatars ({favs?.length ?? "…"})</h3>
      <div className="avatar-grid">
        {favs?.map((a) => (
          <AvatarCard key={a.id} a={a} onSelect={() => sel(a)} />
        ))}
      </div>
    </>
  );
}

// ---------- prints, stickers, emojis, gallery ----------

function Files() {
  const [kind, setKind] = useState<FileKind | "print">("emoji");
  const [files, err, reload] = useLoad<(VrcFile | Print)[]>(() => (kind === "print" ? myPrints() : myFiles(kind)), [kind]);
  const [uploading, setUploading] = useState(false);
  const isVrcPlus = useApp((s) => (s.cache.me?.profile?.tags ?? []).includes("system_supporter"));
  return (
    <>
      <div className="row">
        <div className="seg">
          {(["emoji", "sticker", "print", "gallery", "icon"] as const).map((k) => (
            <button key={k} className={kind === k ? "on" : ""} aria-pressed={kind === k} onClick={() => setKind(k)}>
              {k === "emoji" ? "Emojis" : k === "sticker" ? "Stickers" : k === "print" ? "Prints" : k === "gallery" ? "Gallery" : "Icons"}
            </button>
          ))}
        </div>
        <button className="btn small primary" onClick={() => setUploading(true)}>
          <Icon name="upload" size={14} /> {tr("vrchat.upload")}
        </button>
        {!isVrcPlus && <span className="small muted">{tr("vrchat.mostOfTheseNeedVrc")}</span>}
      </div>
      {err && <p className="small warn">{err}</p>}
      <div className="pic-grid file-grid">
        {files?.map((f) => {
          const url = (f as VrcFile).imageUrl ?? (f as Print).imageUrl;
          return (
            <div key={f.id} className="pic square">
              {url && <img src={imgSrc(url)} alt="" loading="lazy" onClick={() => openImage({ url, title: (f as VrcFile).name ?? (f as Print).note ?? kind })} />}
              {"note" in f && f.note && <span className="pic-meta small">{f.note}</span>}
              {"animated" in f && f.animated && <span className="pic-tag small">animated</span>}
              <button
                className="icon-btn tiny pic-del"
                title={tr("vrchat.delete")}
                onClick={() =>
                  window.confirm(tr("vrchat.deleteThisFromVrchat")) &&
                  void (kind === "print" ? deletePrint(f.id) : deleteFile(f.id)).then((e) => {
                    showToast(e ? tr("vrchat.vrchatSaidNoError", { error: e }) : "Deleted");
                    reload();
                  })
                }
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
          );
        })}
      </div>
      {files?.length === 0 && <p className="small muted">{tr("vrchat.noneYet")}</p>}
      {uploading && (
        <Uploader
          kind={kind}
          onClose={(done) => {
            setUploading(false);
            if (done) reload();
          }}
        />
      )}
    </>
  );
}

const ANIMATION_STYLES = ["aura", "bats", "bees", "bounce", "cloud", "confetti", "crying", "dislike", "fire", "idea", "lasers", "like", "magnet", "mistletoe", "money", "noise", "orbit", "pizza", "rain", "rotate", "shake", "snow", "snowball", "spin", "splash", "stop", "zzz"];

/** Crop an image to the shape VRChat wants, then upload it. GIFs can become animated emojis. */
function Uploader({ kind, onClose }: { kind: FileKind | "print"; onClose: (done: boolean) => void }) {
  const shape = UPLOAD_SHAPE[kind];
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [frames, setFrames] = useState<ImageBitmap[] | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0.5, y: 0.5 });
  const [style, setStyle] = useState("aura");
  const [note, setNote] = useState("");
  const [fps, setFps] = useState(10);
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const aspect = shape.w / shape.h;

  const source = frames?.[0] ?? img;
  const srcW = source ? ("naturalWidth" in source ? source.naturalWidth : source.width) : 0;
  const srcH = source ? ("naturalHeight" in source ? source.naturalHeight : source.height) : 0;

  /** The crop rectangle in source pixels. */
  const crop = () => {
    const base = srcW / srcH > aspect ? { h: srcH, w: srcH * aspect } : { w: srcW, h: srcW / aspect };
    const w = base.w / zoom;
    const h = base.h / zoom;
    return { x: (srcW - w) * pos.x, y: (srcH - h) * pos.y, w, h };
  };

  useEffect(() => {
    const c = preview.current;
    if (!c || !source) return;
    const ctx = c.getContext("2d")!;
    c.width = 320;
    c.height = Math.round(320 / aspect);
    const r = crop();
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(source as CanvasImageSource, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
  });

  const load = async (file: File) => {
    setFrames(null);
    setImg(null);
    // Animated GIF → frames (Chromium's ImageDecoder), for animated emojis.
    const Decoder = (globalThis as unknown as { ImageDecoder?: new (o: { data: ReadableStream | ArrayBuffer; type: string }) => { tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } }; decode: (o: { frameIndex: number }) => Promise<{ image: VideoFrame }> } }).ImageDecoder;
    if (kind === "emoji" && file.type === "image/gif" && Decoder) {
      try {
        const dec = new Decoder({ data: await file.arrayBuffer(), type: file.type });
        await dec.tracks.ready;
        const count = Math.min(64, dec.tracks.selectedTrack.frameCount);
        if (count > 1) {
          const out: ImageBitmap[] = [];
          for (let i = 0; i < count; i++) {
            const { image } = await dec.decode({ frameIndex: i });
            out.push(await createImageBitmap(image));
            image.close();
          }
          setFrames(out);
          return;
        }
      } catch {
        // fall back to a still image
      }
    }
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => setImg(im);
    im.src = url;
  };

  const render = async (): Promise<Blob> => {
    const r = crop();
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    if (frames && frames.length > 1) {
      // Sprite sheet: frames in a square grid, 1024 × 1024 in total.
      const grid = Math.ceil(Math.sqrt(frames.length));
      const cell = Math.floor(1024 / grid);
      c.width = c.height = 1024;
      frames.forEach((f, i) => ctx.drawImage(f, r.x, r.y, r.w, r.h, (i % grid) * cell, Math.floor(i / grid) * cell, cell, cell));
    } else {
      c.width = shape.w;
      c.height = shape.h;
      ctx.drawImage(source as CanvasImageSource, r.x, r.y, r.w, r.h, 0, 0, shape.w, shape.h);
    }
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("couldn't make the picture"))), "image/png"));
  };

  return (
    <div className="modal-backdrop top" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose(false)}>
      <div className="modal uploader" role="dialog">
        <h2>{tr("vrchat.uploadLabel", { label: shape.label })}</h2>
        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={(e) => e.target.files?.[0] && void load(e.target.files[0])} />
        {source && (
          <>
            <canvas
              ref={preview}
              className="crop-preview"
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
              }}
              onPointerMove={(e) => {
                if (!drag.current) return;
                const dx = (e.clientX - drag.current.x) / 320;
                const dy = (e.clientY - drag.current.y) / (320 / aspect);
                setPos({ x: Math.min(1, Math.max(0, drag.current.px - dx * zoom)), y: Math.min(1, Math.max(0, drag.current.py - dy * zoom)) });
              }}
              onPointerUp={() => (drag.current = null)}
            />
            <label className="field">
              <span>{tr("vrchat.zoomDragThePictureTo")}</span>
              <Range min={1} max={5} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            </label>
            {frames && <p className="small">{tr("vrchat.animatedLengthFramesAnAnimated", { length: frames.length })}</p>}
            {frames && (
              <label className="field narrow">
                <span>{tr("vrchat.framesPerSecondFps", { fps })}</span>
                <Range min={1} max={30} value={fps} onChange={(e) => setFps(Number(e.target.value))} />
              </label>
            )}
            {kind === "emoji" && (
              <label className="field narrow">
                <span>{tr("vrchat.effectInGame")}</span>
                <select value={style} onChange={(e) => setStyle(e.target.value)}>
                  {ANIMATION_STYLES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {kind === "print" && (
              <label className="field">
                <span>{tr("vrchat.noteOnThePrint")}</span>
                <input value={note} maxLength={64} onChange={(e) => setNote(e.target.value)} />
              </label>
            )}
          </>
        )}
        <div className="row end">
          <button className="btn" onClick={() => onClose(false)}>
            {tr("vrchat.cancel")}
          </button>
          <button
            className="btn primary"
            disabled={!source || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const blob = await render();
                const e = await uploadImage(kind, blob, { animationStyle: style, frames: frames?.length, fps, note });
                showToast(e ? tr("vrchat.uploadFailedError", { error: e }) : "Uploaded");
                if (!e) onClose(true);
              } catch (e) {
                showToast(tr("vrchat.uploadFailedError", { error: e }));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? tr("vrchat.uploading") : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- world notes ----------

function WorldNotes() {
  const notes = useApp((s) => s.local.worldNotes) ?? EMPTY_OBJ;
  const worlds = useApp((s) => s.cache.worlds) ?? EMPTY_OBJ;
  const [tag, setTag] = useState("");
  const all = Object.entries(notes).sort((a, b) => b[1].t - a[1].t);
  const tags = [...new Set(all.flatMap(([, n]) => n.tags))].sort();
  const shown = all.filter(([, n]) => !tag || n.tags.includes(tag));
  return (
    <section className="insight-card">
      <h3>
        <Icon name="tag" size={16} /> Your world notes ({all.length})
      </h3>
      {tags.length > 0 && (
        <div className="chips">
          <button className={`chip ${!tag ? "on" : ""}`} onClick={() => setTag("")}>
            {tr("vrchat.all")}
          </button>
          {tags.map((t) => (
            <button key={t} className={`chip ${tag === t ? "on" : ""}`} onClick={() => setTag(tag === t ? "" : t)}>
              {t}
            </button>
          ))}
        </div>
      )}
      {!all.length && <p className="small muted">{tr("vrchat.addNotesAndTagsTo")}</p>}
      <ul className="missed-list">
        {shown.map(([id, n]) => (
          <li key={id}>
            <button className="link-btn" onClick={() => setState({ openWorld: id })}>
              {worlds[id]?.name ?? id}
            </button>
            <span className="small">{n.text}</span>
            <span className="small muted">{n.tags.join(", ")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

