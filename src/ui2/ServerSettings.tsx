// Beta UI: one server's settings, in sections that say what they're for. The same
// switches and calls as the classic card (src/components/ServersModal.tsx ServerCard),
// laid out as: joining, what I share, what I receive, my other devices, the 24/7
// logger, and the footer (last sync, Sync now, remove).
import { useEffect, useState } from "react";
import { backend, type LoggerStatus } from "../backend";
import { fmtDate } from "../model";
import {
  pairLogger,
  refreshServer,
  registerServer,
  mismatchOf,
  removeServer,
  serverSwitch,
  syncServer,
  trustServerKey,
  unpairLogger,
} from "../share";
import { setState, updateServer, useApp } from "../store";
import type { ShareServer } from "../types";
import { Icon } from "../components/Icon";
import { PeopleChooser } from "../components/PeopleChooser";
import { ago, EncryptionSwitch, POLICY_LABEL, Why } from "../components/ServersModal";
import { knownPeers, onPeers, type Peer } from "../peers";
import { newerVersion } from "../compat";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Section({ icon, title, help, children }: { icon: string; title: string; help?: string; children: React.ReactNode }) {
  return (
    <section className="ui2-srvsec">
      <h4>
        <Icon name={icon} size={16} /> {title}
      </h4>
      {help && <p className="small muted ui2-help">{help}</p>}
      {children}
    </section>
  );
}

function Check({ id, checked, disabled, onChange, icon, label, hint }: { id: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; icon?: string; label: string; hint?: string }) {
  return (
    <label className="check">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {icon && <Icon name={icon} size={14} />} {label}
        {hint && <small className="muted ui2-help">{hint}</small>}
      </span>
    </label>
  );
}

function MyDevices({ url }: { url: string }) {
  const [list, setList] = useState<Peer[]>(() => knownPeers());
  useEffect(() => onPeers(() => setList(knownPeers())), []);
  const here = list.filter((p) => p.via === url || p.direct);
  if (!here.length) return <p className="small muted">Your other devices show up here once they're online too.</p>;
  return (
    <ul className="ui2-devices">
      {here.map((p) => (
        <li key={p.device}>
          <Icon name={/phone/i.test(p.name) ? "phone" : "desktop"} size={14} /> {p.name}
          <span className="small muted"> · {p.direct ? "directly, at home" : "through this server"}</span>
        </li>
      ))}
    </ul>
  );
}

export function ServerSettings({ server: s }: { server: ShareServer }) {
  const busy = useApp((st) => st.shareBusy);
  const [invite, setInvite] = useState("");
  const [code, setCode] = useState("");
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [logger, setLogger] = useState<LoggerStatus | null>(null);
  const info = s.info;
  const set = (patch: Partial<ShareServer>) => updateServer(s.id, patch);
  const sw = serverSwitch(s);

  useEffect(() => {
    if (!s.loggerOwner) return setLogger(null);
    backend.share.loggerStatus(s.url).then(setLogger).catch(() => setLogger(null));
  }, [s.loggerOwner, s.url, s.lastSync]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setWorking(label);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    } finally {
      setWorking("");
    }
  };

  const plainHttp = s.url.startsWith("http://") && !/^http:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^/]*\.local\b|[^./:]+(:|$))/.test(s.url);

  return (
    <div className="ui2-srvsettings">
      {/* About the server: version, encryption rule, message, warnings. */}
      <div className="ui2-srvinfo small">
        {info && (
          <>
            <span className="pill">vfm-server {info.version}</span>
            <span className={`pill ${info.encryption === "force-off" ? "warn" : info.encryption === "force-on" ? "ok" : ""}`}>
              <Icon name={info.encryption === "force-off" ? "unlock" : "lock"} size={12} /> {POLICY_LABEL[info.encryption]}
            </span>
          </>
        )}
        <button className="btn small ghost" onClick={() => run("refresh", () => refreshServer(s.id))} title="Ask the server again">
          <Icon name="refresh" size={14} /> Check again
        </button>
      </div>
      {info?.motd && <p className="motd">{info.motd}</p>}
      {mismatchOf(s) ? (
        <p className="small warn-text">
          <Icon name="warn" size={14} /> {mismatchOf(s)!.text} Nothing syncs with this server until then.
        </p>
      ) : info && newerVersion(__APP_VERSION__, info.version) && (
        <p className="small warn-text">
          <Icon name="warn" size={14} /> This server is older than your app; some things (like syncing your devices) need it updated.
        </p>
      )}
      {plainHttp && (
        <p className="small warn-text">
          <Icon name="warn" size={14} /> Not HTTPS: encrypted uploads stay unreadable, but others on the way can see that you use this server.
        </p>
      )}
      {s.keyChanged && (
        <div className="callout warn">
          <p>
            <Icon name="warn" size={14} /> This server's own key changed since you added it. Expected after a reinstall; otherwise someone may be pretending
            to be it. Nothing is sent to it until you decide.
          </p>
          <button className="btn small" onClick={() => run("trust", () => trustServerKey(s.id))}>
            It was reinstalled: trust the new key
          </button>
        </div>
      )}

      {!s.registered && info && !s.keyChanged && (
        <Section icon="user-plus" title="Join this server" help={info.registration === "invite" ? "Ask its owner for an invite code." : undefined}>
          {info.registration === "closed" ? (
            <p className="small muted">This server isn't taking new people.</p>
          ) : (
            <div className="row">
              {info.registration === "invite" && (
                <input id={`join-${s.id}`} className="grow" value={invite} placeholder="Invite code" onChange={(e) => setInvite(e.target.value)} />
              )}
              <button
                className="btn primary small"
                disabled={working !== "" || (info.registration === "invite" && !invite.trim())}
                onClick={() =>
                  run("join", async () => {
                    await registerServer(s.id, invite.trim());
                    await syncServer(s.id, { manual: true });
                  })
                }
              >
                {working === "join" ? "Joining…" : "Join"}
              </button>
            </div>
          )}
        </Section>
      )}

      {s.registered && (
        <>
          <Section icon="upload" title="What I share here" help="Goes only to the friends you pick, and only if they joined this server too. These choices follow you to your other devices (when they sync your devices).">
            <Check
              id={`up-${s.id}`}
              checked={s.upload}
              label="Share my data on this server"
              onChange={(v) => {
                set({ upload: v });
                // On a server that can read uploads, ask right away.
                if (v && serverSwitch({ ...s, upload: true }).warn && !s.ackUnencrypted) setState({ confirmUnencrypted: s.id });
              }}
            />
            {s.upload && (
              <div className="indent ui2-stack">
                <Check id={`fr-${s.id}`} checked={s.shareFriends} onChange={(v) => set({ shareFriends: v })} icon="users" label="My friend list" hint="Names and IDs, so friends see connections VRChat hides." />
                <Check id={`ac-${s.id}`} checked={s.shareActivity} onChange={(v) => set({ shareActivity: v })} icon="clock" label="Who spends time with whom" hint="Makes everyone's circle suggestions better." />
                <Check id={`no-${s.id}`} checked={s.shareNotes} disabled={!s.shareFriends} onChange={(v) => set({ shareNotes: v })} icon="tag" label="My notes about people" hint="Only what you chose to tell friends. Notes about age never leave your device." />
                <Check id={`rm-${s.id}`} checked={s.shareRemovals} disabled={!s.shareFriends} onChange={(v) => set({ shareRemovals: v })} icon="flag" label="Whom I removed as a friend" hint="Friends see it as a note on that person's profile." />
                <Check id={`bl-${s.id}`} checked={s.shareBlocks} disabled={!s.shareFriends} onChange={(v) => set({ shareBlocks: v })} icon="shield" label="Why I blocked people" hint="The reasons you picked, never your own words." />
                <Check id={`tz-${s.id}`} checked={s.shareTimezone} disabled={!s.shareFriends} onChange={(v) => set({ shareTimezone: v })} icon="clock" label="My time zone" hint="So friends see your local time." />
                <div className="ui2-sub">
                  <span className="small">
                    <Icon name="filter" size={14} /> Which friends it's about
                  </span>
                  <PeopleChooser value={s.include} onChange={(include) => set({ include })} />
                </div>
                <div className="ui2-sub">
                  <span className="small">
                    <Icon name="user-check" size={14} /> Who may get it
                  </span>
                  <PeopleChooser
                    value={{ who: s.audience, circleIds: s.circleIds, picked: s.audiencePicked, autoAdd: s.audienceAutoAdd }}
                    onChange={(v) => set({ audience: v.who, circleIds: v.circleIds, audiencePicked: v.picked, audienceAutoAdd: v.autoAdd })}
                  />
                </div>
                <EncryptionSwitch server={s} />
                {s.info?.hiddenRecipients && (
                  <Check
                    id={`hid-${s.id}`}
                    checked={!!s.hideAudience}
                    disabled={!sw.on}
                    onChange={(v) => set({ hideAudience: v })}
                    icon="eye"
                    label="Hide from the server whom I share with"
                    hint="Needs encryption. Friends need app 0.12.0 or newer to get it."
                  />
                )}
                {sw.warn && s.ackUnencrypted && (
                  <p className="small muted">
                    You chose not to be asked again before unencrypted uploads.{" "}
                    <button className="btn link small" onClick={() => set({ ackUnencrypted: false })}>
                      Ask me again
                    </button>
                  </p>
                )}
              </div>
            )}
          </Section>

          <Section icon="download" title="What I receive here">
            <Check id={`dl-${s.id}`} checked={s.download} onChange={(v) => set({ download: v })} label="What friends share with me" hint="Their friend lists and time together show on your map." />
            <Check
              id={`ca-${s.id}`}
              checked={s.useCache !== false}
              onChange={(v) => set({ useCache: v })}
              label="Public VRChat info from this server's cache"
              hint="Worlds and avatars others already loaded, so VRChat gets fewer requests."
            />
          </Section>

          <Section icon="desktop" title="My other devices" help="Your circles, notes, stars and nicknames, encrypted for you only; the server can't read them.">
            <Check id={`me-${s.id}`} checked={s.syncMine} onChange={(v) => set({ syncMine: v })} label="Sync my devices through this server" />
            {s.syncMine && s.info?.deviceRelay && <MyDevices url={s.url} />}
          </Section>

          {info?.loggerEnabled && (
            <Section icon="clock" title="24/7 logger" help="The server watches where your friends are, around the clock, so time together keeps counting while your PC is off.">
              {s.loggerOwner ? (
                <>
                  {(s.loggerExpired || logger?.expired) && (
                    <div className="ui2-expired">
                      <p className="small warn-text">
                        <Icon name="warn" size={14} /> The server's VRChat login expired, so it isn't logging. Log in again: make a pairing code on the server (its window or
                        admin page) and enter it here. The server gets this app's current login, sealed so only it can open it.
                      </p>
                      <div className="row">
                        <input className="code-input" inputMode="numeric" maxLength={7} value={code} placeholder="123456" aria-label="Pairing code" onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))} />
                        <button className="btn small primary" disabled={code.length !== 6 || working !== ""} onClick={() => run("pair", () => pairLogger(s.id, code))}>
                          {working === "pair" ? "Logging in…" : "Log in again"}
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="small">
                    {logger ? (
                      <>
                        <span className={logger.connected ? "ok-text" : "warn-text"}>{logger.connected ? "● Logging" : "○ Not connected"}</span> · {logger.online}/
                        {logger.friends} friends online · {logger.pairs} pairs seen together since {fmtDate(logger.since * 1000)}
                      </>
                    ) : (
                      "Paired with you."
                    )}
                  </p>
                  <div className="row">
                    <button className="btn small" onClick={() => run("unpair", () => unpairLogger(s.id, false))}>
                      Unpair (keep history)
                    </button>
                    <button className="btn small danger" onClick={() => run("unpair", () => unpairLogger(s.id, true))}>
                      Unpair and delete history
                    </button>
                  </div>
                </>
              ) : info.loggerPaired ? (
                <p className="small muted">Paired with someone else's account.</p>
              ) : (
                <div className="row">
                  <input id={`pair-${s.id}`} className="code-input" inputMode="numeric" maxLength={7} value={code} placeholder="123456" onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))} />
                  <button className="btn small primary" disabled={code.length !== 6 || working !== ""} onClick={() => run("pair", () => pairLogger(s.id, code))}>
                    {working === "pair" ? "Pairing…" : "Pair"}
                  </button>
                  <Why text="The pairing code is shown in the server's window or on its admin page. Pairing hands the server your VRChat login, sealed so only it can open it; only pair a server you run." label="Where's the code?" />
                </div>
              )}
            </Section>
          )}
        </>
      )}

      {error && <p className="error-text">{error}</p>}
      {s.lastError && !error && <p className="error-text">{s.lastError}</p>}
      {s.lastNote && <p className="small muted">{s.lastNote}</p>}
      <div className="row ui2-srvfoot">
        <span className="small muted">Last sync {ago(s.lastSync)}</span>
        <span className="grow" />
        {s.registered && (
          <button className="btn small" disabled={busy || working !== ""} onClick={() => run("sync", () => syncServer(s.id, { manual: true }))}>
            <Icon name="refresh" size={14} /> Sync now
          </button>
        )}
        {confirmRemove ? (
          <>
            <button className="btn small danger" onClick={() => run("remove", () => removeServer(s.id, true))} disabled={!s.registered}>
              Delete my account there
            </button>
            <button className="btn small" onClick={() => run("remove", () => removeServer(s.id, false))}>
              Just remove from my list
            </button>
            <button className="btn small ghost" onClick={() => setConfirmRemove(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn small ghost" onClick={() => setConfirmRemove(true)}>
            <Icon name="trash" size={14} /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
