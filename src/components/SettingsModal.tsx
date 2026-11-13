import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { scoreSection } from "../settingsSearch";
import { backend, isMobile, isTauri, type GraphicsInfo, type GraphicsMode } from "../backend";
import { forgetLogHistory, logsSupported, naiveToDate, scanLogs } from "../logs";
import { exitDemo, logoutAll, wipeEverything } from "../session";
import { flushSaves, setState, showToast, updatePeople, updateGroupSettings, updateLocal, updateLogSettings, updateMap, updateSettings, useApp } from "../store";
import { CloseSection, NotificationsSection } from "./NotificationsSection";
import { WheelFixSection } from "./WheelFixSection";
import { wheelFixHere } from "../wheelfix";
import { forgetObserved } from "../together";
import type { GroupSettings, MapSettings, Theme } from "../types";

import { CAT_ACCENTS, CAT_FLAVORS, CAT_LABEL, CAT_PALETTES, isCatFlavor } from "../catppuccin";
const THEMES: { value: Theme; label: string; bg: string; panel: string; accent: string }[] = [
  { value: "dark", label: "Dark", bg: "#0b1015", panel: "#18242e", accent: "#19c3b1" },
  { value: "oled", label: "OLED black", bg: "#000000", panel: "#0e1215", accent: "#19c3b1" },
  { value: "light", label: "Light", bg: "#eef2f5", panel: "#ffffff", accent: "#0f9d8f" },
  ...CAT_FLAVORS.slice()
    .reverse()
    .map((f) => ({ value: f as Theme, label: `Catppuccin ${CAT_LABEL[f]}`, bg: CAT_PALETTES[f].base, panel: CAT_PALETTES[f].surface0, accent: CAT_PALETTES[f].mauve })),
  { value: "nord", label: "Nord", bg: "#2e3440", panel: "#3b4252", accent: "#88c0d0" },
  { value: "dracula", label: "Dracula", bg: "#21222c", panel: "#44475a", accent: "#bd93f9" },
];
import { Icon } from "./Icon";
import { Diagnostics } from "./Diagnostics";
import { FrameRateSection } from "./FrameRateSection";
import { openServers } from "./ServersModal";
import { serverName } from "../share";

export function SettingsModal() {
  const settings = useApp((s) => s.settings);
  const session = useApp((s) => s.session);
  const demo = useApp((s) => s.demo);
  const tab = useApp((s) => s.settingsTab);
  const [info, setInfo] = useState<{ data_dir: string; image_cache_bytes: number } | null>(null);
  const [gfx, setGfx] = useState<GraphicsInfo | null>(null);
  const [gfxStart, setGfxStart] = useState<GraphicsMode | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [cat, setCat] = useState<Cat>("appearance");
  const [query, setQuery] = useState("");
  const [scores, setScores] = useState<Record<string, number> | null>(null);
  const sections = useRef(new Map<string, { cat: Cat; title: string; keys: string; el: HTMLElement | null }>());
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    backend.storageInfo().then(setInfo).catch(() => setInfo(null));
    backend.graphicsInfo().then((g) => { setGfx(g); setGfxStart(g?.mode ?? null); }).catch(() => setGfx(null));
  }, []);

  // Opened for a specific part (e.g. from group suggestions).
  useEffect(() => {
    if (tab === "groups" || tab === "logs") setCat("logs");
    if (tab !== "general") {
      const id = tab;
      requestAnimationFrame(() => sections.current.get(id)?.el?.scrollIntoView({ block: "start" }));
      setState({ settingsTab: "general" });
    }
  }, [tab]);

  // Search: each section's own text plus its keywords and synonyms.
  useLayoutEffect(() => {
    const q = query.trim();
    if (!q) return setScores(null);
    const out: Record<string, number> = {};
    for (const [id, sec] of sections.current) {
      const score = scoreSection(q, { id, title: sec.title, keywords: sec.keys, text: sec.el?.textContent ?? "" });
      if (score > 0) out[id] = score;
    }
    setScores(out);
  }, [query, gfx]);

  const close = () => setState({ settingsOpen: false });
  const ranked = scores ? Object.entries(scores).sort((a, b) => b[1] - a[1]) : [];
  const jump = (id: string) => {
    const sec = sections.current.get(id);
    if (!sec) return;
    setQuery("");
    setCat(sec.cat);
    requestAnimationFrame(() => sec.el?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };
  const ctx: SecCtx = {
    visible: (id, c) => (scores ? id in scores : c === cat),
    order: (id) => (scores ? ranked.findIndex(([x]) => x === id) : 0),
    register: (id, info) => {
      if (info) sections.current.set(id, info);
      else sections.current.delete(id);
    },
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal settings-modal" role="dialog" aria-label="Settings">
        <div className="modal-head settings-head">
          <h2>Settings</h2>
          <div className="settings-search">
            <Icon name="search" size={16} />
            <input
              ref={searchRef}
              autoFocus={!/Android|iPhone|iPad/i.test(navigator.userAgent)}
              value={query}
              placeholder="Search settings (e.g. theme, fps, sound, blocked)"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) {
                  e.stopPropagation();
                  setQuery("");
                } else if (e.key === "Enter" && ranked[0]) jump(ranked[0][0]);
              }}
            />
            {query && (
              <button className="icon-btn small" title="Clear" onClick={() => setQuery("")}>
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
          <button className="icon-btn" onClick={close} title="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Settings categories">
            {CATS.map((c) => {
              const hits = scores ? ranked.filter(([id]) => sections.current.get(id)?.cat === c.id).length : 0;
              return (
                <button
                  key={c.id}
                  className={`settings-cat ${!scores && cat === c.id ? "on" : ""} ${scores && !hits ? "dim" : ""}`}
                  onClick={() => {
                    setQuery("");
                    setCat(c.id);
                    bodyRef.current?.scrollTo({ top: 0 });
                  }}
                >
                  <Icon name={c.icon} size={16} />
                  <span>{c.label}</span>
                  {scores && hits > 0 && <span className="settings-hits">{hits}</span>}
                </button>
              );
            })}
          </nav>
          <div className="settings-body" ref={bodyRef}>
            {scores && (
              <div className="settings-results">
                {ranked.length ? (
                  <>
                    <span className="small muted">
                      {ranked.length} match{ranked.length === 1 ? "" : "es"}:
                    </span>
                    {ranked.slice(0, 6).map(([id]) => (
                      <button key={id} className="chip-btn" onClick={() => jump(id)}>
                        {sections.current.get(id)?.title}
                      </button>
                    ))}
                  </>
                ) : (
                  <span className="small muted">Nothing found for “{query}”. Try a different word, like “colors”, “fps”, “sound” or “servers”.</span>
                )}
              </div>
            )}
            <SecContext.Provider value={ctx}>
{/*SECTIONS*/}
        <Sec id="account" cat="account" title="Account" keys="login log out sign out user">
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
        </Sec>

        <Sec id="servers" cat="sharing" title="Servers and sharing" keys="server sync share encryption logger">
          <h3>
            <Icon name="server" size={16} /> Servers and sharing
          </h3>
          <ServersSummary />
        </Sec>

        <Sec id="requests" cat="account" title="Requests to VRChat" keys="api rate limit contact user agent interval refresh">
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
        </Sec>

        <Sec id="display" cat="appearance" title="Themes" keys="theme colors dark light style look catppuccin accent latte frappe macchiato mocha">
          <h3>Themes</h3>
          <div className="field">
            <span>Color theme</span>
            <div className="theme-grid" role="radiogroup" aria-label="Color theme">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  role="radio"
                  aria-checked={settings.theme === t.value}
                  className={`theme-chip ${settings.theme === t.value ? "on" : ""}`}
                  onClick={() => updateSettings({ theme: t.value })}
                >
                  <span className="theme-swatch" style={{ background: t.bg }}>
                    <span style={{ background: t.panel }} />
                    <span style={{ background: t.accent }} />
                  </span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {isCatFlavor(settings.theme) && (
            <div className="field">
              <span>Catppuccin accent: {settings.catAccent[0].toUpperCase() + settings.catAccent.slice(1)}</span>
              <div className="accent-grid" role="radiogroup" aria-label="Accent color">
                {CAT_ACCENTS.map((a) => {
                  const color = CAT_PALETTES[settings.theme as keyof typeof CAT_PALETTES][a];
                  return (
                    <button
                      key={a}
                      role="radio"
                      aria-checked={settings.catAccent === a}
                      title={a[0].toUpperCase() + a.slice(1)}
                      className={`accent-dot ${settings.catAccent === a ? "on" : ""}`}
                      style={{ background: color }}
                      onClick={() => updateSettings({ catAccent: a })}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </Sec>

        <Sec id="mapdisplay" cat="appearance" title="Map and profiles" keys="popup sidebar lines ring trust dim filters">
          <h3>Map and profiles</h3>
          <label className="field narrow">
            <span>Open profiles</span>
            <select value={settings.profileAs} onChange={(e) => updateSettings({ profileAs: e.target.value as "popup" | "sidebar" })}>
              <option value="popup">As a popup (best on phones)</option>
              <option value="sidebar">In a panel next to the map</option>
            </select>
          </label>
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
        </Sec>

        <Sec id="framerate" cat="performance" title="Frame rate" keys="fps vsync limit power saving battery">
          <FrameRateSection gfx={gfx} />
        </Sec>

        {gfx?.supported && (
          <Sec id="graphics" cat="performance" title="Graphics" keys="gpu software rendering">
            <h3>Graphics</h3>
            <label className="field narrow">
              <span>Map rendering</span>
              <select
                value={gfx.mode}
                onChange={(e) => {
                  const mode = e.target.value as GraphicsMode;
                  backend
                    .setGraphicsMode(mode)
                    .then(() => setGfx((g) => (g ? { ...g, mode } : g)))
                    .catch((err) => showToast(`Couldn't save the graphics setting: ${err}`));
                }}
              >
                <option value="auto">Automatic</option>
                <option value="gpu">Prefer the graphics card (GPU)</option>
                <option value="software">Software (CPU only)</option>
              </select>
            </label>
            <p className="small muted">
              Choose “Prefer the graphics card” if the map is slow or your GPU sits idle; choose “Software” if the window is blank or flickers.
              Turn on “Show frame rate” in Map options to compare.
            </p>
            {gfx.forced && (
              <p className="small">
                The <code>VRC_FRIEND_MAP_GPU</code> environment variable is set to <code>{gfx.forced}</code> and overrides this choice.
              </p>
            )}
            {gfxStart !== null && gfxStart !== gfx.mode && !gfx.forced && (
              <div className="row">
                <span className="small">Restart the app for this to take effect.</span>
                <button
                  className="btn"
                  onClick={async () => {
                    try {
                      await flushSaves();
                      await backend.restartApp();
                    } catch (err) {
                      showToast(`Couldn't restart: ${err}`);
                    }
                  }}
                >
                  Restart now
                </button>
              </div>
            )}
          </Sec>
        )}

        <Sec id="people" cat="people" title="People who aren't friends" keys="strangers blocked profiles cache">
          <PeopleSection />
        </Sec>

        {wheelFixHere && (
          <Sec id="wheel" cat="performance" title="Mouse wheel" keys="scroll zoom wheel mouse touchpad x11 xlibre input not working">
            <WheelFixSection />
          </Sec>
        )}
        <Sec id="diagnostics" cat="performance" title="Diagnostics" keys="fps gpu benchmark debug">
          <Diagnostics />
        </Sec>

        <Sec id="notify" cat="sounds" title="Notifications" keys="sound notification volume chime online offline alert mute ping tune friend added removed joined left world once date waiting">
          <NotificationsSection />
        </Sec>
        {isTauri && !isMobile && (
          <Sec id="close" cat="sounds" title="Closing the window" keys="tray minimize background close quit exit">
            <CloseSection />
          </Sec>
        )}

        <Sec id="logs" cat="logs" title="Game logs" keys="log folder steam instance here live">
          <GameLogSection />
        </Sec>

        <Sec id="groups" cat="logs" title="Friend group detection" keys="circles suggestions automatic">
          <GroupSection />
        </Sec>

        <Sec id="data" cat="account" title="Local data" keys="storage cache delete backup folder">
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
        </Sec>
        <Sec id="about" cat="account" title="About" keys="version">
          <h3>About</h3>
          <p className="small muted">VRC Friend Map {__APP_VERSION__}. Not affiliated with VRChat Inc.</p>
        </Sec>
            </SecContext.Provider>
          </div>
        </div>
      </div>
    </div>
  );
}

type Cat = "appearance" | "performance" | "people" | "logs" | "sharing" | "sounds" | "account";
const CATS: { id: Cat; label: string; icon: string }[] = [
  { id: "appearance", label: "Appearance", icon: "eye" },
  { id: "performance", label: "Performance", icon: "rocket" },
  { id: "people", label: "People", icon: "users" },
  { id: "logs", label: "Game logs & groups", icon: "clock" },
  { id: "sharing", label: "Sharing & servers", icon: "server" },
  { id: "sounds", label: "Notifications", icon: "sound" },
  { id: "account", label: "Account & data", icon: "user" },
];

interface SecInfo {
  cat: Cat;
  title: string;
  keys: string;
  el: HTMLElement | null;
}
interface SecCtx {
  visible: (id: string, cat: Cat) => boolean;
  order: (id: string) => number;
  register: (id: string, info: SecInfo | null) => void;
}
const SecContext = createContext<SecCtx | null>(null);

/** One settings section: shown in its category, or when it matches the search. */
function Sec({ id, cat, title, keys, children }: { id: string; cat: Cat; title: string; keys: string; children: React.ReactNode }) {
  const ctx = useContext(SecContext)!;
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    ctx.register(id, { cat, title, keys, el: ref.current });
    return () => ctx.register(id, null);
  });
  const shown = ctx.visible(id, cat);
  return (
    <section ref={ref} className={`settings-sec ${shown ? "" : "hidden"}`} style={{ order: ctx.order(id) }} data-sec={id}>
      {children}
    </section>
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
      <label className="check">
        <input type="checkbox" checked={ls.live} disabled={!ls.enabled} onChange={(e) => updateLogSettings({ live: e.target.checked })} />
        Show who's in my instance right now (follows the log while VRChat runs)
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
      <label className="check">
        <input type="checkbox" checked={g.useLogs} onChange={(e) => set({ useLogs: e.target.checked })} />
        Use my game logs (time friends spent in instances with me, PC only)
      </label>
      <label className="check">
        <input type="checkbox" checked={g.useLive} onChange={(e) => set({ useLive: e.target.checked })} />
        Use friends' live locations (time friends spend in the same instance, even without me; counted while this app is open, any
        device; private instances can't be seen)
      </label>
      <button className="btn small" onClick={() => forgetObserved()}>
        Forget friend-location history
      </button>
      <p className="small muted">
        Suggestions come from who spends time in the same instance. Two people count as connected when they spent enough time together on
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

function ServersSummary() {
  const servers = useApp((s) => s.settings.sharing.servers);
  const shared = useApp((s) => s.shared);
  const people = new Set(Object.values(shared?.items ?? {}).map((i) => i.owner)).size;
  const loggers = servers.filter((s) => s.loggerOwner);
  return (
    <>
      <p className="small">
        {servers.length
          ? `${servers.length} server${servers.length === 1 ? "" : "s"}: ${servers.map(serverName).join(", ")}. ${people} ${people === 1 ? "person shares" : "people share"} with you${loggers.length ? `; logging on ${loggers.map(serverName).join(", ")}` : ""}.`
          : "Share friend lists and activity with friends through vfm-servers (end-to-end encrypted), and let a spare device log your friends' instance hopping 24/7 for better circle suggestions."}
      </p>
      <button className="btn" onClick={openServers}>
        <Icon name="server" size={16} /> {servers.length ? "Manage servers" : "Set up"}
      </button>
    </>
  );
}

function PeopleSection() {
  const people = useApp((s) => s.settings.people);
  const blocked = useApp((s) => Object.values(s.cache.moderations?.byUser ?? {}).filter((t) => t.includes("block")).length);
  return (
    <>
      <h3>People who aren't friends</h3>
      <label className="check">
        <input type="checkbox" checked={people.loadEveryone} onChange={(e) => updatePeople({ loadEveryone: e.target.checked })} />
        Load the profile of everyone in my instance (otherwise the first 25)
      </label>
      <label className="field narrow">
        <span>Keep their profiles on this device</span>
        <select value={people.keep} onChange={(e) => updatePeople({ keep: e.target.value as typeof people.keep })}>
          <option value="none">Don't keep (only while the app is open)</option>
          <option value="potential">Only potential friends</option>
          <option value="everyone">Everyone</option>
        </select>
      </label>
      <p className="small muted">
        Potential friends: people who share friends with you or who you've spent time with (game logs). Kept profiles are refreshed after a
        week; the others load again when you meet them.
      </p>
      <label className="check">
        <input type="checkbox" checked={people.showBlocked} onChange={(e) => updatePeople({ showBlocked: e.target.checked })} />
        Show people I've blocked{blocked ? ` (${blocked})` : ""}
      </label>
    </>
  );
}
