import { useEffect, useMemo, useRef, useState } from "react";
import { isMobile } from "../backend";
import {
  addCustomSound,
  askNotificationPermission,
  customSounds,
  EVENT_LABEL,
  isMuted,
  loadCustomSounds,
  muteFor,
  muteLabel,
  notifyEvent,
  onCustomSounds,
  previewEvent,
  removeCustomSound,
} from "../notifications";
import { celebrateNewFriends, SOUNDS } from "../notify";
import { getState, NOTIFY_EVENTS, setState, showToast, updateCache, updateNotify, updateSettings, useApp } from "../store";
import type { NotifyEvent, NotifyPerson } from "../types";
import { Icon } from "./Icon";

export const PERSON_MODES: { value: NotifyPerson["mode"] | "default"; label: string }[] = [
  { value: "default", label: "General rules" },
  { value: "always", label: "Always notify" },
  { value: "once", label: "Next time they come online (once)" },
  { value: "never", label: "Never notify" },
];

export function setPersonMode(id: string, mode: NotifyPerson["mode"] | "default") {
  const people = { ...getState().settings.notify.people };
  if (mode === "default") delete people[id];
  else people[id] = { mode };
  updateNotify({ people });
}

function useCustoms() {
  const [, setTick] = useState(0);
  useEffect(() => {
    void loadCustomSounds();
    return onCustomSounds(() => setTick((t) => t + 1));
  }, []);
  return customSounds();
}

/** Settings → Notifications. */
export function NotificationsSection() {
  const n = useApp((s) => s.settings.notify);
  const circles = useApp((s) => s.local.circles);
  const friends = useApp((s) => s.cache.friends);
  const myName = useApp((s) => s.cache.me?.displayName);
  const demo = useApp((s) => s.demo);
  const customs = useCustoms();
  const [sample, setSample] = useState("");
  const [find, setFind] = useState("");
  const [, setNow] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const exampleName = sample.trim() || myName || "Lumi";

  useEffect(() => {
    if (n.muteUntil <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [n.muteUntil]);

  const picked = Object.entries(n.people).sort((a, b) => (friends[a[0]]?.displayName ?? a[0]).localeCompare(friends[b[0]]?.displayName ?? b[0]));
  const matches = useMemo(() => {
    const q = find.trim().toLowerCase();
    if (!q) return [];
    return Object.values(friends)
      .filter((f) => !n.people[f.id] && f.displayName.toLowerCase().includes(q))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .slice(0, 6);
  }, [find, friends, n.people]);

  const soundOptions = (
    <>
      <option value="none">No sound</option>
      {SOUNDS.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
      {customs.map((c) => (
        <option key={c.id} value={`custom:${c.id}`}>
          ♪ {c.name}
        </option>
      ))}
    </>
  );

  const muted = isMuted(n);
  return (
    <>
      <h3>Notifications</h3>
      <label className="check">
        <input type="checkbox" checked={n.enabled} onChange={(e) => updateNotify({ enabled: e.target.checked })} />
        Notify me about friends
      </label>

      <div className="row mute-row">
        {muted ? (
          <>
            <span className="small">
              <Icon name="pause" size={14} /> {muteLabel(n)}
            </span>
            <button className="btn small" onClick={() => muteFor(0)}>
              Unmute
            </button>
          </>
        ) : (
          <>
            <span className="small muted">Mute:</span>
            <button className="btn small" onClick={() => muteFor(30 * 60_000)}>
              30 min
            </button>
            <button className="btn small" onClick={() => muteFor(60 * 60_000)}>
              1 h
            </button>
            <button className="btn small" onClick={() => muteFor(4 * 60 * 60_000)}>
              4 h
            </button>
            <button className="btn small" onClick={() => muteFor("forever")}>
              Until I unmute
            </button>
          </>
        )}
      </div>

      <h4 className="sub-h">When</h4>
      <div className="notify-events">
        {NOTIFY_EVENTS.map((e: NotifyEvent) => (
          <div key={e} className="notify-event">
            <label className="check">
              <input type="checkbox" checked={n.events[e]} disabled={!n.enabled} onChange={(ev) => updateNotify({ events: { ...n.events, [e]: ev.target.checked } })} />
              {EVENT_LABEL[e]}
              {(e === "joined" || e === "left") && <span className="small muted"> (game log, PC)</span>}
            </label>
            <select
              value={n.actionSounds[e]}
              disabled={!n.enabled || !n.sound}
              title="Sound for this"
              onChange={(ev) => updateNotify({ actionSounds: { ...n.actionSounds, [e]: ev.target.value } })}
            >
              {soundOptions}
            </select>
            <button className="icon-btn small" title={`Play: ${EVENT_LABEL[e]}, then ${exampleName}'s tune`} onClick={() => previewEvent(e, exampleName)}>
              <Icon name="play" size={14} />
            </button>
          </div>
        ))}
      </div>

      <label className="field narrow">
        <span>"Came online" and "went offline" for</span>
        <select value={n.scope} disabled={!n.enabled} onChange={(e) => updateNotify({ scope: e.target.value as typeof n.scope })}>
          <option value="everyone">All friends</option>
          <option value="circles">People in some circles</option>
          <option value="picked">Only the people I pick below</option>
        </select>
      </label>
      {n.scope === "circles" && (
        <div className="chips">
          {circles.length === 0 && <span className="small muted">Make circles first (on the map or in the sidebar).</span>}
          {circles.map((c) => {
            const on = n.circleIds.includes(c.id);
            return (
              <button
                key={c.id}
                className={`chip ${on ? "on" : ""}`}
                style={{ "--chip": c.color } as React.CSSProperties}
                onClick={() => updateNotify({ circleIds: on ? n.circleIds.filter((x) => x !== c.id) : [...n.circleIds, c.id] })}
              >
                {c.name} ({c.members.length})
              </button>
            );
          })}
        </div>
      )}

      <h4 className="sub-h">People</h4>
      <p className="small muted">
        <b>Always</b>: when they come online or join your world, even if those are off above (other events follow the switches).{" "}
        <b>Next time they come online</b>: once, then back to normal. Handy when you're waiting for someone. <b>Never</b>: nothing about
        them. Also from the bell on their profile.
      </p>
      {picked.length > 0 && (
        <ul className="notify-people">
          {picked.map(([id, p]) => (
            <li key={id}>
              <button className="link-btn" onClick={() => setState({ selectedId: id, settingsOpen: false })}>
                {friends[id]?.displayName ?? id}
              </button>
              <select value={p.mode} onChange={(e) => setPersonMode(id, e.target.value as NotifyPerson["mode"])}>
                {PERSON_MODES.filter((m) => m.value !== "default").map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button className="icon-btn small" title="Back to the general rules" onClick={() => setPersonMode(id, "default")}>
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="notify-find">
        <input value={find} placeholder="Add a friend…" onChange={(e) => setFind(e.target.value)} />
        {matches.length > 0 && (
          <ul className="notify-matches">
            {matches.map((f) => (
              <li key={f.id}>
                <span>{f.displayName}</span>
                <button className="btn small" onClick={() => (setPersonMode(f.id, "always"), setFind(""))}>
                  Always
                </button>
                <button className="btn small" onClick={() => (setPersonMode(f.id, "once"), setFind(""))}>
                  Once
                </button>
                <button className="btn small" onClick={() => (setPersonMode(f.id, "never"), setFind(""))}>
                  Never
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h4 className="sub-h">Sounds</h4>
      <label className="check">
        <input type="checkbox" checked={n.sound} onChange={(e) => updateNotify({ sound: e.target.checked })} />
        Play sounds
      </label>
      <label className="check">
        <input type="checkbox" checked={n.personTune} disabled={!n.sound} onChange={(e) => updateNotify({ personTune: e.target.checked })} />
        After the sound, play the person's own tune (made from their name, always the same for them)
      </label>
      <div className="row">
        <label className="field narrow">
          <span>Volume {Math.round(n.volume * 100)}%</span>
          <input type="range" min={0} max={1} step={0.05} value={n.volume} onChange={(e) => updateNotify({ volume: Number(e.target.value) })} />
        </label>
        <label className="field narrow">
          <span>Hear someone's tune</span>
          <div className="row tight">
            <input value={sample} placeholder={myName ?? "A name"} onChange={(e) => setSample(e.target.value)} />
            <button className="btn small" onClick={() => previewEvent("online", exampleName)}>
              <Icon name="play" size={14} /> Play
            </button>
          </div>
        </label>
      </div>
      <div className="custom-sounds">
        <span className="small">Your own sounds:</span>
        {customs.length === 0 && <span className="small muted">none yet</span>}
        {customs.map((c) => (
          <span key={c.id} className="pill custom-sound">
            ♪ {c.name}
            <button className="icon-btn small" title="Remove" onClick={() => removeCustomSound(c.id)}>
              <Icon name="close" size={12} />
            </button>
          </span>
        ))}
        <button className="btn small" onClick={() => fileRef.current?.click()}>
          <Icon name="plus" size={14} /> Add a sound file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              await addCustomSound(f);
              showToast(`Added ${f.name}. Pick it for any event above.`);
            } catch (err) {
              showToast(err instanceof Error ? err.message : String(err));
            }
          }}
        />
      </div>

      <h4 className="sub-h">Pop-up notifications</h4>
      <div className="row">
        <label className="field narrow">
          <span>Show a system notification</span>
          <select value={n.system} onChange={(e) => updateNotify({ system: e.target.value as typeof n.system })}>
            <option value="background">When the app is in the background</option>
            <option value="always">Always</option>
            <option value="never">Never (sound and a note in the app only)</option>
          </select>
        </label>
        <button
          className="btn small"
          onClick={async () => showToast((await askNotificationPermission()) ? "Notifications are allowed" : "Notifications aren't allowed (check the system settings)")}
        >
          <Icon name="info" size={14} /> Allow notifications
        </button>
      </div>
      <p className="small muted">
        {isMobile
          ? "On phones, notifications come while the app runs, including in the background until the system pauses it. Phone notifications use the system's sound; your sounds play while the app is open."
          : "Notifications keep coming while the app is in the tray (see “Closing the window”)."}
      </p>
      {demo && (
        <button
          className="btn small"
          onClick={() => {
            const s = getState();
            const ids = Object.keys(s.cache.friends);
            const base = s.cache.friends[ids[Math.floor(Math.random() * ids.length)]];
            const id = `usr_demo_new_${Date.now()}`;
            updateCache((c) => ({
              ...c,
              friends: { ...c.friends, [id]: { ...base, id, displayName: `NewFriend${Math.floor(Math.random() * 90 + 10)}`, status: "join me", location: "private" } },
              presence: { ...c.presence, [id]: "online" },
            }));
            celebrateNewFriends([id]);
            notifyEvent("added", id, getState().cache.friends[id]?.displayName ?? "Someone");
            setState({ settingsOpen: false });
          }}
        >
          Try it: add a demo friend
        </button>
      )}
    </>
  );
}

/** Settings → Closing the window (desktop). */
export function CloseSection() {
  const closeAction = useApp((s) => s.settings.closeAction);
  return (
    <>
      <h3>Closing the window</h3>
      <label className="field narrow">
        <span>When I close the window</span>
        <select value={closeAction} onChange={(e) => updateSettings({ closeAction: e.target.value as typeof closeAction })}>
          <option value="ask">Ask me</option>
          <option value="tray">Keep running in the tray</option>
          <option value="quit">Quit the app</option>
        </select>
      </label>
      <p className="small muted">
        In the tray the app keeps notifying and collecting (live updates, game logs, servers) without drawing anything. Click the tray icon to
        open it again; its menu can also mute notifications or quit.
      </p>
    </>
  );
}
