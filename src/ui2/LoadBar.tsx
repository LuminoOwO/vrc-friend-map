// Loading bar along the top while the app loads from VRChat: a thin progress line, a small
// card with the step, how far along, who's loading and roughly how long is left, and an
// unfoldable log of every step and every person loaded. Made for the first start, when
// everything still has to be fetched and nothing else on screen moves yet.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useT } from "../i18n";
import { getState, subscribeState, useApp } from "../store";
import { Icon } from "../components/Icon";

interface LogLine {
  t: number;
  kind: "step" | "item" | "error";
  text: string;
}

// ---- the log: written from the sync state as it changes (kept for this run) ----
const MAX = 400;
let lines: LogLine[] = [];
let steps: { phase: string; start: number; end?: number; total: number }[] = [];
let runStart = 0;
let last = { running: false, phase: "", message: "", error: "" };
const listeners = new Set<() => void>();
let snapshot = { lines, steps };
const emit = () => {
  snapshot = { lines, steps };
  listeners.forEach((f) => f());
};
const push = (l: LogLine) => {
  lines = [...lines.slice(-(MAX - 1)), l];
};

subscribeState(() => {
  const s = getState().sync;
  if (s.running === last.running && s.phase === last.phase && s.message === last.message && s.error === last.error) return;
  const now = Date.now();
  if (s.running && !last.running) {
    lines = [];
    steps = [];
    runStart = now;
  }
  if (s.running && s.phase && s.phase !== last.phase) {
    steps = steps.map((x) => (x.end ? x : { ...x, end: now }));
    steps = [...steps, { phase: s.phase, start: now, total: s.total }];
    push({ t: now, kind: "step", text: s.phase });
  } else if (s.running && steps.length && s.total && !steps[steps.length - 1].total) {
    steps = [...steps.slice(0, -1), { ...steps[steps.length - 1], total: s.total }];
  }
  if (s.running && s.message && s.message !== last.message) push({ t: now, kind: "item", text: s.message });
  if (s.error && s.error !== last.error) push({ t: now, kind: "error", text: s.error });
  if (!s.running && last.running) steps = steps.map((x) => (x.end ? x : { ...x, end: now }));
  last = { running: s.running, phase: s.phase, message: s.message, error: s.error };
  emit();
});

function useLog() {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => snapshot,
  );
}

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function LoadBar() {
  const t = useT();
  const sync = useApp((s) => s.sync);
  const log = useLog();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!sync.running) return;
    setHidden(false);
    const tm = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tm);
  }, [sync.running]);
  // Rough time left from how fast this step has gone so far.
  const eta = useMemo(() => {
    const step = log.steps[log.steps.length - 1];
    if (!sync.total || sync.done < 3 || !step) return 0;
    const per = (now - step.start) / sync.done;
    return Math.max(0, Math.round((per * (sync.total - sync.done)) / 1000));
  }, [log.steps, sync.done, sync.total, now]);
  if (!sync.running) return null;
  const pct = sync.total ? Math.min(100, (sync.done / sync.total) * 100) : null;
  const waiting = sync.backoffUntil > now;
  const fmtEta = eta >= 90 ? t("loadBar.minutesLeft", { n: Math.round(eta / 60) }) : eta > 0 ? t("loadBar.secondsLeft", { n: eta }) : "";
  return (
    <div className="lb" role="status" aria-live="polite">
      {hidden && (
        <button className="lb-mini" title={t("loadBar.showLog")} onClick={() => setHidden(false)}>
          <span className="lb-spin" aria-hidden />
          {pct != null ? `${Math.floor(pct)}%` : t("loadBar.loading")}
        </button>
      )}
      {!hidden && (
        <div className={`lb-card ${open ? "open" : ""}`}>
          <div className="lb-head">
            <span className="lb-spin" aria-hidden />
            <span className="lb-text">
              <b>{sync.phase || t("loadBar.loading")}</b>
              <span className="lb-now">
                {[
                  pct != null ? `${sync.done.toLocaleString()} / ${sync.total.toLocaleString()}` : "",
                  sync.paused ? t("loadBar.paused") : waiting ? t("loadBar.waiting") : fmtEta,
                  sync.message,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <button className="icon-btn tiny" aria-expanded={open} title={open ? t("loadBar.hideLog") : t("loadBar.showLog")} onClick={() => setOpen(!open)}>
              <Icon name={open ? "compress" : "expand"} size={13} />
            </button>
            <button className="icon-btn tiny" title={t("loadBar.hideCard")} onClick={() => setHidden(true)}>
              <Icon name="close" size={13} />
            </button>
          </div>
          {open && (
            <div className="lb-body">
              <ol className="lb-steps">
                {log.steps.map((s, i) => (
                  <li key={i} className={s.end ? "done" : "now"}>
                    <Icon name={s.end ? "check" : "refresh"} size={12} />
                    <span>{s.phase}</span>
                    <span className="muted">{s.end ? `${Math.max(1, Math.round((s.end - s.start) / 1000))} s` : s.total ? `${sync.done}/${s.total}` : ""}</span>
                  </li>
                ))}
              </ol>
              <div className="lb-log" aria-label={t("loadBar.log")}>
                {[...log.lines].reverse().map((l, i) => (
                  <div key={log.lines.length - i} className={`lb-row ${l.kind}`}>
                    <span className="lb-time">{clock(l.t)}</span>
                    <span>{l.kind === "item" ? t("loadBar.loaded", { what: l.text }) : l.text}</span>
                  </div>
                ))}
              </div>
              <p className="small muted lb-foot">
                {t("loadBar.running", { s: Math.round((now - runStart) / 1000) })} · {t("loadBar.why")}
              </p>
            </div>
          )}
          <div className={`lb-line ${pct == null ? "busy" : ""}`}>
            <span style={pct == null ? undefined : { width: `${pct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
