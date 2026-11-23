import { InsightsView } from "./components/InsightsView";
import { useLanguage } from "./i18n";
import { LogbookView } from "./components/LogbookView";
import { VrchatView } from "./components/VrchatView";
import { GroupDialog, InstanceDialog, WorldDialog } from "./components/ContentDialogs";
import { BlockReasonDialog } from "./components/PersonExtras";
import { startBioCache, stopBioCache } from "./biocache";
import { startHistory, stopHistory } from "./history";
import { startWatchers, stopWatchers } from "./watchers";
import { startNotesLine, stopNotesLine } from "./notesline";
import { startServerLink } from "./serverlink";
import { startExtras, stopExtras } from "./extras";
import { ImageViewer } from "./components/ImageViewer";
import { ActivityView } from "./components/ActivityView";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { backend, isTauri } from "./backend";
import { useDerived } from "./derived";
import { CardsView } from "./components/CardsView";
import { DetailPanel } from "./components/DetailPanel";
import { GraphView } from "./components/GraphView";
import { LoginScreen } from "./components/LoginScreen";
import { SettingsModal } from "./components/SettingsModal";
import { CloseDialog } from "./components/CloseDialog";
import { UpdateDialog } from "./components/UpdateDialog";
import { catppuccinVars, isCatFlavor } from "./catppuccin";
import { ownColorVars } from "./owncolors";
import { ConfirmUnencrypted, ServersModal } from "./components/ServersModal";
import { loadShared, startSharing, stopSharing } from "./share";
import { startAccounts, stopAccounts } from "./accounts";
import { syncLive } from "./live";
import { HereNow } from "./components/HereNow";
import { SharedLists } from "./components/SharedLists";
import { Sidebar } from "./components/Sidebar";
import { ToastView } from "./components/ToastView";
import { Popups } from "./ui2/Inbox";
import { TopBar } from "./components/TopBar";
import { Icon } from "./components/Icon";
import { applyThemeColors } from "./model";
import { applyAutoGroups, initLogs, refreshStats, scheduleLogScans, useGroupSuggestions } from "./logs";
import { startObserving, stopObserving } from "./together";
import { flushSaves, getState, loadPersisted, setState, updateLocal, updateUi, useApp } from "./store";
import { applyPipelineEvent, startAutoRefresh, syncAll } from "./sync";
import { setBetaActive } from "./ui2/active";

const BetaApp = lazy(() => import("./ui2/BetaApp").then((m) => ({ default: m.BetaApp })));

/** `--classic-ui` at start keeps the classic UI even with the beta turned on. */
function useClassicFlag(): boolean {
  const [classic, setClassic] = useState(false);
  useEffect(() => {
    if (!isTauri) return;
    invoke<string[]>("start_args")
      .then((a) => setClassic(a.includes("--classic-ui")))
      .catch(() => {});
  }, []);
  return classic;
}

/** Dialogs both UIs share. */
function GlobalDialogs() {
  const settingsOpen = useApp((s) => s.settingsOpen);
  const serversOpen = useApp((s) => s.serversOpen);
  return (
    <>
      {settingsOpen && <SettingsModal />}
      {serversOpen && <ServersModal />}
      <ConfirmUnencrypted />
      <ImageViewer />
      <BlockReasonDialog />
      <InstanceDialog />
      <WorldDialog />
      <GroupDialog />
      <CloseDialog />
      <UpdateDialog />
      <ToastView />
      <Popups />
    </>
  );
}

function goLive() {
  syncAll();
  backend.pipelineStart().catch(() => {});
}

export default function App() {
  const mode = useApp((s) => s.mode);
  const view = useApp((s) => s.view);
  const selectedId = useApp((s) => s.selectedId);
  const theme = useApp((s) => s.settings.theme);
  const profileAs = useApp((s) => s.settings.profileAs);
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const herePlace = useApp((s) => s.settings.map.herePlace);
  const beta = useApp((s) => s.settings.ui.beta);
  const classicFlag = useClassicFlag();
  // A new language redraws the interface (below the start-up code here).
  const lang = useLanguage();

  useEffect(() => {
    let unlisten: (() => void)[] = [];
    (async () => {
      await loadPersisted();
      await loadShared();
      initLogs();
      const info = await backend.sessionInfo().catch(() => ({ logged_in: false, user_id: null, display_name: null }));
      setState({ session: info, mode: info.logged_in ? "app" : "login" });
      if (info.logged_in) goLive();
      startAutoRefresh();
      unlisten.push(
        await backend.onLoginFinished(async (e) => {
          if (e.ok) {
            const session = await backend.sessionInfo();
            // A fresh login: earlier "log out everywhere" presses don't apply to it.
            updateLocal((l) => ({ ...l, loginAt: Date.now() }));
            setState({ session, mode: "app", loginBusy: false, loginMessage: "", demo: false });
            goLive();
          } else {
            setState({ loginBusy: false, loginMessage: e.message === "Login window closed" ? "" : e.message });
          }
        }),
        await backend.onLoginProgress((e) => setState({ loginMessage: e.message })),
        await backend.onPipeline((e) => applyPipelineEvent(e.type, e.content)),
        await backend.onPipelineStatus((e) => {
          setState({ live: { connected: e.connected, message: e.message } });
          // A rejected live connection usually means the session ended; a normal
          // sync confirms it and shows the login screen if needed.
          if (e.fatal) syncAll({ friendsOnly: true });
        }),
      );
    })();
    const onHide = () => {
      if (document.visibilityState === "hidden") flushSaves();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      unlisten.forEach((u) => u());
      unlisten = [];
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const s = getState();
        if (s.viewer) return; // the image viewer closes itself
        if (s.settingsOpen) setState({ settingsOpen: false });
        else if (s.selectedId) setState({ selectedId: null });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (mode === "loading") {
    return <div className="splash">Loading…</div>;
  }
  if (mode === "login") {
    return (
      <>
        <ThemeSync />
        <LoginScreen key={lang} canLogin={isTauri} />
        <CloseDialog />
        <UpdateDialog />
        <ToastView />
      </>
    );
  }

  setBetaActive(beta && !classicFlag);
  if (beta && !classicFlag) {
    return (
      <Suspense fallback={<div className="splash">Loading…</div>}>
        <LogsAndGroups />
        <ThemeSync />
        <BetaApp key={lang}>
          <Notice />
          <GlobalDialogs />
        </BetaApp>
      </Suspense>
    );
  }

  return (
    <div className={`app ${sidebarOpen ? "with-sidebar" : ""}`} key={lang}>
      <LogsAndGroups />
      <ThemeSync />
      <TopBar />
      <Notice />
      <NewUiOnce />
      <div className="main" key={theme}>
        {sidebarOpen && <Sidebar />}
        <div className="content">
          {!(sidebarOpen && herePlace === "sidebar") && <HereNow />}
          {view === "graph" && <GraphView />}
          {view === "cards" && <CardsView />}
          {view === "lists" && <SharedLists />}
          {view === "activity" && <ActivityView />}
          {view === "insights" && <InsightsView />}
          {view === "logbook" && <LogbookView />}
          {view === "vrchat" && <VrchatView />}
        </div>
        {selectedId && profileAs === "sidebar" && <DetailPanel id={selectedId} />}
      </div>
      {selectedId && profileAs === "popup" && (
        <div
          className="profile-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setState({ selectedId: null });
          }}
        >
          <DetailPanel id={selectedId} popup />
        </div>
      )}
      <GlobalDialogs />
    </div>
  );
}

/** Keeps log scanning, time-together stats and automatic groups in step with settings. */
/** Applies the color theme to the whole page. */
/** Okabe–Ito based status colors: tell apart with red/green color blindness. */
const COLORBLIND_STATUS: Record<string, string> = {
  "--status-joinme": "#56B4E9",
  "--status-active": "#F0E442",
  "--status-askme": "#E69F00",
  "--status-busy": "#D55E00",
  "--status-offline": "#5f6870",
  "--status-web": "#CC79A7",
};

function ThemeSync() {
  const theme = useApp((s) => s.settings.theme);
  const catAccent = useApp((s) => s.settings.catAccent);
  const ownColors = useApp((s) => s.settings.ownColors);
  const ui = useApp((s) => s.settings.ui);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--ui-zoom", String(ui.textScale));
    if (ui.reducedMotion === "on") root.dataset.motion = "reduce";
    else if (ui.reducedMotion === "off") root.dataset.motion = "full";
    else delete root.dataset.motion;
  }, [ui.textScale, ui.reducedMotion]);
  // Layout effect: colors must be in place before the first paint of the new theme.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") delete root.dataset.theme;
    else root.dataset.theme = theme;
    // Catppuccin: the variables come from its palette with the chosen accent.
    for (const k of [...root.style]) if (k.startsWith("--") || k === "color-scheme") root.style.removeProperty(k);
    if (isCatFlavor(theme)) for (const [k, v] of Object.entries(catppuccinVars(theme, catAccent))) root.style.setProperty(k, v);
    if (ui.colorblind) for (const [k, v] of Object.entries(COLORBLIND_STATUS)) root.style.setProperty(k, v);
    root.style.setProperty("--ui-zoom", String(ui.textScale));
    const cs = getComputedStyle(document.documentElement);
    // Your own colors on top of the theme.
    for (const [k, v] of Object.entries(ownColorVars(ownColors, (v) => cs.getPropertyValue(v)))) root.style.setProperty(k, v);
    applyThemeColors((v) => cs.getPropertyValue(v).trim());
  }, [theme, catAccent, ui.colorblind, ownColors]);
  return null;
}

function LogsAndGroups() {
  const { idsKey } = useDerived();
  const meId = useApp((s) => s.cache.me?.id);
  const crowd = useApp((s) => s.settings.groups.crowd);
  const sinceDays = useApp((s) => s.settings.groups.sinceDays);
  const logSettings = useApp((s) => s.settings.logs);
  const platform = useApp((s) => s.logs.platform);
  const demo = useApp((s) => s.demo);
  const auto = useApp((s) => s.settings.groups.auto);
  const { suggestions } = useGroupSuggestions();
  const lastApplied = useRef("");
  const mode = useApp((s) => s.mode);

  useEffect(() => {
    if (mode === "app" && !demo) {
      startObserving();
      startSharing();
      startBioCache();
      startHistory();
      startWatchers();
      startNotesLine();
      startServerLink();
      startExtras();
      void startAccounts();
    } else {
      stopObserving();
      stopSharing();
      stopAccounts();
      stopBioCache();
      stopHistory();
      stopWatchers();
      stopNotesLine();
      stopExtras();
    }
  }, [mode, demo]);

  useEffect(() => {
    refreshStats();
  }, [idsKey, meId, crowd, sinceDays]);

  // Who's in your instance right now (live game log).
  useEffect(() => {
    syncLive();
  }, [mode, demo, platform, logSettings.enabled, logSettings.live, logSettings.dirs, logSettings.autoDetect]);

  useEffect(() => {
    scheduleLogScans();
  }, [logSettings, platform, demo]);

  useEffect(() => {
    if (!auto || !suggestions.length) return;
    const key = suggestions.map((s) => s.key + (s.match?.add.join(",") ?? "")).join(";");
    if (key === lastApplied.current) return;
    lastApplied.current = key;
    applyAutoGroups(suggestions);
  }, [auto, suggestions]);

  return null;
}

/** 0.13.0: the new interface becomes everyone's interface, once per device. After that the
 *  choice is theirs again (Settings → Appearance → Interface → classic interface). */
function NewUiOnce() {
  const due = useApp((s) => s.mode === "app" && !s.local.newUiSwitched);
  useEffect(() => {
    if (!due) return;
    updateLocal((l) => ({ ...l, newUiSwitched: true, betaHintSeen: true }));
    if (!getState().settings.ui.beta) updateUi({ beta: true });
  }, [due]);
  return null;
}

function Notice() {
  const notice = useApp((s) => s.notice);
  if (!notice) return null;
  return (
    <div className="notice" role="status">
      <span>{notice}</span>
      <button className="icon-btn tiny" title="Dismiss" onClick={() => setState({ notice: null })}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
