// VRChat tab → Avatars, with OSC listening on: the avatar you're wearing in
// game, AFK / muted, its toggles (set them from here), and the avatars you wore.
import { useState } from "react";
import { setParam, toggles, useOscLive, type AvatarParam, type ParamValue } from "../osclive";
import { setState, showToast, useApp } from "../store";

function Toggle({ p, value }: { p: AvatarParam; value: ParamValue | undefined }) {
  const send = (v: ParamValue) => void setParam(p.name, v, p.type).catch((e) => showToast(String(e)));
  if (p.type === "Bool")
    return (
      <label className="check">
        <input type="checkbox" checked={value === true} onChange={(e) => send(e.target.checked)} />
        <span>{p.name}</span>
      </label>
    );
  if (p.type === "Int")
    return (
      <label className="field narrow">
        <span>{p.name}</span>
        <input
          type="number"
          min={0}
          max={255}
          value={typeof value === "number" ? value : 0}
          onChange={(e) => send(Math.max(0, Math.min(255, Math.round(Number(e.target.value) || 0))))}
        />
      </label>
    );
  return (
    <label className="field">
      <span>
        {p.name} <span className="muted small">{typeof value === "number" ? value.toFixed(2) : ""}</span>
      </span>
      <input type="range" min={-1} max={1} step={0.01} value={typeof value === "number" ? value : 0} onChange={(e) => send(Number(e.target.value))} />
    </label>
  );
}

export function OscLivePanel() {
  const listen = useApp((s) => s.settings.extras.osc.listen);
  const live = useOscLive();
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);
  if (!listen)
    return (
      <p className="small muted">
        Turn on <button className="link" onClick={() => setState({ settingsOpen: true, settingsTab: "osc" })}>Listen to VRChat</button> (OSC) to see and set your
        avatar's toggles here.
      </p>
    );
  const list = toggles(live.config).filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()));
  const shown = showAll ? list : list.slice(0, 40);
  return (
    <section className="insight-card">
      <h3>In game now</h3>
      {live.error && <p className="small warn">{live.error}</p>}
      {live.avatar ? (
        <>
          <p className="small">
            Wearing <b>{live.config?.name || live.avatar}</b>
            {live.params.AFK === true && <span className="chip">AFK</span>}
            {live.params.MuteSelf === true && <span className="chip">Muted</span>}
            {live.params.Earmuffs === true && <span className="chip">Earmuffs</span>}
          </p>
          {live.config ? (
            list.length || filter ? (
              <>
                <input placeholder="Find a toggle" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a toggle" />
                <div className="osc-toggles">
                  {shown.map((p) => (
                    <Toggle key={p.name} p={p} value={live.params[p.name]} />
                  ))}
                </div>
                {list.length > shown.length && (
                  <button className="btn small ghost" onClick={() => setShowAll(true)}>
                    Show all {list.length}
                  </button>
                )}
              </>
            ) : (
              <p className="small muted">This avatar has no toggles VRChat lets you set over OSC.</p>
            )
          ) : (
            <p className="small muted">VRChat hasn't written this avatar's OSC file yet (it does when you put it on with OSC turned on).</p>
          )}
        </>
      ) : (
        <p className="small muted">{live.listening ? "Waiting for VRChat to say which avatar you're wearing (change avatar, or reset OSC in the Action Menu)." : "Not listening."}</p>
      )}
      {live.history.length > 0 && (
        <>
          <h4>Avatars you wore</h4>
          <ul className="osc-history small">
            {live.history.slice(0, 30).map((h) => (
              <li key={h.id}>
                {h.name || h.id} <span className="muted">{new Date(h.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
