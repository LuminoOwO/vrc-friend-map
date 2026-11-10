import { useEffect, useLayoutEffect, useRef } from "react";
import { backend, isTauri } from "./backend";
import { useDerived } from "./derived";
import { CardsView } from "./components/CardsView";
import { DetailPanel } from "./components/DetailPanel";
import { GraphView } from "./components/GraphView";
import { LoginScreen } from "./components/LoginScreen";
import { SettingsModal } from "./components/SettingsModal";
import { ConfirmUnencrypted, ServersModal } from "./components/ServersModal";
import { loadShared, startSharing, stopSharing } from "./share";
import { SharedLists } from "./components/SharedLists";
import { Sidebar } from "./components/Sidebar";
import { ToastView } from "./components/ToastView";
import { TopBar } from "./components/TopBar";
import { Icon } from "./components/Icon";
import { applyThemeColors } from "./model";
import { applyAutoGroups, initLogs, refreshStats, scheduleLogScans, useGroupSuggestions } from "./logs";
import { startObserving, stopObserving } from "./together";
import { flushSaves, getState, loadPersisted, setState, useApp } from "./store";
import { applyPipelineEvent, startAutoRefresh, syncAll } from "./sync";

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
  const settingsOpen = useApp((s) => s.settingsOpen);
  const serversOpen = useApp((s) => s.serversOpen);
  const sidebarOpen = useApp((s) => s.sidebarOpen);

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
        <LoginScreen canLogin={isTauri} />
        <ToastView />
      </>
    );
  }

  return (
    <div className={`app ${sidebarOpen ? "with-sidebar" : ""}`}>
      <LogsAndGroups />
      <ThemeSync />
      <TopBar />
      <Notice />
      <div className="main" key={theme}>
        {sidebarOpen && <Sidebar />}
        <div className="content">
          {view === "graph" && <GraphView />}
          {view === "cards" && <CardsView />}
          {view === "lists" && <SharedLists />}
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
      {settingsOpen && <SettingsModal />}
      {serversOpen && <ServersModal />}
      <ConfirmUnencrypted />
      <ToastView />
    </div>
  );
}

/** Keeps log scanning, time-together stats and automatic groups in step with settings. */
/** Applies the color theme to the whole page. */
function ThemeSync() {
  const theme = useApp((s) => s.settings.theme);
  // Layout effect: colors must be in place before the first paint of the new theme.
  useLayoutEffect(() => {
    if (theme === "dark") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    const cs = getComputedStyle(document.documentElement);
    applyThemeColors((v) => cs.getPropertyValue(v).trim());
  }, [theme]);
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
    } else {
      stopObserving();
      stopSharing();
    }
  }, [mode, demo]);

  useEffect(() => {
    refreshStats();
  }, [idsKey, meId, crowd, sinceDays]);

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
