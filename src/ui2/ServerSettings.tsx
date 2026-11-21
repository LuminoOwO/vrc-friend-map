// Beta UI: one server's settings, in sections that say what they're for. The same
// switches and calls as the classic card (src/components/ServersModal.tsx ServerCard),
// laid out as: joining, what I share, what I receive, my other devices, the 24/7
// logger, and the footer (last sync, Sync now, remove).
import { t as tr } from "../i18n";
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
  if (!here.length) return <p className="small muted">{tr("serverSettings.yourOtherDevicesShowUp")}</p>;
  return (
    <ul className="ui2-devices">
      {here.map((p) => (
        <li key={p.device}>
          <Icon name={/phone/i.test(p.name) ? "phone" : "desktop"} size={14} /> {p.name}
          <span className="small muted"> · {p.direct ? tr("serverSettings.directlyAtHome") : tr("serverSettings.throughThisServer")}</span>
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
        <button className="btn small ghost" onClick={() => run("refresh", () => refreshServer(s.id))} title={tr("serverSettings.askTheServerAgain")}>
          <Icon name="refresh" size={14} /> {tr("serverSettings.checkAgain")}
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
          <Icon name="warn" size={14} /> {tr("serverSettings.notHttpsEncryptedUploadsStay")}
        </p>
      )}
      {s.keyChanged && (
        <div className="callout warn">
          <p>
            <Icon name="warn" size={14} /> This server's own key changed since you added it. Expected after a reinstall; otherwise someone may be pretending
            to be it. Nothing is sent to it until you decide.
          </p>
          <button className="btn small" onClick={() => run("trust", () => trustServerKey(s.id))}>
            {tr("serverSettings.itWasReinstalledTrustThe")}
          </button>
        </div>
      )}

      {!s.registered && info && !s.keyChanged && (
        <Section icon="user-plus" title={tr("serverSettings.joinThisServer")} help={info.registration === "invite" ? tr("serverSettings.askItsOwnerForAn") : undefined}>
          {info.registration === "closed" ? (
            <p className="small muted">{tr("serverSettings.thisServerIsnTTaking")}</p>
          ) : (
            <div className="row">
              {info.registration === "invite" && (
                <input id={`join-${s.id}`} className="grow" value={invite} placeholder={tr("serverSettings.inviteCode")} onChange={(e) => setInvite(e.target.value)} />
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
                {working === "join" ? tr("serverSettings.joining") : "Join"}
              </button>
            </div>
          )}
        </Section>
      )}

      {s.registered && (
        <>
          <Section icon="upload" title={tr("serverSettings.whatIShareHere")} help={tr("serverSettings.goesOnlyToTheFriends")}>
            <Check
              id={`up-${s.id}`}
              checked={s.upload}
              label={tr("serverSettings.shareMyDataOnThis")}
              onChange={(v) => {
                set({ upload: v });
                // On a server that can read uploads, ask right away.
                if (v && serverSwitch({ ...s, upload: true }).warn && !s.ackUnencrypted) setState({ confirmUnencrypted: s.id });
              }}
            />
            {s.upload && (
              <div className="indent ui2-stack">
                <Check id={`fr-${s.id}`} checked={s.shareFriends} onChange={(v) => set({ shareFriends: v })} icon="users" label={tr("serverSettings.myFriendList")} hint={tr("serverSettings.namesAndIdsSoFriends")} />
                <Check id={`ac-${s.id}`} checked={s.shareActivity} onChange={(v) => set({ shareActivity: v })} icon="clock" label={tr("serverSettings.whoSpendsTimeWithWhom")} hint={tr("serverSettings.makesEveryoneSCircleSuggestions")} />
                <Check id={`no-${s.id}`} checked={s.shareNotes} disabled={!s.shareFriends} onChange={(v) => set({ shareNotes: v })} icon="tag" label={tr("serverSettings.myNotesAboutPeople")} hint={tr("serverSettings.onlyWhatYouChoseTo")} />
                <Check id={`rm-${s.id}`} checked={s.shareRemovals} disabled={!s.shareFriends} onChange={(v) => set({ shareRemovals: v })} icon="flag" label={tr("serverSettings.whomIRemovedAsA")} hint={tr("serverSettings.friendsSeeItAsA")} />
                <Check id={`bl-${s.id}`} checked={s.shareBlocks} disabled={!s.shareFriends} onChange={(v) => set({ shareBlocks: v })} icon="shield" label={tr("serverSettings.whyIBlockedPeople")} hint={tr("serverSettings.theReasonsYouPickedNever")} />
                <Check id={`tz-${s.id}`} checked={s.shareTimezone} disabled={!s.shareFriends} onChange={(v) => set({ shareTimezone: v })} icon="clock" label={tr("serverSettings.myTimeZone")} hint={tr("serverSettings.soFriendsSeeYourLocal")} />
                <div className="ui2-sub">
                  <span className="small">
                    <Icon name="filter" size={14} /> {tr("serverSettings.whichFriendsItSAbout")}
                  </span>
                  <PeopleChooser value={s.include} onChange={(include) => set({ include })} />
                </div>
                <div className="ui2-sub">
                  <span className="small">
                    <Icon name="user-check" size={14} /> {tr("serverSettings.whoMayGetIt")}
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
                    label={tr("serverSettings.hideFromTheServerWhom")}
                    hint={tr("serverSettings.needsEncryptionFriendsNeedApp")}
                  />
                )}
                {sw.warn && s.ackUnencrypted && (
                  <p className="small muted">
                    You chose not to be asked again before unencrypted uploads.{" "}
                    <button className="btn link small" onClick={() => set({ ackUnencrypted: false })}>
                      {tr("serverSettings.askMeAgain")}
                    </button>
                  </p>
                )}
              </div>
            )}
          </Section>

          <Section icon="download" title={tr("serverSettings.whatIReceiveHere")}>
            <Check id={`dl-${s.id}`} checked={s.download} onChange={(v) => set({ download: v })} label={tr("serverSettings.whatFriendsShareWithMe")} hint={tr("serverSettings.theirFriendListsAndTime")} />
            <Check
              id={`ca-${s.id}`}
              checked={s.useCache !== false}
              onChange={(v) => set({ useCache: v })}
              label={tr("serverSettings.publicVrchatInfoFromThis")}
              hint={tr("serverSettings.worldsAndAvatarsOthersAlready")}
            />
          </Section>

          <Section icon="desktop" title={tr("serverSettings.myOtherDevices")} help={tr("serverSettings.yourCirclesNotesStarsAnd")}>
            <Check id={`me-${s.id}`} checked={s.syncMine} onChange={(v) => set({ syncMine: v })} label={tr("serverSettings.syncMyDevicesThroughThis")} />
            {s.syncMine && s.info?.deviceRelay && <MyDevices url={s.url} />}
          </Section>

          {info?.loggerEnabled && (
            <Section icon="clock" title={tr("serverSettings.n247Logger")} help={tr("serverSettings.theServerWatchesWhereYour")}>
              {s.loggerOwner ? (
                <>
                  {(s.loggerExpired || logger?.expired) && (
                    <div className="ui2-expired">
                      <p className="small warn-text">
                        <Icon name="warn" size={14} /> The server's VRChat login expired, so it isn't logging. Log in again: make a pairing code on the server (its window or
                        admin page) and enter it here. The server gets this app's current login, sealed so only it can open it.
                      </p>
                      <div className="row">
                        <input className="code-input" inputMode="numeric" maxLength={7} value={code} placeholder="123456" aria-label={tr("serverSettings.pairingCode")} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))} />
                        <button className="btn small primary" disabled={code.length !== 6 || working !== ""} onClick={() => run("pair", () => pairLogger(s.id, code))}>
                          {working === "pair" ? tr("serverSettings.loggingIn") : tr("serverSettings.logInAgain")}
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="small">
                    {logger ? (
                      <>
                        <span className={logger.connected ? "ok-text" : "warn-text"}>{logger.connected ? tr("serverSettings.logging") : tr("serverSettings.notConnected")}</span> · {logger.online}/
                        {logger.friends} friends online · {logger.pairs} pairs seen together since {fmtDate(logger.since * 1000)}
                      </>
                    ) : (
                      tr("serverSettings.pairedWithYou")
                    )}
                  </p>
                  <div className="row">
                    <button className="btn small" onClick={() => run("unpair", () => unpairLogger(s.id, false))}>
                      {tr("serverSettings.unpairKeepHistory")}
                    </button>
                    <button className="btn small danger" onClick={() => run("unpair", () => unpairLogger(s.id, true))}>
                      {tr("serverSettings.unpairAndDeleteHistory")}
                    </button>
                  </div>
                </>
              ) : info.loggerPaired ? (
                <p className="small muted">{tr("serverSettings.pairedWithSomeoneElseS")}</p>
              ) : (
                <div className="row">
                  <input id={`pair-${s.id}`} className="code-input" inputMode="numeric" maxLength={7} value={code} placeholder="123456" onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))} />
                  <button className="btn small primary" disabled={code.length !== 6 || working !== ""} onClick={() => run("pair", () => pairLogger(s.id, code))}>
                    {working === "pair" ? tr("serverSettings.pairing") : "Pair"}
                  </button>
                  <Why text={tr("serverSettings.thePairingCodeIsShown")} label={tr("serverSettings.whereSTheCode")} />
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
            <Icon name="refresh" size={14} /> {tr("serverSettings.syncNow")}
          </button>
        )}
        {confirmRemove ? (
          <>
            <button className="btn small danger" onClick={() => run("remove", () => removeServer(s.id, true))} disabled={!s.registered}>
              {tr("serverSettings.deleteMyAccountThere")}
            </button>
            <button className="btn small" onClick={() => run("remove", () => removeServer(s.id, false))}>
              {tr("serverSettings.justRemoveFromMyList")}
            </button>
            <button className="btn small ghost" onClick={() => setConfirmRemove(false)}>
              {tr("serverSettings.cancel")}
            </button>
          </>
        ) : (
          <button className="btn small ghost" onClick={() => setConfirmRemove(true)}>
            <Icon name="trash" size={14} /> {tr("serverSettings.remove")}
          </button>
        )}
      </div>
    </div>
  );
}
