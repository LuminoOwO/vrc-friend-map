// Settings → Servers: vfm-servers you share through (exchange) and/or that
// log your friends for you (logger). See share.ts for the rules.
import { t as tr, lazy } from "../i18n";
import { SETTING_GROUPS } from "../devicesync";
import { useEffect, useState } from "react";
import { backend, isTauri, type LoggerStatus, type MyIdentity } from "../backend";
import { fmtDate } from "../model";
import {
  acceptKey,
  addServerFromInput,
  confirmUnencrypted,
  pairLogger,
  refreshServer,
  registerServer,
  removeServer,
  serverName,
  serverSwitch,
  syncAllServers,
  syncServer,
  trustServerKey,
  unpairLogger,
} from "../share";
import { setState, showToast, updateServer, updateSharing, useApp } from "../store";
import type { EncDefault, EncPolicy, ShareServer } from "../types";
import { Icon } from "./Icon";
import { PeopleChooser } from "./PeopleChooser";
import { newerVersion } from "../updates";
import { betaActive } from "../ui2/active";
import { knownPeers, onPeers, type Peer } from "../peers";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const POLICY_LABEL: Record<EncPolicy, string> = lazy(() => ({
  "force-off": tr("serversModal.neverEncrypted"),
  optional: tr("serversModal.encryptionOptional"),
  recommended: tr("serversModal.encryptionRecommended"),
  "force-on": tr("serversModal.alwaysEncrypted"),
}));

export function ago(t: number) {
  if (!t) return "never";
  const s = (Date.now() - t) / 1000;
  if (s < 90) return "just now";
  if (s < 5400) return tr("serversModal.valueMinAgo", { value: Math.round(s / 60) });
  if (s < 129600) return tr("serversModal.valueHAgo", { value: Math.round(s / 3600) });
  return fmtDate(t);
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied");
  } catch {
    showToast(tr("serversModal.couldnTCopySelectThe"));
  }
}

/** The (?) button: explanation in a bubble. */
export function Why({ text, label = "Why?" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="why">
      <button type="button" className="icon-btn tiny" aria-label={label} aria-expanded={open} title={label} onClick={() => setOpen(!open)}>
        <Icon name="help" size={16} />
      </button>
      {open && (
        <span className="why-bubble" role="note" onClick={() => setOpen(false)}>
          {text}
        </span>
      )}
    </span>
  );
}

/** Off / On, with the side the server doesn't allow greyed out. */
export function EncryptionSwitch({ server }: { server: ShareServer }) {
  useApp((s) => s.settings.sharing.encDefault);
  const sw = serverSwitch(server);
  const set = (on: boolean) => updateServer(server.id, { encrypt: on });
  return (
    <div className="enc-row">
      <span className="enc-label">
        <Icon name={sw.on ? "lock" : "unlock"} size={16} /> {tr("serversModal.encryption")}
      </span>
      <div className="seg enc-seg" role="radiogroup" aria-label={tr("serversModal.encryption")}>
        <button role="radio" aria-checked={!sw.on} className={!sw.on ? "on off-side" : ""} disabled={sw.locked === "off"} onClick={() => set(false)}>
          {tr("serversModal.off")}
        </button>
        <button role="radio" aria-checked={sw.on} className={sw.on ? "on" : ""} disabled={sw.locked === "on"} onClick={() => set(true)}>
          {tr("serversModal.on")}
        </button>
      </div>
      <Why text={sw.why} label={tr("serversModal.whyIsItSetLike")} />
      {sw.source === "yours" && (
        <button className="btn link small" onClick={() => updateServer(server.id, { encrypt: null })}>
          {tr("serversModal.useDefault")}
        </button>
      )}
      {sw.warn && (
        <span className="enc-warn">
          <Icon name="warn" size={14} /> The server can read uploads; you'll be asked before each one.
        </span>
      )}
    </div>
  );
}

export const DEFAULTS: { value: EncDefault; label: string; why: string }[] = lazy(() => [
  { value: "server", label: tr("serversModal.serverBased"), why: tr("serversModal.eachServerSSuggestionOn") },
  { value: "on", label: tr("serversModal.alwaysOn"), why: tr("serversModal.encryptWhereverTheServerLets") },
  { value: "off", label: tr("serversModal.alwaysOff"), why: tr("serversModal.donTEncryptWhereThe") },
]);

export function ServersModal() {
  const sharing = useApp((s) => s.settings.sharing);
  const busy = useApp((s) => s.shareBusy);
  const shared = useApp((s) => s.shared);
  const demo = useApp((s) => s.demo);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [me, setMe] = useState<MyIdentity | null>(null);
  const close = () => setState({ serversOpen: false });

  useEffect(() => {
    if (isTauri && !demo) backend.share.identity().then(setMe).catch(() => setMe(null));
  }, [demo]);

  const add = async () => {
    setAdding(true);
    setAddError("");
    try {
      await addServerFromInput(url);
      setUrl("");
    } catch (e) {
      setAddError(errText(e));
    } finally {
      setAdding(false);
    }
  };

  const received = Object.values(shared?.items ?? {});
  const people = new Set(received.map((i) => i.owner)).size;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal wide" role="dialog" aria-label={tr("serversModal.servers")}>
        <div className="modal-head">
          <h2>
            <Icon name="server" /> {tr("serversModal.servers")}
          </h2>
          <button className="icon-btn" onClick={close} title={tr("serversModal.close")}>
            <Icon name="close" />
          </button>
        </div>
        <p className="small muted">
          Share your friend list and time-together with friends through one or more vfm-servers (yours, a friend's, a public one), and get theirs
          back. A server on a spare device can also log your friends' instance hopping around the clock. Using more than one server gives
          redundancy; encrypted uploads keep each server from reading anything.
        </p>

        {demo && <p className="notice-inline">{tr("serversModal.notAvailableInDemoMode")}</p>}

        <section>
          <h3>{tr("serversModal.addAServer")}</h3>
          <div className="row">
            <input
              className="grow"
              value={url}
              placeholder={tr("serversModal.eG1921681")}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && url.trim() && add()}
              disabled={demo}
            />
            <button className="btn primary" onClick={add} disabled={!url.trim() || adding || demo}>
              <Icon name="plus" size={16} /> {adding ? tr("serversModal.checking") : "Add"}
            </button>
          </div>
          {addError && <p className="error-text">{addError}</p>}
          <small className="muted">{tr("serversModal.runYourOwnDownloadVfm")}</small>
        </section>

        {sharing.servers.map((s) => (
          <ServerCard key={s.id} server={s} />
        ))}

        <section>
          <h3>{tr("serversModal.encryptionDefault")}</h3>
          <div className="row">
            <div className="seg" role="radiogroup" aria-label={tr("serversModal.encryptionDefault")}>
              {DEFAULTS.map((d) => (
                <button
                  key={d.value}
                  role="radio"
                  aria-checked={sharing.encDefault === d.value}
                  className={sharing.encDefault === d.value ? "on" : ""}
                  onClick={() =>
                    // A new default replaces the per-server choices you made.
                    updateSharing({ encDefault: d.value, servers: sharing.servers.map((x) => ({ ...x, encrypt: null })) })
                  }
                >
                  {d.label}
                </button>
              ))}
            </div>
            <Why
              text={tr("serversModal.encDefaultWhy", { why: DEFAULTS.find((d) => d.value === sharing.encDefault)!.why })}
            />
          </div>
        </section>

        <section>
          <h3>{tr("serversModal.syncing")}</h3>
          <label className="check">
            <input type="checkbox" checked={sharing.autoSync} onChange={(e) => updateSharing({ autoSync: e.target.checked })} />
            {tr("serversModal.syncWhileTheAppIs")}
            <select value={sharing.intervalMin} onChange={(e) => updateSharing({ intervalMin: Number(e.target.value) })} disabled={!sharing.autoSync}>
              {[15, 30, 60, 180, 720].map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? tr("serversModal.mMin", { m }) : tr("serversModal.valueH", { value: m / 60 })}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={sharing.syncSettings} onChange={(e) => updateSharing({ syncSettings: e.target.checked })} />
            {tr("serversModal.alsoSyncSettingsBetweenMy")}
          </label>
          {sharing.syncSettings && (
            <div className="indent">
              {SETTING_GROUPS.map((g) => {
                const synced = !sharing.syncGroups.length || sharing.syncGroups.includes(g.id);
                const local = sharing.localOnly.includes(g.id);
                return (
                  <div key={g.id} className="row tight">
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={synced}
                        onChange={(e) => {
                          const all = SETTING_GROUPS.map((x) => x.id);
                          const cur = sharing.syncGroups.length ? sharing.syncGroups : all;
                          updateSharing({ syncGroups: e.target.checked ? [...cur, g.id] : cur.filter((x) => x !== g.id) });
                        }}
                      />
                      {g.label}
                    </label>
                    {synced && (
                      <label className="check small muted">
                        <input type="checkbox" checked={local} onChange={(e) => updateSharing({ localOnly: e.target.checked ? [...sharing.localOnly, g.id] : sharing.localOnly.filter((x) => x !== g.id) })} />
                        {tr("serversModal.keepThisDeviceSOwn")}
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <label className="check">
            <input type="checkbox" checked={sharing.neverUnencrypted} onChange={(e) => updateSharing({ neverUnencrypted: e.target.checked })} />
            {tr("serversModal.neverSendAnythingUnencryptedWhatever")}
          </label>
          <label className="check">
            <input type="checkbox" checked={sharing.useShared} onChange={(e) => updateSharing({ useShared: e.target.checked })} />
            {tr("serversModal.useActivityFriendsShareWith")}
          </label>
          <label className="check">
            <input type="checkbox" checked={sharing.useLogger} onChange={(e) => updateSharing({ useLogger: e.target.checked })} />
            {tr("serversModal.useMyLoggersHistoryFor")}
          </label>
          <div className="row">
            <button className="btn" onClick={() => syncAllServers({ manual: true })} disabled={busy || !sharing.servers.length || demo}>
              <Icon name="refresh" size={16} /> {busy ? tr("serversModal.syncing2") : tr("serversModal.syncAllNow")}
            </button>
            <span className="small muted">
              {people ? tr("serversModal.peopleValueWithYouFriend", { count: people }) : tr("serversModal.nothingSharedWithYouYet")}
            </span>
          </div>
        </section>

        <ChangedKeys />
        <KeySection me={me} setMe={setMe} />
      </div>
    </div>
  );
}

/** Friends whose key a server reported differently than first seen. */
export function ChangedKeys() {
  const pins = useApp((s) => s.keyPins);
  const friends = useApp((s) => s.cache.friends);
  const changed = Object.entries(pins ?? {}).filter(([, p]) => p.offered);
  if (!changed.length) return null;
  return (
    <section>
      <h3>
        <Icon name="warn" size={16} /> {tr("serversModal.changedKeys")}
      </h3>
      <p className="small">
        A server gave a different key for these people than the one you first got. Usually they reinstalled the app or set up a new device
        without copying their key; it could also be a server trying to read what you share with them. Until you accept, nothing is sent to or
        accepted from the new key. Best: ask them for their fingerprint.
      </p>
      {changed.map(([id, p]) => (
        <div key={id} className="row">
          <span className="grow">
            <b>{friends[id]?.displayName ?? id}</b>{" "}
            <span className="small muted">
              was <code className="fp">{p.fingerprint}</code>
            </span>
          </span>
          <button className="btn small" onClick={() => acceptKey(id).catch((e) => showToast(errText(e)))}>
            {tr("serversModal.acceptNewKey")}
          </button>
        </div>
      ))}
    </section>
  );
}

export function KeySection({ me, setMe }: { me: MyIdentity | null; setMe: (m: MyIdentity) => void }) {
  const [secret, setSecret] = useState("");
  const [paste, setPaste] = useState("");
  const [showImport, setShowImport] = useState(false);
  if (!me) return null;
  return (
    <section>
      <h3>
        <Icon name="key" size={16} /> {tr("serversModal.yourKey")}
      </h3>
      <p className="small">
        Fingerprint <code className="fp">{me.fingerprint}</code>
        <Why text={tr("serversModal.yourKeyLivesOnlyOn")} />
      </p>
      <div className="row">
        <code className="fp">{me.proof}</code>
        <button className="btn small" onClick={() => copy(me.proof)}>
          <Icon name="copy" size={14} /> {tr("serversModal.copyBioLine")}
        </button>
      </div>
      <p className="small muted">{tr("serversModal.usingTheAppOnMore")}</p>
      <div className="row">
        <button
          className="btn small"
          onClick={async () => {
            if (secret) return setSecret("");
            setSecret(await backend.share.exportKey());
          }}
        >
          {secret ? tr("serversModal.hideKey") : tr("serversModal.copyKeyToAnotherDevice")}
        </button>
        <button className="btn small" onClick={() => setShowImport(!showImport)}>
          {tr("serversModal.useKeyFromAnotherDevice")}
        </button>
      </div>
      {secret && (
        <div className="secret-box">
          <p className="small warn-text">
            <Icon name="warn" size={14} /> This is your private key. Anyone with it can read what friends share with you. Paste it only into your own
            devices.
          </p>
          <div className="row">
            <code className="secret">{secret}</code>
            <button className="btn small" onClick={() => copy(secret)}>
              <Icon name="copy" size={14} /> {tr("serversModal.copy")}
            </button>
          </div>
        </div>
      )}
      {showImport && (
        <div className="row">
          <input className="grow" type="password" value={paste} placeholder={tr("serversModal.vfmkey1Usr")} onChange={(e) => setPaste(e.target.value)} />
          <button
            className="btn small primary"
            disabled={!paste.trim()}
            onClick={async () => {
              try {
                setMe(await backend.share.importKey(paste));
                setPaste("");
                setShowImport(false);
                showToast(tr("serversModal.thisDeviceNowUsesThat"));
              } catch (e) {
                showToast(errText(e));
              }
            }}
          >
            {tr("serversModal.useThisKey")}
          </button>
        </div>
      )}
    </section>
  );
}

export function ServerCard({ server: s }: { server: ShareServer }) {
  const busy = useApp((st) => st.shareBusy);
  const [invite, setInvite] = useState("");
  const [code, setCode] = useState("");
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [logger, setLogger] = useState<LoggerStatus | null>(null);
  const info = s.info;
  const set = (patch: Partial<ShareServer>) => updateServer(s.id, patch);

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

  return (
    <section className="server-card">
      <div className="server-head">
        <div>
          <h3>{serverName(s)}</h3>
          <div className="small muted">
            {s.url}
            {info && ` · vfm-server ${info.version}`}
          </div>
          {info && newerVersion(__APP_VERSION__, info.version) && (
            <div className="small warn-text">
              Older than this app ({__APP_VERSION__}); some things (like syncing your devices) need a newer server.{" "}
              <button className="link-btn" onClick={() => void backend.openUrl("https://github.com/LuminoOwO/vrc-friend-map/blob/main/docs/server-setup.md#9-updating-the-server")}>
                {tr("serversModal.howToUpdateIt")}
              </button>
            </div>
          )}
        </div>
        <div className="row tight">
          {info && <span className={`pill ${info.encryption === "force-off" ? "warn" : info.encryption === "force-on" ? "ok" : ""}`}>{POLICY_LABEL[info.encryption]}</span>}
          <button className="icon-btn tiny" title={tr("serversModal.checkAgain")} onClick={() => run("refresh", () => refreshServer(s.id))}>
            <Icon name="refresh" size={15} />
          </button>
        </div>
      </div>
      {info?.motd && <p className="motd">{info.motd}</p>}
      {s.url.startsWith("http://") && !/^http:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^/]*\.local\b|[^./:]+(:|$))/.test(s.url) && (
        <p className="small warn-text">
          <Icon name="warn" size={14} /> Not HTTPS. Requests are signed and encrypted uploads stay unreadable, but others on the way can see
          that you use this server.
        </p>
      )}

      {s.keyChanged && (
        <div className="callout warn">
          <p>
            <Icon name="warn" size={14} /> This server's own key changed since you added it. That's expected if it was reinstalled; otherwise
            someone may be pretending to be it. Nothing is sent to it until you decide.
          </p>
          <button className="btn small" onClick={() => run("trust", () => trustServerKey(s.id))}>
            {tr("serversModal.itWasReinstalledTrustThe")}
          </button>
        </div>
      )}

      {!s.registered && info && !s.keyChanged && (
        <div className="join">
          {info.registration === "closed" ? (
            <p className="small muted">{tr("serversModal.thisServerIsnTTaking")}</p>
          ) : (
            <div className="row">
              {info.registration === "invite" && (
                <input className="grow" value={invite} placeholder={tr("serversModal.inviteCodeFromTheServer")} onChange={(e) => setInvite(e.target.value)} />
              )}
              <button
                className="btn primary small"
                disabled={working !== "" || (info.registration === "invite" && !invite.trim())}
                onClick={() => run("join", async () => {
                  await registerServer(s.id, invite.trim());
                  await syncServer(s.id, { manual: true });
                })}
              >
                {working === "join" ? tr("serversModal.joining") : tr("serversModal.joinThisServer")}
              </button>
            </div>
          )}
        </div>
      )}

      {s.registered && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={s.upload}
              onChange={(e) => {
                set({ upload: e.target.checked });
                // On a server that can read uploads, ask right away.
                if (e.target.checked && serverSwitch({ ...s, upload: true }).warn && !s.ackUnencrypted) setState({ confirmUnencrypted: s.id });
              }}
            />
            <Icon name="upload" size={15} /> {tr("serversModal.shareMyDataHere")}
          </label>
          {s.upload && (
            <div className="indent">
              <div className="row">
                <label className="check">
                  <input type="checkbox" checked={s.shareFriends} onChange={(e) => set({ shareFriends: e.target.checked })} />
                  {tr("serversModal.friendList")}
                </label>
                <label className="check">
                  <input type="checkbox" checked={s.shareActivity} onChange={(e) => set({ shareActivity: e.target.checked })} />
                  {tr("serversModal.activityWhoSpendsTimeWith")}
                </label>
                <label className="check">
                  <input type="checkbox" checked={s.shareNotes} disabled={!s.shareFriends} onChange={(e) => set({ shareNotes: e.target.checked })} />
                  {tr("serversModal.myNotesAboutPeople")}
                </label>
                <label className="check">
                  <input type="checkbox" checked={s.syncMine} onChange={(e) => set({ syncMine: e.target.checked })} />
                  {tr("serversModal.syncMyCirclesAndNotes")}
                </label>
                <Why text={tr("serversModal.yourCirclesDismissedGroupSuggestions")} />
                {s.syncMine && s.info?.deviceRelay && <DevicesHere url={s.url} />}
                <label className="check">
                  <input type="checkbox" checked={s.shareRemovals} disabled={!s.shareFriends} onChange={(e) => set({ shareRemovals: e.target.checked })} />
                  {tr("serversModal.myFriendRemovals")}
                </label>
                <label className="check">
                  <input type="checkbox" checked={s.shareBlocks} disabled={!s.shareFriends} onChange={(e) => set({ shareBlocks: e.target.checked })} />
                  {tr("serversModal.whyIBlockedPeopleThe")}
                </label>
                <label className="check">
                  <input type="checkbox" checked={s.shareTimezone} disabled={!s.shareFriends} onChange={(e) => set({ shareTimezone: e.target.checked })} />
                  {tr("serversModal.myTimeZoneSoFriends")}
                </label>
                <label className="check">
                  <input type="checkbox" checked={s.useCache !== false} onChange={(e) => set({ useCache: e.target.checked })} />
                  {tr("serversModal.useThisServerSShared")}
                </label>
                <Why text={tr("serversModal.friendListYourFriendsNames")} />
              </div>
              <div className="row">
                <span className="small">{tr("serversModal.whichFriendsItCovers")}</span>
                <Why text={tr("serversModal.onlyTheseFriendsGoInto")} />
              </div>
              <PeopleChooser value={s.include} onChange={(include) => set({ include })} />
              <div className="row">
                <span className="small">{tr("serversModal.whoCanGetIt")}</span>
                <Why text={tr("serversModal.onlyThesePeopleCanDownload")} />
              </div>
              <PeopleChooser
                value={{ who: s.audience, circleIds: s.circleIds, picked: s.audiencePicked, autoAdd: s.audienceAutoAdd }}
                onChange={(v) => set({ audience: v.who, circleIds: v.circleIds, audiencePicked: v.picked, audienceAutoAdd: v.autoAdd })}
              />
              <EncryptionSwitch server={s} />
              {s.info?.hiddenRecipients && (
                <label className="check">
                  <input type="checkbox" checked={!!s.hideAudience} disabled={!serverSwitch(s).on} onChange={(e) => set({ hideAudience: e.target.checked })} />
                  {tr("serversModal.hideWhoIShareWith")}
                  <Why text={tr("serversModal.whatYouUploadThenDoesn")} />
                </label>
              )}
              {serverSwitch(s).warn && s.ackUnencrypted && (
                <p className="small muted">
                  You chose not to be asked again.{" "}
                  <button className="btn link small" onClick={() => set({ ackUnencrypted: false })}>
                    {tr("serversModal.askMeAgain")}
                  </button>
                </p>
              )}
            </div>
          )}
          <label className="check">
            <input type="checkbox" checked={s.download} onChange={(e) => set({ download: e.target.checked })} />
            <Icon name="download" size={15} /> {tr("serversModal.getWhatFriendsShareWith")}
          </label>

          {info?.loggerEnabled && (
            <div className="logger-box">
              <h4>
                Logger <Why text={tr("serversModal.theServerWatchesYourFriends")} />
              </h4>
              {s.loggerOwner ? (
                <>
                  {logger ? (
                    <p className="small">
                      <span className={logger.connected ? "ok-text" : "warn-text"}>{logger.connected ? tr("serversModal.logging") : tr("serversModal.notConnected")}</span> · {logger.message} ·{" "}
                      {logger.online}/{logger.friends} friends online · {logger.pairs} pairs seen together since {fmtDate(logger.since * 1000)}
                    </p>
                  ) : (
                    <p className="small muted">{tr("serversModal.pairedWithYou")}</p>
                  )}
                  {(s.loggerExpired || logger?.expired) && (
                    <>
                      <p className="small warn-text">
                        <Icon name="warn" size={14} /> {tr("serversModal.theServerSVrchatLogin")}
                      </p>
                      <div className="row">
                        <input className="code-input" inputMode="numeric" maxLength={7} value={code} placeholder="123456" aria-label={tr("serversModal.pairingCode")} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))} />
                        <button className="btn small primary" disabled={code.length !== 6 || working !== ""} onClick={() => run("pair", () => pairLogger(s.id, code))}>
                          {working === "pair" ? tr("serversModal.loggingIn") : tr("serversModal.logInAgain")}
                        </button>
                      </div>
                    </>
                  )}
                  <div className="row">
                    <button className="btn small" onClick={() => run("unpair", () => unpairLogger(s.id, false))}>
                      {tr("serversModal.unpairKeepHistory")}
                    </button>
                    <button className="btn small danger" onClick={() => run("unpair", () => unpairLogger(s.id, true))}>
                      {tr("serversModal.unpairAndDeleteHistory")}
                    </button>
                  </div>
                </>
              ) : info.loggerPaired ? (
                <p className="small muted">{tr("serversModal.pairedWithSomeoneElseS")}</p>
              ) : (
                <div className="row">
                  <input
                    className="code-input"
                    inputMode="numeric"
                    maxLength={7}
                    value={code}
                    placeholder="123456"
                    onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                  <button className="btn small primary" disabled={code.length !== 6 || working !== ""} onClick={() => run("pair", () => pairLogger(s.id, code))}>
                    {working === "pair" ? tr("serversModal.pairing") : tr("serversModal.pairLogger")}
                  </button>
                  <span className="small muted">{tr("serversModal.codeFromTheServerS")}</span>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {error && <p className="error-text">{error}</p>}
      {s.lastError && !error && <p className="error-text">{s.lastError}</p>}
      {s.lastNote && <p className="small muted">{s.lastNote}</p>}
      <div className="row server-foot">
        <span className="small muted">Last sync {ago(s.lastSync)}</span>
        <span className="grow" />
        {s.registered && (
          <button className="btn small" disabled={busy || working !== ""} onClick={() => run("sync", () => syncServer(s.id, { manual: true }))}>
            <Icon name="refresh" size={14} /> {tr("serversModal.syncNow")}
          </button>
        )}
        {confirmRemove ? (
          <>
            <button className="btn small danger" onClick={() => run("remove", () => removeServer(s.id, true))} disabled={!s.registered}>
              {tr("serversModal.deleteMyAccountThere")}
            </button>
            <button className="btn small" onClick={() => run("remove", () => removeServer(s.id, false))}>
              {tr("serversModal.justRemoveFromList")}
            </button>
            <button className="btn small ghost" onClick={() => setConfirmRemove(false)}>
              {tr("serversModal.cancel")}
            </button>
          </>
        ) : (
          <button className="btn small ghost" onClick={() => setConfirmRemove(true)} title={tr("serversModal.removeThisServer")}>
            <Icon name="trash" size={14} />
          </button>
        )}
      </div>
    </section>
  );
}

/** Shown before uploading to a server that doesn't allow encryption. */
export function ConfirmUnencrypted() {
  const id = useApp((s) => s.confirmUnencrypted);
  const server = useApp((s) => s.settings.sharing.servers.find((x) => x.id === id));
  const [again, setAgain] = useState(false);
  if (!id || !server) return null;
  const what = [server.shareFriends && "your friend list", server.shareActivity && "your activity"].filter(Boolean).join(" and ");
  return (
    <div className="modal-backdrop top" role="presentation">
      <div className="modal confirm" role="alertdialog" aria-labelledby="unenc-title" aria-describedby="unenc-body">
        <h2 id="unenc-title">
          <Icon name="warn" /> {tr("serversModal.uploadWithoutEncryption")}
        </h2>
        <div id="unenc-body">
          <p>
            <b>{serverName(server)}</b> doesn't allow encryption. What you upload ({what}) is stored <b>{tr("serversModal.readableOnTheServer")}</b>: whoever runs it, or
            gets its files, can read it.
          </p>
          <p>{tr("serversModal.thisMightBeARisk")}</p>
        </div>
        <label className="check">
          <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} />
          {tr("serversModal.donTAskAgainFor")}
        </label>
        <div className="row end">
          <button className="btn" onClick={() => confirmUnencrypted(server.id, false, false)} autoFocus>
            {tr("serversModal.donTUpload")}
          </button>
          <button className="btn danger" onClick={() => confirmUnencrypted(server.id, again, true)}>
            {tr("serversModal.uploadAnyway")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The servers screen: in the beta UI the Sharing & servers tab of Settings, else the Servers dialog. */
export function openServers() {
  if (betaActive()) setState({ settingsOpen: true, settingsTab: "servers", serversOpen: false });
  else setState({ serversOpen: true, settingsOpen: false });
}

/** Your other devices seen through this server, and how they're reached. */
function DevicesHere({ url }: { url: string }) {
  const [list, setList] = useState<Peer[]>(() => knownPeers());
  useEffect(() => {
    const update = () => setList(knownPeers());
    return onPeers(update);
  }, []);
  const here = list.filter((p) => p.via === url || p.direct);
  return (
    <p className="small muted indent">
      {here.length
        ? tr("serversModal.liveWith", { devices: here.map((p) => `${p.name} (${p.direct ? tr("serversModal.directlyAtHome") : tr("serversModal.throughThisServer")})`).join(", ") })
        : tr("serversModal.yourOtherDevicesSyncLive")}
    </p>
  );
}
