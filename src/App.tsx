import { useEffect } from "react";
import { backend, isTauri } from "./backend";
import { CardsView } from "./components/CardsView";
import { DetailPanel } from "./components/DetailPanel";
import { GraphView } from "./components/GraphView";
import { LoginScreen } from "./components/LoginScreen";
import { SettingsModal } from "./components/SettingsModal";
import { SharedLists } from "./components/SharedLists";
import { Sidebar } from "./components/Sidebar";
import { ToastView } from "./components/ToastView";
import { TopBar } from "./components/TopBar";
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
  const settingsOpen = useApp((s) => s.settingsOpen);
  const sidebarOpen = useApp((s) => s.sidebarOpen);

  useEffect(() => {
    let unlisten: (() => void)[] = [];
    (async () => {
      await loadPersisted();
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
        <LoginScreen canLogin={isTauri} />
        <ToastView />
      </>
    );
  }

  return (
    <div className={`app ${sidebarOpen ? "with-sidebar" : ""}`}>
      <TopBar />
      <div className="main">
        {sidebarOpen && <Sidebar />}
        <div className="content">
          {view === "graph" && <GraphView />}
          {view === "cards" && <CardsView />}
          {view === "lists" && <SharedLists />}
        </div>
        {selectedId && <DetailPanel id={selectedId} />}
      </div>
      {settingsOpen && <SettingsModal />}
      <ToastView />
    </div>
  );
}
