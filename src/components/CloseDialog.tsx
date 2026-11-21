// Asked when the window is closed and Settings → Closing the window is "Ask me"
// (the default, so the first close always asks).
import { t as tr } from "../i18n";
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
        <h2 id="close-title">{tr("closeDialog.closeTheWindow")}</h2>
        <label className="check radio-card">
          <input type="radio" name="close" checked={choice === "tray"} onChange={() => setChoice("tray")} autoFocus />
          <span>
            <b>{tr("closeDialog.keepRunningInTheTray")}</b> (recommended)
            <br />
            <span className="small muted">{tr("closeDialog.notificationsAndSoundsKeepComing")}</span>
          </span>
        </label>
        <label className="check radio-card">
          <input type="radio" name="close" checked={choice === "quit"} onChange={() => setChoice("quit")} />
          <span>
            <b>{tr("closeDialog.quit")}</b>
            <br />
            <span className="small muted">{tr("closeDialog.noNotificationsUntilYouOpen")}</span>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={askAgain} onChange={(e) => setAskAgain(e.target.checked)} />
          {tr("closeDialog.askMeEveryTime")}
        </label>
        <p className="small muted">
          <Icon name="settings" size={13} /> {tr("closeDialog.youCanChangeThisLater")}
        </p>
        <div className="row end">
          <button className="btn" onClick={cancel}>
            {tr("closeDialog.cancel")}
          </button>
          <button className="btn primary" onClick={go}>
            {choice === "tray" ? tr("closeDialog.closeToTray") : "Quit"}
          </button>
        </div>
      </div>
    </div>
  );
}
