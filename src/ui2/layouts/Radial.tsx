// Layout "Radial" (like VRChat's action menu): just the map. One round hub at the bottom opens a
// ring of views around it; a view opens as a round-cornered bubble in the middle.
import { useEffect, useState } from "react";
import { setState, useApp, type View } from "../../store";
import { GraphView } from "../../components/GraphView";
import { Icon } from "../../components/Icon";
import { Avatar, RAIL, ToolCluster, ViewSheet } from "../parts";

export function RadialLayout({ onPalette }: { onPalette: () => void }) {
  const view = useApp((s) => s.view);
  const me = useApp((s) => s.cache.me);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const items: { key: View | "settings"; label: string; icon: string }[] = [...RAIL, { key: "settings", label: "Settings", icon: "settings" }];
  const pick = (k: View | "settings") => {
    setOpen(false);
    if (k === "settings") setState({ settingsOpen: true });
    else setState({ view: k });
  };
  return (
    <div className="lay-radial">
      <div className="rad-map">
        <GraphView />
      </div>
      <ToolCluster onPalette={onPalette} className="rad-tools" />
      {view !== "graph" && <ViewSheet view={view} onClose={() => setState({ view: "graph" })} closeLabel="Back to the map" className="rad-bubble" />}
      {open && <div className="rad-dim" onClick={() => setOpen(false)} />}
      <div className={`rad-ring ${open ? "open" : ""}`}>
        {items.map((it, i) => {
          // Spread over the upper half circle, left to right.
          const a = Math.PI + (Math.PI * (i + 0.5)) / items.length;
          const r = 150;
          return (
            <button
              key={it.key}
              className={`rad-item ${view === it.key ? "on" : ""}`}
              style={{ ["--x" as string]: `${Math.cos(a) * r}px`, ["--y" as string]: `${Math.sin(a) * r}px`, transitionDelay: open ? `${i * 25}ms` : "0ms" }}
              tabIndex={open ? 0 : -1}
              title={it.label}
              onClick={() => pick(it.key)}
            >
              <Icon name={it.icon} size={22} />
              <span>{it.label}</span>
            </button>
          );
        })}
        <button className="rad-hub" aria-expanded={open} aria-label="Menu" title="Menu" onClick={() => setOpen(!open)}>
          {me ? <Avatar id={me.id} size={58} /> : <Icon name="menu" size={26} />}
          <span className="rad-hub-x">
            <Icon name={open ? "close" : "menu"} size={16} />
          </span>
        </button>
      </div>
    </div>
  );
}
