// The notification center (top left, apart from the other buttons) and the in-app pop-ups
// under it. What goes in: src/inbox.ts.
import { t as tr, language, useT } from "../i18n";
import { useCallback, useState } from "react";
import { imgSrc } from "../backend";
import { markAllRead, useHistory, type Missed } from "../history";
import { dismissPopup, holdPopup, INBOX_EVENTS, openBlockAsk } from "../inbox";
import { displayNameOf } from "../people";
import { getState, setState, useApp, type Popup } from "../store";
import { Icon } from "../components/Icon";
import { useDismiss } from "./dismiss";
import type { NotifyEvent } from "../types";

const ICON: Record<string, string> = {
  friendRequest: "user-plus",
  added: "user-check",
  removed: "heart",
  invite: "share",
  requestInvite: "user-plus",
  slotOpen: "users",
  blockAsk: "flag",
  friendBlockedHere: "flag",
};

/** Open what a notification is about: the block question, or the person's profile. */
function act(kind: NotifyEvent | "blockAsk", userId: string) {
  if (kind === "blockAsk") openBlockAsk(userId);
  else if (userId.startsWith("usr_")) setState({ selectedId: userId });
}

function usePic(userId: string): string | undefined {
  return useApp((s) => {
    const p = s.cache.friends[userId] ?? s.cache.others?.[userId];
    return p ? imgSrc(p.profilePicOverride || p.iconUrl || p.currentAvatarThumbnailImageUrl) : undefined;
  });
}

function Pic({ userId, kind }: { userId: string; kind: string }) {
  const pic = usePic(userId);
  return (
    <span className={`inbox-pic k-${kind}`} aria-hidden="true">
      {pic ? <img src={pic} alt="" /> : <Icon name={ICON[kind] ?? "bell"} size={16} />}
      {pic && (
        <span className="inbox-pic-badge">
          <Icon name={ICON[kind] ?? "bell"} size={11} />
        </span>
      )}
    </span>
  );
}

/** Unread items in the center: new notifications of the kept kinds, and open block questions. */
export function useInboxCount(): number {
  const unread = useHistory((h) => h.missed.filter((m) => !m.read && INBOX_EVENTS.has(m.event)).length);
  const asks = useApp((s) => s.blockAsk.length);
  return unread + asks;
}

export function Inbox({ className = "" }: { className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    markAllRead();
  }, []);
  const ref = useDismiss(open, close);
  const count = useInboxCount();
  const missed = useHistory((h) => h.missed);
  const asks = useApp((s) => s.blockAsk);
  const cache = useApp((s) => s.cache);
  // Not memoized: history changes the same array in place.
  const list = missed.filter((m) => INBOX_EVENTS.has(m.event)).sort((a, b) => b.t - a.t).slice(0, 40);
  const label = count ? t("inbox.titleCount", { count }) : t("inbox.title");
  return (
    <div className={`inbox ${className}`} ref={ref}>
      <button className={`inbox-btn ${count ? "has" : ""} ${open ? "on" : ""}`} aria-label={label} title={label} aria-expanded={open} onClick={() => {
          if (open) close();
          else {
            // Everything worth keeping is in the list; the pop-ups would cover it.
            for (const p of getState().popups) dismissPopup(p.id);
            setOpen(true);
          }
        }}>
        <Icon name="bell" size={20} />
        {count > 0 && <span className="inbox-count">{count > 99 ? "99+" : count}</span>}
      </button>
      {open && (
        <div className="inbox-drop" role="dialog" aria-label={t("inbox.title")}>
          <div className="inbox-head">
            <b>{t("inbox.title")}</b>
          </div>
          {asks.length === 0 && list.length === 0 ? (
            <p className="small muted inbox-empty">{t("inbox.empty")}</p>
          ) : (
            <ul className="inbox-list">
              {asks.map((id) => (
                <li key={`ask-${id}`}>
                  <button
                    className="inbox-item new ask"
                    onClick={() => {
                      setOpen(false);
                      openBlockAsk(id);
                    }}
                  >
                    <Pic userId={id} kind="blockAsk" />
                    <span className="inbox-text">
                      <span>{t("inbox.whyBlocked", { name: displayNameOf(cache, id) ?? t("personExtras.them") })}</span>
                      <span className="small muted">{t("inbox.tapToAnswer")}</span>
                    </span>
                  </button>
                </li>
              ))}
              {list.map((m: Missed, i) => (
                <li key={`${m.t}-${i}`}>
                  <button
                    className={`inbox-item ${m.read ? "" : "new"}`}
                    onClick={() => {
                      close();
                      act(m.event, m.userId);
                    }}
                  >
                    <Pic userId={m.userId} kind={m.event} />
                    <span className="inbox-text">
                      <span>{m.text}</span>
                      <span className="small muted">
                        {new Date(m.t).toLocaleString(language(), { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                        {m.why === "quiet" ? tr("parts.duringQuietHours") : m.why === "muted" ? tr("parts.whileMuted") : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            className="inbox-foot"
            onClick={() => {
              close();
              setState({ view: "activity" });
            }}
          >
            {t("inbox.restInActivity")}
          </button>
        </div>
      )}
    </div>
  );
}

/** The in-app pop-ups, under the notification center. */
export function Popups() {
  const popups = useApp((s) => s.popups);
  const secs = useApp((s) => s.settings.notify.popupSeconds);
  if (!popups.length) return null;
  return (
    <div className="popups" role="status" aria-live="polite">
      {[...popups].reverse().map((p: Popup) => (
        <div key={p.id} className={`popup k-${p.kind}`} style={{ ["--life" as string]: `${secs}s` }} onMouseEnter={() => holdPopup(p.id, true)} onMouseLeave={() => holdPopup(p.id, false)}>
          <button
            className="popup-main"
            onClick={() => {
              dismissPopup(p.id);
              act(p.kind, p.userId);
            }}
          >
            <Pic userId={p.userId} kind={p.kind} />
            <span className="inbox-text">
              <span>{p.text}</span>
              {p.kind === "blockAsk" && <span className="small muted">{tr("inbox.tapToAnswer")}</span>}
            </span>
          </button>
          <button className="popup-close" aria-label={tr("common.close")} onClick={() => dismissPopup(p.id)}>
            <Icon name="close" size={14} />
          </button>
          <span className="popup-life" aria-hidden="true" />
        </div>
      ))}
    </div>
  );
}
