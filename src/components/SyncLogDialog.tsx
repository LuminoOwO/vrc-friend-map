// The sync log: every sync step with time, result and the exact error.
// Opened by clicking the sync status in the top bar.
import { useState } from "react";
import { clearSyncLog, type SyncLogEntry, useSyncLog } from "../synclog";
import { showToast } from "../store";
import { Icon } from "./Icon";

const LABEL: Record<SyncLogEntry["result"], string> = { ok: "OK", failed: "Failed", interrupted: "Interrupted", info: "Note" };

export function SyncLogDialog({ onClose }: { onClose: () => void }) {
  const all = useSyncLog();
  const [onlyProblems, setOnlyProblems] = useState(false);
  const list = [...all].reverse().filter((e) => !onlyProblems || e.result === "failed" || e.result === "interrupted");
  const copy = () => {
    const text = [...all]
      .map((e) => `${new Date(e.t).toISOString()} [${e.area}] ${e.step}: ${LABEL[e.result]}${e.detail ? ` – ${e.detail}` : ""}`)
      .join("\n");
    navigator.clipboard?.writeText(text).then(
      () => showToast("Sync log copied"),
      () => showToast("Couldn't copy"),
    );
  };
  return (
    <div className="modal-backdrop top" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal synclog" role="dialog" aria-labelledby="synclog-title" onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="row between">
          <h2 id="synclog-title">Sync log</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose} autoFocus>
            <Icon name="close" size={18} />
          </button>
        </div>
        <p className="small muted">
          What each sync did. <b>Interrupted</b> means the app went to the background while syncing (phones pause the app); it tries again
          by itself and isn't an error.
        </p>
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
            Only problems
          </label>
          <span className="grow" />
          <button className="btn small" onClick={copy} disabled={!all.length}>
            <Icon name="copy" size={14} /> Copy
          </button>
          <button className="btn small" onClick={clearSyncLog} disabled={!all.length}>
            Clear
          </button>
        </div>
        {list.length === 0 ? (
          <p className="muted">{all.length ? "No problems logged." : "Nothing logged yet."}</p>
        ) : (
          <ul className="synclog-list">
            {list.map((e, i) => (
              <li key={`${e.t}-${i}`} className={e.result}>
                <span className="synclog-time">{new Date(e.t).toLocaleString()}</span>
                <span className={`synclog-result ${e.result}`}>{LABEL[e.result]}</span>
                <span className="synclog-where">
                  {e.area} · {e.step}
                </span>
                {e.detail && <span className="synclog-detail selectable">{e.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
