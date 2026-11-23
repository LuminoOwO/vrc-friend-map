// Compare friend lists that other people share with you. Each person exports a
// file from their own copy of the app (their own login, their own device) and
// sends it to you; nobody hands over a login.
import { t as tr } from "../i18n";
import { ServersPanel } from "./ServersPanel";
import { useEffect, useMemo, useState } from "react";
import { backend, randomHex } from "../backend";
import { listMemberIds } from "../derived";
import { fmtDate, uid } from "../model";
import { getState, setState, showToast, updateFilters, updateLocal, updateSharing, useApp } from "../store";
import type { ImportedList } from "../types";
import { Icon } from "./Icon";
import { PeopleChooser } from "./PeopleChooser";
import { selectedIds } from "../selection";
import { CompareLists, ListViewer } from "./ListViewer";
import { toggleMapList } from "../listoverlay";

const FORMAT = "vrc-friend-map/friends-v1";
const MAX_ENTRIES = 20000;

interface ExportFile {
  format: string;
  exportedAt: string;
  owner: { id?: string; displayName: string };
  mode: "full" | "hashed";
  friends?: { id: string; displayName: string }[];
  salt?: string;
  hashes?: string[];
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

async function buildExport(mode: "full" | "hashed"): Promise<ExportFile> {
  const { cache, settings } = getState();
  const me = cache.me;
  const friends = selectedIds(settings.sharing.exportPick).map((id) => cache.friends[id]);
  const base = {
    format: FORMAT,
    exportedAt: new Date().toISOString(),
    owner: { id: me?.id, displayName: me?.displayName ?? "Unknown" },
    mode,
  };
  if (mode === "full") {
    return {
      ...base,
      friends: friends.map((f) => ({ id: f.id, displayName: f.displayName })).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    };
  }
  const salt = randomHex(16);
  const hashes = (await backend.hashIds(salt, friends.map((f) => f.id))).sort();
  return { ...base, salt, hashes };
}

function parseImport(text: string): ExportFile {
  let data: ExportFile;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(tr("lists.notJson"));
  }
  if (data?.format !== FORMAT) throw new Error(tr("lists.notOurs"));
  if (!data.owner || typeof data.owner.displayName !== "string") throw new Error(tr("lists.noOwner"));
  if (data.mode === "full") {
    if (!Array.isArray(data.friends) || data.friends.length > MAX_ENTRIES) throw new Error(tr("lists.badFriends"));
    data.friends = data.friends
      .filter((f) => f && typeof f.id === "string" && /^usr_[\w-]+$|^[A-Za-z0-9]{10}$/.test(f.id))
      .map((f) => ({ id: f.id, displayName: String(f.displayName ?? "").slice(0, 64) }));
  } else if (data.mode === "hashed") {
    if (typeof data.salt !== "string" || data.salt.length < 16) throw new Error(tr("lists.noSalt"));
    if (!Array.isArray(data.hashes) || data.hashes.length > MAX_ENTRIES) throw new Error(tr("lists.badHashes"));
    data.hashes = data.hashes.filter((h) => typeof h === "string" && /^[0-9a-f]{64}$/.test(h));
  } else {
    throw new Error(tr("lists.unknownMode"));
  }
  data.owner = { id: typeof data.owner.id === "string" ? data.owner.id : undefined, displayName: data.owner.displayName.slice(0, 64) };
  return data;
}

async function resolveHashed(list: Pick<ImportedList, "salt" | "hashes">): Promise<string[]> {
  const { cache } = getState();
  const known = [...Object.keys(cache.friends), ...(cache.me ? [cache.me.id] : [])];
  if (!list.salt || !list.hashes?.length || !known.length) return [];
  const hashes = await backend.hashIds(list.salt, known);
  const set = new Set(list.hashes);
  return known.filter((_, i) => set.has(hashes[i]));
}

async function importText(text: string) {
  const data = parseImport(text);
  const list: ImportedList = {
    id: uid(),
    importedAt: Date.now(),
    owner: data.owner,
    exportedAt: data.exportedAt,
    mode: data.mode,
    friends: data.friends,
    salt: data.salt,
    hashes: data.hashes,
  };
  if (list.mode === "hashed") list.resolved = await resolveHashed(list);
  const me = getState().cache.me;
  if (me && list.owner.id === me.id) throw new Error(tr("lists.ownExport"));
  let replaced = false;
  updateLocal((l) => {
    const others = l.imports.filter((x) => !(list.owner.id && x.owner.id === list.owner.id));
    replaced = others.length !== l.imports.length;
    return { ...l, imports: [...others, list] };
  });
  showToast(tr("lists.valueNameSList", { value: replaced ? "Updated" : "Imported", name: list.owner.displayName }));
}

function sampleExports(): string[] {
  const { cache } = getState();
  const ids = Object.keys(cache.friends);
  const pick = (n: number, seed: number) => ids.filter((_, i) => (i * 7 + seed) % 11 < n);
  const strangers = ["MapleKite", "OrbitCrane", "Sable", "TinyGolem", "Wisp", "Rook99"].map((n, i) => ({ id: `usr_sample-${i}`, displayName: n }));
  const full: ExportFile = {
    format: FORMAT,
    exportedAt: new Date().toISOString(),
    owner: { id: ids[3], displayName: cache.friends[ids[3]]?.displayName ?? tr("lists.sampleFriend") },
    mode: "full",
    friends: [...pick(4, 1).map((id) => ({ id, displayName: cache.friends[id].displayName })), ...strangers],
  };
  return [JSON.stringify(full)];
}

export function SharedLists() {
  const imports = useApp((s) => s.local.imports);
  const cache = useApp((s) => s.cache);
  const demo = useApp((s) => s.demo);
  const exportPick = useApp((s) => s.settings.sharing.exportPick);
  const [mode, setMode] = useState<"hashed" | "full">("hashed");
  const [paste, setPaste] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openStrangers, setOpenStrangers] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const mapLists = useApp((s) => s.mapLists);
  const friendCount = Object.keys(cache.friends).length;

  // Re-match hashed lists whenever our own friend list changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hashed = getState().local.imports.filter((l) => l.mode === "hashed");
      if (!hashed.length) return;
      const updates = await Promise.all(hashed.map(async (l) => [l.id, await resolveHashed(l)] as const));
      if (cancelled) return;
      const map = new Map(updates);
      updateLocal((l) => ({ ...l, imports: l.imports.map((x) => (map.has(x.id) ? { ...x, resolved: map.get(x.id) } : x)) }));
    })();
    return () => {
      cancelled = true;
    };
  }, [friendCount]);

  const sets = useMemo(() => {
    const mine = new Set(Object.keys(cache.friends));
    const lists = imports.map((l) => ({
      list: l,
      known: new Set(listMemberIds(l, cache)),
      includesMe: !!cache.me && (l.mode === "full" ? !!l.friends?.some((f) => f.id === cache.me!.id) : !!l.resolved?.includes(cache.me.id)),
      strangers: l.mode === "full" ? (l.friends ?? []).filter((f) => !mine.has(f.id) && f.id !== cache.me?.id) : [],
      size: l.mode === "full" ? l.friends?.length ?? 0 : l.hashes?.length ?? 0,
    }));
    const counts = new Map<string, number>();
    for (const x of lists) for (const id of x.known) counts.set(id, (counts.get(id) ?? 0) + 1);
    const ranking = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
    return { mine, lists, ranking };
  }, [imports, cache]);

  const doExport = async (how: "copy" | "save") => {
    setBusy(true);
    try {
      const data = await buildExport(mode);
      const text = JSON.stringify(data, null, mode === "full" ? 1 : 0);
      if (how === "copy") {
        const ok = await copyText(text);
        showToast(ok ? tr("lists.copiedPasteItIntoA") : tr("lists.couldnTCopyToThe"));
      } else {
        const name = `vrc-friends-${(data.owner.displayName || "me").replace(/[^\w-]/g, "_")}-${mode}.json`;
        const path = await backend.saveExport(name, text);
        showToast(tr("lists.savedToPath", { path }));
      }
    } catch (e) {
      showToast(String(e));
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (text: string) => {
    setError("");
    try {
      await importText(text);
      setPaste("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="lists-view">
      <ServersPanel />
      <h2 className="lists-title">{tr("lists.orByHand")}</h2>
      <div className="lists-cols">
        <section className="panel">
          <h2>{tr("lists.shareYourList")}</h2>
          <p className="muted">{tr("lists.sendThisToAFriend")}</p>
          <label className={`radio-card ${mode === "hashed" ? "on" : ""}`}>
            <input type="radio" checked={mode === "hashed"} onChange={() => setMode("hashed")} />
            <div>
              <b>{tr("lists.onlyPeopleWeBothKnow")}</b> <span className="pill">recommended</span>
              <p className="small muted">{tr("lists.idsAreScrambledWithA")}</p>
            </div>
          </label>
          <label className={`radio-card ${mode === "full" ? "on" : ""}`}>
            <input type="radio" checked={mode === "full"} onChange={() => setMode("full")} />
            <div>
              <b>{tr("lists.fullListWithNames")}</b>
              <p className="small muted">{tr("lists.showsYourWholeFriendsList")}</p>
            </div>
          </label>
          <p className="small">{tr("lists.whoSInIt")}</p>
          <PeopleChooser value={exportPick} onChange={(v) => updateSharing({ exportPick: v })} />
          <div className="row">
            <button className="btn primary" disabled={busy || demo} onClick={() => doExport("copy")}>
              <Icon name="copy" size={16} /> {tr("lists.copy")}
            </button>
            <button className="btn" disabled={busy || demo} onClick={() => doExport("save")}>
              <Icon name="download" size={16} /> {tr("lists.saveFile")}
            </button>
          </div>
          {demo && <p className="small muted">{tr("lists.exportingIsOffInDemo")}</p>}
        </section>

        <section className="panel">
          <h2>{tr("lists.importAFriendSList")}</h2>
          <div className="row">
            <label className="btn">
              <Icon name="upload" size={16} /> Choose file
              <input
                type="file"
                accept=".json,application/json"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  if (file.size > 8 * 1024 * 1024) return setError(tr("lists.tooLarge"));
                  doImport(await file.text());
                }}
              />
            </label>
            {demo && (
              <button className="btn ghost" onClick={() => sampleExports().forEach((t) => doImport(t))}>
                {tr("lists.addASampleList")}
              </button>
            )}
          </div>
          <textarea value={paste} placeholder={tr("lists.orPasteTheCopiedText")} rows={4} onChange={(e) => setPaste(e.target.value)} />
          <button className="btn" disabled={!paste.trim()} onClick={() => doImport(paste)}>
            {tr("lists.importPastedText")}
          </button>
          {error && <p className="error-text">{error}</p>}
        </section>
      </div>

      {sets.lists.length > 0 && (
        <>
          <h2 className="lists-title">{tr("lists.importedLists")}</h2>
          <div className="import-grid">
            {sets.lists.map(({ list, known, includesMe, strangers, size }) => (
              <div key={list.id} className="panel import-card">
                <div className="section-head">
                  <h3>
                    {list.owner.id && cache.friends[list.owner.id] ? (
                      <button className="btn link" onClick={() => setState({ selectedId: list.owner.id! })}>
                        {list.owner.displayName}
                      </button>
                    ) : (
                      <button className="btn link" onClick={() => setViewing(list.id)}>
                        {list.owner.displayName}
                      </button>
                    )}
                  </h3>
                  <span className="pill">{list.mode === "full" ? "full list" : "overlap only"}</span>
                </div>
                <p className="small muted">
                  {size} friends · {list.via ? "shared" : "exported"} {fmtDate(list.exportedAt)} {includesMe ? tr("lists.includesYou") : ""}
                </p>
                {list.via && (
                  <p className="via">
                    <Icon name="server" size={12} /> via {list.via.join(", ")} · updates on every sync
                  </p>
                )}
                <div className="big-num">
                  <b>{known.size}</b> people you both know
                  {size > 0 && <span className="muted"> ({Math.round((known.size / size) * 100)}% of their list)</span>}
                </div>
                {list.mode === "full" && (
                  <button className="btn link small" onClick={() => setOpenStrangers(openStrangers === list.id ? null : list.id)}>
                    {strangers.length} of their friends you don't know {openStrangers === list.id ? "▴" : "▾"}
                  </button>
                )}
                {openStrangers === list.id && (
                  <div className="mini-list">
                    {strangers.slice(0, 200).map((s) => (
                      <span key={s.id} className="mini static">
                        {s.displayName || s.id}
                      </span>
                    ))}
                  </div>
                )}
                <div className="row">
                  <button className="btn small primary" onClick={() => setViewing(viewing === list.id ? null : list.id)} aria-pressed={viewing === list.id}>
                    <Icon name="users" size={14} /> {tr("listView.view")}
                  </button>
                  <button
                    className={`btn small ${mapLists.includes(list.id) ? "active" : ""}`}
                    aria-pressed={mapLists.includes(list.id)}
                    title={tr("listView.onMyMapHelp")}
                    onClick={() => toggleMapList(list.id)}
                  >
                    <Icon name={mapLists.includes(list.id) ? "check" : "graph"} size={14} /> {tr("listView.onMyMap")}
                  </button>
                  <button
                    className="btn small"
                    onClick={() => {
                      updateFilters({ listId: list.id });
                      setState({ view: "graph" });
                    }}
                  >
                    {tr("lists.showOnMap")}
                  </button>
                  <button
                    className="btn small"
                    onClick={() => {
                      updateFilters({ listId: list.id });
                      setState({ view: "cards" });
                    }}
                  >
                    {tr("lists.showCards")}
                  </button>
                  <button
                    className="btn small danger"
                    onClick={() => {
                      const prev = getState().local.imports;
                      updateLocal((l) => ({ ...l, imports: l.imports.filter((x) => x.id !== list.id) }));
                      if (getState().filters.listId === list.id) updateFilters({ listId: null });
                      showToast(tr("lists.removedNameSList", { name: list.owner.displayName }), () => updateLocal((l) => ({ ...l, imports: prev })));
                    }}
                  >
                    {tr("lists.remove")}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {viewing && imports.find((l) => l.id === viewing) && <ListViewer list={imports.find((l) => l.id === viewing)!} onClose={() => setViewing(null)} />}
          <CompareLists />

          {sets.lists.length > 1 && (
            <section className="panel">
              <h3>{tr("lists.overlapBetweenLists")}</h3>
              <p className="small muted">{tr("lists.countedOverPeopleYouCan")}</p>
              <div className="matrix-wrap">
                <table className="matrix">
                  <thead>
                    <tr>
                      <th />
                      {sets.lists.map((x) => (
                        <th key={x.list.id}>{x.list.owner.displayName}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sets.lists.map((a) => (
                      <tr key={a.list.id}>
                        <th>{a.list.owner.displayName}</th>
                        {sets.lists.map((b) => {
                          let n = 0;
                          for (const id of a.known) if (b.known.has(id)) n++;
                          return <td key={b.list.id}>{a === b ? "—" : n}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="panel">
            <h3>{tr("lists.yourFriendsWhoShowUp")}</h3>
            <div className="mini-list">
              {sets.ranking.map(([id, n]) => (
                <button key={id} className="mini" onClick={() => setState({ selectedId: id })}>
                  {cache.friends[id]?.displayName ?? id} <span className="muted">×{n}</span>
                </button>
              ))}
              {!sets.ranking.length && <span className="muted small">{tr("lists.noneOfYourFriendsAppear")}</span>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
