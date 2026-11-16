// Settings → Notifications → Phone in the background (Android).
import { useEffect, useState } from "react";
import { askBatteryExemption, pushDistributors, pushRegister, pushUnregister, refreshRates, rootLogs } from "../phone";
import { showToast, updateSettings, useApp } from "../store";
import type { PhoneSettings } from "../types";

const MODES: { value: PhoneSettings["background"]; label: string; text: string }[] = [
  { value: "off", label: "Off", text: "Notifications only while the app is open (Android may close it soon after you switch away)." },
  { value: "visible", label: "Stay connected, with a notification", text: "The app keeps its live connection; a permanent notification shows that it runs. Uses some battery." },
  { value: "quiet", label: "Stay connected, quietly", text: "The same, but the notification is silent and minimised; on Android 13+ it mostly shows under “Active apps” (like Sunup)." },
  { value: "push", label: "Push through UnifiedPush", text: "No connection on the phone: your PC app sends notifications through a UnifiedPush distributor (Sunup, ntfy…). No extra battery. Needs the PC app running and a server for device sync." },
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
      <h3>Phone in the background</h3>
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
        <button className="btn small" onClick={() => void askBatteryExemption().then((ok) => showToast(ok ? "The app is left out of battery optimisation." : "Allow it in the dialog so Android doesn't stop the app."))}>
          Leave the app out of battery optimisation
        </button>
      )}
      {p.background === "push" && (
        <div className="indent">
          {dists === null ? (
            <p className="small muted">Looking for push distributors…</p>
          ) : dists.length === 0 ? (
            <p className="small">
              No UnifiedPush distributor on this phone. Install one, e.g. Sunup or ntfy (both on F-Droid / IzzyOnDroid), then come back.
            </p>
          ) : (
            <div className="row">
              <span className="small">Distributor:</span>
              {dists.map((d) => (
                <button key={d.id} className={`btn small ${push?.distributor === d.id ? "on" : ""}`} onClick={() => void pushRegister(d.id).then(() => showToast(`Registering with ${d.name}…`))}>
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
                Stop
              </button>
            </p>
          ) : push?.distributor ? (
            <p className="small muted">Waiting for the distributor to answer…</p>
          ) : null}
        </div>
      )}

      <h4 className="sub-h">Smoothness</h4>
      <label className="field narrow">
        <span>Screen refresh rate</span>
        <select value={p.refreshRate} onChange={(e) => set({ refreshRate: Number(e.target.value) })}>
          <option value={0}>The highest this screen can do{rates?.rates.length ? ` (${Math.round(Math.max(...rates.rates))} Hz)` : ""}</option>
          <option value={-1}>Leave it to the system</option>
          {rates?.rates.map((r) => (
            <option key={r} value={r}>
              {Math.round(r)} Hz
            </option>
          ))}
        </select>
      </label>
      <p className="small muted">The map's own limit is under Performance → Frame rate.</p>

      <h4 className="sub-h">Home screen</h4>
      <label className="check">
        <input type="checkbox" checked={p.widget} onChange={(e) => set({ widget: e.target.checked })} />
        Widget: starred friends online (long-press the home screen → Widgets → VRC Friend Map)
      </label>

      <h4 className="sub-h">Game logs on this device</h4>
      <label className="check">
        <input type="checkbox" checked={p.rootLogs} onChange={(e) => set({ rootLogs: e.target.checked })} />
        Read VRChat's logs with root (rooted phones, or a rooted Quest such as with Singularity)
      </label>
      {p.rootLogs && (
        <button className="btn small" onClick={() => void rootLogs().then(showToast, (e) => showToast(String(e)))}>
          Copy the logs now
        </button>
      )}
      <p className="small muted">
        Android keeps other apps' files private since Android 11; with root the app can copy VRChat's log files every few minutes. Shizuku (without
        root) isn't supported yet.
      </p>
    </>
  );
}
