import { defaultMap, updateMap, updateSettings, useApp } from "../store";
import type { Gravity, MapSettings, NodeStyle } from "../types";
import { Icon } from "./Icon";

const STYLES: { value: NodeStyle; label: string; hint: string }[] = [
  { value: "dot", label: "Dot", hint: "Small colored dots. Fastest with big friend lists." },
  { value: "icon", label: "Picture", hint: "Round profile pictures (default)." },
  { value: "card", label: "Card", hint: "Compact cards with name and status." },
  { value: "fullcard", label: "Full card", hint: "The whole player card: banner, picture, name, status, rank, mutuals and circles." },
];

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => `${Math.round(v * 100)}%`,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="opt-slider">
      <span>
        {label} <b>{format(value)}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function MapOptions({ onClose, onFit, hasLogData }: { onClose: () => void; onFit: () => void; hasLogData: boolean }) {
  const map = useApp((s) => s.settings.map);
  const ringMode = useApp((s) => s.settings.ringMode);
  const showLabels = useApp((s) => s.settings.showLabels);
  const dimMode = useApp((s) => s.settings.dimMode);
  const set = (patch: Partial<MapSettings>) => updateMap(patch);
  const round = map.nodeStyle === "dot" || map.nodeStyle === "icon";

  return (
    <div className="map-options" role="dialog" aria-label="Map options">
      <div className="map-options-head">
        <b>Map options</b>
        <button className="icon-btn tiny" title="Close" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className="opt-group">
        <div className="opt-title">People</div>
        <div className="segmented" role="radiogroup" aria-label="How people are drawn">
          {STYLES.map((s) => (
            <button key={s.value} className={map.nodeStyle === s.value ? "on" : ""} title={s.hint} role="radio" aria-checked={map.nodeStyle === s.value} onClick={() => set({ nodeStyle: s.value })}>
              {s.label}
            </button>
          ))}
        </div>
        <Slider label="Size" value={map.nodeScale} min={0.5} max={2.5} step={0.05} onChange={(v) => set({ nodeScale: v })} />
        {round && (
          <label className="opt-row">
            <span>Size by</span>
            <select value={map.sizeBy} onChange={(e) => set({ sizeBy: e.target.value as MapSettings["sizeBy"] })}>
              <option value="mutuals">Mutual friends</option>
              <option value="together" disabled={!hasLogData}>
                Time together (game logs)
              </option>
              <option value="same">Same for everyone</option>
            </select>
          </label>
        )}
        <label className="opt-row">
          <span>Ring / accent</span>
          <select value={ringMode} onChange={(e) => updateSettings({ ringMode: e.target.value as "status" | "trust" })}>
            <option value="status">Online status</option>
            <option value="trust">Trust rank</option>
          </select>
        </label>
        {round && (
          <label className="opt-row">
            <span>Names</span>
            <select value={showLabels} onChange={(e) => updateSettings({ showLabels: e.target.value as "auto" | "always" | "never" })}>
              <option value="auto">When zoomed in</option>
              <option value="always">Always</option>
              <option value="never">Only on hover</option>
            </select>
          </label>
        )}
        <label className="opt-row">
          <span>Not matching filters</span>
          <select value={dimMode} onChange={(e) => updateSettings({ dimMode: e.target.value as "dim" | "hide" })}>
            <option value="dim">Dim</option>
            <option value="hide">Hide</option>
          </select>
        </label>
        <label className="check small">
          <input type="checkbox" checked={map.showStars} onChange={(e) => set({ showStars: e.target.checked })} />
          Star on favorites
        </label>
        <label className="check small">
          <input type="checkbox" checked={map.showShield} onChange={(e) => set({ showShield: e.target.checked })} />
          Trust-rank shield next to names on cards
        </label>
        <label className="check small">
          <input type="checkbox" checked={map.showFps} onChange={(e) => set({ showFps: e.target.checked })} />
          Show frame rate
        </label>
        {map.nodeStyle !== "fullcard" && (
          <label className="check small">
            <input type="checkbox" checked={map.hoverCard} onChange={(e) => set({ hoverCard: e.target.checked })} />
            Show the full player card when pointing at someone
          </label>
        )}
      </div>

      <div className="opt-group">
        <div className="opt-title">Lines</div>
        <label className="opt-row">
          <span>Show</span>
          <select value={map.lines} onChange={(e) => set({ lines: e.target.value as MapSettings["lines"] })}>
            <option value="shared">Mutual friends, colored by friends in common</option>
            <option value="plain">Mutual friends, one color</option>
            <option value="together">Time together (game logs){hasLogData ? "" : " – no data yet"}</option>
            <option value="none">No lines</option>
          </select>
        </label>
        <Slider label="Thickness" value={map.lineWidth} min={0.3} max={3} step={0.05} onChange={(v) => set({ lineWidth: v })} />
        <Slider label="Visibility" value={map.lineOpacity} min={0.2} max={3} step={0.05} onChange={(v) => set({ lineOpacity: v })} />
        <label className="check small">
          <input type="checkbox" checked={map.focusLinesOnly} onChange={(e) => set({ focusLinesOnly: e.target.checked })} />
          Only show lines of the person I point at or select
        </label>
      </div>

      <div className="opt-group">
        <div className="opt-title">Layout & circles</div>
        <label className="opt-row">
          <span>Gravity</span>
          <select value={map.gravity} onChange={(e) => set({ gravity: e.target.value as Gravity })}>
            <option value="mutuals">Loners float in a ring</option>
            <option value="loners">Loners gather in one spot</option>
            <option value="center">Everyone close together</option>
            <option value="circles">Each circle (and loners) in its own spot</option>
          </select>
        </label>
        <label className="opt-row">
          <span>Slowly turn the map</span>
          <select value={map.orbit} onChange={(e) => set({ orbit: Number(e.target.value) })}>
            <option value={0}>Off</option>
            <option value={1}>Slow</option>
            <option value={2}>Medium</option>
            <option value={3}>Fast</option>
          </select>
        </label>
        {map.orbit > 0 && (
          <label className="opt-row">
            <span>Direction</span>
            <select value={map.orbitDir} onChange={(e) => set({ orbitDir: Number(e.target.value) === -1 ? -1 : 1 })}>
              <option value={1}>Clockwise</option>
              <option value={-1}>Counter-clockwise</option>
            </select>
          </label>
        )}
        <Slider label="Spacing" value={map.spacing} min={0.5} max={2.5} step={0.05} onChange={(v) => set({ spacing: v })} />
        <Slider label="Pull circle members together" value={map.groupPull} min={0} max={3} step={0.1} onChange={(v) => set({ groupPull: v })} format={(v) => (v === 0 ? "off" : `${Math.round(v * 100)}%`)} />
        <label className="check small">
          <input type="checkbox" checked={map.hulls} onChange={(e) => set({ hulls: e.target.checked })} />
          Draw circle outlines
        </label>
        {map.hulls && <Slider label="Outline strength" value={map.hullOpacity} min={0.2} max={3} step={0.05} onChange={(v) => set({ hullOpacity: v })} />}
      </div>

      <div className="row">
        <button className="btn small" onClick={onFit}>
          <Icon name="fit" size={14} /> Fit to screen
        </button>
        <button className="btn small" onClick={() => updateMap(defaultMap())}>
          Reset map options
        </button>
      </div>
    </div>
  );
}
