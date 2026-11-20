// Settings: now playing in your status, Steam play time in
// your bio (src/extras.ts), and encrypted backups (src/backup.ts).
import { useEffect, useRef, useState } from "react";
import { backend, isMobile, isTauri } from "../backend";
import { describeBackup, makeBackup, openBackup, restoreBackup } from "../backup";
import { bioWithLine, fill, nowPlaying, songText, steamPlaytime, type NowPlaying, type Playtime } from "../extras";
import { showToast, updateSettings, useApp } from "../store";
import type { ExtrasSettings } from "../types";

function useExtras() {
  const x = useApp((s) => s.settings.extras);
  const set = <K extends keyof ExtrasSettings>(k: K, patch: Partial<ExtrasSettings[K]>) => updateSettings({ extras: { ...x, [k]: { ...x[k], ...patch } } });
  return [x, set] as const;
}

export function NowPlayingSection() {
  const [x, set] = useExtras();
  const [n, setN] = useState<NowPlaying | null | string>(null);
  useEffect(() => {
    void nowPlaying().then(setN, (e) => setN(String(e)));
  }, []);
  const sample = typeof n === "object" && n ? fill(x.nowPlaying.template, { title: n.title, artist: n.artist, song: songText(n) }).slice(0, 32) : "";
  return (
    <>
      <h3>Now playing in your status</h3>
      <p className="small muted">
        The song from your music player (MPRIS, through <code>playerctl</code>) as your VRChat status text, at most one change every 90 seconds. When the music
        stops or you turn this off, your old status text comes back. Change your status yourself and it's left alone.
      </p>
      <label className="check">
        <input type="checkbox" checked={x.nowPlaying.status} onChange={(e) => set("nowPlaying", { status: e.target.checked })} />
        <span>Put the song into my status</span>
      </label>
      <label className="field">
        <span>
          Template <span className="muted small">({"{title} {artist} {song}"}; VRChat keeps 32 characters)</span>
        </span>
        <input value={x.nowPlaying.template} onChange={(e) => set("nowPlaying", { template: e.target.value.slice(0, 64) })} />
      </label>
      <p className="small muted">
        {typeof n === "string" ? n : n ? `Playing now: ${songText(n)} → “${sample}”` : "Nothing is playing right now."}
      </p>
    </>
  );
}

export function PlaytimeSection() {
  const [x, set] = useExtras();
  const meId = useApp((s) => s.cache.me?.id);
  const bio = useApp((s) => (meId ? (s.cache.details[meId]?.bio ?? "") : ""));
  const [p, setP] = useState<Playtime | null | string>(null);
  useEffect(() => {
    void steamPlaytime().then(setP, (e) => setP(String(e)));
  }, []);
  const hours = typeof p === "object" && p ? Math.round(p.minutes / 60) : null;
  const preview = hours !== null ? bioWithLine(bio, x.playtime.template, hours) : null;
  return (
    <>
      <h3>Steam play time in your bio</h3>
      <p className="small muted">
        Reads VRChat's play time from Steam's own files on this PC and keeps one line in your VRChat bio up to date, once a day. The rest of your bio stays as
        it is; the line is found again by its template.
      </p>
      <label className="check">
        <input type="checkbox" checked={x.playtime.bio} onChange={(e) => set("playtime", { bio: e.target.checked })} />
        <span>Keep the line in my bio</span>
      </label>
      <label className="field">
        <span>
          The line <span className="muted small">({"{hours}"})</span>
        </span>
        <input value={x.playtime.template} onChange={(e) => set("playtime", { template: e.target.value.slice(0, 80) })} />
      </label>
      <p className="small muted">
        {typeof p === "string"
          ? p
          : p === null
            ? "No VRChat play time found in Steam's files (Steam on this PC, signed in once)."
            : `Steam says ${hours!.toLocaleString("en-US")} h (${Math.round(p.two_weeks / 60)} h in the last two weeks).`}
        {hours !== null && !x.playtime.template.includes("{hours}") && " The template needs {hours}."}
        {hours !== null && preview === null && " Your bio would get longer than 512 characters, so it's left alone."}
      </p>
    </>
  );
}

export function BackupSection() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Awaited<ReturnType<typeof openBackup>> | null>(null);
  const [withSettings, setWithSettings] = useState(true);
  const [text, setText] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      const data = await makeBackup(pw);
      const name = `vrc-friend-map-backup-${new Date().toISOString().slice(0, 10)}.vfmbackup`;
      if (isTauri && !isMobile) showToast(`Saved to ${await backend.saveExport(name, data)}`);
      else {
        await navigator.clipboard.writeText(data);
        showToast("Backup copied. Paste it into a note or file you keep.");
      }
    });
  const open = (t: string) =>
    run(async () => {
      setText(t);
      setFound(await openBackup(t, pw));
    });
  return (
    <>
      <h4 className="sub-h">Backup to another device</h4>
      <p className="small muted">
        Circles, stars, nicknames, time zones, block reasons, invite messages, world notes, settings and your own sounds in one file, encrypted with a password
        you choose. Not in it: your VRChat login, server keys, and your age notes (those never leave this device).
      </p>
      <label className="field narrow">
        <span>Password (8 characters or more)</span>
        <input type="password" value={pw} autoComplete="new-password" onChange={(e) => setPw(e.target.value)} />
      </label>
      <div className="row">
        <button className="btn small" disabled={busy || pw.length < 8} onClick={() => void save()}>
          {isTauri && !isMobile ? "Save a backup to Downloads" : "Copy a backup"}
        </button>
        <button className="btn small" disabled={busy || pw.length < 8} onClick={() => file.current?.click()}>
          Restore from a file…
        </button>
        {isMobile && (
          <button className="btn small" disabled={busy || pw.length < 8} onClick={() => void navigator.clipboard.readText().then(open)}>
            Restore from the clipboard
          </button>
        )}
        <input
          ref={file}
          type="file"
          accept=".vfmbackup,application/json,text/plain"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void f.text().then(open);
          }}
        />
      </div>
      {found && (
        <div className="callout">
          <p className="small">{describeBackup(found)}</p>
          <label className="check">
            <input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} />
            <span>Also take its settings</span>
          </label>
          <p className="small">This replaces the circles, stars, nicknames and the rest on this device.</p>
          <div className="row">
            <button
              className="btn small danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await restoreBackup(found, { settings: withSettings });
                  setFound(null);
                  setText(null);
                  showToast("Backup restored");
                })
              }
            >
              Restore it
            </button>
            <button className="btn small ghost" onClick={() => setFound(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {text && !found && busy && <p className="small muted">Opening…</p>}
    </>
  );
}
