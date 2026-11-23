import { t as tr, lazy, tx, language } from "../i18n";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { COMPLETE, LANGUAGES, MACHINE_TRANSLATED, languageName, resolveLanguage, useT } from "../i18n";
import { NO_OWN_COLORS, type OwnColors } from "../owncolors";
import { scoreSection } from "../settingsSearch";
import { backend, imgSrc, isMobile, type GraphicsInfo, type GraphicsMode } from "../backend";
import { iconUrl, STATUS_LABEL, statusColor } from "../model";
import { forgetLogHistory, logsSupported, naiveToDate, scanLogs } from "../logs";
import { exitDemo, logoutAll, logoutCarriers, logoutEverywhere, wipeEverything } from "../session";
import { flushSaves, resetSettings, setState, showToast, updatePeople, updateGroupSettings, updateLocal, updateLogSettings, updateMap, updateSettings, updateUi, useApp } from "../store";
import { CloseSection, NotificationsSection } from "./NotificationsSection";
import { WheelFixSection } from "./WheelFixSection";
import { AgeSection } from "./AgeSection";
import { AboutSection } from "./AboutSection";
import { BlockedSection } from "./BlockedSection";
import { checkForUpdate } from "../updates";
import { wheelFixHere } from "../wheelfix";
import { forgetObserved } from "../together";
import type { GroupSettings, MapSettings, Theme } from "../types";

import { CAT_ACCENTS, CAT_FLAVORS, CAT_LABEL, CAT_PALETTES, isCatFlavor } from "../catppuccin";
const THEMES: { value: Theme; label: string; bg: string; panel: string; accent: string }[] = lazy(() => [
  { value: "dark", label: tr("settings.dark"), bg: "#070b0f", panel: "#131c24", accent: "#19c3b1" },
  { value: "oled", label: tr("settings.oledBlack"), bg: "#000000", panel: "#0e1215", accent: "#19c3b1" },
  { value: "graphite", label: tr("settings.graphiteGrey"), bg: "#1c1c1f", panel: "#2a2a2f", accent: "#d4d4d8" },
  { value: "light", label: tr("settings.light"), bg: "#eef2f5", panel: "#ffffff", accent: "#0f9d8f" },
  ...CAT_FLAVORS.slice()
    .reverse()
    .map((f) => ({ value: f as Theme, label: tr("settings.catppuccinValue", { value: CAT_LABEL[f] }), bg: CAT_PALETTES[f].base, panel: CAT_PALETTES[f].surface0, accent: CAT_PALETTES[f].mauve })),
  { value: "nord", label: tr("settings.nord"), bg: "#2e3440", panel: "#3b4252", accent: "#88c0d0" },
  { value: "dracula", label: tr("settings.dracula"), bg: "#21222c", panel: "#44475a", accent: "#bd93f9" },
  { value: "tokyonight", label: tr("settings.tokyoNight"), bg: "#1a1b26", panel: "#24283b", accent: "#7aa2f7" },
  { value: "gruvbox", label: tr("settings.gruvbox"), bg: "#282828", panel: "#3c3836", accent: "#fabd2f" },
  { value: "rosepine", label: tr("settings.rosPine"), bg: "#191724", panel: "#26233a", accent: "#c4a7e7" },
  { value: "onedark", label: tr("settings.oneDark"), bg: "#282c34", panel: "#2c313a", accent: "#61afef" },
  { value: "everforest", label: tr("settings.everforest"), bg: "#2d353b", panel: "#343f44", accent: "#a7c080" },
  { value: "solarized", label: tr("settings.solarizedDark"), bg: "#002b36", panel: "#073642", accent: "#2aa198" },
  { value: "solarizedlight", label: tr("settings.solarizedLight"), bg: "#fdf6e3", panel: "#fffbef", accent: "#268bd2" },
]);
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
      <h3>{tr("settings.redFlagsInVrchatNotes")}</h3>
      <p className="small muted">
        {tr("settings.writesAShortLineAt")}
      </p>
      <label className="field narrow">
        <span>{tr("settings.lineInTheNote")}</span>
        <select value={n.mode} onChange={(e) => set({ mode: e.target.value as typeof n.mode })}>
          <option value="off">{tr("settings.off")}</option>
          <option value="mine">{tr("settings.onlyMyBlockReasons")}</option>
          <option value="friends">{tr("settings.mineAndHowManyFriends")}</option>
          <option value="full">{tr("settings.mineAndEachFriendS")}</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={n.compact} onChange={(e) => set({ compact: e.target.checked })} />
        {tr("settings.compactShortWordsFitsBetter")}
      </label>
      <p className="small">
        Example: <code>{example}</code>
      </p>
      <p className="small muted">
        Updated every 20 minutes, a few notes at a time. Turning it off removes the lines again. Block reasons: asked after you block someone
        (here or in game); shared with friends only per server (Servers → <i>{tr("settings.whyIBlockedPeople")}</i>).
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
      <h3>{tr("settings.inviteMessages")}</h3>
      <p className="small muted">
        VRChat keeps 12 saved messages for asking for an invite and 12 for invites you send; each can be changed once an hour. Saved ones show up
        on profiles under <i>{tr("settings.requestInviteWithMessage")}</i>.
      </p>
      <div className="row">
        <div className="seg">
          <button className={kind === "request" ? "on" : ""} aria-pressed={kind === "request"} onClick={() => { setKind("request"); if (slots) load("request"); }}>
            {tr("settings.askingForAnInvite")}
          </button>
          <button className={kind === "message" ? "on" : ""} aria-pressed={kind === "message"} onClick={() => { setKind("message"); if (slots) load("message"); }}>
            {tr("settings.invitesISend")}
          </button>
        </div>
        <button className="btn small" disabled={demo} onClick={() => load()}>
          {slots ? "Reload" : tr("settings.loadFromVrchat")}
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
                      if (e2) showToast(tr("settings.couldnTSaveE2", { e2 }));
                      else {
                        setEdit(null);
                        load();
                      }
                    }}
                  >
                    {tr("settings.save")}
                  </button>
                  <button className="btn small" onClick={() => setEdit(null)}>
                    {tr("settings.cancel")}
                  </button>
                </>
              ) : (
                <>
                  <span className="grow">{sl.message || <i className="muted">empty</i>}</span>
                  {sl.cooldown > 0 ? (
                    <span className="small muted">{tr("settings.canChangeInCooldownMin", { cooldown: sl.cooldown })}</span>
                  ) : (
                    <button className="btn small ghost" onClick={() => setEdit({ slot: sl.slot, text: sl.message })}>
                      {tr("settings.change")}
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
      <h3>{tr("settings.readingBiosInTheBackground")}</h3>
      <label className="check">
        <input type="checkbox" checked={b.background} onChange={(e) => updateSettings({ bios: { ...b, background: e.target.checked } })} />
        {tr("settings.slowlyReadEveryoneSProfile")}
      </label>
      <label className="field narrow">
        <span>{tr("settings.onePersonEveryEverysecsS", { everySecs: b.everySecs })}</span>
        <Range min={10} max={300} step={5} value={b.everySecs} disabled={!b.background} onChange={(e) => updateSettings({ bios: { ...b, everySecs: Number(e.target.value) } })} />
      </label>
      <p className="small muted">
        So profiles open with their bio right away, and age hints and time zone guesses are ready. Friends first (online ones before offline),
        then people you've met. Waits while a sync runs. {p.total > 0 && <b>{tr("settings.doneOfTotalUpTo", { done: p.done, total: p.total })}</b>}
      </p>
    </>
  );
}

function InterfaceSection() {
  const ui = useApp((s) => s.settings.ui);
  const set = (patch: Partial<UiSettings>) => updateUi(patch);
  const t = useT();
  const shownLang = resolveLanguage(ui.language);
  return (
    <>
      <h3>{tr("settings.interface")}</h3>
      <label className="field narrow">
        <span>{t("language.title")}</span>
        <select value={ui.language} onChange={(e) => set({ language: e.target.value })}>
          <option value="system">{t("language.system", { name: languageName(resolveLanguage("system")) })}</option>
          {LANGUAGES.map((c) => (
            <option key={c} value={c}>
              {languageName(c)}
            </option>
          ))}
        </select>
      </label>
      <p className="small muted">
        {t("language.help")}
        {ui.language === "system" && LANGUAGES.some((c) => c !== "en" && !COMPLETE.has(c)) ? ` ${t("language.partial")}` : ""}
        {MACHINE_TRANSLATED.has(shownLang) ? ` ${t("language.machine", { name: languageName(shownLang) })}` : ""}
      </p>
      <label className="check">
        <input type="checkbox" checked={ui.hideUnavailable} onChange={(e) => set({ hideUnavailable: e.target.checked })} />
        {tr("settings.hideFeaturesNotAvailableOn")}
      </label>
      <p className="small muted">{tr("settings.offTheyReShownGreyed")}</p>
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
          <span>{tr("settings.textSizeValue", { value: Math.round(ui.textScale * 100) })}</span>
          <Range min={0.8} max={1.6} step={0.05} value={ui.textScale} onChange={(e) => set({ textScale: Number(e.target.value) })} />
        </label>
        <label className="field narrow">
          <span>{tr("settings.animations")}</span>
          <select value={ui.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.value as UiSettings["reducedMotion"] })}>
            <option value="system">{tr("settings.likeTheSystem")}</option>
            <option value="on">{tr("settings.fewerAnimations")}</option>
            <option value="off">{tr("settings.allAnimations")}</option>
          </select>
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={ui.colorblind} onChange={(e) => set({ colorblind: e.target.checked })} />
        {tr("settings.colorBlindFriendlyStatusColors")}
      </label>
      <label className="check">
        <input type="checkbox" checked={!ui.beta} onChange={(e) => set({ beta: !e.target.checked })} />
        {tr("settings.classicInterface")}
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
        placeholder={beta ? tr("settings.searchSettings") : tr("settings.searchSettingsEGTheme")}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && query) {
            e.stopPropagation();
            setQuery("");
          } else if (e.key === "Enter" && ranked[0]) jump(ranked[0][0]);
        }}
      />
      {query && (
        <button className="icon-btn small" title={tr("settings.clear")} onClick={() => setQuery("")}>
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
      <div className="modal settings-modal" role="dialog" aria-label={tr("settings.settings")}>
        {phone && (
          <div className="ui2-set-bar">
            {phoneList ? (
              <span />
            ) : (
              <button className="ui2-set-back" aria-label={tr("settings.backToSettings")} onClick={() => setPhoneList(true)}>
                <Icon name="chevron-left" size={22} />
              </button>
            )}
            <h2>{phoneList || scores ? "Settings" : page.label}</h2>
            <button className="ui2-set-x" aria-label={tr("settings.closeSettings")} onClick={close}>
              <Icon name="close" size={20} />
            </button>
          </div>
        )}
        {!beta && (
        <div className="modal-head settings-head">
          <h2>{tr("settings.settings")}</h2>
          {!beta && searchBox}
          <button className="icon-btn" onClick={close} title={tr("settings.closeEsc")} aria-label={tr("settings.closeSettings")}>
            <Icon name="close" />
          </button>
        </div>
        )}
        <div className="settings-layout">
          {beta ? (
            <div className="ui2-set-side">
              <nav className="settings-nav" aria-label={tr("settings.settingsSections")} data-arrows="v">
                {searchBox}
                <AccountCard onOpen={() => pick("account")} />
                {BETA_GROUPS.map((g) => (
                  <div key={g.label} className="settings-group">
                    {g.icon !== "user" && (
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
          <nav className="settings-nav" aria-label={tr("settings.settingsCategories")}>
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
                  <span className="small muted">{tr("settings.nothingFoundForQueryTry", { query })}</span>
                )}
              </div>
            )}
            <SecContext.Provider value={ctx}>
{/*SECTIONS*/}
        <Sec id="account" cat="account" title={tr("settings.account")} keys="login log out sign out user everywhere hacked compromised sessions password">
          <h3>{tr("settings.account")}</h3>
          {demo ? (
            <p>
              Demo mode: all data is made up.{" "}
              <button className="btn link" onClick={() => { close(); exitDemo(); }}>
                {tr("settings.leaveDemo")}
              </button>
            </p>
          ) : (
            <p>{tx("settings.loggedInAs", { name: <b>{session?.display_name ?? tr("settings.unknownName")}</b> })}</p>
          )}
          {!demo && (
            <div className="row">
              <button className="btn" onClick={() => logoutAll(false)}>
                <Icon name="logout" size={16} /> {tr("settings.logOutKeepData")}
              </button>
              <button className="btn" onClick={() => logoutAll(true)}>
                {tr("settings.logOutAndClearFriend")}
              </button>
            </div>
          )}
          {!demo && <LogoutEverywhere />}
        </Sec>

        <Sec id="servers" cat="sharing" title={tr("settings.serversAndSharing")} keys="server sync share encryption logger">
          <h3>
            <Icon name="server" size={16} /> {tr("settings.serversAndSharing")}
          </h3>
          {betaActive() ? <ServersPage /> : <ServersSummary />}
        </Sec>

        <Sec id="requests" cat="account" title={tr("settings.requestsToVrchat")} keys="api rate limit contact user agent interval refresh">
          <h3>{tr("settings.requestsToVrchat")}</h3>
          <label className="field">
            <span>{tr("settings.contactForTheUserAgent")}</span>
            <input value={settings.contact} placeholder={tr("settings.discordNameOrEmail")} onChange={(e) => updateSettings({ contact: e.target.value })} />
            <small>{tr("settings.sentWithEachRequestSo")}</small>
          </label>
          <label className="field">
            <span>{tr("settings.timeBetweenRequestsValueS", { value: (settings.intervalMs / 1000).toFixed(1) })}</span>
            <Range min={1000} max={4000} step={100} value={settings.intervalMs} onChange={(e) => updateSettings({ intervalMs: Number(e.target.value) })} />
            <small>{tr("settings.neverFasterThanOnePer")}</small>
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.autoRefresh} onChange={(e) => updateSettings({ autoRefresh: e.target.checked })} />
            {tr("settings.refreshOnlineStatusAboutEvery")}
          </label>
          <div className="row">
            <label className="field narrow">
              <span>{tr("settings.reloadProfilesAfterDays")}</span>
              <input type="number" min={1} max={60} value={settings.detailTtlDays} onChange={(e) => updateSettings({ detailTtlDays: Math.max(1, Number(e.target.value) || 7) })} />
            </label>
            <label className="field narrow">
              <span>{tr("settings.reloadMutualsAfterDays")}</span>
              <input type="number" min={1} max={60} value={settings.mutualTtlDays} onChange={(e) => updateSettings({ mutualTtlDays: Math.max(1, Number(e.target.value) || 7) })} />
            </label>
          </div>
        </Sec>

        <Sec id="interface" cat="appearance" title={tr("settings.interface")} keys="language sprache idioma langue translation hide unavailable platform haptics vibration beta new ui text size font motion animation color blind accessibility">
          <InterfaceSection />
        </Sec>

        <Sec id="display" cat="appearance" title={tr("settings.themes")} keys="theme colors dark light style look catppuccin accent latte frappe macchiato mocha graphite grey gray tokyo night gruvbox rose pine one dark everforest solarized nord dracula">
          <h3>{tr("settings.themes")}</h3>
          <div className="field">
            <span>{tr("settings.colorTheme")}</span>
            <div className="theme-grid" role="radiogroup" aria-label={tr("settings.colorTheme")}>
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
              <div className="accent-grid" role="radiogroup" aria-label={tr("settings.accentColor")}>
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

        <Sec id="mapdisplay" cat="appearance" title={tr("settings.mapAndProfiles")} keys="popup sidebar lines ring trust dim filters">
          <h3>{tr("settings.mapAndProfiles")}</h3>
          <label className="field narrow">
            <span>{tr("settings.openProfiles")}</span>
            <select value={settings.profileAs} onChange={(e) => updateSettings({ profileAs: e.target.value as "popup" | "sidebar" })}>
              <option value="popup">{tr("settings.asAPopupBestOn")}</option>
              <option value="sidebar">{tr("settings.inAPanelNextTo")}</option>
            </select>
          </label>
          <div className="row">
            <label className="field narrow">
              <span>{tr("settings.peopleWhoDonTMatch")}</span>
              <select value={settings.dimMode} onChange={(e) => updateSettings({ dimMode: e.target.value as "dim" | "hide" })}>
                <option value="dim">{tr("settings.dimThem")}</option>
                <option value="hide">{tr("settings.hideThem")}</option>
              </select>
            </label>
            <label className="field narrow">
              <span>{tr("settings.linesBetweenPeople")}</span>
              <select value={settings.map.lines} onChange={(e) => updateMap({ lines: e.target.value as MapSettings["lines"] })}>
                <option value="shared">{tr("settings.coloredByFriendsInCommon")}</option>
                <option value="plain">{tr("settings.singleColor")}</option>
                <option value="together">{tr("settings.timeTogetherGameLogs")}</option>
                <option value="none">{tr("settings.none")}</option>
              </select>
            </label>
            <label className="field narrow">
              <span>{tr("settings.ringAroundPeopleOnThe")}</span>
              <select value={settings.ringMode} onChange={(e) => updateSettings({ ringMode: e.target.value as "status" | "trust" })}>
                <option value="status">{tr("settings.onlineStatus")}</option>
                <option value="trust">{tr("settings.trustRank")}</option>
              </select>
            </label>
          </div>
          <p className="small muted">{tr("settings.moreOptionsFullPlayerCards")}</p>
        </Sec>

        <Sec id="framerate" cat="performance" title={tr("settings.frameRate")} keys="fps vsync limit power saving battery">
          <FrameRateSection gfx={gfx} />
        </Sec>

        {gfx?.supported && (
          <Sec id="graphics" cat="performance" title={tr("settings.graphics")} keys="gpu software rendering">
            <h3>{tr("settings.graphics")}</h3>
            <label className="field narrow">
              <span>{tr("settings.mapRendering")}</span>
              <select
                value={gfx.mode}
                onChange={(e) => {
                  const mode = e.target.value as GraphicsMode;
                  backend
                    .setGraphicsMode(mode)
                    .then(() => setGfx((g) => (g ? { ...g, mode } : g)))
                    .catch((err) => showToast(tr("settings.couldnTSaveTheGraphics", { error: err })));
                }}
              >
                <option value="auto">{tr("settings.automatic")}</option>
                <option value="gpu">{tr("settings.preferTheGraphicsCardGpu")}</option>
                <option value="software">{tr("settings.softwareCpuOnly")}</option>
              </select>
            </label>
            <p className="small muted">
              {tr("settings.choosePreferTheGraphicsCard")}
            </p>
            {gfx.forced && (
              <p className="small">
                The <code>{tr("settings.vrcFriendMapGpu")}</code> environment variable is set to <code>{gfx.forced}</code> {tr("settings.andOverridesThisChoice")}
              </p>
            )}
            {gfxStart !== null && gfxStart !== gfx.mode && !gfx.forced && (
              <div className="row">
                <span className="small">{tr("settings.restartTheAppForThis")}</span>
                <button
                  className="btn"
                  onClick={async () => {
                    try {
                      await flushSaves();
                      await backend.restartApp();
                    } catch (err) {
                      showToast(tr("settings.couldnTRestartError", { error: err }));
                    }
                  }}
                >
                  {tr("settings.restartNow")}
                </button>
              </div>
            )}
          </Sec>
        )}

        <Sec id="age" cat="people" title={tr("settings.ageHints")} keys="age minor adult 18 underage kids safety notes vouch distance friend request warning">
          <AgeSection />
        </Sec>
        <Sec id="blocked" cat="people" title={tr("blocked.title")} keys="blocked block list reasons why unblock delete edit people">
          <BlockedSection />
        </Sec>
        <Sec id="redflags" cat="people" title={tr("settings.redFlagsInVrchatNotes")} keys="block reasons red flag note in game vrchat notes removed blocked">
          <NotesLineSection />
        </Sec>
        <Sec id="invites" cat="people" title={tr("settings.inviteMessages")} keys="invite request message template slot">
          <InviteMessagesSection />
        </Sec>
        <Sec id="bios" cat="people" title={tr("settings.readingBiosInTheBackground")} keys="bio profile background cache preload slow">
          <BioSection />
        </Sec>
        <Sec id="people" cat="people" title={tr("settings.peopleWhoArenTFriends")} keys="strangers blocked profiles cache">
          <PeopleSection />
        </Sec>

        <Sec id="wheel" cat="performance" title={tr("settings.mouseWheel")} keys="scroll zoom wheel mouse touchpad x11 xlibre input not working" unavailable={wheelFixHere ? null : unavailable("wheelFix") ?? tr("settings.onlyNeededOnLinuxX11")}>
          <WheelFixSection />
        </Sec>
        <Sec id="diagnostics" cat="performance" title={tr("settings.diagnostics")} keys="fps gpu benchmark debug">
          <Diagnostics />
        </Sec>

        <Sec id="notify" cat="sounds" title={tr("settings.notifications")} keys="sound notification volume chime online offline alert mute ping tune friend added removed joined left world once date waiting">
          <NotificationsSection />
        </Sec>
        <Sec id="phone" cat="sounds" title={tr("settings.phoneInTheBackground")} keys="android background service push unifiedpush sunup ntfy battery refresh rate 120hz widget root quest singularity logs" unavailable={unavailable("backgroundService")}>
          <PhoneSection />
        </Sec>
        <Sec id="close" cat="sounds" title={tr("settings.closingTheWindow")} keys="tray minimize background close quit exit start hidden startup autostart" unavailable={unavailable("closeWindow")}>
          <CloseSection />
        </Sec>

        <Sec id="logs" cat="logs" title={tr("settings.gameLogs")} keys="log folder steam instance here live" unavailable={unavailable("gameLogs")}>
          <GameLogSection />
        </Sec>

        <Sec id="groups" cat="logs" title={tr("settings.friendGroupDetection")} keys="circles suggestions automatic">
          <GroupSection />
        </Sec>

        <Sec id="nowplaying" cat="account" title={tr("settings.nowPlayingInYourStatus")} keys="music song spotify mpris playerctl status text" unavailable={unavailable("mpris")}>
          <NowPlayingSection />
        </Sec>
        <Sec id="playtime" cat="account" title={tr("settings.steamPlayTimeInYour")} keys="steam hours play time bio" unavailable={unavailable("steam")}>
          <PlaytimeSection />
        </Sec>
        <Sec id="accounts" cat="account" title={tr("settings.yourOtherAccounts")} keys="multiple accounts alt second account main switch act as crossover">
          <AccountsSection />
        </Sec>
        <Sec id="backup" cat="account" title={tr("settings.backupToAnotherDevice")} keys="backup export import restore move device encrypted password file">
          <BackupSection />
        </Sec>
        <Sec id="reset" cat="account" title={tr("settings.resetTitle")} keys="reset restore default settings options factory start over">
          <ResetSettings />
        </Sec>
        <Sec id="data" cat="account" title={tr("settings.localData")} keys="storage cache delete backup folder">
          <h3>{tr("settings.localData")}</h3>
          {demo ? (
            <p className="small muted">{tr("settings.demoDataIsnTSaved")}</p>
          ) : info ? (
            <>
              <p className="small">
                Stored in <code>{info.data_dir}</code>. Image cache: {(info.image_cache_bytes / 1024 / 1024).toFixed(1)} MB. Before an update
                changes the format of your data, a copy is saved in <code>{tr("settings.storeBackups")}</code>.
              </p>
              <div className="row">
                <button className="btn" onClick={() => backend.clearImageCache().then(() => backend.storageInfo().then(setInfo))}>
                  {tr("settings.clearImageCache")}
                </button>
                {!confirmWipe ? (
                  <button className="btn danger" onClick={() => setConfirmWipe(true)}>
                    {tr("settings.deleteAllLocalData")}
                  </button>
                ) : (
                  <button className="btn danger" onClick={() => wipeEverything()}>
                    {tr("settings.yesDeleteCirclesImportsCache")}
                  </button>
                )}
              </div>
            </>
          ) : (
            <p className="small muted">{tr("settings.runningInABrowserData")}</p>
          )}
        </Sec>
        <Sec id="updates" cat="account" title={tr("settings.updates")} keys="update upgrade new version download install release">
          <UpdatesSection />
        </Sec>
        <Sec id="about" cat="account" title={tr("settings.about")} keys="version github source code release changelog bug report issue translate license">
          <h3>{tr("settings.about")}</h3>
          <AboutSection />
        </Sec>
            </SecContext.Provider>
            </div>
            {beta && !phone && (
              <div className="ui2-set-close">
                <button onClick={close} title={tr("settings.closeEsc")} aria-label={tr("settings.closeSettings")}>
                  <Icon name="close" size={18} />
                </button>
                <span>{tr("settings.esc")}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type Cat = "appearance" | "performance" | "people" | "logs" | "sharing" | "sounds" | "account";
const CATS: { id: Cat; label: string; icon: string }[] = lazy(() => [
  { id: "appearance", label: tr("settings.appearance"), icon: "eye" },
  { id: "performance", label: tr("settings.performance"), icon: "rocket" },
  { id: "people", label: tr("settings.people"), icon: "users" },
  { id: "logs", label: tr("settings.gameLogsGroups"), icon: "clock" },
  { id: "sharing", label: tr("settings.sharingServers"), icon: "server" },
  { id: "sounds", label: tr("settings.notifications"), icon: "sound" },
  { id: "account", label: tr("settings.accountData"), icon: "user" },
]);

const OWN_COLOR_FIELDS: { key: keyof OwnColors; label: string }[] = lazy(() => [
  { key: "accent", label: tr("settings.accent") },
  { key: "bg", label: tr("settings.background") },
  { key: "panel", label: tr("settings.panels") },
  { key: "text", label: tr("settings.text") },
]);

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
      <span>{tr("settings.yourOwnColorsOnTop")}</span>
      <div className="own-colors">
        {OWN_COLOR_FIELDS.map((f) => (
          <label key={f.key} className="own-color">
            <input type="color" value={own[f.key] || shown(f.key)} onChange={(e) => set(f.key, e.target.value)} aria-label={`${f.label} color`} />
            <span>{f.label}</span>
            {own[f.key] && (
              <button type="button" className="btn link small" onClick={() => set(f.key, "")} title={tr("settings.backToTheThemeS")}>
                {tr("settings.reset")}
              </button>
            )}
          </label>
        ))}
      </div>
      {any && (
        <button type="button" className="btn small ghost" onClick={() => updateSettings({ ownColors: { ...NO_OWN_COLORS } })}>
          {tr("settings.useTheThemeSColors")}
        </button>
      )}
    </div>
  );
}

/** New interface: settings pages in groups (User, App, People, Connect, Advanced), like Discord. */
const BETA_PAGES: { id: string; group: string; label: string; icon: string; about: string }[] = lazy(() => [
  { id: "account", group: tr("settings.user"), label: tr("settings.myAccount"), icon: "user", about: tr("settings.yourVrchatLoginAndWhat") },
  { id: "status", group: tr("settings.user"), label: tr("settings.statusExtras"), icon: "star", about: tr("settings.thingsTheAppCanPut") },
  { id: "appearance", group: tr("settings.app"), label: tr("settings.appearance"), icon: "eye", about: tr("settings.themeColoursAndHowThe") },
  { id: "performance", group: tr("settings.app"), label: tr("settings.performance"), icon: "rocket", about: tr("settings.howSmoothTheMapIs") },
  { id: "notify", group: tr("settings.app"), label: tr("settings.notificationsSounds"), icon: "bell", about: tr("settings.whatYouHearAndSee") },
  { id: "people", group: tr("settings.people"), label: tr("settings.peopleSafety"), icon: "shield", about: tr("settings.hintsAboutPeopleAndWho") },
  { id: "blocked", group: tr("settings.people"), label: tr("blocked.title"), icon: "lock", about: tr("sections.blockedPeople") },
  { id: "invites", group: tr("settings.people"), label: tr("settings.inviteMessages"), icon: "user-plus", about: tr("settings.readyMadeMessagesForInvites") },
  { id: "logs", group: tr("settings.people"), label: tr("settings.gameLogsGroups"), icon: "clock", about: tr("settings.readingVrchatSLogFiles") },
  { id: "servers", group: tr("settings.connect"), label: tr("settings.sharingServers"), icon: "server", about: tr("settings.shareWithFriendsSyncYour") },
  { id: "devices", group: tr("settings.connect"), label: tr("settings.devicesBackup"), icon: "phone", about: tr("settings.keepYourPhoneAndPc") },
  { id: "data", group: tr("settings.advanced"), label: tr("settings.localData"), icon: "folder", about: tr("settings.everythingStoredOnThisDevice") },
  { id: "diagnostics", group: tr("settings.advanced"), label: tr("settings.diagnostics"), icon: "chart", about: tr("settings.numbersThatHelpFindBugs") },
  { id: "updates", group: tr("settings.advanced"), label: tr("settings.updates"), icon: "download", about: tr("settings.checksGithubForNewVersions") },
  { id: "about", group: tr("settings.advanced"), label: tr("settings.about"), icon: "info", about: tr("settings.versionBuildAndLinks") },
]);
const BETA_GROUPS: { label: string; icon: string }[] = lazy(() => [
  { label: tr("settings.user"), icon: "user" },
  { label: tr("settings.app"), icon: "sliders" },
  { label: tr("settings.people"), icon: "users" },
  { label: tr("settings.connect"), icon: "link" },
  { label: tr("settings.advanced"), icon: "key" },
]);
/** Which page each section is on in the new interface. */
const BETA_OF: Record<string, string> = {
  account: "account", requests: "account", accounts: "account",
  nowplaying: "status", playtime: "status",
  interface: "appearance", display: "appearance", mapdisplay: "appearance",
  framerate: "performance", graphics: "performance", wheel: "performance",
  notify: "notify", phone: "notify", close: "notify",
  age: "people", blocked: "blocked", redflags: "people", bios: "people", people: "people",
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
      <h4 className="sub-h">{tr("settings.logOutEverywhere")}</h4>
      <p className="small muted">
        {tr("settings.logsOutThisDeviceAnd")}
        {carriers.length ? tr("settings.throughValueOrDirectlyAt", { value: carriers.map((s) => serverName(s)).join(", ") }) : tr("settings.needsAServerThatSyncs")}. Devices
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
                showToast(tr("settings.couldnTLogOutEverywhere", { error: e }));
                setBusy(false);
              }
            }}
          >
            {busy ? tr("settings.loggingOut") : tr("settings.yesLogOutEverywhere")}
          </button>
          <button className="btn ghost" disabled={busy} onClick={() => setAsk(false)}>
            {tr("settings.cancel")}
          </button>
        </div>
      ) : (
        <div className="row">
          <button className="btn" onClick={() => setAsk(true)}>
            <Icon name="logout" size={16} /> {tr("settings.logOutEverywhere2")}
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
  const status = f ? (STATUS_LABEL[f.status] ?? "Online") : demo ? tr("settings.demoMode") : tr("settings.notSignedIn");
  return (
    <div className="settings-account">
      <button className="settings-account-me" onClick={onOpen} title={tr("settings.myAccount")}>
        <span className="ui2-avatar" style={{ width: 38, height: 38, boxShadow: `0 0 0 2px var(--panel-2), 0 0 0 4px ${ring}` }}>
          {src ? <img src={src} alt="" /> : (me?.displayName?.[0] ?? "?")}
        </span>
        <span className="settings-account-text">
          <b>{me?.displayName ?? (demo ? "Demo" : tr("settings.notSignedIn"))}</b>
          <span className="small muted">
            {status}
            {alts > 0 ? tr("settings.valueAccounts", { value: alts + 1 }) : ""}
          </span>
        </span>
      </button>
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
function ResetSettings() {
  const [sure, setSure] = useState(false);
  return (
    <>
      <h3>{tr("settings.resetTitle")}</h3>
      <p className="small muted">{tr("settings.resetHelp")}</p>
      <div className="row">
        {!sure ? (
          <button className="btn" onClick={() => setSure(true)}>
            <Icon name="refresh" size={15} /> {tr("settings.resetButton")}
          </button>
        ) : (
          <>
            <button
              className="btn danger"
              onClick={() => {
                resetSettings();
                setSure(false);
                showToast(tr("settings.resetDone"));
              }}
            >
              {tr("settings.resetConfirm")}
            </button>
            <button className="btn" onClick={() => setSure(false)}>
              {tr("quickEdit.cancel")}
            </button>
          </>
        )}
      </div>
    </>
  );
}

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
      <span>{tr("settings.pictureFoldersLogbookPictures")}</span>
      <ul className="path-list">
        {found.map((p) => (
          <li key={p}>
            <code>{p}</code> <span className="muted small">{tr("settings.found")}</span>
          </li>
        ))}
        {ls.pictureDirs.map((p) => (
          <li key={p}>
            <code>{p}</code>
            <button className="icon-btn tiny" title={tr("settings.remove")} onClick={() => updateLogSettings({ pictureDirs: ls.pictureDirs.filter((x) => x !== p) })}>
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
        {!found.length && !ls.pictureDirs.length && <li className="muted small">{tr("settings.noVrchatPictureFolderFound")}</li>}
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
        <input value={d} placeholder={tr("settings.pathToPicturesVrchat")} onChange={(e) => setD(e.target.value)} />
        <button className="btn" type="submit" disabled={!d.trim()} title={tr("settings.addFolder")}>
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
        <h3>{tr("settings.gameLogs")}</h3>
        <p className="small muted">
          {logs.platform === "browser"
            ? tr("settings.readingVrchatSLogFiles2")
            : tr("settings.vrchatSLogFilesOnly")}
        </p>
      </>
    );
  }
  return (
    <>
      <h3>{tr("settings.gameLogsThisPc")}</h3>
      <p className="small muted">
        {tr("settings.vrchatWritesALogWhile")}
      </p>
      {demo && <p className="small warn">{tr("settings.demoModeLogReadingIs")}</p>}
      <label className="check">
        <input type="checkbox" checked={ls.enabled} onChange={(e) => updateLogSettings({ enabled: e.target.checked })} />
        {tr("settings.readVrchatSLogs")}
      </label>
      <label className="check">
        <input type="checkbox" checked={ls.autoDetect} onChange={(e) => updateLogSettings({ autoDetect: e.target.checked })} />
        {tr("settings.findTheLogFolderAutomatically")}
      </label>
      <label className="check">
        <input type="checkbox" checked={ls.live} disabled={!ls.enabled} onChange={(e) => updateLogSettings({ live: e.target.checked })} />
        {tr("settings.showWhoSInMy")}
      </label>
      {ls.autoDetect && (
        <ul className="path-list">
          {logs.detected.length ? logs.detected.map((d) => <li key={d}><code>{d}</code></li>) : <li className="muted small">{tr("settings.noVrchatLogFolderFound")}</li>}
        </ul>
      )}
      <div className="field">
        <span>{tr("settings.extraFolders")}</span>
        <ul className="path-list">
          {ls.dirs.map((d) => (
            <li key={d}>
              <code>{d}</code>
              <button className="icon-btn tiny" title={tr("settings.remove")} onClick={() => updateLogSettings({ dirs: ls.dirs.filter((x) => x !== d) })}>
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
          <input value={newDir} placeholder={tr("settings.pathToAppdataLocallowVrchat")} onChange={(e) => setNewDir(e.target.value)} />
          <button className="btn" type="submit" disabled={!newDir.trim()} title={tr("settings.addFolder")}>
            <Icon name="plus" size={16} />
          </button>
        </form>
        <small>{tr("settings.fullPathOfTheFolder")}</small>
      </div>
      <PictureFolders />
      <div className="row">
        <label className="field narrow">
          <span>{tr("settings.checkForNewEntriesEvery")}</span>
          <select value={ls.scanMinutes} onChange={(e) => updateLogSettings({ scanMinutes: Number(e.target.value) })}>
            {[1, 2, 5, 10, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
        <label className="field narrow">
          <span>{tr("settings.keepHistory")}</span>
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
          ? tr("settings.historyVisitsInstanceVisitsFrom", { visits: r.visits, files_stored: r.files_stored, value: naiveToDate(r.first).toLocaleDateString(language()), value2: naiveToDate(r.last).toLocaleDateString(language()), value3: (r.bytes / 1024).toFixed(0) })
          : tr("settings.noLogHistoryYet")}
      </p>
      {logs.error && <p className="small warn">{logs.error}</p>}
      <div className="row">
        <button className="btn" disabled={logs.scanning || demo} onClick={() => scanLogs(true)}>
          <Icon name="refresh" size={16} /> {logs.scanning ? tr("settings.reading") : tr("settings.readLogsNow")}
        </button>
        {!confirm ? (
          <button className="btn" disabled={demo} onClick={() => setConfirm(true)}>
            {tr("settings.forgetLogHistory")}
          </button>
        ) : (
          <button
            className="btn danger"
            onClick={() => {
              forgetLogHistory();
              setConfirm(false);
            }}
          >
            {tr("settings.yesForgetItLogFiles")}
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
      <h3>{tr("settings.friendGroupDetection")}</h3>
      <label className="check">
        <input type="checkbox" checked={g.useLogs} onChange={(e) => set({ useLogs: e.target.checked })} />
        {tr("settings.useMyGameLogsTime")}
      </label>
      <label className="check">
        <input type="checkbox" checked={g.useLive} onChange={(e) => set({ useLive: e.target.checked })} />
        {tr("settings.useFriendsLiveLocationsTime")}
      </label>
      <button className="btn small" onClick={() => forgetObserved()}>
        {tr("settings.forgetFriendLocationHistory")}
      </button>
      <p className="small muted">
        {tr("settings.suggestionsComeFromWhoSpends")}
      </p>
      <div className="row">
        <label className="field narrow">
          <span>{tr("settings.timeTogetherAtLeast")}</span>
          <select value={g.minMinutes} onChange={(e) => set({ minMinutes: Number(e.target.value) })}>
            {[10, 20, 30, 60, 120, 240].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? tr("settings.mMin", { m }) : tr("settings.valueH", { value: m / 60 })}
              </option>
            ))}
          </select>
        </label>
        <label className="field narrow">
          <span>{tr("settings.onAtLeast")}</span>
          <select value={g.minDays} onChange={(e) => set({ minDays: Number(e.target.value) })}>
            {[1, 2, 3, 5, 7, 10].map((d) => (
              <option key={d} value={d}>
                {d} day{d === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>
        <label className="field narrow">
          <span>{tr("settings.smallestGroup")}</span>
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
          Group size: <b>{g.resolution < 0.8 ? tr("settings.biggerLooserGroups") : g.resolution > 1.25 ? tr("settings.smallerTighterGroups") : "balanced"}</b>
        </span>
        <Range min={0.4} max={2.2} step={0.05} value={g.resolution} onChange={(e) => set({ resolution: Number(e.target.value) })} />
      </label>
      <div className="row">
        <label className="field narrow">
          <span>{tr("settings.bigInstancesCount")}</span>
          <select value={g.crowd} onChange={(e) => set({ crowd: e.target.value as GroupSettings["crowd"] })}>
            <option value="strong">{tr("settings.muchLessRecommended")}</option>
            <option value="mild">{tr("settings.aBitLess")}</option>
            <option value="off">{tr("settings.theSame")}</option>
          </select>
        </label>
        <label className="field narrow">
          <span>{tr("settings.useHistoryFrom")}</span>
          <select value={g.sinceDays} onChange={(e) => set({ sinceDays: Number(e.target.value) })}>
            <option value={0}>{tr("settings.allTime")}</option>
            <option value={30}>{tr("settings.last30Days")}</option>
            <option value={90}>{tr("settings.last90Days")}</option>
            <option value={180}>{tr("settings.last6Months")}</option>
            <option value={365}>{tr("settings.lastYear")}</option>
          </select>
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={g.overlap} onChange={(e) => set({ overlap: e.target.checked })} />
        {tr("settings.peopleCanBeInMore")}
      </label>
      <label className="check">
        <input type="checkbox" checked={g.mutualBoost} onChange={(e) => set({ mutualBoost: e.target.checked })} />
        {tr("settings.weighTimeTogetherMoreWhen")}
      </label>
      <label className="check">
        <input type="checkbox" checked={g.auto} onChange={(e) => set({ auto: e.target.checked })} />
        {tr("settings.makeAndUpdateCirclesAutomatically")}
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
          : tr("settings.shareFriendListsAndActivity")}
      </p>
      <button className="btn" onClick={openServers}>
        <Icon name="server" size={16} /> {servers.length ? tr("settings.manageServers") : tr("settings.setUp")}
      </button>
    </>
  );
}

function PeopleSection() {
  const people = useApp((s) => s.settings.people);
  const blocked = useApp((s) => Object.values(s.cache.moderations?.byUser ?? {}).filter((t) => t.includes("block")).length);
  return (
    <>
      <h3>{tr("settings.peopleWhoArenTFriends")}</h3>
      <label className="check">
        <input type="checkbox" checked={people.loadEveryone} onChange={(e) => updatePeople({ loadEveryone: e.target.checked })} />
        {tr("settings.loadTheProfileOfEveryone")}
      </label>
      <label className="field narrow">
        <span>{tr("settings.keepTheirProfilesOnThis")}</span>
        <select value={people.keep} onChange={(e) => updatePeople({ keep: e.target.value as typeof people.keep })}>
          <option value="none">{tr("settings.donTKeepOnlyWhile")}</option>
          <option value="potential">{tr("settings.onlyPotentialFriends")}</option>
          <option value="everyone">{tr("settings.everyone")}</option>
        </select>
      </label>
      <p className="small muted">
        {tr("settings.potentialFriendsPeopleWhoShare")}
      </p>
      <label className="check">
        <input type="checkbox" checked={people.showBlocked} onChange={(e) => updatePeople({ showBlocked: e.target.checked })} />
        {tr("blocked.showOnMap", { count: blocked })}
      </label>
    </>
  );
}

function UpdatesSection() {
  const u = useApp((s) => s.settings.updates);
  const [checking, setChecking] = useState(false);
  return (
    <>
      <h3>{tr("settings.updates")}</h3>
      <label className="check">
        <input type="checkbox" checked={u.check} onChange={(e) => updateSettings({ updates: { ...u, check: e.target.checked } })} />
        {tr("settings.lookForNewVersionsAutomatically")}
      </label>
      {!u.check && (
        <p className="small warn">
          {tr("settings.notRecommendedTheAppChanges")}
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
          <Icon name="refresh" size={14} /> {checking ? tr("settings.checking") : tr("settings.checkNow")}
        </button>
        {u.skipped && (
          <button className="btn small ghost" onClick={() => updateSettings({ updates: { ...u, skipped: "" } })}>
            {tr("settings.offerSkippedAgain", { skipped: u.skipped })}
          </button>
        )}
      </div>
      <p className="small muted">
        {tr("settings.updatingDownloadsTheNewVersion")}
      </p>
    </>
  );
}
