// Smooth layout changes and loading placeholders for the new interface.
//
// useSmooth(): put the ref on a list's parent; items that appear, disappear or move get a short
// animation, and everything around them slides into place instead of jumping (AutoAnimate).
// Off with Settings → Animations → fewer (data-motion="reduce") or the system's reduced motion.
//
// <Skel />: a shimmering bar where text is still loading.
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { useEffect } from "react";

function motionOff(): boolean {
  const m = document.documentElement.dataset.motion;
  if (m === "reduce") return true;
  if (m === "full") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function useSmooth<T extends HTMLElement = HTMLDivElement>(duration = 260) {
  const [ref, enable] = useAutoAnimate<T>({ duration, easing: "cubic-bezier(0.2, 0.9, 0.25, 1)" });
  useEffect(() => {
    const apply = () => enable(!motionOff());
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
    return () => mo.disconnect();
  }, [enable]);
  return ref;
}

/** A shimmering placeholder for text that's still loading. */
export function Skel({ w = "8em", h = "0.9em", block = false }: { w?: string | number; h?: string | number; block?: boolean }) {
  return <span className={`skel ${block ? "block" : ""}`} style={{ width: w, height: h }} aria-label="Loading" role="status" />;
}

/** Images fade in once they've loaded (their frame shimmers until then). One listener for the whole page. */
export function watchImageLoads() {
  const mark = (e: Event) => {
    const t = e.target;
    if (t instanceof HTMLImageElement) t.classList.add("is-loaded");
  };
  document.addEventListener("load", mark, true);
  document.addEventListener("error", mark, true);
}

/** A few shimmering lines in place of a block that's still loading. */
export function SkelBlock({ lines = 3, label }: { lines?: number; label?: string }) {
  const widths = ["94%", "82%", "68%", "88%", "60%"];
  return (
    <div className="skel-lines" role="status" aria-label={label ?? "Loading"}>
      {Array.from({ length: lines }, (_, i) => (
        <Skel key={i} w={widths[i % widths.length]} block />
      ))}
      {label && <span className="small muted">{label}</span>}
    </div>
  );
}
