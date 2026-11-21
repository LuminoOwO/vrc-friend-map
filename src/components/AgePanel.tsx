// Profile → Age: hints from their own profile, your note (this device only),
// what you tell friends (adult vouches or "keep your distance", never "under
// 18"), and what friends told you. See src/age.ts for the rules.
import { t as tr } from "../i18n";
import { useEffect, useState } from "react";
import { friendNotesAbout, noteExpires, noteOf, RATINGS, refreshHints, setNote, setShareNote, SHARE_NOTES, summarize } from "../age";
import { fmtDate } from "../model";
import { setState, useApp } from "../store";
import type { AgeRating, ShareNote } from "../types";
import { Icon } from "./Icon";

const READ_LABEL: Record<string, string> = { read: "read", login: "login needed", unreachable: "unreachable", skipped: "skipped" };

const VERDICT: Record<string, string> = {
  adult: "Hints point to over 18",
  minor: "Hints point to under 18",
  mixed: "Mixed hints",
  none: "No hints in their profile",
};

export function AgePanel({ id }: { id: string }) {
  const enabled = useApp((s) => s.settings.age.enabled);
  const readLinks = useApp((s) => s.settings.age.readLinks);
  const linkKey = useApp((s) => `${s.settings.age.linkDepth}/${s.settings.age.maxPages}/${s.settings.age.socials}/${s.settings.age.fxTwitter}`);
  const reads = useApp((s) => s.cache.linkReads?.[id]?.reads);
  const hintsEntry = useApp((s) => s.cache.ageHints?.[id]);
  const profileAt = useApp((s) => s.cache.details[id]?.profileFetchedAt);
  const bio = useApp((s) => s.cache.details[id]?.bio);
  useApp((s) => s.local.ageNotes?.[id]);
  const share = useApp((s) => s.local.shareNotes?.[id]);
  useApp((s) => s.local.imports);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (enabled) void refreshHints(id);
  }, [id, enabled, profileAt, bio, readLinks, linkKey]);

  if (!enabled) return null;
  const note = noteOf(id);
  const hints = hintsEntry?.hints ?? [];
  const sum = summarize(hints);
  const fromFriends = friendNotesAbout(id);
  const distance = fromFriends.filter((n) => n.v === "distance");
  const vouches = fromFriends.filter((n) => n.v !== "distance");
  const headline = note
    ? tr("age.yourNoteValue", { value: RATINGS.find((r) => r.value === note.rating)?.label })
    : !sum.strong && (sum.verdict === "adult" || sum.verdict === "minor")
      ? sum.verdict === "adult" ? tr("age.hintsPointToProbablyOver") : tr("age.hintsPointToProbablyUnder")
      : VERDICT[sum.verdict];
  const warn = !note && (sum.verdict === "minor" || sum.verdict === "mixed");

  return (
    <div className="profile-block age-block" data-flip-fade>
      <button className="age-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <h3>{tr("age.age")}</h3>
        <span className={`age-headline ${warn ? "warn" : ""} ${note?.rating === "minor" || note?.rating === "likely-minor" ? "warn" : ""}`}>{headline}</span>
        {distance.length > 0 && <span className="age-distance">keep your distance ({distance.length})</span>}
        <Icon name={open ? "chevron-up" : "chevron-down"} size={14} />
      </button>
      {open && (
        <div className="age-body">
          {note?.rating !== "sure-adult" && (
            <>
              {hints.length > 0 ? (
                <ul className="age-hints">
                  {hints.map((h, i) => (
                    <li key={i} className={h.dir}>
                      <b>{h.dir === "adult" ? tr("age.over18") : tr("age.under18")}</b> · {h.why} <span className="muted">({h.source})</span>
                      <div className="small muted">“{h.snippet}”</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">Nothing in their bio, pronouns, status{readLinks ? tr("age.linksOrLinkedPages") : tr("age.orLinks")} hints at their age.</p>
              )}
              {readLinks && reads && reads.length > 0 && (
                <details className="link-reads">
                  <summary className="small">
                    Linked pages: {reads.filter((r) => r.status === "read").length} read
                    {reads.some((r) => r.status === "login") && `, ${reads.filter((r) => r.status === "login").length} need a login`}
                    {reads.some((r) => r.status === "unreachable") && `, ${reads.filter((r) => r.status === "unreachable").length} unreachable`}
                    {reads.some((r) => r.status === "skipped") && `, ${reads.filter((r) => r.status === "skipped").length} skipped`}
                  </summary>
                  <ul>
                    {reads.map((r) => (
                      <li key={r.url} className={r.status}>
                        <span className={`link-status ${r.status}`}>{READ_LABEL[r.status]}</span> <b>{r.site}</b>{" "}
                        <span className="muted small selectable">{r.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                        {r.depth > 0 && <span className="muted small"> {tr("age.foundOnALinkedPage")}</span>}
                        {r.note && <span className="muted small"> – {r.note}</span>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="small muted">
                Hints are guesses from what they wrote; VRChat's 18+ badge isn't counted (verified accounts get sold). Only you see them.
              </p>
            </>
          )}
          <label className="field narrow">
            <span>{tr("age.yourNoteOnlyOnThis")}</span>
            <select value={note?.rating ?? ""} onChange={(e) => setNote(id, (e.target.value || null) as AgeRating | null)}>
              <option value="">{tr("age.noNote")}</option>
              {RATINGS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {note && (
            <p className="small muted">
              Set {fmtDate(note.t)}
              {Number.isFinite(noteExpires(note)) ? tr("age.fadesOnValue", { value: fmtDate(noteExpires(note)) }) : ""}.
            </p>
          )}
          <label className="field narrow">
            <span>{tr("age.tellFriendsThroughYourServers")}</span>
            <select value={share?.v ?? ""} onChange={(e) => setShareNote(id, (e.target.value || null) as ShareNote["v"] | null)}>
              <option value="">{tr("age.nothing")}</option>
              {SHARE_NOTES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <p className="small muted">
            Goes to the people you share with on your servers (Shared lists → servers → “My notes about people”). “Keep your distance” carries no
            reason. Notes saying someone is under 18 can't be shared.
          </p>
          {fromFriends.length > 0 && (
            <div className="age-friends">
              <span className="small">{tr("age.fromFriends")}</span>
              {[...distance, ...vouches].map((n) => (
                <p key={`${n.byId}-${n.v}`} className={`small ${n.v === "distance" ? "age-distance-line" : ""}`}>
                  <button className="link-btn" disabled={!n.byId} onClick={() => n.byId && setState({ selectedId: n.byId })}>
                    {n.by}
                  </button>
                  : {SHARE_NOTES.find((s) => s.value === n.v)?.label} <span className="muted">({fmtDate(n.t)})</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
