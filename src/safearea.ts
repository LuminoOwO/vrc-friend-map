// Android draws the app edge to edge (behind the status bar), but some
// WebView versions report no safe-area inset for it, so buttons at the very
// top end up under the clock and battery. When the page fills the whole
// screen and no inset is reported, assume a status bar's height.
const FALLBACK_TOP = 28;

function envTop(): number {
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none";
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return h;
}

export function applySafeArea(): void {
  if (!/Android/i.test(navigator.userAgent)) return;
  const update = () => {
    const fullScreen = window.innerHeight >= window.screen.height - 2;
    const top = envTop() > 0 || !fullScreen ? 0 : FALLBACK_TOP;
    document.documentElement.style.setProperty("--safe-top-fallback", `${top}px`);
  };
  update();
  window.addEventListener("resize", update);
}
