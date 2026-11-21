// "Version X is available": what's new, and update now / later / skip.
import { t as tr } from "../i18n";
import { useEffect, useState } from "react";
import { backend } from "../backend";
import { setState, useApp } from "../store";
import { installUpdate, KIND_LABEL, notesSummary, onUpdateProgress, skipVersion } from "../updates";
import { Icon } from "./Icon";

/** Very small markdown: headings, bullets, bold, code. Plain text otherwise (no HTML from the release). */
function Notes({ text }: { text: string }) {
  const lines = text.split("\n");
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((p, i) =>
      p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith("`") ? <code key={i}>{p.slice(1, -1)}</code> : p,
    );
  return (
    <div className="update-notes">
      {lines.map((l, i) => {
        if (/^#{2,4} /.test(l)) return <h4 key={i}>{l.replace(/^#+ /, "")}</h4>;
        if (/^\s*- /.test(l)) return <li key={i} style={{ marginLeft: 16 + (l.search(/\S/) / 2) * 14 }}>{inline(l.replace(/^\s*- /, ""))}</li>;
        if (!l.trim()) return null;
        return <p key={i}>{inline(l.trim())}</p>;
      })}
    </div>
  );
}

export function UpdateDialog() {
  const info = useApp((s) => s.update);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  useEffect(() => onUpdateProgress((d, t) => setProgress([d, t])), []);
  if (!info) return null;
  const close = () => !busy && setState({ update: null });
  const pct = progress && progress[1] ? Math.round((progress[0] / progress[1]) * 100) : null;
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const msg = await installUpdate(info);
      if (msg) setResult(msg);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const how =
    info.kind === "flatpak"
      ? tr("update.theFlatpakCanTInstall")
      : info.kind === "android"
        ? tr("update.androidDownloadsTheNewVersion")
        : info.kind === "ios"
          ? tr("update.sideloadedAppsCanTUpdate")
          : info.kind === "deb" || info.kind === "rpm"
            ? tr("update.theSystemAsksForYour")
            : info.kind === "windows-msi"
              ? tr("update.windowsAsksForPermissionTo")
              : tr("update.theAppDownloadsItChecks");
  return (
    <div className="modal-backdrop top" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal update-dialog" role="dialog" aria-labelledby="update-title">
        <h2 id="update-title">
          <Icon name="download" /> Version {info.latest} is available
        </h2>
        <p className="small muted">
          You have {info.current} ({KIND_LABEL[info.kind]}). Your circles, settings and data stay.
        </p>
        <Notes text={notesSummary(info.notes)} />
        <p className="small muted">{how}</p>
        {busy && (
          <div className="update-progress">
            <div style={{ width: `${pct ?? 5}%` }} />
            <span className="small">{pct != null && pct < 100 ? tr("update.downloadingPct", { pct }) : tr("update.installing")}</span>
          </div>
        )}
        {result && (
          <div className="update-result">
            <p className="small">{tr("update.savedInstallItWith")}</p>
            <code>{result}</code>
            <button className="btn small" onClick={() => navigator.clipboard?.writeText(result)}>
              <Icon name="copy" size={14} /> {tr("update.copy")}
            </button>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
        <div className="row end">
          <button className="btn ghost" disabled={busy} onClick={() => skipVersion(info.latest)}>
            {tr("update.skipThisVersion")}
          </button>
          <button className="btn" disabled={busy} onClick={close}>
            {tr("update.later")}
          </button>
          {info.kind === "android" || info.kind === "ios" || !info.can_install ? (
            <button className="btn primary" onClick={() => void backend.openUrl(info.kind === "android" && info.asset ? info.asset.url : info.page)}>
              <Icon name="external" size={15} /> {info.kind === "android" && info.asset ? "Download" : tr("update.openTheRelease")}
            </button>
          ) : (
            !result && (
              <button className="btn primary" disabled={busy} onClick={go}>
                {busy ? tr("update.updating") : info.kind === "flatpak" ? "Download" : tr("update.updateNow")}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
