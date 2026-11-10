// Settings → Servers: vfm-servers you share through (exchange) and/or that
// log your friends for you (logger). See share.ts for the rules.
import { useEffect, useState } from "react";
import { backend, isTauri, type LoggerStatus, type MyIdentity } from "../backend";
import { fmtDate } from "../model";
import {
  acceptKey,
  addServer,
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

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const POLICY_LABEL: Record<EncPolicy, string> = {
  "force-off": "Never encrypted",
  optional: "Encryption optional",
  recommended: "Encryption recommended",
  "force-on": "Always encrypted",
};

function ago(t: number) {
  if (!t) return "never";
  const s = (Date.now() - t) / 1000;
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return fmtDate(t);
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied");
  } catch {
    showToast("Couldn't copy; select the text instead");
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
        <Icon name={sw.on ? "lock" : "unlock"} size={16} /> Encryption
      </span>
      <div className="seg enc-seg" role="radiogroup" aria-label="Encryption">
        <button role="radio" aria-checked={!sw.on} className={!sw.on ? "on off-side" : ""} disabled={sw.locked === "off"} onClick={() => set(false)}>
          Off
        </button>
        <button role="radio" aria-checked={sw.on} className={sw.on ? "on" : ""} disabled={sw.locked === "on"} onClick={() => set(true)}>
          On
        </button>
      </div>
      <Why text={sw.why} label="Why is it set like this?" />
      {sw.source === "yours" && (
        <button className="btn link small" onClick={() => updateServer(server.id, { encrypt: null })}>
          Use default
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

const DEFAULTS: { value: EncDefault; label: string; why: string }[] = [
  { value: "server", label: "Server-based", why: "Each server's suggestion: on where it recommends encryption, off where it's optional." },
  { value: "on", label: "Always on", why: "Encrypt wherever the server lets you. Servers that never encrypt start with uploading turned off." },
  { value: "off", label: "Always off", why: "Don't encrypt where the server lets you choose (it can then read what you share). Servers that always encrypt still do." },
];

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
      await addServer(url);
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
      <div className="modal wide" role="dialog" aria-label="Servers">
        <div className="modal-head">
          <h2>
            <Icon name="server" /> Servers
          </h2>
          <button className="icon-btn" onClick={close} title="Close">
            <Icon name="close" />
          </button>
        </div>
        <p className="small muted">
          Share your friend list and time-together with friends through one or more vfm-servers (yours, a friend's, a public one), and get theirs
          back. A server on a spare device can also log your friends' instance hopping around the clock. Using more than one server gives
          redundancy; encrypted uploads keep each server from reading anything.
        </p>

        {demo && <p className="notice-inline">Not available in demo mode.</p>}

        <section>
          <h3>Add a server</h3>
          <div className="row">
            <input
              className="grow"
              value={url}
              placeholder="e.g. 192.168.1.20:8787 or vfm.example.com"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && url.trim() && add()}
              disabled={demo}
            />
            <button className="btn primary" onClick={add} disabled={!url.trim() || adding || demo}>
              <Icon name="plus" size={16} /> {adding ? "Checking…" : "Add"}
            </button>
          </div>
          {addError && <p className="error-text">{addError}</p>}
          <small className="muted">Run your own: download vfm-server for your device from the releases page and start it; it shows the address.</small>
        </section>

        {sharing.servers.map((s) => (
          <ServerCard key={s.id} server={s} />
        ))}

        <section>
          <h3>Encryption default</h3>
          <div className="row">
            <div className="seg" role="radiogroup" aria-label="Encryption default">
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
              text={`${DEFAULTS.find((d) => d.value === sharing.encDefault)!.why} A server can still force encryption on or off; then the other side of its switch is greyed out. Changing this resets the switch on every server to the new default.`}
            />
          </div>
        </section>

        <section>
          <h3>Syncing</h3>
          <label className="check">
            <input type="checkbox" checked={sharing.autoSync} onChange={(e) => updateSharing({ autoSync: e.target.checked })} />
            Sync while the app is open, every
            <select value={sharing.intervalMin} onChange={(e) => updateSharing({ intervalMin: Number(e.target.value) })} disabled={!sharing.autoSync}>
              {[15, 30, 60, 180, 720].map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} min` : `${m / 60} h`}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={sharing.useShared} onChange={(e) => updateSharing({ useShared: e.target.checked })} />
            Use activity friends share with me for group suggestions
          </label>
          <label className="check">
            <input type="checkbox" checked={sharing.useLogger} onChange={(e) => updateSharing({ useLogger: e.target.checked })} />
            Use my loggers' history for group suggestions
          </label>
          <div className="row">
            <button className="btn" onClick={() => syncAllServers({ manual: true })} disabled={busy || !sharing.servers.length || demo}>
              <Icon name="refresh" size={16} /> {busy ? "Syncing…" : "Sync all now"}
            </button>
            <span className="small muted">
              {people ? `${people} ${people === 1 ? "person shares" : "people share"} with you (friend lists show under Shared lists).` : "Nothing shared with you yet."}
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
function ChangedKeys() {
  const pins = useApp((s) => s.keyPins);
  const friends = useApp((s) => s.cache.friends);
  const changed = Object.entries(pins ?? {}).filter(([, p]) => p.offered);
  if (!changed.length) return null;
  return (
    <section>
      <h3>
        <Icon name="warn" size={16} /> Changed keys
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
            Accept new key
          </button>
        </div>
      ))}
    </section>
  );
}

function KeySection({ me, setMe }: { me: MyIdentity | null; setMe: (m: MyIdentity) => void }) {
  const [secret, setSecret] = useState("");
  const [paste, setPaste] = useState("");
  const [showImport, setShowImport] = useState(false);
  if (!me) return null;
  return (
    <section>
      <h3>
        <Icon name="key" size={16} /> Your key
      </h3>
      <p className="small">
        Fingerprint <code className="fp">{me.fingerprint}</code>
        <Why text="Your key lives only on this device. Servers get the public half, friends' apps lock data for it. If a friend wants to be sure a server isn't faking your key, compare this fingerprint (or put the line below in your VRChat bio: their app then shows your key as confirmed)." />
      </p>
      <div className="row">
        <code className="fp">{me.proof}</code>
        <button className="btn small" onClick={() => copy(me.proof)}>
          <Icon name="copy" size={14} /> Copy bio line
        </button>
      </div>
      <p className="small muted">Using the app on more than one device? Give the others the same key, or they can't read what's shared with you.</p>
      <div className="row">
        <button
          className="btn small"
          onClick={async () => {
            if (secret) return setSecret("");
            setSecret(await backend.share.exportKey());
          }}
        >
          {secret ? "Hide key" : "Copy key to another device"}
        </button>
        <button className="btn small" onClick={() => setShowImport(!showImport)}>
          Use key from another device
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
              <Icon name="copy" size={14} /> Copy
            </button>
          </div>
        </div>
      )}
      {showImport && (
        <div className="row">
          <input className="grow" type="password" value={paste} placeholder="vfmkey1:usr_…" onChange={(e) => setPaste(e.target.value)} />
          <button
            className="btn small primary"
            disabled={!paste.trim()}
            onClick={async () => {
              try {
                setMe(await backend.share.importKey(paste));
                setPaste("");
                setShowImport(false);
                showToast("This device now uses that key");
              } catch (e) {
                showToast(errText(e));
              }
            }}
          >
            Use this key
          </button>
        </div>
      )}
    </section>
  );
}

function ServerCard({ server: s }: { server: ShareServer }) {
  const circles = useApp((st) => st.local.circles);
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
        </div>
        <div className="row tight">
          {info && <span className={`pill ${info.encryption === "force-off" ? "warn" : info.encryption === "force-on" ? "ok" : ""}`}>{POLICY_LABEL[info.encryption]}</span>}
          <button className="icon-btn tiny" title="Check again" onClick={() => run("refresh", () => refreshServer(s.id))}>
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
            It was reinstalled: trust the new key
          </button>
        </div>
      )}

      {!s.registered && info && !s.keyChanged && (
        <div className="join">
          {info.registration === "closed" ? (
            <p className="small muted">This server isn't taking new people.</p>
          ) : (
            <div className="row">
              {info.registration === "invite" && (
                <input className="grow" value={invite} placeholder="Invite code from the server's owner" onChange={(e) => setInvite(e.target.value)} />
              )}
              <button
                className="btn primary small"
                disabled={working !== "" || (info.registration === "invite" && !invite.trim())}
                onClick={() => run("join", async () => {
                  await registerServer(s.id, invite.trim());
                  await syncServer(s.id, { manual: true });
                })}
              >
                {working === "join" ? "Joining…" : "Join this server"}
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
            <Icon name="upload" size={15} /> Share my data here
          </label>
          {s.upload && (
            <div className="indent">
              <div className="row">
                <label className="check">
                  <input type="checkbox" checked={s.shareFriends} onChange={(e) => set({ shareFriends: e.target.checked })} />
                  Friend list
                </label>
                <label className="check">
                  <input type="checkbox" checked={s.shareActivity} onChange={(e) => set({ shareActivity: e.target.checked })} />
                  Activity (who spends time with whom)
                </label>
                <Why text="Friend list: your friends' names and IDs, so friends see your connections even when VRChat hides mutuals. Activity: how much time pairs of your friends spent in the same instance (from your game logs, live locations and loggers), which makes their group suggestions better. Nothing else is sent." />
              </div>
              <div className="row">
                <span className="small">Who can get it:</span>
                <div className="seg" role="radiogroup" aria-label="Who can get it">
                  <button role="radio" aria-checked={s.audience === "all"} className={s.audience === "all" ? "on" : ""} onClick={() => set({ audience: "all" })}>
                    All my friends
                  </button>
                  <button role="radio" aria-checked={s.audience === "circles"} className={s.audience === "circles" ? "on" : ""} onClick={() => set({ audience: "circles" })}>
                    Some circles
                  </button>
                </div>
                <Why text="Only these people can download what you share here, and only if they joined this server too. Friends who join later get it on your next sync." />
              </div>
              {s.audience === "circles" && (
                <div className="chips">
                  {circles.length === 0 && <span className="small muted">Make circles first (on the map or in the sidebar).</span>}
                  {circles.map((c) => {
                    const on = s.circleIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        className={`chip ${on ? "on" : ""}`}
                        style={{ "--chip": c.color } as React.CSSProperties}
                        onClick={() => set({ circleIds: on ? s.circleIds.filter((x) => x !== c.id) : [...s.circleIds, c.id] })}
                      >
                        {c.name} ({c.members.length})
                      </button>
                    );
                  })}
                </div>
              )}
              <EncryptionSwitch server={s} />
              {serverSwitch(s).warn && s.ackUnencrypted && (
                <p className="small muted">
                  You chose not to be asked again.{" "}
                  <button className="btn link small" onClick={() => set({ ackUnencrypted: false })}>
                    Ask me again
                  </button>
                </p>
              )}
            </div>
          )}
          <label className="check">
            <input type="checkbox" checked={s.download} onChange={(e) => set({ download: e.target.checked })} />
            <Icon name="download" size={15} /> Get what friends share with me here
          </label>

          {info?.loggerEnabled && (
            <div className="logger-box">
              <h4>
                Logger <Why text="The server watches your friends' locations through VRChat's live feed (like this app does while open), around the clock, and counts who is in the same instance as whom. Private and invite-only instances are hidden by VRChat. To pair, it gets your VRChat login (sealed so only that server can open it); logging out of this app keeps it running. Its history comes back to this app signed and encrypted for you." />
              </h4>
              {s.loggerOwner ? (
                <>
                  {logger ? (
                    <p className="small">
                      <span className={logger.connected ? "ok-text" : "warn-text"}>{logger.connected ? "● Logging" : "○ Not connected"}</span> · {logger.message} ·{" "}
                      {logger.online}/{logger.friends} friends online · {logger.pairs} pairs seen together since {fmtDate(logger.since * 1000)}
                    </p>
                  ) : (
                    <p className="small muted">Paired with you.</p>
                  )}
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
                  <input
                    className="code-input"
                    inputMode="numeric"
                    maxLength={7}
                    value={code}
                    placeholder="123456"
                    onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                  <button className="btn small primary" disabled={code.length !== 6 || working !== ""} onClick={() => run("pair", () => pairLogger(s.id, code))}>
                    {working === "pair" ? "Pairing…" : "Pair logger"}
                  </button>
                  <span className="small muted">Code from the server's window or admin page.</span>
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
            <Icon name="refresh" size={14} /> Sync now
          </button>
        )}
        {confirmRemove ? (
          <>
            <button className="btn small danger" onClick={() => run("remove", () => removeServer(s.id, true))} disabled={!s.registered}>
              Delete my account there
            </button>
            <button className="btn small" onClick={() => run("remove", () => removeServer(s.id, false))}>
              Just remove from list
            </button>
            <button className="btn small ghost" onClick={() => setConfirmRemove(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn small ghost" onClick={() => setConfirmRemove(true)} title="Remove this server">
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
          <Icon name="warn" /> Upload without encryption?
        </h2>
        <div id="unenc-body">
          <p>
            <b>{serverName(server)}</b> doesn't allow encryption. What you upload ({what}) is stored <b>readable on the server</b>: whoever runs it, or
            gets its files, can read it.
          </p>
          <p>This might be a risk. If you don't fully trust the people running this server, don't upload your data there.</p>
        </div>
        <label className="check">
          <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} />
          Don't ask again for this server
        </label>
        <div className="row end">
          <button className="btn" onClick={() => confirmUnencrypted(server.id, false, false)} autoFocus>
            Don't upload
          </button>
          <button className="btn danger" onClick={() => confirmUnencrypted(server.id, again, true)}>
            Upload anyway
          </button>
        </div>
      </div>
    </div>
  );
}

export function openServers() {
  setState({ serversOpen: true, settingsOpen: false });
}
