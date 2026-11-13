// Asked when the window is closed and Settings → Closing the window is "Ask me"
// (the default, so the first close always asks).
import { useState } from "react";
import { setState, updateSettings, useApp } from "../store";
import { hideToTray, quitApp } from "../tray";
import { Icon } from "./Icon";

export function CloseDialog() {
  const open = useApp((s) => s.closeAsk);
  const [choice, setChoice] = useState<"tray" | "quit">("tray");
  const [askAgain, setAskAgain] = useState(false);
  if (!open) return null;
  const cancel = () => setState({ closeAsk: false });
  const go = () => {
    setState({ closeAsk: false });
    if (!askAgain) updateSettings({ closeAction: choice });
    void (choice === "tray" ? hideToTray() : quitApp());
  };
  return (
    <div className="modal-backdrop top" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
      <div className="modal confirm" role="alertdialog" aria-labelledby="close-title" onKeyDown={(e) => e.key === "Escape" && cancel()}>
        <h2 id="close-title">Close the window</h2>
        <label className="check radio-card">
          <input type="radio" name="close" checked={choice === "tray"} onChange={() => setChoice("tray")} autoFocus />
          <span>
            <b>Keep running in the tray</b> (recommended)
            <br />
            <span className="small muted">Notifications and sounds keep coming, live updates and game logs keep being collected. Nothing is drawn, so it uses little power. Click the tray icon to come back.</span>
          </span>
        </label>
        <label className="check radio-card">
          <input type="radio" name="close" checked={choice === "quit"} onChange={() => setChoice("quit")} />
          <span>
            <b>Quit</b>
            <br />
            <span className="small muted">No notifications until you open the app again.</span>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={askAgain} onChange={(e) => setAskAgain(e.target.checked)} />
          Ask me every time
        </label>
        <p className="small muted">
          <Icon name="settings" size={13} /> You can change this later in Settings → Notifications → Closing the window.
        </p>
        <div className="row end">
          <button className="btn" onClick={cancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={go}>
            {choice === "tray" ? "Close to tray" : "Quit"}
          </button>
        </div>
      </div>
    </div>
  );
}
