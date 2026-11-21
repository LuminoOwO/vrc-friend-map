import { t as tr } from "../i18n";
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
        <h3>{tr("groups.suggestedGroups")}</h3>
        <span className="row tight">
          {supported && !demo && (
            <button className="icon-btn tiny" title={tr("groups.readNewLogEntriesNow")} disabled={logs.scanning} onClick={() => scanLogs(true)}>
              <Icon name="refresh" size={14} />
            </button>
          )}
          <button className="icon-btn tiny" title={tr("groups.groupDetectionSettings")} onClick={openSettings}>
            <Icon name="settings" size={14} />
          </button>
        </span>
      </div>
      {!supported ? (
        <p className="muted small">
          {tr("groups.groupsAreSuggestedFromVrchat")}
        </p>
      ) : !enabled && !demo && !useLive ? (
        <p className="muted small">
          Reading game logs is turned off.{" "}
          <button className="btn link small" onClick={openSettings}>
            {tr("groups.turnItOn")}
          </button>
        </p>
      ) : (
        <>
          <p className="muted small">
            {tr("groups.fromTimeSpentInThe")}
            {logsHere && enabled ? (report && report.visits > 0 ? tr("groups.withYouVisits", { visits: report.visits, count: spanDays }) : tr("groups.withYou")) : ""}
            {useLive ? tr(observedPairs ? "groups.betweenFriendsPairs" : "groups.betweenFriends", { lead: logsHere && enabled ? tr("groups.and") : tr("groups.colon"), pairs: observedPairs }) : ""}.
          </p>
          {logs.error && <p className="small warn">{logs.error}</p>}
          {suggestions.length === 0 ? (
            <p className="muted small">
              {(!report || report.visits === 0) && !observedPairs
                ? logs.scanning
                  ? tr("groups.readingLogs")
                  : tr("groups.nothingCollectedYetKeepThe")
                : pairsUsable === 0
                  ? tr("groups.nothingYetSuggestionsNeedPeople", { minMinutes: g.minMinutes, minDays: g.minDays })
                  : tr("groups.noNewGroupsEverythingFound")}
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
            {tr("groups.makeAndUpdateCirclesAutomatically")}
          </label>
          {logs.lastScan > 0 && <p className="muted tiny-text">{tr("groups.logsCheckedValue", { value: relTime(logs.lastScan) })}</p>}
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
  const title = s.match ? tr("groups.addToValue", { value: circleName ?? "circle" }) : suggestionName(s, nameOf);

  return (
    <li className={`suggestion ${open ? "open" : ""}`}>
      <button className="suggestion-head" onClick={() => setOpen(!open)} title={open ? tr("groups.hidePeople") : tr("groups.showPeople")}>
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
            {s.match ? tr("groups.lengthValueWhoHangOut", { count: s.match.add.length }) : tr("groups.lengthPeople", { length: all.length })}
            ~{fmtHours(s.hours * 3600)} together on ~{Math.round(s.days)} days
            {s.worlds[0] ? tr("groups.oftenInValue", { value: s.worlds[0] }) : ""}
          </span>
        </span>
      </button>
      {open && (
        <div className="suggestion-body">
          <div className="chips">
            {all.map((id) => (
              <label key={id} className={`chip ${skip.has(id) ? "off" : ""}`} title={s.extra.includes(id) ? tr("groups.alsoSpendsALotOf") : ""}>
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
          {s.match ? tr("groups.addLength", { length: chosen.length }) : tr("groups.createCircle")}
        </button>
        <button className="btn small" onClick={() => dismissSuggestion(s)}>
          {tr("groups.dismiss")}
        </button>
      </div>
    </li>
  );
}
