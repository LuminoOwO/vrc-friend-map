// Settings → Notifications → Phone in the background (Android).
import { t as tr } from "../i18n";
import { useEffect, useState } from "react";
import { askBatteryExemption, pushDistributors, pushRegister, pushUnregister, refreshRates, rootLogs } from "../phone";
import { showToast, updateSettings, useApp } from "../store";
import type { PhoneSettings } from "../types";

const MODES: { value: PhoneSettings["background"]; label: string; text: string }[] = [
  { value: "off", label: "Off", text: tr("phoneSettings.notificationsOnlyWhileTheApp") },
  { value: "visible", label: tr("phoneSettings.stayConnectedWithANotification"), text: tr("phoneSettings.theAppKeepsItsLive") },
  { value: "quiet", label: tr("phoneSettings.stayConnectedQuietly"), text: tr("phoneSettings.theSameButTheNotification") },
  { value: "push", label: tr("phoneSettings.pushThroughUnifiedpush"), text: tr("phoneSettings.noConnectionOnThePhone") },
];

export function PhoneSection() {
  const p = useApp((s) => s.settings.phone);
  const push = useApp((s) => s.local.push);
  const set = (patch: Partial<PhoneSettings>) => updateSettings({ phone: { ...p, ...patch } });
  const [dists, setDists] = useState<{ id: string; name: string }[] | null>(null);
  const [rates, setRates] = useState<{ rates: number[]; current: number } | null>(null);
  useEffect(() => {
    void refreshRates().then(setRates);
  }, []);
  useEffect(() => {
    if (p.background === "push") void pushDistributors().then(setDists, () => setDists([]));
  }, [p.background]);
  return (
    <>
      <h3>{tr("phoneSettings.phoneInTheBackground")}</h3>
      {MODES.map((m) => (
        <label key={m.value} className="check radio-card">
          <input type="radio" name="bgmode" checked={p.background === m.value} onChange={() => set({ background: m.value })} />
          <span>
            <b>{m.label}</b>
            <br />
            <span className="small muted">{m.text}</span>
          </span>
        </label>
      ))}
      {(p.background === "visible" || p.background === "quiet") && (
        <button className="btn small" onClick={() => void askBatteryExemption().then((ok) => showToast(ok ? tr("phoneSettings.theAppIsLeftOut") : tr("phoneSettings.allowItInTheDialog")))}>
          {tr("phoneSettings.leaveTheAppOutOf")}
        </button>
      )}
      {p.background === "push" && (
        <div className="indent">
          {dists === null ? (
            <p className="small muted">{tr("phoneSettings.lookingForPushDistributors")}</p>
          ) : dists.length === 0 ? (
            <p className="small">
              {tr("phoneSettings.noUnifiedpushDistributorOnThis")}
            </p>
          ) : (
            <div className="row">
              <span className="small">{tr("phoneSettings.distributor")}</span>
              {dists.map((d) => (
                <button key={d.id} className={`btn small ${push?.distributor === d.id ? "on" : ""}`} onClick={() => void pushRegister(d.id).then(() => showToast(tr("phoneSettings.registeringWithName", { name: d.name })))}>
                  {d.name}
                </button>
              ))}
            </div>
          )}
          {push?.endpoint ? (
            <p className="small">
              Registered. Your PC app learns about this phone through device sync and sends invites, friends coming online and the rest of your
              notification rules here, encrypted.{" "}
              <button className="btn link small" onClick={() => void pushUnregister()}>
                {tr("phoneSettings.stop")}
              </button>
            </p>
          ) : push?.distributor ? (
            <p className="small muted">{tr("phoneSettings.waitingForTheDistributorTo")}</p>
          ) : null}
        </div>
      )}

      <h4 className="sub-h">{tr("phoneSettings.smoothness")}</h4>
      <label className="field narrow">
        <span>{tr("phoneSettings.screenRefreshRate")}</span>
        <select value={p.refreshRate} onChange={(e) => set({ refreshRate: Number(e.target.value) })}>
          <option value={0}>The highest this screen can do{rates?.rates.length ? tr("phoneSettings.valueHz", { value: Math.round(Math.max(...rates.rates)) }) : ""}</option>
          <option value={-1}>{tr("phoneSettings.leaveItToTheSystem")}</option>
          {rates?.rates.map((r) => (
            <option key={r} value={r}>
              {Math.round(r)} Hz
            </option>
          ))}
        </select>
      </label>
      <p className="small muted">{tr("phoneSettings.theMapSOwnLimit")}</p>

      <h4 className="sub-h">{tr("phoneSettings.homeScreen")}</h4>
      <label className="check">
        <input type="checkbox" checked={p.widget} onChange={(e) => set({ widget: e.target.checked })} />
        {tr("phoneSettings.widgetStarredFriendsOnlineLong")}
      </label>

      <h4 className="sub-h">{tr("phoneSettings.gameLogsOnThisDevice")}</h4>
      <label className="check">
        <input type="checkbox" checked={p.rootLogs} onChange={(e) => set({ rootLogs: e.target.checked })} />
        {tr("phoneSettings.readVrchatSLogsWith")}
      </label>
      {p.rootLogs && (
        <button className="btn small" onClick={() => void rootLogs().then(showToast, (e) => showToast(String(e)))}>
          {tr("phoneSettings.copyTheLogsNow")}
        </button>
      )}
      <p className="small muted">
        Android keeps other apps' files private since Android 11; with root the app can copy VRChat's log files every few minutes. Shizuku (without
        root) isn't supported yet.
      </p>
    </>
  );
}
