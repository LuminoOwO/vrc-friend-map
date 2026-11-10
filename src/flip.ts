// Card -> profile transition. When you open a profile from a card (the map's
// hover card or a card in the Cards view), the card's banner, picture, name
// and status fly to where they sit in the profile, and the profile grows out
// of the card's outline. Elements are matched by data-flip="banner|icon|name|status".

type Rects = Record<string, DOMRect>;

let pending: { id: string; root: DOMRect; parts: Rects; at: number } | null = null;

const PARTS = ["banner", "icon", "name", "status"];

function reduced(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Remember where a card's parts are, just before its profile opens. */
export function captureCard(id: string, root: Element | null) {
  if (!root || reduced()) {
    pending = null;
    return;
  }
  const parts: Rects = {};
  for (const name of PARTS) {
    const el = root.querySelector(`[data-flip="${name}"]`);
    if (el) parts[name] = el.getBoundingClientRect();
  }
  pending = { id, root: root.getBoundingClientRect(), parts, at: performance.now() };
}

/** Same, from a bare picture on the map (phones have no hover card). */
export function capturePicture(id: string, pic: DOMRect) {
  if (reduced()) return;
  pending = { id, root: pic, parts: { icon: pic }, at: performance.now() };
}

/** Run the transition into a freshly shown profile, if one was captured for it. */
export function playIntoProfile(id: string, profile: HTMLElement | null) {
  const from = pending;
  pending = null;
  if (!from || !profile || from.id !== id || performance.now() - from.at > 1500) return;
  const easing = "cubic-bezier(0.2, 0.8, 0.2, 1)";
  const duration = 380;

  // The profile grows out of the card's outline.
  const box = profile.getBoundingClientRect();
  const top = from.root.top - box.top;
  const left = from.root.left - box.left;
  const right = box.right - from.root.right;
  const bottom = box.bottom - from.root.bottom;
  profile.animate(
    [
      { clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round 12px)` },
      { clipPath: "inset(0px 0px 0px 0px round 26px)" },
    ],
    { duration, easing },
  );

  // Each part flies from its spot on the card to its spot in the profile.
  for (const name of PARTS) {
    const src = from.parts[name];
    const el = profile.querySelector(`[data-flip="${name}"]`) as HTMLElement | null;
    if (!src || !el) continue;
    const dst = el.getBoundingClientRect();
    if (!dst.width || !dst.height) continue;
    const sx = src.width / dst.width;
    const sy = name === "banner" ? src.height / dst.height : sx;
    const dx = src.left - dst.left;
    const dy = src.top - dst.top;
    el.animate(
      [
        { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${name === "name" || name === "status" ? src.height / dst.height : sy})` },
        { transformOrigin: "0 0", transform: "none" },
      ],
      { duration, easing },
    );
  }

  // Everything else fades in after the parts have mostly arrived.
  for (const el of profile.querySelectorAll<HTMLElement>("[data-flip-fade]")) {
    el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }], { duration: duration + 120, easing: "ease-out" });
  }
}
