import { useState } from "react";
import { imgSrc } from "../backend";
import type { Suggestion } from "../groups";
import { suggestionName } from "../groups";
import { acceptSuggestion, dismissSuggestion, fmtHours, logsSupported, nameOf, scanLogs, useGroupSuggestions } from "../logs";
import { iconUrl, relTime } from "../model";
import { setState, updateGroupSettings, useApp } from "../store";
import { Icon } from "./Icon";

export function SuggestedGroups() {
  const logs = useApp((s) => s.logs);
  const demo = useApp((s) => s.demo);
  const g = useApp((s) => s.settings.groups);
  const enabled = useApp((s) => s.settings.logs.enabled);
  const circles = useApp((s) => s.local.circles);
  const { suggestions, pairsUsable } = useGroupSuggestions();
  const useLive = useApp((s) => s.settings.groups.useLive);
  const observedPairs = useApp((s) => s.observed?.pairs.length ?? 0);
  const logsHere = logsSupported(logs.platform);
  const supported = demo || logsHere || useLive;

  const openSettings = () => setState({ settingsOpen: true, settingsTab: "groups" });
  const report = logs.report;
  const spanDays = report && report.visits ? Math.max(1, Math.round((report.last - report.first) / 86400)) : 0;

  return (
    <section>
      <div className="section-head">
        <h3>Suggested groups</h3>
        <span className="row tight">
          {supported && !demo && (
            <button className="icon-btn tiny" title="Read new log entries now" disabled={logs.scanning} onClick={() => scanLogs(true)}>
              <Icon name="refresh" size={14} />
            </button>
          )}
          <button className="icon-btn tiny" title="Group detection settings" onClick={openSettings}>
            <Icon name="settings" size={14} />
          </button>
        </span>
      </div>
      {!supported ? (
        <p className="muted small">
          Groups are suggested from VRChat's log files, which only exist on the PC that runs VRChat. Use the desktop app on that PC for
          suggestions.
        </p>
      ) : !enabled && !demo && !useLive ? (
        <p className="muted small">
          Reading game logs is turned off.{" "}
          <button className="btn link small" onClick={openSettings}>
            Turn it on
          </button>
        </p>
      ) : (
        <>
          <p className="muted small">
            From time spent in the same instance
            {logsHere && enabled ? `: with you (game logs${report && report.visits > 0 ? `, ${report.visits} visits over ${spanDays} day${spanDays === 1 ? "" : "s"}` : ""})` : ""}
            {useLive ? `${logsHere && enabled ? " and" : ":"} between friends (their live locations while this app is open${observedPairs ? `, ${observedPairs} pairs so far` : ""})` : ""}.
          </p>
          {logs.error && <p className="small warn">{logs.error}</p>}
          {suggestions.length === 0 ? (
            <p className="muted small">
              {(!report || report.visits === 0) && !observedPairs
                ? logs.scanning
                  ? "Reading logs…"
                  : "Nothing collected yet. Keep the app open for a while (and play on this PC for game logs), and groups show up over time."
                : pairsUsable === 0
                  ? `Nothing yet: suggestions need people seen together for ${g.minMinutes}+ minutes on ${g.minDays}+ different days.`
                  : "No new groups. Everything found is already in your circles."}
            </p>
          ) : (
            <ul className="suggestions">
              {suggestions.slice(0, 12).map((s) => (
                <SuggestionItem key={s.key} s={s} circleName={circles.find((c) => c.id === s.match?.circleId)?.name} />
              ))}
            </ul>
          )}
          <label className="check small">
            <input type="checkbox" checked={g.auto} onChange={(e) => updateGroupSettings({ auto: e.target.checked })} />
            Make and update circles automatically
          </label>
          {logs.lastScan > 0 && <p className="muted tiny-text">Logs checked {relTime(logs.lastScan)}.</p>}
        </>
      )}
    </section>
  );
}

function SuggestionItem({ s, circleName }: { s: Suggestion; circleName?: string }) {
  const friends = useApp((st) => st.cache.friends);
  const [open, setOpen] = useState(false);
  const all = s.match ? s.match.add : [...s.members, ...s.extra];
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const chosen = all.filter((id) => !skip.has(id));
  const title = s.match ? `Add to ${circleName ?? "circle"}` : suggestionName(s, nameOf);

  return (
    <li className={`suggestion ${open ? "open" : ""}`}>
      <button className="suggestion-head" onClick={() => setOpen(!open)} title={open ? "Hide people" : "Show people"}>
        <span className="face-stack">
          {all.slice(0, 5).map((id) => {
            const f = friends[id];
            const src = f ? imgSrc(iconUrl(f)) : undefined;
            return <span key={id} className="face">{src ? <img src={src} alt="" /> : (f?.displayName ?? "?").slice(0, 1)}</span>;
          })}
          {all.length > 5 && <span className="face more">+{all.length - 5}</span>}
        </span>
        <span className="suggestion-text">
          <b>{title}</b>
          <span className="muted small">
            {s.match ? `${s.match.add.length} ${s.match.add.length === 1 ? "person" : "people"} who hang out with them · ` : `${all.length} people · `}
            ~{fmtHours(s.hours * 3600)} together on ~{Math.round(s.days)} days
            {s.worlds[0] ? ` · often in ${s.worlds[0]}` : ""}
          </span>
        </span>
      </button>
      {open && (
        <div className="suggestion-body">
          <div className="chips">
            {all.map((id) => (
              <label key={id} className={`chip ${skip.has(id) ? "off" : ""}`} title={s.extra.includes(id) ? "Also spends a lot of time with another group" : ""}>
                <input
                  type="checkbox"
                  checked={!skip.has(id)}
                  onChange={() => {
                    const next = new Set(skip);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    setSkip(next);
                  }}
                />
                {friends[id]?.displayName ?? "Unknown"}
                {s.extra.includes(id) && <span className="muted"> ↔</span>}
              </label>
            ))}
          </div>
          <p className="muted tiny-text">
            {Math.round(s.cohesion * 100)}% of the time these people spend with your friends is with each other. ↔ = also close to another group.
          </p>
        </div>
      )}
      <div className="suggestion-actions">
        <button className="btn small primary" disabled={!chosen.length} onClick={() => acceptSuggestion(s, chosen)}>
          {s.match ? `Add ${chosen.length}` : "Create circle"}
        </button>
        <button className="btn small" onClick={() => dismissSuggestion(s)}>
          Dismiss
        </button>
      </div>
    </li>
  );
}
