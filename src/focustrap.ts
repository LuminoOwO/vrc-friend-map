// Keyboard focus for every popup and dialog, in one place (no change to each dialog needed):
//  - when one opens, focus moves into it (unless something inside already has it, e.g. a search
//    box with autoFocus), so Tab and screen readers start there;
//  - Tab and Shift+Tab stay inside the top-most one instead of wandering into the page behind;
//  - when it closes, focus goes back to what had it before (the button that opened it), if that
//    is still on the page.
// Also: arrow keys move through menus marked data-arrows (the menu on computers, the phone's tabs,
// the settings list).
// The view frame on computers isn't modal (the menu and the party stay usable): focus moves into
// it and back, but Tab isn't kept inside.

export const DIALOG_SELECTOR = ".profile-backdrop, .ui2-world-wrap, .modal-backdrop, .ui2-fullsheet";
const FRAME_SELECTOR = ".lob-frame";
const ANY_SELECTOR = `${DIALOG_SELECTOR}, ${FRAME_SELECTOR}`;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

interface Open {
  el: HTMLElement;
  before: Element | null;
  /** The opener's name, to find it again if it was drawn anew meanwhile. */
  name: string | null;
  trap: boolean;
}
const stack: Open[] = [];
/** The last control that had focus: the opener may lose it a moment before the dialog appears
 *  (the page around it re-renders), so this is what focus goes back to then. */
const recent: { el: Element; name: string | null }[] = [];

/** What can take focus inside `root`, in Tab order (only what's shown). */
export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => !e.closest("[inert], [hidden]") && (e.offsetParent !== null || e === document.activeElement) && e.tabIndex >= 0);
}

function topDialog(): HTMLElement | null {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].el.isConnected && stack[i].trap) return stack[i].el;
  return null;
}

function nameOf(e: Element | null): string | null {
  if (!(e instanceof HTMLElement)) return null;
  return e.getAttribute("aria-label") || e.title || e.textContent?.trim().slice(0, 60) || null;
}

/** The opener, or (if it was replaced) a visible control with the same name. */
function findBack(o: Open): HTMLElement | null {
  if (o.before instanceof HTMLElement && o.before.isConnected) return o.before;
  if (!o.name) return null;
  const tag = o.before instanceof HTMLElement ? o.before.tagName.toLowerCase() : "button";
  return [...document.querySelectorAll<HTMLElement>(tag)].find((e) => e.offsetParent !== null && nameOf(e) === o.name) ?? null;
}

function opened(el: HTMLElement) {
  if (stack.some((o) => o.el === el)) return;
  // The latest control outside this dialog that had focus (something inside may have it already,
  // e.g. a search box with autoFocus).
  const prev = [...recent].reverse().find((r) => !el.contains(r.el));
  const trap = el.matches(DIALOG_SELECTOR);
  stack.push({ el, before: prev?.el ?? null, name: prev?.name ?? null, trap });
  if (trap) markModal(el);
  // After React has run autoFocus and effects.
  requestAnimationFrame(() => {
    if (!el.isConnected || el.contains(document.activeElement)) return;
    const first = focusables(el).find((e) => !e.matches(".ui2-close, .profile-close, [aria-label^='Close']")) ?? focusables(el)[0];
    if (first) first.focus({ preventScroll: true });
    else {
      el.tabIndex = -1;
      el.focus({ preventScroll: true });
    }
  });
}

/** Screen readers: a dialog says it's one, that the page behind doesn't count, and its name
 *  (its first heading, when it has no name of its own). */
function markModal(el: HTMLElement) {
  let d = el.matches("[role=dialog], [role=alertdialog]") ? el : el.querySelector<HTMLElement>("[role=dialog], [role=alertdialog]");
  if (!d) {
    d = (el.firstElementChild as HTMLElement | null) ?? el;
    d.setAttribute("role", "dialog");
  }
  if (!d.hasAttribute("aria-modal")) d.setAttribute("aria-modal", "true");
  if (!d.hasAttribute("aria-label") && !d.hasAttribute("aria-labelledby")) {
    const h = d.querySelector("h1, h2, h3");
    const text = h?.textContent?.trim();
    if (text) d.setAttribute("aria-label", text.slice(0, 80));
  }
}

function closed(el: HTMLElement) {
  const i = stack.findIndex((o) => o.el === el);
  if (i < 0) return;
  const [o] = stack.splice(i, 1);
  // Only when focus was in the dialog (or got lost with it): don't pull focus from elsewhere.
  const lost = () => !document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected;
  if (!lost()) return;
  // The opener may come back a moment later (e.g. the party slides in again after Settings):
  // try for a few frames.
  let tries = 0;
  const tryBack = () => {
    if (!lost()) return;
    // A frame closing because a dialog opened over it: the dialog keeps the focus.
    const back = findBack(o) ?? topDialog();
    if (back) back.focus({ preventScroll: true });
    else if (++tries < 20) requestAnimationFrame(tryBack);
  };
  tryBack();
}

/** Arrow keys inside a menu marked data-arrows="v" (up/down) or "h" (left/right), plus Home/End. */
function onArrows(e: KeyboardEvent): boolean {
  const active = document.activeElement as HTMLElement | null;
  const menu = active?.closest<HTMLElement>("[data-arrows]");
  if (!menu || e.ctrlKey || e.metaKey || e.altKey) return false;
  if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return false;
  const v = menu.dataset.arrows === "v";
  const prev = v ? "ArrowUp" : "ArrowLeft";
  const next = v ? "ArrowDown" : "ArrowRight";
  if (![prev, next, "Home", "End"].includes(e.key)) return false;
  const items = focusables(menu).filter((x) => x.tagName === "BUTTON");
  const i = items.indexOf(active as HTMLElement);
  if (i < 0 || !items.length) return false;
  const to = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === next ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
  items[to].focus();
  return true;
}

function onKey(e: KeyboardEvent) {
  if (onArrows(e)) {
    e.preventDefault();
    return;
  }
  if (e.key !== "Tab") return;
  const top = topDialog();
  if (!top) return;
  const items = focusables(top);
  if (!items.length) {
    e.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (!active || !top.contains(active)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  } else if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

let started = false;

export function startFocusTrap() {
  if (started || typeof document === "undefined") return;
  started = true;
  const scan = (n: Node, add: boolean) => {
    if (!(n instanceof HTMLElement)) return;
    const hits = n.matches(ANY_SELECTOR) ? [n] : [...n.querySelectorAll<HTMLElement>(ANY_SELECTOR)];
    for (const h of hits) (add ? opened : closed)(h);
  };
  new MutationObserver((ms) => {
    for (const m of ms) {
      m.removedNodes.forEach((n) => scan(n, false));
      m.addedNodes.forEach((n) => scan(n, true));
    }
  }).observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll<HTMLElement>(ANY_SELECTOR).forEach(opened);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener(
    "focusin",
    (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || t === document.body) return;
      recent.push({ el: t, name: nameOf(t) });
      if (recent.length > 8) recent.shift();
    },
    true,
  );
}
