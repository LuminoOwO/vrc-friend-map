// Layout "Split": two panes side by side, each with its own view (say the map and the activity
// log), a divider you drag, and a swap button. Remembered on this device.
import { useRef, useState } from "react";
import type { View } from "../../store";
import { Icon } from "../../components/Icon";
import { MeButton, RAIL, ToolCluster, ViewBody } from "../parts";

const LS = "vfm-ui2-split";
function read(): { a: View; b: View; at: number } {
  try {
    const r = JSON.parse(localStorage.getItem(LS) ?? "null");
    const ok = (v: unknown): v is View => RAIL.some((x) => x.key === v);
    if (r && ok(r.a) && ok(r.b) && typeof r.at === "number") return { a: r.a, b: r.b, at: Math.min(80, Math.max(20, r.at)) };
  } catch {
    /* not remembered */
  }
  return { a: "graph", b: "activity", at: 58 };
}

export function SplitLayout({ onPalette }: { onPalette: () => void }) {
  const [st, setRaw] = useState(read);
  const set = (p: Partial<typeof st>) => {
    const next = { ...st, ...p };
    setRaw(next);
    try {
      localStorage.setItem(LS, JSON.stringify(next));
    } catch {
      /* private window */
    }
  };
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const at = drag ?? st.at;
  return (
    <div className="lay-split">
      <header className="sp-head">
        <MeButton />
        <span className="ui2-grow" />
        <button className="ui2-pill-btn" onClick={() => set({ a: st.b, b: st.a })} title="Swap the panes">
          <Icon name="refresh" size={14} /> Swap
        </button>
        <ToolCluster onPalette={onPalette} filters={false} />
      </header>
      <div className="sp-body" ref={box}>
        <Pane view={st.a} other={st.b} onPick={(a) => set({ a })} style={{ width: `${at}%` }} />
        <div
          className="sp-divider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Drag to resize the panes"
          onDoubleClick={() => set({ at: 50 })}
          onPointerDown={(e) => (e.target as HTMLElement).setPointerCapture(e.pointerId)}
          onPointerMove={(e) => {
            if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId) || !box.current) return;
            const r = box.current.getBoundingClientRect();
            setDrag(Math.min(80, Math.max(20, ((e.clientX - r.left) / r.width) * 100)));
          }}
          onPointerUp={() => {
            if (drag !== null) set({ at: drag });
            setDrag(null);
          }}
        >
          <span />
        </div>
        <Pane view={st.b} other={st.a} onPick={(b) => set({ b })} style={{ flex: 1 }} />
      </div>
    </div>
  );
}

function Pane({ view, other, onPick, style }: { view: View; other: View; onPick: (v: View) => void; style: React.CSSProperties }) {
  return (
    <section className="sp-pane" style={style}>
      <nav className="sp-tabs" aria-label="View in this pane">
        {RAIL.map((r) => (
          <button key={r.key} className={`sp-tab ${view === r.key ? "on" : ""}`} disabled={r.key === other} title={r.key === other ? "Open in the other pane" : r.label} onClick={() => onPick(r.key)}>
            <Icon name={r.icon} size={15} />
            <span>{r.label}</span>
          </button>
        ))}
      </nav>
      <div className="sp-view">
        <div className="ui2-view" key={view}>
          <ViewBody view={view} />
        </div>
      </div>
    </section>
  );
}
