import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { NO_OWN_COLORS, type OwnColors } from "../owncolors";
import { scoreSection } from "../settingsSearch";
import { backend, imgSrc, isMobile, type GraphicsInfo, type GraphicsMode } from "../backend";
import { iconUrl, STATUS_LABEL, statusColor } from "../model";
import { forgetLogHistory, logsSupported, naiveToDate, scanLogs } from "../logs";
import { exitDemo, logoutAll, logoutCarriers, logoutEverywhere, wipeEverything } from "../session";
import { flushSaves, setState, showToast, updatePeople, updateGroupSettings, updateLocal, updateLogSettings, updateMap, updateSettings, updateUi, useApp } from "../store";
import { CloseSection, NotificationsSection } from "./NotificationsSection";
import { WheelFixSection } from "./WheelFixSection";
import { AgeSection } from "./AgeSection";
import { checkForUpdate } from "../updates";
import { wheelFixHere } from "../wheelfix";
import { forgetObserved } from "../together";
import type { GroupSettings, MapSettings, Theme } from "../types";

import { CAT_ACCENTS, CAT_FLAVORS, CAT_LABEL, CAT_PALETTES, isCatFlavor } from "../catppuccin";
const THEMES: { value: Theme; label: string; bg: string; panel: string; accent: string }[] = [
  { value: "dark", label: "Dark", bg: "#070b0f", panel: "#131c24", accent: "#19c3b1" },
  { value: "oled", label: "OLED black", bg: "#000000", panel: "#0e1215", accent: "#19c3b1" },
  { value: "graphite", label: "Graphite (grey)", bg: "#1c1c1f", panel: "#2a2a2f", accent: "#d4d4d8" },
  { value: "light", label: "Light", bg: "#eef2f5", panel: "#ffffff", accent: "#0f9d8f" },
  ...CAT_FLAVORS.slice()
    .reverse()
    .map((f) => ({ value: f as Theme, label: `Catppuccin ${CAT_LABEL[f]}`, bg: CAT_PALETTES[f].base, panel: CAT_PALETTES[f].surface0, accent: CAT_PALETTES[f].mauve })),
  { value: "nord", label: "Nord", bg: "#2e3440", panel: "#3b4252", accent: "#88c0d0" },
  { value: "dracula", label: "Dracula", bg: "#21222c", panel: "#44475a", accent: "#bd93f9" },
  { value: "tokyonight", label: "Tokyo Night", bg: "#1a1b26", panel: "#24283b", accent: "#7aa2f7" },
  { value: "gruvbox", label: "Gruvbox", bg: "#282828", panel: "#3c3836", accent: "#fabd2f" },
  { value: "rosepine", label: "Rosé Pine", bg: "#191724", panel: "#26233a", accent: "#c4a7e7" },
  { value: "onedark", label: "One Dark", bg: "#282c34", panel: "#2c313a", accent: "#61afef" },
  { value: "everforest", label: "Everforest", bg: "#2d353b", panel: "#343f44", accent: "#a7c080" },
  { value: "solarized", label: "Solarized dark", bg: "#002b36", panel: "#073642", accent: "#2aa198" },
  { value: "solarizedlight", label: "Solarized light", bg: "#fdf6e3", panel: "#fffbef", accent: "#268bd2" },
];
import { Icon } from "./Icon";
import { Diagnostics } from "./Diagnostics";
import { FrameRateSection } from "./FrameRateSection";
import { openServers } from "./ServersModal";
import { serverName } from "../share";
import { unavailable } from "../platform";
import { haptic } from "../haptics";
import { bioProgress } from "../biocache";
import { PhoneSection } from "./PhoneSection";
import { BackupSection, NowPlayingSection, PlaytimeSection } from "./ExtrasSection";
import { AccountsSection } from "./AccountsSection";
import { ServersPage } from "../ui2/ServersPage";
import { betaActive } from "../ui2/active";
import { SECTION_INFO } from "../ui2/sectionInfo";
import { flagLine } from "../notesline";
import { loadSlots, saveSlot, type MessageSlot } from "../invites";
import type { UiSettings } from "../types";
import { Range } from "./Range";

function NotesLineSection() {
  const n = useApp((s) => s.settings.notesLine);
  const set = (patch: Partial<typeof n>) => updateSettings({ notesLine: { ...n, ...patch } });
  const example = flagLine(
    { mine: ["crasher", "trolling"], blocks: [{ by: "Luna", reasons: ["loud-music"] }, { by: "Kai", reasons: [] }], removedBy: ["Mo"], distance: 0 },
    n.mode === "off" ? { ...n, mode: "friends" } : n,
  );
  return (
    <>
      <h3>Red flags in VRChat notes</h3>
      <p className="small muted">
        Writes a short line at the top of your VRChat note on people with red flags (why you blocked them, friends' shared blocks and removals),
        so you see it in game on their profile. Your own note text moves below it and is never changed. Nothing about age goes there.
      </p>
      <label className="field narrow">
        <span>Line in the note</span>
        <select value={n.mode} onChange={(e) => set({ mode: e.target.value as typeof n.mode })}>
          <option value="off">Off</option>
          <option value="mine">Only my block reasons</option>
          <option value="friends">Mine, and how many friends blocked or removed them</option>
          <option value="full">Mine and each friend's, with names</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={n.compact} onChange={(e) => set({ compact: e.target.checked })} />
        Compact (short words, fits better)
      </label>
      <p className="small">
        Example: <code>{example}</code>
      </p>
      <p className="small muted">
        Updated every 20 minutes, a few notes at a time. Turning it off removes the lines again. Block reasons: asked after you block someone
        (here or in game); shared with friends only per server (Servers → <i>Why I blocked people</i>).
      </p>
    </>
  );
}

function InviteMessagesSection() {
  const demo = useApp((s) => s.demo);
  const [kind, setKind] = useState<"request" | "message">("request");
  const [slots, setSlots] = useState<MessageSlot[] | null>(null);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<{ slot: number; text: string } | null>(null);
  const load = (k = kind) => {
    setErr("");
    setSlots(null);
    loadSlots(k).then(setSlots, (e) => setErr(String(e instanceof Error ? e.message : e)));
  };
  return (
    <>
      <h3>Invite messages</h3>
      <p className="small muted">
        VRChat keeps 12 saved messages for asking for an invite and 12 for invites you send; each can be changed once an hour. Saved ones show up
        on profiles under <i>Request invite → With message</i>.
      </p>
      <div className="row">
        <div className="seg">
          <button className={kind === "request" ? "on" : ""} aria-pressed={kind === "request"} onClick={() => { setKind("request"); if (slots) load("request"); }}>
            Asking for an invite
          </button>
          <button className={kind === "message" ? "on" : ""} aria-pressed={kind === "message"} onClick={() => { setKind("message"); if (slots) load("message"); }}>
            Invites I send
          </button>
        </div>
        <button className="btn small" disabled={demo} onClick={() => load()}>
          {slots ? "Reload" : "Load from VRChat"}
        </button>
      </div>
      {err && <p className="small warn">{err}</p>}
      {slots && (
        <ul className="slot-list">
          {slots.map((sl) => (
            <li key={sl.slot}>
              <span className="muted small">{sl.slot + 1}.</span>
              {edit?.slot === sl.slot ? (
                <>
                  <input value={edit.text} maxLength={64} autoFocus onChange={(e) => setEdit({ slot: sl.slot, text: e.target.value })} />
                  <button
                    className="btn small primary"
                    onClick={async () => {
                      const e2 = await saveSlot(kind, sl.slot, edit.text);
                      if (e2) showToast(`Couldn't save: ${e2}`);
                      else {
                        setEdit(null);
                        load();
                      }
                    }}
                  >
                    Save
                  </button>
                  <button className="btn small" onClick={() => setEdit(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="grow">{sl.message || <i className="muted">empty</i>}</span>
                  {sl.cooldown > 0 ? (
                    <span className="small muted">can change in {sl.cooldown} min</span>
                  ) : (
                    <button className="btn small ghost" onClick={() => setEdit({ slot: sl.slot, text: sl.message })}>
                      Change
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function BioSection() {
  const b = useApp((s) => s.settings.bios);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);
  const p = bioProgress();
  return (
    <>
      <h3>Reading bios in the background</h3>
      <label className="check">
        <input type="checkbox" checked={b.background} onChange={(e) => updateSettings({ bios: { ...b, background: e.target.checked } })} />
        Slowly read everyone's profile (bio, links, languages) in the background
      </label>
      <label className="field narrow">
        <span>One person every {b.everySecs} s</span>
        <Range min={10} max={300} step={5} value={b.everySecs} disabled={!b.background} onChange={(e) => updateSettings({ bios: { ...b, everySecs: Number(e.target.value) } })} />
      </label>
      <p className="small muted">
        So profiles open with their bio right away, and age hints and time zone guesses are ready. Friends first (online ones before offline),
        then people you've met. Waits while a sync runs. {p.total > 0 && <b>{p.done} of {p.total} up to date.</b>}
      </p>
    </>
  );
}

function InterfaceSection() {
  const ui = useApp((s) => s.settings.ui);
  const set = (patch: Partial<UiSettings>) => updateUi(patch);
  return (
    <>
      <h3>Interface</h3>
      <label className="check">
        <input type="checkbox" checked={ui.hideUnavailable} onChange={(e) => set({ hideUnavailable: e.target.checked })} />
        Hide features not available on this platform
      </label>
      <p className="small muted">Off: they're shown greyed out, with why they can't work here.</p>
      {(!unavailable("haptics") || !ui.hideUnavailable) && (
        <label className={`check ${unavailable("haptics") ? "dim" : ""}`}>
          <input
            type="checkbox"
            checked={ui.haptics}
            disabled={!!unavailable("haptics")}
            onChange={(e) => {
              set({ haptics: e.target.checked });
              if (e.target.checked) haptic("toggle", true);
            }}
          />
          Vibrate on taps and toggles (haptics){unavailable("haptics") ? ` – ${unavailable("haptics")}` : ""}
        </label>
      )}
      <div className="row">
        <label className="field narrow">
          <span>Text size: {Math.round(ui.textScale * 100)} %</span>
          <Range min={0.8} max={1.6} step={0.05} value={ui.textScale} onChange={(e) => set({ textScale: Number(e.target.value) })} />
        </label>
        <label className="field narrow">
          <span>Animations</span>
          <select value={ui.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.value as UiSettings["reducedMotion"] })}>
            <option value="system">Like the system</option>
            <option value="on">Fewer animations</option>
            <option value="off">All animations</option>
          </select>
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={ui.colorblind} onChange={(e) => set({ colorblind: e.target.checked })} />
        Color-blind friendly status colors (online / offline also differ in brightness and shape)
      </label>
      <label className="check">
        <input type="checkbox" checked={!ui.beta} onChange={(e) => set({ beta: !e.target.checked })} />
        Classic interface
      </label>
      <p className="small muted">
        The older layout, for now. The new interface is the default and where new things land; the classic one will go away later. Only this device
        switches (you can also start the app with <code>--classic-ui</code>).
      </p>
    </>
  );
}

export function SettingsModal() {
  const settings = useApp((s) => s.settings);
  const session = useApp((s) => s.session);
  const demo = useApp((s) => s.demo);
  const tab = useApp((s) => s.settingsTab);
  const [info, setInfo] = useState<{ data_dir: string; image_cache_bytes: number } | null>(null);
  const [gfx, setGfx] = useState<GraphicsInfo | null>(null);
  const [gfxStart, setGfxStart] = useState<GraphicsMode | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [cat, setCat] = useState<string>("appearance");
  const [query, setQuery] = useState("");
  const [scores, setScores] = useState<Record<string, number> | null>(null);
  const sections = useRef(new Map<string, { cat: Cat; title: string; keys: string; el: HTMLElement | null }>());
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Phones (new interface): a list of pages first, like a phone's own settings; one page at a time.
  const phone = betaActive() && isMobile;
  const [phoneList, setPhoneList] = useState(true);

  useEffect(() => {
    backend.storageInfo().then(setInfo).catch(() => setInfo(null));
    backend.graphicsInfo().then((g) => { setGfx(g); setGfxStart(g?.mode ?? null); }).catch(() => setGfx(null));
  }, []);

  // Opened for a specific part (e.g. from group suggestions).
  useEffect(() => {
    if (tab !== "general") {
      const id = tab;
      const c = betaActive() ? (BETA_OF[id] ?? null) : (sections.current.get(id)?.cat ?? (id === "groups" || id === "logs" ? "logs" : null));
      if (c) {
        setCat(c);
        setPhoneList(false);
      }
      requestAnimationFrame(() => sections.current.get(id)?.el?.scrollIntoView({ block: "start" }));
      setState({ settingsTab: "general" });
    }
  }, [tab]);

  // Phones: each page opens at its top (the body keeps its scroll while hidden behind the list).
  useLayoutEffect(() => {
    if (phone && !phoneList) bodyRef.current?.scrollTo({ top: 0 });
  }, [phone, phoneList, cat]);

  // Phones: the back gesture on a page goes back to the list (one history entry per open page;
  // left another way, the entry stays but is neutralized, as with the person sheet).
  useEffect(() => {
    if (!phone || phoneList) return;
    if (!history.state?.vfmSetPage) history.pushState({ vfmSetPage: true }, "");
    const onPop = () => setPhoneList(true);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (history.state?.vfmSetPage) history.replaceState(null, "");
    };
  }, [phone, phoneList]);

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
  const beta = betaActive();
  const pick = (c: string) => {
    setQuery("");
    setCat(c);
    setPhoneList(false);
    bodyRef.current?.scrollTo({ top: 0 });
  };
  const ranked = scores ? Object.entries(scores).sort((a, b) => b[1] - a[1]) : [];
  const jump = (id: string) => {
    const sec = sections.current.get(id);
    if (!sec) return;
    setQuery("");
    setCat(betaActive() ? (BETA_OF[id] ?? "appearance") : sec.cat);
    setPhoneList(false);
    requestAnimationFrame(() => sec.el?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };
  const ctx: SecCtx = {
    visible: (id, c) => (scores ? id in scores : betaActive() ? BETA_OF[id] === cat : c === cat),
    order: (id) => (scores ? ranked.findIndex(([x]) => x === id) : 0),
    register: (id, info) => {
      if (info) sections.current.set(id, info);
      else sections.current.delete(id);
    },
  };

  const searchBox = (
    <div className="settings-search">
      <Icon name="search" size={16} />
      <input
        ref={searchRef}
        autoFocus={!/Android|iPhone|iPad/i.test(navigator.userAgent)}
        value={query}
        placeholder={beta ? "Search settings" : "Search settings (e.g. theme, fps, sound, blocked)"}
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
  );
  const page = BETA_PAGES.find((p) => p.id === cat) ?? BETA_PAGES[2];

  return (
    <div
      className={`modal-backdrop ${beta ? "ui2-settings" : ""} ${phone ? (phoneList ? `ph-list ${scores ? "searching" : ""}` : "ph-page") : ""}`}
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="modal settings-modal" role="dialog" aria-label="Settings">
        {phone && (
          <div className="ui2-set-bar">
            {phoneList ? (
              <span />
            ) : (
              <button className="ui2-set-back" aria-label="Back to settings" onClick={() => setPhoneList(true)}>
                <Icon name="chevron-left" size={22} />
              </button>
            )}
            <h2>{phoneList || scores ? "Settings" : page.label}</h2>
            <button className="ui2-set-x" aria-label="Close settings" onClick={close}>
              <Icon name="close" size={20} />
            </button>
          </div>
        )}
        {!beta && (
        <div className="modal-head settings-head">
          <h2>Settings</h2>
          {!beta && searchBox}
          <button className="icon-btn" onClick={close} title="Close (Esc)" aria-label="Close settings">
            <Icon name="close" />
          </button>
        </div>
        )}
        <div className="settings-layout">
          {beta ? (
            <div className="ui2-set-side">
              <nav className="settings-nav" aria-label="Settings sections" data-arrows="v">
                {searchBox}
                <AccountCard onOpen={() => pick("account")} />
                {BETA_GROUPS.map((g) => (
                  <div key={g.label} className="settings-group">
                    {g.label !== "User" && (
                      <span className="settings-group-head">
                        <Icon name={g.icon} size={14} /> {g.label}
                      </span>
                    )}
                    {BETA_PAGES.filter((p) => p.group === g.label).map((p) => {
                      const hits = scores ? ranked.filter(([id]) => BETA_OF[id] === p.id).length : 0;
                      return (
                        <button key={p.id} className={`settings-cat ${!scores && cat === p.id ? "on" : ""} ${scores && !hits ? "dim" : ""}`} aria-current={!scores && cat === p.id ? "page" : undefined} onClick={() => pick(p.id)}>
                          <Icon name={p.icon} size={18} />
                          <span>{p.label}</span>
                          {scores && hits > 0 && <span className="settings-hits">{hits}</span>}
                          {phone && <Icon name="chevron-right" size={16} />}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </nav>
            </div>
          ) : (
          <nav className="settings-nav" aria-label="Settings categories">
            {CATS.map((c) => {
              const hits = scores ? ranked.filter(([id]) => sections.current.get(id)?.cat === c.id).length : 0;
              return (
                <button
                  key={c.id}
                  className={`settings-cat ${!scores && cat === c.id ? "on" : ""} ${scores && !hits ? "dim" : ""}`}
                  onClick={() => pick(c.id)}
                >
                  <Icon name={c.icon} size={16} />
                  <span>{c.label}</span>
                  {scores && hits > 0 && <span className="settings-hits">{hits}</span>}
                </button>
              );
            })}
          </nav>
          )}
          <div className="settings-body" ref={bodyRef}>
            <div className="ui2-set-page" key={beta ? cat : undefined}>
            {beta && !scores && (
              <header className="ui2-page-head">
                <h1>
                  <span className="ui2-page-icon">
                    <Icon name={page.icon} size={22} />
                  </span>
                  {page.label}
                </h1>
                <p>{page.about}</p>
              </header>
            )}
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
        <Sec id="account" cat="account" title="Account" keys="login log out sign out user everywhere hacked compromised sessions password">
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
          {!demo && <LogoutEverywhere />}
        </Sec>

        <Sec id="servers" cat="sharing" title="Servers and sharing" keys="server sync share encryption logger">
          <h3>
            <Icon name="server" size={16} /> Servers and sharing
          </h3>
          {betaActive() ? <ServersPage /> : <ServersSummary />}
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
            <Range min={1000} max={4000} step={100} value={settings.intervalMs} onChange={(e) => updateSettings({ intervalMs: Number(e.target.value) })} />
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

        <Sec id="interface" cat="appearance" title="Interface" keys="hide unavailable platform haptics vibration beta new ui text size font motion animation color blind accessibility">
          <InterfaceSection />
        </Sec>

        <Sec id="display" cat="appearance" title="Themes" keys="theme colors dark light style look catppuccin accent latte frappe macchiato mocha graphite grey gray tokyo night gruvbox rose pine one dark everforest solarized nord dracula">
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
                  <span>{t.label}</span>
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
          <OwnColorsField />
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

        <Sec id="age" cat="people" title="Age hints" keys="age minor adult 18 underage kids safety notes vouch distance friend request warning">
          <AgeSection />
        </Sec>
        <Sec id="redflags" cat="people" title="Red flags in VRChat notes" keys="block reasons red flag note in game vrchat notes removed blocked">
          <NotesLineSection />
        </Sec>
        <Sec id="invites" cat="people" title="Invite messages" keys="invite request message template slot">
          <InviteMessagesSection />
        </Sec>
        <Sec id="bios" cat="people" title="Reading bios in the background" keys="bio profile background cache preload slow">
          <BioSection />
        </Sec>
        <Sec id="people" cat="people" title="People who aren't friends" keys="strangers blocked profiles cache">
          <PeopleSection />
        </Sec>

        <Sec id="wheel" cat="performance" title="Mouse wheel" keys="scroll zoom wheel mouse touchpad x11 xlibre input not working" unavailable={wheelFixHere ? null : unavailable("wheelFix") ?? "Only needed on Linux (X11)."}>
          <WheelFixSection />
        </Sec>
        <Sec id="diagnostics" cat="performance" title="Diagnostics" keys="fps gpu benchmark debug">
          <Diagnostics />
        </Sec>

        <Sec id="notify" cat="sounds" title="Notifications" keys="sound notification volume chime online offline alert mute ping tune friend added removed joined left world once date waiting">
          <NotificationsSection />
        </Sec>
        <Sec id="phone" cat="sounds" title="Phone in the background" keys="android background service push unifiedpush sunup ntfy battery refresh rate 120hz widget root quest singularity logs" unavailable={unavailable("backgroundService")}>
          <PhoneSection />
        </Sec>
        <Sec id="close" cat="sounds" title="Closing the window" keys="tray minimize background close quit exit" unavailable={unavailable("closeWindow")}>
          <CloseSection />
        </Sec>

        <Sec id="logs" cat="logs" title="Game logs" keys="log folder steam instance here live" unavailable={unavailable("gameLogs")}>
          <GameLogSection />
        </Sec>

        <Sec id="groups" cat="logs" title="Friend group detection" keys="circles suggestions automatic">
          <GroupSection />
        </Sec>

        <Sec id="nowplaying" cat="account" title="Now playing in your status" keys="music song spotify mpris playerctl status text" unavailable={unavailable("mpris")}>
          <NowPlayingSection />
        </Sec>
        <Sec id="playtime" cat="account" title="Steam play time in your bio" keys="steam hours play time bio" unavailable={unavailable("steam")}>
          <PlaytimeSection />
        </Sec>
        <Sec id="accounts" cat="account" title="Your other accounts" keys="multiple accounts alt second account main switch act as crossover">
          <AccountsSection />
        </Sec>
        <Sec id="backup" cat="account" title="Backup to another device" keys="backup export import restore move device encrypted password file">
          <BackupSection />
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
        <Sec id="updates" cat="account" title="Updates" keys="update upgrade new version download install release">
          <UpdatesSection />
        </Sec>
        <Sec id="about" cat="account" title="About" keys="version">
          <h3>About</h3>
          <p className="small muted">VRC Friend Map {__APP_VERSION__} (build {__APP_BUILD__}). Not affiliated with VRChat Inc.</p>
        </Sec>
            </SecContext.Provider>
            </div>
            {beta && !phone && (
              <div className="ui2-set-close">
                <button onClick={close} title="Close (Esc)" aria-label="Close settings">
                  <Icon name="close" size={18} />
                </button>
                <span>ESC</span>
              </div>
            )}
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

const OWN_COLOR_FIELDS: { key: keyof OwnColors; label: string }[] = [
  { key: "accent", label: "Accent" },
  { key: "bg", label: "Background" },
  { key: "panel", label: "Panels" },
  { key: "text", label: "Text" },
];

/** Appearance: pick your own main colors on top of the theme; each can go back to the theme's. */
function OwnColorsField() {
  const own = useApp((s) => s.settings.ownColors);
  const set = (k: keyof OwnColors, v: string) => updateSettings({ ownColors: { ...own, [k]: v } });
  // What the theme shows right now, so the picker starts there.
  const cs = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const shown = (k: keyof OwnColors) => {
    const v = (cs?.getPropertyValue({ accent: "--accent", bg: "--bg", panel: "--panel", text: "--text" }[k]) ?? "").trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v : "#808080";
  };
  const any = OWN_COLOR_FIELDS.some((f) => own[f.key]);
  return (
    <div className="field">
      <span>Your own colors (on top of the theme)</span>
      <div className="own-colors">
        {OWN_COLOR_FIELDS.map((f) => (
          <label key={f.key} className="own-color">
            <input type="color" value={own[f.key] || shown(f.key)} onChange={(e) => set(f.key, e.target.value)} aria-label={`${f.label} color`} />
            <span>{f.label}</span>
            {own[f.key] && (
              <button type="button" className="btn link small" onClick={() => set(f.key, "")} title="Back to the theme's color">
                Reset
              </button>
            )}
          </label>
        ))}
      </div>
      {any && (
        <button type="button" className="btn small ghost" onClick={() => updateSettings({ ownColors: { ...NO_OWN_COLORS } })}>
          Use the theme's colors again
        </button>
      )}
    </div>
  );
}

/** New interface: settings pages in groups (User, App, People, Connect, Advanced), like Discord. */
const BETA_PAGES: { id: string; group: string; label: string; icon: string; about: string }[] = [
  { id: "account", group: "User", label: "My account", icon: "user", about: "Your VRChat login and what this app asks VRChat for." },
  { id: "status", group: "User", label: "Status extras", icon: "star", about: "Things the app can put into your VRChat status or bio." },
  { id: "appearance", group: "App", label: "Appearance", icon: "eye", about: "Theme, colours and how the map and profiles look." },
  { id: "performance", group: "App", label: "Performance", icon: "rocket", about: "How smooth the map is and how much power it uses." },
  { id: "notify", group: "App", label: "Notifications & sounds", icon: "bell", about: "What you hear and see when friends do things." },
  { id: "people", group: "People", label: "People & safety", icon: "shield", about: "Hints about people, and who shows up at all." },
  { id: "invites", group: "People", label: "Invite messages", icon: "user-plus", about: "Ready-made messages for invites and requests." },
  { id: "logs", group: "People", label: "Game logs & groups", icon: "clock", about: "Reading VRChat's log files on this computer." },
  { id: "servers", group: "Connect", label: "Sharing & servers", icon: "server", about: "Share with friends, sync your devices, log around the clock." },
  { id: "devices", group: "Connect", label: "Devices & backup", icon: "phone", about: "Keep your phone and PC in step." },
  { id: "data", group: "Advanced", label: "Local data", icon: "folder", about: "Everything stored on this device." },
  { id: "diagnostics", group: "Advanced", label: "Diagnostics", icon: "chart", about: "Numbers that help find bugs." },
  { id: "updates", group: "Advanced", label: "Updates", icon: "download", about: "Checks GitHub for new versions." },
  { id: "about", group: "Advanced", label: "About", icon: "info", about: "Version, build and links." },
];
const BETA_GROUPS: { label: string; icon: string }[] = [
  { label: "User", icon: "user" },
  { label: "App", icon: "sliders" },
  { label: "People", icon: "users" },
  { label: "Connect", icon: "link" },
  { label: "Advanced", icon: "key" },
];
/** Which page each section is on in the new interface. */
const BETA_OF: Record<string, string> = {
  account: "account", requests: "account", accounts: "account",
  nowplaying: "status", playtime: "status",
  interface: "appearance", display: "appearance", mapdisplay: "appearance",
  framerate: "performance", graphics: "performance", wheel: "performance",
  notify: "notify", phone: "notify", close: "notify",
  age: "people", redflags: "people", bios: "people", people: "people",
  invites: "invites",
  logs: "logs", groups: "logs",
  servers: "servers",
  backup: "devices",
  data: "data",
  diagnostics: "diagnostics",
  updates: "updates",
  about: "about",
};

/** "Log out everywhere", with what it can and can't do (VRChat has no "end all sessions"). */
function LogoutEverywhere() {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const carriers = logoutCarriers();
  return (
    <div className="logout-everywhere">
      <h4 className="sub-h">Log out everywhere</h4>
      <p className="small muted">
        Logs out this device and every other device of yours where this app syncs with it
        {carriers.length ? ` (through ${carriers.map((s) => serverName(s)).join(", ")}, or directly at home)` : " (needs a server that syncs your devices; without one, only this device)"}. Devices
        that are off log out at their next sync.
      </p>
      <p className="small muted">
        If your account may be hacked: VRChat has no button to end every session, so also change your password on{" "}
        <button className="btn link" onClick={() => backend.openUrl("https://vrchat.com/home/profile").catch(() => {})}>
          vrchat.com
        </button>{" "}
        and turn on two-factor authentication there. A logger on your server keeps its own login: unpair it in Sharing &amp; servers.
      </p>
      {ask ? (
        <div className="row">
          <button
            className="btn danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await logoutEverywhere();
              } catch (e) {
                showToast(`Couldn't log out everywhere: ${e}`);
                setBusy(false);
              }
            }}
          >
            {busy ? "Logging out…" : "Yes, log out everywhere"}
          </button>
          <button className="btn ghost" disabled={busy} onClick={() => setAsk(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="row">
          <button className="btn" onClick={() => setAsk(true)}>
            <Icon name="logout" size={16} /> Log out everywhere…
          </button>
        </div>
      )}
    </div>
  );
}

/** New interface: you at the top of the settings sidebar (opens My account), with Log out. */
function AccountCard({ onOpen }: { onOpen: () => void }) {
  const me = useApp((s) => s.cache.me);
  const demo = useApp((s) => s.demo);
  const alts = useApp((s) => Object.keys(s.cache.alts ?? {}).length);
  const f = me?.profile;
  const src = f ? imgSrc(iconUrl(f)) : undefined;
  const ring = f ? statusColor(f, "online") : "var(--muted)";
  const status = f ? (STATUS_LABEL[f.status] ?? "Online") : demo ? "Demo mode" : "Not signed in";
  return (
    <div className="settings-account">
      <button className="settings-account-me" onClick={onOpen} title="My account">
        <span className="ui2-avatar" style={{ width: 38, height: 38, boxShadow: `0 0 0 2px var(--panel-2), 0 0 0 4px ${ring}` }}>
          {src ? <img src={src} alt="" /> : (me?.displayName?.[0] ?? "?")}
        </span>
        <span className="settings-account-text">
          <b>{me?.displayName ?? (demo ? "Demo" : "Not signed in")}</b>
          <span className="small muted">
            {status}
            {alts > 0 ? ` · ${alts + 1} accounts` : ""}
          </span>
        </span>
      </button>
      {!demo && me && (
        <button className="settings-logout" onClick={() => logoutAll(false)} title="Log out (keeps your data)">
          Log out
        </button>
      )}
    </div>
  );
}

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
function Sec({ id, cat, title, keys, children, unavailable }: { id: string; cat: Cat; title: string; keys: string; children: React.ReactNode; unavailable?: string | null }) {
  const ctx = useContext(SecContext)!;
  const hide = useApp((s) => s.settings.ui.hideUnavailable);
  const ref = useRef<HTMLElement>(null);
  const gone = !!unavailable && hide;
  useLayoutEffect(() => {
    if (gone) return;
    ctx.register(id, { cat, title, keys, el: ref.current });
    return () => ctx.register(id, null);
  });
  if (gone) return null;
  const shown = ctx.visible(id, cat);
  // Beta UI: a header with an icon and what the section is for (replaces the section's own title).
  const info = betaActive() ? SECTION_INFO[id] : undefined;
  return (
    <section ref={ref} className={`settings-sec ${shown ? "" : "hidden"} ${unavailable ? "unavailable" : ""} ${info ? "ui2-sec" : ""}`} style={{ order: ctx.order(id) }} data-sec={id}>
      {info && (
        <header className="ui2-sec-head">
          <h2>{title}</h2>
          <span className="small muted">{info.about}</span>
        </header>
      )}
      {unavailable ? (
        <>
          <p className="unavailable-note small">
            <Icon name="info" size={13} /> Not available here: {unavailable}
          </p>
          <fieldset disabled className="plain-fieldset">
            {children}
          </fieldset>
        </>
      ) : (
        children
      )}
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

function PictureFolders() {
  const ls = useApp((s) => s.settings.logs);
  const [found, setFound] = useState<string[]>([]);
  const [d, setD] = useState("");
  useEffect(() => {
    backend.picturesDetect().then(setFound, () => setFound([]));
  }, []);
  return (
    <div className="field">
      <span>Picture folders (Logbook → Pictures)</span>
      <ul className="path-list">
        {found.map((p) => (
          <li key={p}>
            <code>{p}</code> <span className="muted small">(found)</span>
          </li>
        ))}
        {ls.pictureDirs.map((p) => (
          <li key={p}>
            <code>{p}</code>
            <button className="icon-btn tiny" title="Remove" onClick={() => updateLogSettings({ pictureDirs: ls.pictureDirs.filter((x) => x !== p) })}>
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
        {!found.length && !ls.pictureDirs.length && <li className="muted small">No VRChat picture folder found automatically.</li>}
      </ul>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const v = d.trim();
          if (!v || ls.pictureDirs.includes(v)) return;
          updateLogSettings({ pictureDirs: [...ls.pictureDirs, v] });
          setD("");
        }}
      >
        <input value={d} placeholder="/path/to/Pictures/VRChat" onChange={(e) => setD(e.target.value)} />
        <button className="btn" type="submit" disabled={!d.trim()} title="Add folder">
          <Icon name="plus" size={16} />
        </button>
      </form>
    </div>
  );
}

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
      <PictureFolders />
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
        <Range min={0.4} max={2.2} step={0.05} value={g.resolution} onChange={(e) => set({ resolution: Number(e.target.value) })} />
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

function UpdatesSection() {
  const u = useApp((s) => s.settings.updates);
  const [checking, setChecking] = useState(false);
  return (
    <>
      <h3>Updates</h3>
      <label className="check">
        <input type="checkbox" checked={u.check} onChange={(e) => updateSettings({ updates: { ...u, check: e.target.checked } })} />
        Look for new versions automatically and ask me to update (every few hours, on GitHub; recommended)
      </label>
      {!u.check && (
        <p className="small warn">
          Not recommended: the app changes quickly right now, and new versions bring fixes, also for security and for changes on VRChat's side. You'll only
          hear about updates when you press Check now.
        </p>
      )}
      <div className="row">
        <button
          className="btn small"
          disabled={checking}
          onClick={async () => {
            setChecking(true);
            await checkForUpdate(true);
            setChecking(false);
          }}
        >
          <Icon name="refresh" size={14} /> {checking ? "Checking…" : "Check now"}
        </button>
        {u.skipped && (
          <button className="btn small ghost" onClick={() => updateSettings({ updates: { ...u, skipped: "" } })}>
            Offer {u.skipped} again
          </button>
        )}
      </div>
      <p className="small muted">
        Updating downloads the new version from the GitHub release, checks it against the release's checksums and installs it the way this copy
        was installed (installer, AppImage, .deb / .rpm with your password, tarball). Flatpak, Android and iPhone get a download or the
        release page instead.
      </p>
    </>
  );
}
