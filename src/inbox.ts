// The notification center (top left): only things that want something from you or matter
// for longer (friend requests, invites, new and lost friends, a slot you watch, "why did you
// block …?"). Who came online, joined or left is in Activity, not here.
// Also the in-app pop-ups: they come out under the notification center and stay a while
// (Settings → Notifications), then the item stays in the center.
import { t as tr } from "./i18n";
import { getState, setState, type Popup } from "./store";
import type { NotifyEvent } from "./types";

/** Events kept in the notification center. */
export const INBOX_EVENTS = new Set<NotifyEvent>(["friendRequest", "invite", "requestInvite", "added", "removed", "slotOpen"]);

const MAX_POPUPS = 4;
let popupSeq = Date.now();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

/** Show an in-app pop-up for a while (if pop-ups are on). */
export function pushPopup(p: Omit<Popup, "id" | "t">) {
  const secs = getState().settings.notify.popupSeconds;
  if (!secs) return;
  const id = ++popupSeq;
  const list = [...getState().popups.filter((x) => !(x.kind === p.kind && x.userId === p.userId)), { ...p, id, t: Date.now() }];
  for (const old of list.splice(0, Math.max(0, list.length - MAX_POPUPS))) clearTimeout(timers.get(old.id));
  setState({ popups: list });
  timers.set(id, setTimeout(() => dismissPopup(id), secs * 1000));
}

export function dismissPopup(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  const popups = getState().popups;
  if (popups.some((p) => p.id === id)) setState({ popups: popups.filter((p) => p.id !== id) });
}

/** Keep a pop-up while the pointer is on it; it goes a few seconds after the pointer leaves. */
export function holdPopup(id: number, hold: boolean) {
  clearTimeout(timers.get(id));
  if (!hold) timers.set(id, setTimeout(() => dismissPopup(id), 4000));
}

/** New blocks (here or in game): ask why, now or from the notification center (a setting). */
export function queueBlockAsk(ids: string[], names: Record<string, string | undefined> = {}) {
  const st = getState();
  const fresh = ids.filter((id) => !st.blockAsk.includes(id));
  if (!fresh.length) return;
  const now = st.settings.notify.blockAskPopup;
  setState((s) => ({ blockAsk: [...s.blockAsk, ...fresh], blockAskShown: s.blockAskShown || now }));
  if (!now && !document.hidden) {
    for (const id of fresh.slice(0, 2)) pushPopup({ kind: "blockAsk", userId: id, text: tr("inbox.whyBlocked", { name: names[id] ?? tr("personExtras.them") }) });
  }
}

/** Open "why did you block …?" for this person now (from a button). */
export function openBlockAsk(id: string) {
  setState((s) => ({ blockAsk: [id, ...s.blockAsk.filter((x) => x !== id)], blockAskShown: true }));
  for (const p of getState().popups) if (p.kind === "blockAsk" && p.userId === id) dismissPopup(p.id);
}

/** The dialog is done with the first person (saved or skipped). */
export function finishBlockAsk() {
  setState((s) => {
    const rest = s.blockAsk.slice(1);
    return { blockAsk: rest, blockAskShown: rest.length > 0 && s.settings.notify.blockAskPopup };
  });
}

/** Close the dialog but keep the question in the notification center. */
export function laterBlockAsk() {
  setState({ blockAskShown: false });
}
