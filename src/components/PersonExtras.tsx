// Profile additions (0.12): star, nickname, snooze, local time, online
// history and best time to catch someone, earlier names, friends since,
// VRChat's own note (editable), block reasons and invite actions.
import { useEffect, useMemo, useState } from "react";
import { describeHours, earlierNames, history, lastSeen, onlineShare, overlap, useHistory } from "../history";
import { friendsSince } from "../insights";
import { setUserNote, splitNote, userNoteOf, loadUserNotes, NOTE_MAX } from "../notesline";
import {
  BLOCK_REASONS,
  REASON_GROUP_LABEL,
  blockReasonOf,
  friendBlocksAbout,
  reasonLabel,
  setBlockReason,
  setNickname,
  setTimezone,
  snooze,
  snoozeUntil,
  timezoneOf,
  toggleStar,
  watchSlot,
} from "../personal";
import { fmtDate } from "../model";
import { setState, showToast, useApp } from "../store";
import { dayPart, differenceFromMe, hourIn, timeIn, zoneEntry, zoneLabel, ZONE_LIST } from "../tz";
import { requestInvite } from "../invites";
import { Icon } from "./Icon";
import { usePersonLog } from "./LogbookView";
import { pictureSrc } from "../logbook";

export function StarButton({ id }: { id: string }) {
  const on = useApp((s) => s.local.starred?.includes(id) ?? false);
  return (
    <button className={`btn star-btn ${on ? "on" : ""}`} title={on ? "Starred: stays at the top and stands out on the map" : "Star this friend"} aria-pressed={on} onClick={() => toggleStar(id)}>
      <Icon name="star" size={16} />
    </button>
  );
}

export function NicknameAndSnooze({ id, name }: { id: string; name: string }) {
  const nick = useApp((s) => s.local.nicknames?.[id] ?? "");
  const until = useApp((s) => s.local.snoozed?.[id] ?? 0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(nick);
  useEffect(() => setDraft(nick), [nick, id]);
  const snoozed = until > Date.now();
  return (
    <div className="person-extras" data-flip-fade>
      {editing ? (
        <form
          className="row tight"
          onSubmit={(e) => {
            e.preventDefault();
            setNickname(id, draft);
            setEditing(false);
          }}
        >
          <input autoFocus value={draft} maxLength={40} placeholder={`Your name for ${name}`} onChange={(e) => setDraft(e.target.value)} />
          <button className="btn small primary" type="submit">
            Save
          </button>
          <button className="btn small" type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button className="btn small ghost" onClick={() => setEditing(true)} title="Your own name for them, shown on the map (only you see it)">
          <Icon name="tag" size={14} /> {nick ? `Nickname: ${nick}` : "Nickname"}
        </button>
      )}
      <label className={`btn small ghost select-btn ${snoozed ? "on" : ""}`} title="Pause notifications about them">
        <Icon name={snoozed ? "bell-off" : "clock"} size={14} />
        {snoozed ? `Snoozed until ${new Date(until).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : "Snooze"}
        <select
          value=""
          onChange={(e) => {
            const v = e.target.value as "1h" | "3h" | "tomorrow" | "week" | "off";
            if (v === "off") snooze(id, null);
            else if (v) snooze(id, snoozeUntil(v));
          }}
        >
          <option value="">Snooze notifications…</option>
          <option value="1h">For an hour</option>
          <option value="3h">For 3 hours</option>
          <option value="tomorrow">Until tomorrow 8:00</option>
          <option value="week">For a week</option>
          {snoozed && <option value="off">Stop snoozing</option>}
        </select>
      </label>
    </div>
  );
}

/** Their local time: verified, shared, or a suggestion you can confirm. */
export function LocalTime({ id, name }: { id: string; name: string }) {
  useApp((s) => s.local.timezones?.[id]);
  useApp((s) => s.cache.linkReads?.[id]);
  useApp((s) => s.cache.details[id]?.bio);
  useApp((s) => s.cache.groups?.[id]);
  const [, tick] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30e3);
    return () => clearInterval(t);
  }, []);
  const tz = timezoneOf(id);
  if (!tz.tz && !open) {
    return (
      <div className="profile-block local-time" data-flip-fade>
        <h3>Local time</h3>
        <p className="small muted">
          Nothing to go on yet.{" "}
          <button className="btn link small" onClick={() => setOpen(true)}>
            Set their time zone
          </button>
        </p>
      </div>
    );
  }
  const diff = tz.tz ? differenceFromMe(tz.tz) : null;
  const diffText = diff === null ? "" : diff === 0 ? "same as you" : `${Math.abs(diff)} h ${diff > 0 ? "ahead of" : "behind"} you`;
  const verified = tz.how === "set" || tz.how === "confirmed" || tz.how === "shared";
  return (
    <div className="profile-block local-time" data-flip-fade>
      <h3>Local time</h3>
      {tz.tz && (
        <p className="local-time-now">
          <b>{timeIn(tz.tz)}</b> {!verified && <span className="tag-suggested">probably</span>} <span className="muted small">{zoneLabel(tz.tz)} · {diffText}</span>
          {(() => {
            const h = hourIn(tz.tz);
            if (h === null) return null;
            const part = dayPart(h);
            return <span className={`small ${part === "night" ? "warn" : "muted"}`}> · it's {part} for {name}</span>;
          })()}
        </p>
      )}
      <p className="small muted">
        {tz.how === "set" && "You set this."}
        {tz.how === "confirmed" && "You confirmed this suggestion."}
        {tz.how === "shared" && `${name} shares their time zone through the app.`}
        {tz.how === "suggested" && "A guess until you confirm it."}{" "}
        <button className="btn link small" onClick={() => setOpen(!open)}>
          {open ? "Close" : verified ? "Change" : "Why, and other options"}
        </button>
      </p>
      {open && (
        <div className="tz-options">
          {tz.candidates.length > 0 && (
            <ul className="tz-candidates">
              {tz.candidates.map((c) => (
                <li key={c.tz}>
                  <div>
                    <b>{c.label}</b> <span className="muted small">({timeIn(c.tz)} now)</span>
                    <div className="small muted">{c.reasons.slice(0, 4).join(" · ")}</div>
                  </div>
                  <button className="btn small" onClick={() => setTimezone(id, c.tz, "confirmed")}>
                    <Icon name="check" size={14} /> That's it
                  </button>
                </li>
              ))}
            </ul>
          )}
          <TzPicker value={tz.tz} onPick={(z) => setTimezone(id, z, "set")} />
          <div className="row">
            {(tz.how === "set" || tz.how === "confirmed") && (
              <button className="btn small ghost" onClick={() => setTimezone(id, null)}>
                Forget
              </button>
            )}
          </div>
          <p className="small muted">Synced between your devices only. Suggestions come from their bio, status, linked pages, languages, groups and usual online hours.</p>
        </div>
      )}
    </div>
  );
}

/** The 38 time zones by UTC offset, in the app's own look, with a filter. */
function TzPicker({ value, onPick }: { value: string | null | undefined; onPick: (tz: string) => void }) {
  const [q, setQ] = useState("");
  const current = value ? zoneEntry(value) : undefined;
  const words = q.toLowerCase().trim();
  const shown = words ? ZONE_LIST.filter((z) => `${z.offset} ${z.places}`.toLowerCase().includes(words) || z.offset.replace("−", "-").toLowerCase().includes(words)) : ZONE_LIST;
  return (
    <div className="tz-picker">
      <input id="tz-filter" type="search" placeholder="Filter: a country, a city or +2" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter time zones" />
      <ul className="tz-list" role="listbox" aria-label="Time zones">
        {shown.map((z) => (
          <li key={z.tz}>
            <button type="button" role="option" aria-selected={current?.tz === z.tz} className={current?.tz === z.tz ? "on" : ""} onClick={() => onPick(z.tz)}>
              <b>{z.offset}</b>
              <span className="tz-places">{z.places}</span>
              <span className="tz-now">{timeIn(z.tz)}</span>
            </button>
          </li>
        ))}
        {!shown.length && <li className="small muted tz-none">No time zone matches “{q}”.</li>}
      </ul>
    </div>
  );
}

const DAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** Last seen, usual online hours, best time to catch them, friends since, earlier names. */
export function OnlineHistory({ id, name, online }: { id: string; name: string; online: boolean }) {
  const seen = useHistory((h) => h.seen[id]);
  const log = useApp((s) => s.local.friendLog);
  const logSince = useApp((s) => s.local.logSince);
  const since = useMemo(() => friendsSince(id, log), [id, log]);
  const share = onlineShare(seen);
  const best = overlap(id);
  const names = earlierNames(id);
  const last = lastSeen(id);
  return (
    <div className="profile-block online-history" data-flip-fade>
      <h3>Online</h3>
      <dl className="facts">
        {!online && (
          <>
            <dt>Last seen</dt>
            <dd>{last ? `${ago(last)} (${new Date(last).toLocaleString()})` : "not seen online yet"}</dd>
          </>
        )}
        <dt>Friends since</dt>
        <dd>{since ? fmtDate(since) : logSince ? `before ${fmtDate(logSince)}` : "unknown"}</dd>
        {best && best.length > 0 && (
          <>
            <dt>Best time to catch {name}</dt>
            <dd>you're both usually on {describeHours(best.map((b) => b.hour))}</dd>
          </>
        )}
        {names.length > 0 && (
          <>
            <dt>Earlier names</dt>
            <dd>{names.map((n) => `${n.name} (until ${fmtDate(n.to)})`).join(", ")}</dd>
          </>
        )}
      </dl>
      {share ? (
        <div className="heatmap" role="img" aria-label={`Usual online hours of ${name}`}>
          {DAY_SHORT.map((d, day) => (
            <div key={d} className="heat-row">
              <span className="heat-day">{d}</span>
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="heat-cell" style={{ opacity: 0.08 + share[day * 24 + h] * 0.92 }} title={`${d} ${h}:00 – ${share[day * 24 + h] > 0.6 ? "often" : share[day * 24 + h] > 0.25 ? "sometimes" : "rarely"} online`} />
              ))}
            </div>
          ))}
          <div className="heat-row heat-hours">
            <span className="heat-day" />
            {[0, 6, 12, 18].map((h) => (
              <span key={h} className="heat-hour" style={{ gridColumn: `${h + 2} / span 6` }}>
                {h}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="small muted">Usual online hours show up after a few days of the app running ({Math.round((seen?.total ?? 0) / 60)} h seen so far).</p>
      )}
    </div>
  );
}

function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60e3);
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** VRChat's own note on them (shown in game too), editable. */
export function VrcNote({ id }: { id: string }) {
  const note = useApp((s) => s.cache.userNotes?.byUser[id] ?? s.cache.details[id]?.note ?? "");
  const demo = useApp((s) => s.demo);
  const [editing, setEditing] = useState(false);
  const { line, rest } = splitNote(note);
  const [draft, setDraft] = useState(rest);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setDraft(splitNote(userNoteOf(id)).rest);
  }, [id, note]);
  useEffect(() => {
    if (!demo) void loadUserNotes().catch(() => {});
  }, [demo]);
  const room = NOTE_MAX - (line ? line.length + 1 : 0);
  return (
    <div className="profile-block" data-flip-fade>
      <h3>
        Your note <span className="muted small">(VRChat's, shown in game)</span>
      </h3>
      {line && <p className="note-flag small">{line}</p>}
      {editing ? (
        <>
          <textarea rows={3} value={draft} maxLength={NOTE_MAX} onChange={(e) => setDraft(e.target.value)} />
          <div className="row">
            <span className={`small ${draft.length > room ? "warn" : "muted"}`}>
              {draft.length}/{room}
              {line ? " (the flag line takes the rest)" : ""}
            </span>
            <span className="grow" />
            <button className="btn small" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              className="btn small primary"
              disabled={busy || demo}
              onClick={async () => {
                setBusy(true);
                const err = await setUserNote(id, draft);
                setBusy(false);
                if (err) showToast(`Couldn't save the note: ${err}`);
                else setEditing(false);
              }}
            >
              Save
            </button>
          </div>
        </>
      ) : (
        <>
          {rest ? <p className="note-text">{rest}</p> : <p className="small muted">No note.</p>}
          <button className="btn small ghost" onClick={() => setEditing(true)}>
            <Icon name="settings" size={14} /> {rest ? "Edit note" : "Add a note"}
          </button>
        </>
      )}
    </div>
  );
}

/** Block reasons: yours (editable) and what friends shared. */
export function BlockFlags({ id, blocked }: { id: string; blocked: boolean }) {
  const mine = useApp((s) => s.local.blockReasons?.[id]);
  useApp((s) => s.local.imports);
  const theirs = friendBlocksAbout(id);
  if (!mine && !theirs.length && !blocked) return null;
  return (
    <div className="red-flags" data-flip-fade>
      {theirs.map((b) => (
        <p key={`${b.byId}-${b.t}`} className="red-flag">
          <Icon name="flag" size={15} />
          <span>
            <button className="link-btn" disabled={!b.byId} onClick={() => b.byId && setState({ selectedId: b.byId })}>
              {b.by}
            </button>{" "}
            blocked them{b.reasons.length ? `: ${b.reasons.map(reasonLabel).join(", ")}` : ""} ({fmtDate(b.t)}).
          </span>
        </p>
      ))}
      {(mine || blocked) && (
        <p className="red-flag mine">
          <Icon name="flag" size={15} />
          <span>
            {mine?.reasons.length ? `You blocked them: ${mine.reasons.map(reasonLabel).join(", ")}` : "You blocked them."}
            {mine?.text && <span className="muted"> “{mine.text}”</span>}{" "}
            <button className="btn link small" onClick={() => setState((s) => ({ blockAsk: [...new Set([...s.blockAsk, id])] }))}>
              {mine ? "Change reasons" : "Add reasons"}
            </button>
          </span>
        </p>
      )}
    </div>
  );
}

/** The dialog after blocking someone: pick reasons. */
export function BlockReasonDialog() {
  const queue = useApp((s) => s.blockAsk);
  const id = queue[0];
  const person = useApp((s) => (id ? (s.cache.friends[id] ?? s.cache.others?.[id]) : null));
  const age = useApp((s) => (id ? s.cache.ageHints?.[id] : undefined));
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  useEffect(() => {
    const cur = id ? blockReasonOf(id) : null;
    setPicked(cur?.reasons ?? []);
    setText(cur?.text ?? "");
  }, [id]);
  if (!id) return null;
  const close = () => setState((s) => ({ blockAsk: s.blockAsk.slice(1) }));
  const name = person?.displayName ?? "Them";
  const adult = age?.hints.filter((h) => h.dir === "adult").length ?? 0;
  const minor = age?.hints.filter((h) => h.dir === "minor").length ?? 0;
  const ageText = !age ? "" : adult && !minor ? "hints point to over 18" : minor && !adult ? "hints point to under 18" : adult || minor ? "mixed age hints" : "no age hints";
  const toggle = (r: string) => setPicked((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));
  return (
    <div className="modal-backdrop top" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal block-reasons" role="dialog" aria-labelledby="block-title" onKeyDown={(e) => e.key === "Escape" && close()}>
        <div className="row">
          {person?.iconUrl || person?.currentAvatarThumbnailImageUrl ? <img className="block-pic" src={person.iconUrl || person.currentAvatarThumbnailImageUrl} alt="" /> : null}
          <div>
            <h2 id="block-title">Why did you block {name}?</h2>
            {ageText && <p className="small muted">Age: {ageText}</p>}
          </div>
        </div>
        {(["annoying", "harmful", "technical"] as const).map((g) => (
          <div key={g} className="reason-group">
            <span className="flabel">{REASON_GROUP_LABEL[g]}</span>
            <div className="chips">
              {BLOCK_REASONS.filter((r) => r.group === g).map((r) => (
                <button key={r.id} className={`chip reason ${picked.includes(r.id) ? "on" : ""}`} aria-pressed={picked.includes(r.id)} onClick={() => toggle(r.id)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <label className="field">
          <span>In your own words (only on your devices, never shared)</span>
          <input value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="optional" />
        </label>
        <p className="small muted">
          The reasons you pick can be shared with friends like friend removals (per server, off by default), and shown at the top of your VRChat note on them if you turn that on.
          {queue.length > 1 ? ` ${queue.length - 1} more after this.` : ""}
        </p>
        <div className="row end">
          <button className="btn" onClick={close}>
            Skip
          </button>
          <button
            className="btn primary"
            onClick={() => {
              setBlockReason(id, picked, text);
              close();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/** Request an invite (with a saved message) and watch a full instance for a free slot. */
export function InviteActions({ id, name, location, full, worldName }: { id: string; name: string; location: string; full: boolean; worldName: string }) {
  const allTemplates = useApp((s) => s.local.inviteTemplates);
  const templates = useMemo(() => (allTemplates ?? []).filter((t) => t.kind === "request"), [allTemplates]);
  const watching = useApp((s) => !!s.local.slotWatch?.[location]);
  const demo = useApp((s) => s.demo);
  const [busy, setBusy] = useState(false);
  const send = async (slot?: number) => {
    setBusy(true);
    const err = await requestInvite(id, slot);
    setBusy(false);
    showToast(err ? `Couldn't ask for an invite: ${err}` : `Asked ${name} for an invite`);
  };
  return (
    <div className="world-actions">
      <button className="btn" disabled={busy || demo} onClick={() => send()} title={`Ask ${name} to invite you`}>
        <Icon name="user-plus" size={16} /> Request invite
      </button>
      {templates.length > 0 && (
        <label className="btn select-btn" title="Request an invite with one of your saved messages">
          <Icon name="copy" size={16} /> With message
          <select value="" disabled={busy || demo} onChange={(e) => e.target.value && send(Number(e.target.value))}>
            <option value="">Pick a message…</option>
            {templates
              .filter((t) => t.slot !== undefined)
              .map((t) => (
                <option key={t.id} value={t.slot}>
                  {t.text}
                </option>
              ))}
          </select>
        </label>
      )}
      {full && (
        <button className={`btn ${watching ? "on" : ""}`} onClick={() => watchSlot(location, worldName || name, !watching)} title="Tell me when someone leaves and a slot opens (for 3 hours)">
          <Icon name={watching ? "bell-off" : "bell"} size={16} /> {watching ? "Stop watching" : "Tell me when a slot opens"}
        </button>
      )}
    </div>
  );
}

/** For the history store to be loaded where the profile is used first. */
export function useHistoryReady() {
  return useHistory(() => history().seen);
}

/** From your game logs: avatars they were seen in, and your pictures with them. */
export function PersonLog({ id, name }: { id: string; name: string }) {
  const data = usePersonLog(id, name);
  const [open, setOpen] = useState(false);
  if (!data || (!data.pics.length && !data.avatars.length)) return null;
  return (
    <div className="profile-block" data-flip-fade>
      <h3>From your game logs</h3>
      {data.avatars.length > 0 && (
        <p className="small">
          <b>Avatars seen:</b> {data.avatars.slice(0, open ? 40 : 6).map((a) => a.avatar).join(", ")}
          {data.avatars.length > 6 && (
            <button className="btn link small" onClick={() => setOpen(!open)}>
              {open ? "less" : `+${data.avatars.length - 6} more`}
            </button>
          )}
        </p>
      )}
      {data.pics.length > 0 && (
        <>
          <p className="small">
            <b>Your pictures with {name}:</b> {data.pics.length}
          </p>
          <div className="pic-grid small-pics">
            {data.pics.slice(0, 12).map((p) => (
              <a key={p.path} className="pic" href={pictureSrc(p.path)} target="_blank" rel="noreferrer" title={p.worldName}>
                <img src={pictureSrc(p.path)} alt="" loading="lazy" />
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Both people's encryption keys as one code to compare (in person, in VRChat): same code = nobody swapped a key. */
export function SafetyCode({ id, name }: { id: string; name: string }) {
  const pin = useApp((s) => s.keyPins?.[id]);
  const [mine, setMine] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void import("../backend").then(({ backend }) => backend.share.identity().then((m) => setMine(m.fingerprint), () => setMine(null)));
  }, []);
  useEffect(() => {
    if (!pin || !mine) return;
    const [a, b] = [mine, pin.fingerprint].sort();
    void crypto.subtle.digest("SHA-256", new TextEncoder().encode(`vfm-safety|${a}|${b}`)).then((h) => {
      const bytes = new Uint8Array(h);
      const groups: string[] = [];
      for (let i = 0; i < 6; i++) groups.push(String(((bytes[i * 3] << 16) | (bytes[i * 3 + 1] << 8) | bytes[i * 3 + 2]) % 100000).padStart(5, "0"));
      setCode(groups.join(" "));
    });
  }, [pin, mine]);
  if (!pin || !mine) return null;
  return (
    <div className="profile-block" data-flip-fade>
      <button className="age-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <h3>Encryption</h3>
        <span className="age-headline">{pin.offered ? "their key changed: check the code" : "compare a code to be sure"}</span>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={14} />
      </button>
      {open && (
        <>
          <p className="safety-code">{code}</p>
          <p className="small muted">
            Ask {name} to open your profile in their app: if they see the same code, what you share with each other can't be read or swapped by a
            server in between. It changes only if one of you gets a new key.
          </p>
        </>
      )}
    </div>
  );
}
