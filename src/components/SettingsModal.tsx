import { useEffect, useRef, useState } from "react";
import { backend } from "../backend";
import { forgetLogHistory, logsSupported, naiveToDate, scanLogs } from "../logs";
import { exitDemo, logoutAll, wipeEverything } from "../session";
import { setState, updateGroupSettings, updateLocal, updateLogSettings, updateMap, updateSettings, useApp } from "../store";
import type { GroupSettings, MapSettings } from "../types";
import { Icon } from "./Icon";

export function SettingsModal() {
  const settings = useApp((s) => s.settings);
  const session = useApp((s) => s.session);
  const demo = useApp((s) => s.demo);
  const tab = useApp((s) => s.settingsTab);
  const [info, setInfo] = useState<{ data_dir: string; image_cache_bytes: number } | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const groupsRef = useRef<HTMLElement>(null);
  const logsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    backend.storageInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

  useEffect(() => {
    const el = tab === "groups" ? groupsRef.current : tab === "logs" ? logsRef.current : null;
    el?.scrollIntoView({ block: "start" });
    if (tab !== "general") setState({ settingsTab: "general" });
  }, [tab]);

  const close = () => setState({ settingsOpen: false });

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-label="Settings">
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={close} title="Close">
            <Icon name="close" />
          </button>
        </div>

        <section>
          <h3>Account</h3>
          {demo ? (
            <p>
              Demo mode: all data is made up.{" "}
              <button className="btn link" onClick={() => { close(); exitDemo(); }}>
                Leave demo
              </button>
            </p>
          ) : (
            <p>Logged in as <b>{session?.display_name ?? "unknown"}</b>.</p>
          )}
          {!demo && (
            <div className="row">
              <button className="btn" onClick={() => logoutAll(false)}>
                <Icon name="logout" size={16} /> Log out (keep data)
              </button>
              <button className="btn" onClick={() => logoutAll(true)}>
                Log out and clear friend cache
              </button>
            </div>
          )}
        </section>

        <section>
          <h3>Requests to VRChat</h3>
          <label className="field">
            <span>Contact for the User-Agent</span>
            <input value={settings.contact} placeholder="Discord name or email" onChange={(e) => updateSettings({ contact: e.target.value })} />
            <small>Sent with each request so VRChat can reach the tool's user if something goes wrong.</small>
          </label>
          <label className="field">
            <span>Time between requests: {(settings.intervalMs / 1000).toFixed(1)} s</span>
            <input type="range" min={1000} max={4000} step={100} value={settings.intervalMs} onChange={(e) => updateSettings({ intervalMs: Number(e.target.value) })} />
            <small>Never faster than one per second. Slower is gentler on VRChat; the first full sync takes about 2 × (number of friends) requests.</small>
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.autoRefresh} onChange={(e) => updateSettings({ autoRefresh: e.target.checked })} />
            Refresh online status about every 5 minutes while the app is open
          </label>
          <div className="row">
            <label className="field narrow">
              <span>Reload profiles after (days)</span>
              <input type="number" min={1} max={60} value={settings.detailTtlDays} onChange={(e) => updateSettings({ detailTtlDays: Math.max(1, Number(e.target.value) || 7) })} />
            </label>
            <label className="field narrow">
              <span>Reload mutuals after (days)</span>
              <input type="number" min={1} max={60} value={settings.mutualTtlDays} onChange={(e) => updateSettings({ mutualTtlDays: Math.max(1, Number(e.target.value) || 7) })} />
            </label>
          </div>
        </section>

        <section>
          <h3>Display</h3>
          <div className="row">
            <label className="field narrow">
              <span>People who don't match filters</span>
              <select value={settings.dimMode} onChange={(e) => updateSettings({ dimMode: e.target.value as "dim" | "hide" })}>
                <option value="dim">Dim them</option>
                <option value="hide">Hide them</option>
              </select>
            </label>
            <label className="field narrow">
              <span>Lines between people</span>
              <select value={settings.map.lines} onChange={(e) => updateMap({ lines: e.target.value as MapSettings["lines"] })}>
                <option value="shared">Colored by friends in common</option>
                <option value="plain">Single color</option>
                <option value="together">Time together (game logs)</option>
                <option value="none">None</option>
              </select>
            </label>
            <label className="field narrow">
              <span>Ring around people on the map</span>
              <select value={settings.ringMode} onChange={(e) => updateSettings({ ringMode: e.target.value as "status" | "trust" })}>
                <option value="status">Online status</option>
                <option value="trust">Trust rank</option>
              </select>
            </label>
          </div>
          <p className="small muted">More options (full player cards, sizes, spacing…) are under “Map options” on the map.</p>
        </section>

        <section ref={logsRef}>
          <GameLogSection />
        </section>

        <section ref={groupsRef}>
          <GroupSection />
        </section>

        <section>
          <h3>Local data</h3>
          {demo ? (
            <p className="small muted">Demo data isn't saved. Your real circles and cache are untouched.</p>
          ) : info ? (
            <>
              <p className="small">
                Stored in <code>{info.data_dir}</code>. Image cache: {(info.image_cache_bytes / 1024 / 1024).toFixed(1)} MB. Before an update
                changes the format of your data, a copy is saved in <code>store/backups</code>.
              </p>
              <div className="row">
                <button className="btn" onClick={() => backend.clearImageCache().then(() => backend.storageInfo().then(setInfo))}>
                  Clear image cache
                </button>
                {!confirmWipe ? (
                  <button className="btn danger" onClick={() => setConfirmWipe(true)}>
                    Delete all local data…
                  </button>
                ) : (
                  <button className="btn danger" onClick={() => wipeEverything()}>
                    Yes, delete circles, imports, cache, log history and log out
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="small muted">Running in a browser: data is kept in this browser's local storage.</p>
          )}
        </section>
        <section>
          <h3>About</h3>
          <p className="small muted">VRC Friend Map {__APP_VERSION__}. Not affiliated with VRChat Inc.</p>
        </section>
      </div>
    </div>
  );
}

const RETENTION = [
  [0, "Forever"],
  [30, "30 days"],
  [90, "90 days"],
  [180, "6 months"],
  [365, "1 year"],
] as const;

function GameLogSection() {
  const logs = useApp((s) => s.logs);
  const ls = useApp((s) => s.settings.logs);
  const demo = useApp((s) => s.demo);
  const [newDir, setNewDir] = useState("");
  const [confirm, setConfirm] = useState(false);
  const r = logs.report;

  if (!logsSupported(logs.platform)) {
    return (
      <>
        <h3>Game logs</h3>
        <p className="small muted">
          {logs.platform === "browser"
            ? "Reading VRChat's log files needs the desktop app."
            : "VRChat's log files only exist on the PC that runs VRChat, so this part works in the Windows and Linux apps only."}
        </p>
      </>
    );
  }
  return (
    <>
      <h3>Game logs (this PC)</h3>
      <p className="small muted">
        VRChat writes a log while it runs. The app reads who joined and left your instances to work out who spends time together. It only reads
        files; nothing is sent anywhere. Logs from Quest or phone sessions aren't available.
      </p>
      {demo && <p className="small warn">Demo mode: log reading is paused and the data shown is made up.</p>}
      <label className="check">
        <input type="checkbox" checked={ls.enabled} onChange={(e) => updateLogSettings({ enabled: e.target.checked })} />
        Read VRChat's logs
      </label>
      <label className="check">
        <input type="checkbox" checked={ls.autoDetect} onChange={(e) => updateLogSettings({ autoDetect: e.target.checked })} />
        Find the log folder automatically (Windows, Steam/Proton libraries on any drive, Flatpak and Snap Steam)
      </label>
      {ls.autoDetect && (
        <ul className="path-list">
          {logs.detected.length ? logs.detected.map((d) => <li key={d}><code>{d}</code></li>) : <li className="muted small">No VRChat log folder found automatically.</li>}
        </ul>
      )}
      <div className="field">
        <span>Extra folders</span>
        <ul className="path-list">
          {ls.dirs.map((d) => (
            <li key={d}>
              <code>{d}</code>
              <button className="icon-btn tiny" title="Remove" onClick={() => updateLogSettings({ dirs: ls.dirs.filter((x) => x !== d) })}>
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const d = newDir.trim();
            if (!d || ls.dirs.includes(d)) return;
            updateLogSettings({ dirs: [...ls.dirs, d] });
            setNewDir("");
          }}
        >
          <input value={newDir} placeholder="/path/to/AppData/LocalLow/VRChat/VRChat" onChange={(e) => setNewDir(e.target.value)} />
          <button className="btn" type="submit" disabled={!newDir.trim()} title="Add folder">
            <Icon name="plus" size={16} />
          </button>
        </form>
        <small>Full path of the folder that contains the output_log_….txt files.</small>
      </div>
      <div className="row">
        <label className="field narrow">
          <span>Check for new entries every</span>
          <select value={ls.scanMinutes} onChange={(e) => updateLogSettings({ scanMinutes: Number(e.target.value) })}>
            {[1, 2, 5, 10, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
        <label className="field narrow">
          <span>Keep history</span>
          <select value={ls.retentionDays} onChange={(e) => updateLogSettings({ retentionDays: Number(e.target.value) })}>
            {RETENTION.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="small">
        {r && r.visits > 0
          ? `History: ${r.visits} instance visits from ${r.files_stored} log files, ${naiveToDate(r.first).toLocaleDateString()} – ${naiveToDate(r.last).toLocaleDateString()} (${(r.bytes / 1024).toFixed(0)} KB). It's kept even after VRChat deletes old log files.`
          : "No log history yet."}
      </p>
      {logs.error && <p className="small warn">{logs.error}</p>}
      <div className="row">
        <button className="btn" disabled={logs.scanning || demo} onClick={() => scanLogs(true)}>
          <Icon name="refresh" size={16} /> {logs.scanning ? "Reading…" : "Read logs now"}
        </button>
        {!confirm ? (
          <button className="btn" disabled={demo} onClick={() => setConfirm(true)}>
            Forget log history…
          </button>
        ) : (
          <button
            className="btn danger"
            onClick={() => {
              forgetLogHistory();
              setConfirm(false);
            }}
          >
            Yes, forget it (log files themselves stay)
          </button>
        )}
      </div>
    </>
  );
}

function GroupSection() {
  const g = useApp((s) => s.settings.groups);
  const dismissed = useApp((s) => s.local.dismissedGroups.length);
  const set = (patch: Partial<GroupSettings>) => updateGroupSettings(patch);
  return (
    <>
      <h3>Friend group detection</h3>
      <p className="small muted">
        Suggestions come from who you've been in the same instance with. Two people count as connected when they spent enough time together on
        enough different days; then groups are found that are much more connected inside than outside.
      </p>
      <div className="row">
        <label className="field narrow">
          <span>Time together at least</span>
          <select value={g.minMinutes} onChange={(e) => set({ minMinutes: Number(e.target.value) })}>
            {[10, 20, 30, 60, 120, 240].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} h`}
              </option>
            ))}
          </select>
        </label>
        <label className="field narrow">
          <span>…on at least</span>
          <select value={g.minDays} onChange={(e) => set({ minDays: Number(e.target.value) })}>
            {[1, 2, 3, 5, 7, 10].map((d) => (
              <option key={d} value={d}>
                {d} day{d === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
        <label className="field narrow">
          <span>Smallest group</span>
          <select value={g.minSize} onChange={(e) => set({ minSize: Number(e.target.value) })}>
            {[2, 3, 4, 5, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n} people
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>
          Group size: <b>{g.resolution < 0.8 ? "bigger, looser groups" : g.resolution > 1.25 ? "smaller, tighter groups" : "balanced"}</b>
        </span>
        <input type="range" min={0.4} max={2.2} step={0.05} value={g.resolution} onChange={(e) => set({ resolution: Number(e.target.value) })} />
      </label>
      <div className="row">
        <label className="field narrow">
          <span>Big instances count</span>
          <select value={g.crowd} onChange={(e) => set({ crowd: e.target.value as GroupSettings["crowd"] })}>
            <option value="strong">Much less (recommended)</option>
            <option value="mild">A bit less</option>
            <option value="off">The same</option>
          </select>
        </label>
        <label className="field narrow">
          <span>Use history from</span>
          <select value={g.sinceDays} onChange={(e) => set({ sinceDays: Number(e.target.value) })}>
            <option value={0}>All time</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 6 months</option>
            <option value={365}>Last year</option>
          </select>
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={g.overlap} onChange={(e) => set({ overlap: e.target.checked })} />
        People can be in more than one suggested group
      </label>
      <label className="check">
        <input type="checkbox" checked={g.mutualBoost} onChange={(e) => set({ mutualBoost: e.target.checked })} />
        Weigh time together more when the two are VRChat friends too
      </label>
      <label className="check">
        <input type="checkbox" checked={g.auto} onChange={(e) => set({ auto: e.target.checked })} />
        Make and update circles automatically (marked “auto”; renaming one or changing who's in it makes it yours)
      </label>
      {dismissed > 0 && (
        <button className="btn small" onClick={() => updateLocal((l) => ({ ...l, dismissedGroups: [] }))}>
          Show {dismissed} dismissed suggestion{dismissed === 1 ? "" : "s"} again
        </button>
      )}
    </>
  );
}
