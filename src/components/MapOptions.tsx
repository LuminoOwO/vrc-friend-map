import { language, t, tx } from "../i18n";
import { defaultMap, setState, updateMap, updateSettings, useApp } from "../store";
import type { Gravity, MapSettings, NodeStyle } from "../types";
import { Icon } from "./Icon";
import { useEffect, useState } from "react";
import { mePinned, unpinMe } from "../mapstate";
import { Range } from "./Range";

const STYLES: { value: NodeStyle; label: string; hint: string }[] = [
  { value: "dot", label: "mapOptions.styleDot", hint: "mapOptions.styleDotHint" },
  { value: "icon", label: "mapOptions.stylePicture", hint: "mapOptions.stylePictureHint" },
  { value: "card", label: "mapOptions.styleCard", hint: "mapOptions.styleCardHint" },
  { value: "fullcard", label: "mapOptions.styleFull", hint: "mapOptions.styleFullHint" },
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
      <Range min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
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
    <div className="map-options" role="dialog" aria-label={t("mapOptions.mapOptions")}>
      <div className="map-options-head">
        <b>{t("mapOptions.mapOptions")}</b>
        <button className="icon-btn tiny" title={t("mapOptions.close")} onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>

      <MePinned />
      <div className="opt-group">
        <div className="opt-title">{t("mapOptions.people")}</div>
        <div className="segmented" role="radiogroup" aria-label={t("mapOptions.howPeopleAreDrawn")}>
          {STYLES.map((s) => (
            <button key={s.value} className={map.nodeStyle === s.value ? "on" : ""} title={t(s.hint)} role="radio" aria-checked={map.nodeStyle === s.value} onClick={() => set({ nodeStyle: s.value })}>
              {t(s.label)}
            </button>
          ))}
        </div>
        <Slider label={t("mapOptions.size")} value={map.nodeScale} min={0.5} max={2.5} step={0.05} onChange={(v) => set({ nodeScale: v })} />
        {round && (
          <label className="opt-row">
            <span>{t("mapOptions.sizeBy")}</span>
            <select value={map.sizeBy} onChange={(e) => set({ sizeBy: e.target.value as MapSettings["sizeBy"] })}>
              <option value="mutuals">{t("mapOptions.mutualFriends")}</option>
              <option value="together" disabled={!hasLogData}>
                {t("mapOptions.timeTogetherGameLogs")}
              </option>
              <option value="same">{t("mapOptions.sameForEveryone")}</option>
            </select>
          </label>
        )}
        <label className="opt-row">
          <span>{t("mapOptions.ringAccent")}</span>
          <select value={ringMode} onChange={(e) => updateSettings({ ringMode: e.target.value as "status" | "trust" })}>
            <option value="status">{t("mapOptions.onlineStatus")}</option>
            <option value="trust">{t("mapOptions.trustRank")}</option>
          </select>
        </label>
        {round && (
          <label className="opt-row">
            <span>{t("mapOptions.names")}</span>
            <select value={showLabels} onChange={(e) => updateSettings({ showLabels: e.target.value as "auto" | "always" | "never" })}>
              <option value="auto">{t("mapOptions.whenZoomedIn")}</option>
              <option value="always">{t("mapOptions.always")}</option>
              <option value="never">{t("mapOptions.onlyOnHover")}</option>
            </select>
          </label>
        )}
        <label className="opt-row">
          <span>{t("mapOptions.notMatchingFilters")}</span>
          <select value={dimMode} onChange={(e) => updateSettings({ dimMode: e.target.value as "dim" | "hide" })}>
            <option value="dim">{t("mapOptions.dim")}</option>
            <option value="hide">{t("mapOptions.hide")}</option>
          </select>
        </label>
        <label className="check small">
          <input type="checkbox" checked={map.showStars} onChange={(e) => set({ showStars: e.target.checked })} />
          {t("mapOptions.starOnFavorites")}
        </label>
        <label className="check small">
          <input type="checkbox" checked={map.showShield} onChange={(e) => set({ showShield: e.target.checked })} />
          {t("mapOptions.trustRankShieldNextTo")}
        </label>
        <label className="check small">
          <input type="checkbox" checked={map.showMe} onChange={(e) => set({ showMe: e.target.checked })} />
          {t("mapOptions.showMeBetweenTheFriends")}
        </label>
        <label className="opt-row">
          <span>{t("mapOptions.notFriendsYet")}</span>
          <select value={map.showOthers} onChange={(e) => set({ showOthers: e.target.value as MapSettings["showOthers"] })}>
            <option value="off">{t("mapOptions.donTShow")}</option>
            <option value="here">{t("mapOptions.inMyInstanceNow")}</option>
            <option value="met">{t("mapOptions.peopleIVeSpentTime")}</option>
            <option value="all">{t("mapOptions.friendsOfFriendsSharedLists")}</option>
          </select>
        </label>
        <p className="small muted opt-hint">
          {t("mapOptions.othersHint")}
        </p>
        <label className="check small">
          <input type="checkbox" checked={map.showFps} onChange={(e) => set({ showFps: e.target.checked })} />
          {t("mapOptions.showFrameRate")}
        </label>
        {map.nodeStyle !== "fullcard" && (
          <label className="check small">
            <input type="checkbox" checked={map.hoverCard} onChange={(e) => set({ hoverCard: e.target.checked })} />
            {t("mapOptions.showTheFullPlayerCard")}
          </label>
        )}
      </div>

      <div className="opt-group">
        <div className="opt-title">{t("mapOptions.lines")}</div>
        <label className="opt-row">
          <span>{t("mapOptions.show")}</span>
          <select value={map.lines} onChange={(e) => set({ lines: e.target.value as MapSettings["lines"] })}>
            <option value="shared">{t("mapOptions.mutualFriendsColoredByFriends")}</option>
            <option value="plain">{t("mapOptions.mutualFriendsOneColor")}</option>
            <option value="together">{hasLogData ? t("mapOptions.timeTogetherGameLogs") : t("mapOptions.timeTogetherNoData")}</option>
            <option value="none">{t("mapOptions.noLines")}</option>
          </select>
        </label>
        <Slider label={t("mapOptions.thickness")} value={map.lineWidth} min={0.3} max={3} step={0.05} onChange={(v) => set({ lineWidth: v })} />
        <Slider label={t("mapOptions.visibility")} value={map.lineOpacity} min={0.2} max={3} step={0.05} onChange={(v) => set({ lineOpacity: v })} />
        <label className="check small">
          <input type="checkbox" checked={map.focusLinesOnly} onChange={(e) => set({ focusLinesOnly: e.target.checked })} />
          {t("mapOptions.onlyShowLinesOfThe")}
        </label>
      </div>

      <div className="opt-group">
        <div className="opt-title">{t("mapOptions.layoutCircles")}</div>
        <label className="opt-row">
          <span>{t("mapOptions.gravity")}</span>
          <select value={map.gravity} onChange={(e) => set({ gravity: e.target.value as Gravity })}>
            <option value="mutuals">{t("mapOptions.lonersFloatInARing")}</option>
            <option value="loners">{t("mapOptions.lonersGatherInOneSpot")}</option>
            <option value="center">{t("mapOptions.everyoneCloseTogether")}</option>
            <option value="circles">{t("mapOptions.eachCircleAndLonersIn")}</option>
          </select>
        </label>
        <label className="opt-row">
          <span>{t("mapOptions.slowlyTurnTheMap")}</span>
          <select value={map.orbit} onChange={(e) => set({ orbit: Number(e.target.value) })}>
            <option value={0}>{t("mapOptions.off")}</option>
            <option value={1}>{t("mapOptions.slow")}</option>
            <option value={2}>{t("mapOptions.medium")}</option>
            <option value={3}>{t("mapOptions.fast")}</option>
          </select>
        </label>
        {map.orbit > 0 && (
          <label className="opt-row">
            <span>{t("mapOptions.direction")}</span>
            <select value={map.orbitDir} onChange={(e) => set({ orbitDir: Number(e.target.value) === -1 ? -1 : 1 })}>
              <option value={1}>{t("mapOptions.clockwise")}</option>
              <option value={-1}>{t("mapOptions.counterClockwise")}</option>
            </select>
          </label>
        )}
        <Slider label={t("mapOptions.spacing")} value={map.spacing} min={0.5} max={2.5} step={0.05} onChange={(v) => set({ spacing: v })} />
        <Slider label={t("mapOptions.pullCircleMembersTogether")} value={map.groupPull} min={0} max={3} step={0.1} onChange={(v) => set({ groupPull: v })} format={(v) => (v === 0 ? t("mapOptions.off") : `${Math.round(v * 100)}%`)} />
        <label className="check small">
          <input type="checkbox" checked={map.hulls} onChange={(e) => set({ hulls: e.target.checked })} />
          {t("mapOptions.drawCircleOutlines")}
        </label>
        {map.hulls && <Slider label={t("mapOptions.outlineStrength")} value={map.hullOpacity} min={0.2} max={3} step={0.05} onChange={(v) => set({ hullOpacity: v })} />}
      </div>

      <TimeTravel />

      <div className="row">
        <button className="btn small" onClick={onFit}>
          <Icon name="fit" size={14} /> Fit to screen
        </button>
        <button className="btn small" onClick={() => updateMap(defaultMap())}>
          {t("mapOptions.resetMapOptions")}
        </button>
      </div>
    </div>
  );
}

/** The map as it was at an earlier date (from the friend change log). */
function TimeTravel() {
  const since = useApp((s) => s.local.logSince);
  const at = useApp((s) => s.timeTravel);
  if (!since || Date.now() - since < 2 * 864e5) return null;
  const days = Math.ceil((Date.now() - since) / 864e5);
  const value = at ? Math.round((Date.now() - at) / 864e5) : 0;
  return (
    <div className="opt-group">
      <span className="opt-title">{t("mapOptions.timeTravel")}</span>
      <label className="opt-slider">
        <span>
          {tx("mapOptions.showAsOf", { date: <b>{at ? new Date(at).toLocaleDateString(language()) : t("mapOptions.now")}</b> })}
        </span>
        <Range pct={false}
          min={0}
          max={days}
          step={1}
          value={value}
          style={{ direction: "rtl" }}
          onChange={(e) => {
            const d = Number(e.target.value);
            setState({ timeTravel: d === 0 ? null : Date.now() - d * 864e5 });
          }}
        />
      </label>
      {at && (
        <button className="btn small" onClick={() => setState({ timeTravel: null })}>
          {t("mapOptions.backToNow")}
        </button>
      )}
      <span className="small muted">{t("mapOptions.timeTravelNote", { date: new Date(since).toLocaleDateString(language()) })}</span>
    </div>
  );
}

/** After dragging your own bubble somewhere: a way back to the automatic spot. */
function MePinned() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    mePinned.subs.add(f);
    return () => {
      mePinned.subs.delete(f);
    };
  }, []);
  if (!mePinned.at) return null;
  return (
    <div className="opt-group">
      <button className="btn small" onClick={unpinMe}>
        <Icon name="pin" size={14} /> Put me back between my friends
      </button>
    </div>
  );
}
