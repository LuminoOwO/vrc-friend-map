// Your own profile: click the status or the pronouns to change them right there, without the
// full profile editor. Saved to VRChat with the same call the editor uses.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { t as tr } from "../i18n";
import { backend } from "../backend";
import { STATUS_COLORS } from "../model";
import { fetchProfile } from "../sync";
import { getState, showToast, updateCache, useApp } from "../store";
import { Icon } from "./Icon";

const STATUSES = ["join me", "active", "ask me", "busy"] as const;
const statusLabel = (s: string) =>
  s === "join me" ? tr("status.joinMe") : s === "ask me" ? tr("status.askMe") : s === "busy" ? tr("status.busy") : tr("status.online");

/** Common pronouns, offered as one-click choices. */
export const PRONOUNS = [
  "she/her",
  "he/him",
  "they/them",
  "she/they",
  "he/they",
  "they/she",
  "they/he",
  "she/he",
  "any/all",
  "it/its",
  "xe/xem",
  "ze/zir",
  "fae/faer",
  "ask me",
  "use my name",
];

/** Saves user fields (status, statusDescription, pronouns) and updates what the app shows. */
async function saveUser(id: string, user: Record<string, string>): Promise<boolean> {
  const apply = () =>
    updateCache((c) => ({
      ...c,
      me: c.me && c.me.id === id ? { ...c.me, ...user, profile: c.me.profile ? { ...c.me.profile, ...user } : c.me.profile } : c.me,
      friends: c.friends[id] ? { ...c.friends, [id]: { ...c.friends[id], ...user } } : c.friends,
      details: { ...c.details, [id]: { ...(c.details[id] ?? { tags: [], fetchedAt: 0 }), ...user } },
    }));
  if (getState().demo) {
    apply();
    showToast(tr("quickEdit.demo"));
    return true;
  }
  try {
    const res = await backend.updateProfile(id, user, {});
    const bad = res.find((r) => r.status < 200 || r.status >= 300);
    if (bad) {
      const msg = typeof bad.data === "object" && bad.data ? (bad.data.error?.message ?? bad.data.message) : "";
      showToast(msg ? tr("profileEditor.saidNoMsg", { status: bad.status, message: msg }) : tr("profileEditor.saidNo", { status: bad.status }));
      return false;
    }
    apply();
    fetchProfile(id).catch(() => {});
    return true;
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** A small panel under its anchor; closes on Escape (without closing the profile) or a click outside. */
function Pop({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest?.(".qe-anchor") && onClose();
    window.addEventListener("keydown", key, true);
    document.addEventListener("mousedown", down);
    return () => {
      window.removeEventListener("keydown", key, true);
      document.removeEventListener("mousedown", down);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="qe-pop" role="dialog" aria-label={label}>
      {children}
    </div>
  );
}

export function StatusEdit({ id, status, text, onClose }: { id: string; status: string; text: string; onClose: () => void }) {
  const [s, setS] = useState(STATUSES.includes(status as (typeof STATUSES)[number]) ? status : "active");
  const [txt, setTxt] = useState(text);
  const [busy, setBusy] = useState(false);
  const history = useApp((st) => (st.cache.me as { statusHistory?: unknown } | null)?.statusHistory);
  const recent = (Array.isArray(history) ? history : []).filter((x): x is string => typeof x === "string" && !!x.trim() && x !== txt).slice(0, 6);
  const save = async () => {
    setBusy(true);
    const patch: Record<string, string> = {};
    if (s !== status) patch.status = s;
    if (txt !== text) patch.statusDescription = txt;
    const ok = !Object.keys(patch).length || (await saveUser(id, patch));
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Pop onClose={onClose} label={tr("quickEdit.status")}>
      <div className="qe-title">{tr("quickEdit.status")}</div>
      <div className="qe-statuses">
        {STATUSES.map((k) => (
          <button key={k} className={`qe-status ${s === k ? "on" : ""}`} aria-pressed={s === k} onClick={() => setS(k)}>
            <span className="dot" style={{ background: STATUS_COLORS[k] }} />
            {statusLabel(k)}
          </button>
        ))}
      </div>
      <label className="qe-field">
        <span className="small muted">{tr("quickEdit.statusText", { n: txt.length })}</span>
        <input
          autoFocus
          value={txt}
          maxLength={32}
          placeholder={tr("quickEdit.statusTextPlaceholder")}
          onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && save()}
        />
      </label>
      {recent.length > 0 && (
        <div className="qe-chips">
          {recent.map((r) => (
            <button key={r} className="qe-chip" onClick={() => setTxt(r)}>
              {r}
            </button>
          ))}
        </div>
      )}
      <div className="qe-actions">
        {txt && (
          <button className="btn small ghost" onClick={() => setTxt("")}>
            {tr("quickEdit.clear")}
          </button>
        )}
        <span className="grow" />
        <button className="btn small" onClick={onClose}>
          {tr("quickEdit.cancel")}
        </button>
        <button className="btn small primary" disabled={busy} onClick={save}>
          {busy ? tr("quickEdit.saving") : tr("quickEdit.save")}
        </button>
      </div>
    </Pop>
  );
}

export function PronounsEdit({ id, value, onClose }: { id: string; value: string; onClose: () => void }) {
  const [v, setV] = useState(value);
  const [busy, setBusy] = useState(false);
  const save = async (next = v) => {
    if (next === value) return onClose();
    setBusy(true);
    const ok = await saveUser(id, { pronouns: next.trim() });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Pop onClose={onClose} label={tr("quickEdit.pronouns")}>
      <div className="qe-title">{tr("quickEdit.pronouns")}</div>
      <div className="qe-chips">
        {PRONOUNS.map((p) => (
          <button key={p} className={`qe-chip ${v === p ? "on" : ""}`} aria-pressed={v === p} disabled={busy} onClick={() => save(p)}>
            {p}
          </button>
        ))}
      </div>
      <label className="qe-field">
        <span className="small muted">{tr("quickEdit.custom", { n: v.length })}</span>
        <input
          value={v}
          maxLength={32}
          placeholder={tr("quickEdit.customPlaceholder")}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && save()}
        />
      </label>
      <div className="qe-actions">
        {value && (
          <button className="btn small ghost" disabled={busy} onClick={() => save("")}>
            <Icon name="close" size={13} /> {tr("quickEdit.remove")}
          </button>
        )}
        <span className="grow" />
        <button className="btn small" onClick={onClose}>
          {tr("quickEdit.cancel")}
        </button>
        <button className="btn small primary" disabled={busy} onClick={() => save()}>
          {busy ? tr("quickEdit.saving") : tr("quickEdit.save")}
        </button>
      </div>
    </Pop>
  );
}
