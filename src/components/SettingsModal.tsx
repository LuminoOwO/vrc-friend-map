import { useEffect, useState } from "react";
import { backend } from "../backend";
import { exitDemo, logoutAll, wipeEverything } from "../session";
import { setState, updateSettings, useApp } from "../store";
import { Icon } from "./Icon";

export function SettingsModal() {
  const settings = useApp((s) => s.settings);
  const session = useApp((s) => s.session);
  const demo = useApp((s) => s.demo);
  const [info, setInfo] = useState<{ data_dir: string; image_cache_bytes: number } | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);

  useEffect(() => {
    backend.storageInfo().then(setInfo).catch(() => setInfo(null));
  }, []);

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
              <select value={settings.lineColors} onChange={(e) => updateSettings({ lineColors: e.target.value as "shared" | "plain" })}>
                <option value="shared">Colored by friends in common</option>
                <option value="plain">Single color</option>
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
        </section>

        <section>
          <h3>Local data</h3>
          {demo ? (
            <p className="small muted">Demo data isn't saved. Your real circles and cache are untouched.</p>
          ) : info ? (
            <>
              <p className="small">
                Stored in <code>{info.data_dir}</code>. Image cache: {(info.image_cache_bytes / 1024 / 1024).toFixed(1)} MB.
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
                    Yes, delete circles, imports, cache and log out
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="small muted">Running in a browser: data is kept in this browser's local storage.</p>
          )}
        </section>
      </div>
    </div>
  );
}
