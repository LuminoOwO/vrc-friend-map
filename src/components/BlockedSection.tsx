// Settings → People & safety → Blocked people: everyone you've blocked, with the reason you
// gave (if any), to add, change or delete it. Reasons of people you've since unblocked stay
// listed until you delete them.
import { t as tr, language } from "../i18n";
import { useEffect, useMemo, useState } from "react";
import { imgSrc } from "../backend";
import { displayNameOf, refreshModerations, wantProfiles } from "../people";
import { reasonLabel, setBlockReason } from "../personal";
import { setState, useApp } from "../store";
import { openBlockAsk } from "../inbox";
import { Icon } from "./Icon";

const PAGE = 30;

export function BlockedSection() {
  const cache = useApp((s) => s.cache);
  const reasons = useApp((s) => s.local.blockReasons);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  useEffect(() => {
    void refreshModerations();
  }, []);

  const rows = useMemo(() => {
    const blocked = Object.entries(cache.moderations?.byUser ?? {})
      .filter(([, kinds]) => kinds.includes("block"))
      .map(([id]) => id);
    const ids = [...new Set([...blocked, ...Object.keys(reasons ?? {})])];
    return ids
      .map((id) => {
        const p = cache.friends[id] ?? cache.others?.[id];
        const at = cache.moderations?.blockedAt?.[id];
        return {
          id,
          name: displayNameOf(cache, id) ?? tr("blocked.unknown"),
          pic: p?.profilePicOverride || p?.iconUrl || p?.currentAvatarThumbnailImageUrl,
          blocked: blocked.includes(id),
          reason: reasons?.[id],
          when: at ? Date.parse(at) : reasons?.[id]?.t,
        };
      })
      .sort((a, b) => (b.when ?? 0) - (a.when ?? 0));
  }, [cache, reasons]);

  const q = query.trim().toLowerCase();
  const matching = q
    ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.reason?.text?.toLowerCase().includes(q) || r.reason?.reasons.some((x) => reasonLabel(x).toLowerCase().includes(q)))
    : rows;
  const visible = matching.slice(0, shown);

  // Pictures for the rows on screen (slowly, in the background, like other profiles).
  const missing = visible.filter((r) => !r.pic).map((r) => r.id).join(",");
  useEffect(() => {
    if (missing) wantProfiles(missing.split(","));
  }, [missing]);

  const ask = openBlockAsk;
  const withReason = rows.filter((r) => r.reason).length;

  return (
    <>
      <h3>{tr("blocked.title")}</h3>
      <p className="small muted">{tr("blocked.about", { count: rows.filter((r) => r.blocked).length, withReason })}</p>
      {rows.length > 8 && (
        <input className="blocked-search" type="search" value={query} placeholder={tr("blocked.search")} aria-label={tr("blocked.search")} onChange={(e) => setQuery(e.target.value)} />
      )}
      {rows.length === 0 ? (
        <p className="small muted">{cache.moderations ? tr("blocked.none") : tr("blocked.loading")}</p>
      ) : (
        <ul className="blocked-list">
          {visible.map((r) => (
            <li key={r.id} className="blocked-row">
              {r.pic ? (
                <img className="block-pic small" src={imgSrc(r.pic)} alt="" />
              ) : (
                <span className="block-pic small block-pic-empty" aria-hidden="true">
                  {r.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="blocked-main">
                <div className="blocked-name">
                  <button className="btn link" onClick={() => setState({ selectedId: r.id })} title={tr("personExtras.openProfile")}>
                    {r.name}
                  </button>
                  {!r.blocked && <span className="blocked-tag">{tr("blocked.notAnyMore")}</span>}
                  {r.when ? <span className="small muted">{new Date(r.when).toLocaleDateString(language(), { year: "numeric", month: "short", day: "numeric" })}</span> : null}
                </div>
                {r.reason ? (
                  <div className="small">
                    {r.reason.reasons.length > 0 && (
                      <span className="chips inline">
                        {r.reason.reasons.map((x) => (
                          <span key={x} className="chip reason on">
                            {reasonLabel(x)}
                          </span>
                        ))}
                      </span>
                    )}
                    {r.reason.text && <span className="muted"> “{r.reason.text}”</span>}
                  </div>
                ) : (
                  <div className="small muted">{tr("blocked.noReason")}</div>
                )}
              </div>
              <div className="blocked-actions">
                <button className="btn small" onClick={() => ask(r.id)}>
                  <Icon name={r.reason ? "flag" : "plus"} size={14} /> {r.reason ? tr("blocked.edit") : tr("blocked.add")}
                </button>
                {r.reason && (
                  <button
                    className="btn small ghost danger"
                    aria-label={tr("blocked.deleteFor", { name: r.name })}
                    title={tr("blocked.delete")}
                    onClick={() => {
                      if (confirm(tr("blocked.deleteConfirm", { name: r.name }))) setBlockReason(r.id, []);
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {matching.length > shown && (
        <button className="btn small" onClick={() => setShown((n) => n + PAGE)}>
          {tr("blocked.more", { count: matching.length - shown })}
        </button>
      )}
    </>
  );
}
