import { t as tr, lazy, weekdayNames } from "../i18n";
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
import { Range } from "./Range";

export const PERSON_MODES: { value: NotifyPerson["mode"] | "default"; label: string }[] = lazy(() => [
  { value: "default", label: tr("notify.generalRules") },
  { value: "always", label: tr("notify.alwaysNotify") },
  { value: "once", label: tr("notify.nextTimeTheyComeOnline2") },
  { value: "never", label: tr("notify.neverNotify") },
]);

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
      <option value="none">{tr("notify.noSound")}</option>
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
      <h3>{tr("notify.notifications")}</h3>
      <label className="check">
        <input type="checkbox" checked={n.enabled} onChange={(e) => updateNotify({ enabled: e.target.checked })} />
        {tr("notify.notifyMeAboutFriends")}
      </label>

      <div className="row mute-row">
        {muted ? (
          <>
            <span className="small">
              <Icon name="pause" size={14} /> {muteLabel(n)}
            </span>
            <button className="btn small" onClick={() => muteFor(0)}>
              {tr("notify.unmute")}
            </button>
          </>
        ) : (
          <>
            <span className="small muted">{tr("notify.mute")}</span>
            <button className="btn small" onClick={() => muteFor(30 * 60_000)}>
              {tr("notify.n30Min")}
            </button>
            <button className="btn small" onClick={() => muteFor(60 * 60_000)}>
              1 h
            </button>
            <button className="btn small" onClick={() => muteFor(4 * 60 * 60_000)}>
              4 h
            </button>
            <button className="btn small" onClick={() => muteFor("forever")}>
              {tr("notify.untilIUnmute")}
            </button>
          </>
        )}
      </div>

      <h4 className="sub-h">{tr("notify.when")}</h4>
      <div className="notify-events">
        {NOTIFY_EVENTS.map((e: NotifyEvent) => (
          <div key={e} className="notify-event">
            <label className="check">
              <input type="checkbox" checked={n.events[e]} disabled={!n.enabled} onChange={(ev) => updateNotify({ events: { ...n.events, [e]: ev.target.checked } })} />
              {EVENT_LABEL[e]}
              {(e === "joined" || e === "left") && <span className="small muted"> {tr("notify.gameLogPc")}</span>}
            </label>
            <select
              value={n.actionSounds[e]}
              disabled={!n.enabled || !n.sound}
              title={tr("notify.soundForThis")}
              onChange={(ev) => updateNotify({ actionSounds: { ...n.actionSounds, [e]: ev.target.value } })}
            >
              {soundOptions}
            </select>
            <button className="icon-btn small" title={tr("notify.playTitle", { event: EVENT_LABEL[e], name: exampleName })} onClick={() => previewEvent(e, exampleName)}>
              <Icon name="play" size={14} />
            </button>
          </div>
        ))}
      </div>

      <label className="field narrow">
        <span>{tr("notify.cameOnlineAndWentOffline")}</span>
        <select value={n.scope} disabled={!n.enabled} onChange={(e) => updateNotify({ scope: e.target.value as typeof n.scope })}>
          <option value="everyone">{tr("notify.allFriends")}</option>
          <option value="circles">{tr("notify.peopleInSomeCircles")}</option>
          <option value="picked">{tr("notify.onlyThePeopleIPick")}</option>
        </select>
      </label>
      {n.scope === "circles" && (
        <div className="chips">
          {circles.length === 0 && <span className="small muted">{tr("notify.makeCirclesFirstOnThe")}</span>}
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

      <QuietAndCircles />

      <h4 className="sub-h">{tr("notify.people")}</h4>
      <p className="small muted">
        <b>{tr("notify.always")}</b>: when they come online or join your world, even if those are off above (other events follow the switches).{" "}
        <b>{tr("notify.nextTimeTheyComeOnline")}</b>: once, then back to normal. Handy when you're waiting for someone. <b>{tr("notify.never")}</b>: nothing about
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
              <button className="icon-btn small" title={tr("notify.backToTheGeneralRules")} onClick={() => setPersonMode(id, "default")}>
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="notify-find">
        <input value={find} placeholder={tr("notify.addAFriend")} onChange={(e) => setFind(e.target.value)} />
        {matches.length > 0 && (
          <ul className="notify-matches">
            {matches.map((f) => (
              <li key={f.id}>
                <span>{f.displayName}</span>
                <button className="btn small" onClick={() => (setPersonMode(f.id, "always"), setFind(""))}>
                  {tr("notify.always")}
                </button>
                <button className="btn small" onClick={() => (setPersonMode(f.id, "once"), setFind(""))}>
                  {tr("notify.once")}
                </button>
                <button className="btn small" onClick={() => (setPersonMode(f.id, "never"), setFind(""))}>
                  {tr("notify.never")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h4 className="sub-h">{tr("notify.sounds")}</h4>
      <label className="check">
        <input type="checkbox" checked={n.sound} onChange={(e) => updateNotify({ sound: e.target.checked })} />
        {tr("notify.playSounds")}
      </label>
      <label className="check">
        <input type="checkbox" checked={n.personTune} disabled={!n.sound} onChange={(e) => updateNotify({ personTune: e.target.checked })} />
        {tr("notify.afterTheSoundPlayThe")}
      </label>
      <div className="row">
        <label className="field narrow">
          <span>{tr("notify.volumeValue", { value: Math.round(n.volume * 100) })}</span>
          <Range pct min={0} max={1} step={0.05} value={n.volume} onChange={(e) => updateNotify({ volume: Number(e.target.value) })} />
        </label>
        <label className="field narrow">
          <span>{tr("notify.pauseBeforeThePersonS", { value: n.pause.toFixed(2) })}</span>
          <Range pct={false} min={0} max={1} step={0.05} value={n.pause} disabled={!n.sound || !n.personTune} onChange={(e) => updateNotify({ pause: Number(e.target.value) })} />
        </label>
        <label className="field narrow">
          <span>{tr("notify.hearSomeoneSTune")}</span>
          <div className="row tight">
            <input value={sample} placeholder={myName ?? tr("notify.aName")} onChange={(e) => setSample(e.target.value)} />
            <button className="btn small" onClick={() => previewEvent("online", exampleName)}>
              <Icon name="play" size={14} /> {tr("notify.play")}
            </button>
          </div>
        </label>
      </div>
      <div className="custom-sounds">
        <span className="small">{tr("notify.yourOwnSounds")}</span>
        {customs.length === 0 && <span className="small muted">{tr("notify.noneYet")}</span>}
        {customs.map((c) => (
          <span key={c.id} className="pill custom-sound">
            ♪ {c.name}
            <button className="icon-btn small" title={tr("notify.remove")} onClick={() => removeCustomSound(c.id)}>
              <Icon name="close" size={12} />
            </button>
          </span>
        ))}
        <button className="btn small" onClick={() => fileRef.current?.click()}>
          <Icon name="plus" size={14} /> {tr("notify.addASoundFile")}
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
              showToast(tr("notify.addedNamePickItFor", { name: f.name }));
            } catch (err) {
              showToast(err instanceof Error ? err.message : String(err));
            }
          }}
        />
      </div>

      <h4 className="sub-h">{tr("notify.popUpNotifications")}</h4>
      <div className="row">
        <label className="field narrow">
          <span>{tr("notify.showASystemNotification")}</span>
          <select value={n.system} onChange={(e) => updateNotify({ system: e.target.value as typeof n.system })}>
            <option value="background">{tr("notify.whenTheAppIsIn")}</option>
            <option value="always">{tr("notify.always")}</option>
            <option value="never">{tr("notify.neverSoundAndANote")}</option>
          </select>
        </label>
        <button
          className="btn small"
          onClick={async () => showToast((await askNotificationPermission()) ? tr("notify.notificationsAreAllowed") : tr("notify.notificationsArenTAllowedCheck"))}
        >
          <Icon name="info" size={14} /> {tr("notify.allowNotifications")}
        </button>
      </div>
      <p className="small muted">
        {isMobile
          ? tr("notify.onPhonesNotificationsComeWhile")
          : tr("notify.notificationsKeepComingWhileThe")}
      </p>
      <label className="field narrow">
        <span>{tr("inbox.popupsSetting")}</span>
        <select value={n.popupSeconds} onChange={(e) => updateNotify({ popupSeconds: Number(e.target.value) })}>
          {[0, 10, 30, 60, 120].map((v) => (
            <option key={v} value={v}>
              {v ? tr("inbox.popupSeconds", { count: v }) : tr("inbox.popupsOff")}
            </option>
          ))}
        </select>
      </label>
      <p className="small muted">{tr("inbox.popupsHelp")}</p>
      <label className="check">
        <input type="checkbox" checked={n.blockAskPopup} onChange={(e) => updateNotify({ blockAskPopup: e.target.checked })} />
        {tr("inbox.blockAskPopup")}
      </label>
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
          {tr("notify.tryItAddADemo")}
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
      <h3>{tr("notify.closingTheWindow")}</h3>
      <label className="field narrow">
        <span>{tr("notify.whenICloseTheWindow")}</span>
        <select value={closeAction} onChange={(e) => updateSettings({ closeAction: e.target.value as typeof closeAction })}>
          <option value="ask">{tr("notify.askMe")}</option>
          <option value="tray">{tr("notify.keepRunningInTheTray")}</option>
          <option value="quit">{tr("notify.quitTheApp")}</option>
        </select>
      </label>
      <p className="small muted">
        {tr("notify.inTheTrayTheApp")}
      </p>
    </>
  );
}

const DAY_NAMES = lazy(() => weekdayNames("short"));
const RULE_EVENTS: NotifyEvent[] = ["online", "offline", "joined", "left"];

/** Quiet hours, rules per circle, gathering alerts. */
function QuietAndCircles() {
  const n = useApp((s) => s.settings.notify);
  const circles = useApp((s) => s.local.circles);
  const q = n.quiet;
  const setQ = (patch: Partial<typeof q>) => updateNotify({ quiet: { ...q, ...patch } });
  const g = n.gathering;
  const setG = (patch: Partial<typeof g>) => updateNotify({ gathering: { ...g, ...patch } });
  return (
    <>
      <h4 className="sub-h">{tr("notify.quietHours")}</h4>
      <label className="check">
        <input type="checkbox" checked={q.enabled} disabled={!n.enabled} onChange={(e) => setQ({ enabled: e.target.checked })} />
        {tr("notify.doNotDisturbOnA")}
      </label>
      {q.enabled && (
        <div className="indent">
          <div className="row">
            <label className="field narrow">
              <span>{tr("notify.from")}</span>
              <input type="time" value={q.from} onChange={(e) => setQ({ from: e.target.value || q.from })} />
            </label>
            <label className="field narrow">
              <span>{tr("notify.to")}</span>
              <input type="time" value={q.to} onChange={(e) => setQ({ to: e.target.value || q.to })} />
            </label>
          </div>
          <div className="chips">
            {DAY_NAMES.map((d, i) => (
              <button key={d} className={`chip ${q.days.includes(i) ? "on" : ""}`} onClick={() => setQ({ days: q.days.includes(i) ? q.days.filter((x) => x !== i) : [...q.days, i] })}>
                {d}
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={q.allowStarred} onChange={(e) => setQ({ allowStarred: e.target.checked })} />
            {tr("notify.starredFriendsStillGetThrough")}
          </label>
          {circles.length > 0 && (
            <div className="row">
              <span className="small">{tr("notify.alsoGetThrough")}</span>
              <div className="chips">
                {circles.map((c) => {
                  const on = q.allowCircleIds.includes(c.id);
                  return (
                    <button key={c.id} className={`chip ${on ? "on" : ""}`} style={{ "--chip": c.color } as React.CSSProperties} onClick={() => setQ({ allowCircleIds: on ? q.allowCircleIds.filter((x) => x !== c.id) : [...q.allowCircleIds, c.id] })}>
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <p className="small muted">{tr("notify.duringQuietHoursNothingPlays")}</p>
        </div>
      )}

      {circles.length > 0 && (
        <>
          <h4 className="sub-h">{tr("notify.rulesPerCircle")}</h4>
          <p className="small muted">{tr("notify.forEveryoneInACircle")}</p>
          <div className="circle-rules">
            {circles.map((c) => {
              const evs = n.circleRules[c.id] ?? [];
              return (
                <div key={c.id} className="circle-rule">
                  <span className="circle-name" style={{ color: c.color }}>
                    {c.name}
                  </span>
                  <div className="chips">
                    {RULE_EVENTS.map((e) => {
                      const on = evs.includes(e);
                      return (
                        <button
                          key={e}
                          className={`chip ${on ? "on" : ""}`}
                          onClick={() => updateNotify({ circleRules: { ...n.circleRules, [c.id]: on ? evs.filter((x) => x !== e) : [...evs, e] } })}
                        >
                          {EVENT_LABEL[e]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <h4 className="sub-h">{tr("notify.gatheringAlerts")}</h4>
      <p className="small muted">{tr("notify.closeFriendsGatheringAboveWhen")}</p>
      <div className="row">
        <label className="field narrow">
          <span>{tr("notify.atLeast")}</span>
          <input type="number" min={2} max={20} value={g.min} onChange={(e) => setG({ min: Math.max(2, Math.min(20, Number(e.target.value) || 3)) })} />
        </label>
        <label className="field narrow">
          <span>{tr("notify.of")}</span>
          <select value={g.who} onChange={(e) => setG({ who: e.target.value as typeof g.who })}>
            <option value="starred">{tr("notify.starredFriends")}</option>
            <option value="circles">{tr("notify.peopleInChosenCircles")}</option>
            <option value="both">{tr("notify.both")}</option>
          </select>
        </label>
      </div>
      {g.who !== "starred" && circles.length > 0 && (
        <div className="chips">
          {circles.map((c) => {
            const on = g.circleIds.includes(c.id);
            return (
              <button key={c.id} className={`chip ${on ? "on" : ""}`} style={{ "--chip": c.color } as React.CSSProperties} onClick={() => setG({ circleIds: on ? g.circleIds.filter((x) => x !== c.id) : [...g.circleIds, c.id] })}>
                {c.name}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
