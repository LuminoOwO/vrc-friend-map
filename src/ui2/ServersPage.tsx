// Beta UI: Settings → Sharing & servers, all on one page. Your servers are
// listed right away (tap one for its settings), adding one is its own step,
// and the general options are grouped with a line saying what each does.
// The classic UI keeps its Servers dialog (src/components/ServersModal.tsx).
import { t as tr } from "../i18n";
import { useEffect, useState } from "react";
import { backend, isTauri, type MyIdentity } from "../backend";
import { SETTING_GROUPS } from "../devicesync";
import { addServerFromInput, isLive, mismatchOf, onLiveChange, serverName, serverSwitch, syncAllServers } from "../share";
import { updateSharing, useApp } from "../store";
import type { ShareServer } from "../types";
import { ChangedKeys, DEFAULTS, KeySection } from "../components/ServersModal";
import { ServerSettings } from "./ServerSettings";
import { Icon } from "../components/Icon";

/** One plain status per server: what's going on, in words. */
export function serverStatus(s: ShareServer, live: boolean): { text: string; tone: "ok" | "warn" | "bad" | "" } {
  if (s.keyChanged) return { text: tr("serversPage.serverKeyChangedCheckIt"), tone: "bad" };
  if (!s.info) return { text: s.lastError ? tr("serversPage.canTReachIt") : tr("serversPage.checking"), tone: s.lastError ? "bad" : "" };
  const mismatch = mismatchOf(s);
  if (mismatch) return { text: mismatch.short, tone: "bad" };
  if (s.loggerOwner && s.loggerExpired) return { text: tr("serversPage.serverLoginExpired"), tone: "bad" };
  if (!s.registered) return { text: tr("serversPage.notJoinedYet"), tone: "warn" };
  // One failed sync is usually a hiccup (a timeout, the server's request limit): say so calmly
  // and only turn red when it keeps failing.
  if (s.lastError && (s.failedSyncs ?? 2) < 2) return { text: live ? tr("serversPage.connectedLiveRetryingASync") : tr("serversPage.retrying"), tone: live ? "ok" : "" };
  if (s.lastError) return { text: tr("serversPage.lastSyncFailed"), tone: "bad" };
  if (live) return { text: tr("serversPage.connectedLive"), tone: "ok" };
  return { text: s.lastSync ? "Connected" : tr("serversPage.joinedNotSyncedYet"), tone: s.lastSync ? "ok" : "" };
}

/** What a server does for you, as short chips. */
export function serverRoles(s: ShareServer): string[] {
  const out: string[] = [];
  if (s.upload && (s.shareFriends || s.shareActivity)) out.push(tr("serversPage.youShare"));
  if (s.download) out.push(tr("serversPage.friendsShareWithYou"));
  if (s.syncMine) out.push(tr("serversPage.yourDevices"));
  if (s.loggerOwner) out.push(tr("serversPage.logs247"));
  return out;
}

function useLiveTick() {
  const [, tick] = useState(0);
  useEffect(() => onLiveChange(() => tick((n) => n + 1)), []);
}

function AddServer({ onDone }: { onDone: () => void }) {
  const demo = useApp((s) => s.demo);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const add = async () => {
    setBusy(true);
    setError("");
    try {
      await addServerFromInput(url);
      setUrl("");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ui2-add-server">
      <ol className="ui2-steps small">
        <li>{tr("serversPage.pasteTheInviteLinkThe")}</li>
        <li>{tr("serversPage.orEnterTheServerS")}</li>
        <li>{tr("serversPage.pickWhatToShareThere")}</li>
      </ol>
      <div className="row">
        <input
          id="ui2-add-url"
          className="grow"
          value={url}
          placeholder={tr("serversPage.inviteLinkOrAnAddress")}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && url.trim() && void add()}
          disabled={demo}
          autoFocus
        />
        <button className="btn primary" onClick={() => void add()} disabled={!url.trim() || busy || demo}>
          {busy ? tr("serversPage.checking") : "Add"}
        </button>
        <button className="btn ghost" onClick={onDone}>
          {tr("serversPage.cancel")}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      <p className="small muted">
        {tr("serversPage.wantYourOwnInstallVfm")}
      </p>
    </div>
  );
}

function ServerRow({ s, open, onToggle }: { s: ShareServer; open: boolean; onToggle: () => void }) {
  const st = serverStatus(s, isLive(s.url));
  const roles = serverRoles(s);
  return (
    <li className={`ui2-server ${open ? "open" : ""}`}>
      <button className="ui2-server-row" onClick={onToggle} aria-expanded={open}>
        <Icon name="server" size={18} />
        <span className="ui2-grow">
          <b>{serverName(s)}</b>
          <span className="small muted ui2-server-url">{s.url}</span>
          {roles.length > 0 && (
            <span className="ui2-roles">
              {roles.map((r) => (
                <span key={r} className="chip">
                  {r}
                </span>
              ))}
            </span>
          )}
        </span>
        <span className={`pill ${st.tone}`}>{st.text}</span>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} />
      </button>
      {open && (
        <div className="ui2-server-detail">
          <ServerSettings server={s} />
        </div>
      )}
    </li>
  );
}

export function ServersPage() {
  const sharing = useApp((s) => s.settings.sharing);
  const busy = useApp((s) => s.shareBusy);
  const shared = useApp((s) => s.shared);
  const demo = useApp((s) => s.demo);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [me, setMe] = useState<MyIdentity | null>(null);
  useLiveTick();
  useEffect(() => {
    if (isTauri && !demo) backend.share.identity().then(setMe).catch(() => setMe(null));
  }, [demo]);
  const people = new Set(Object.values(shared?.items ?? {}).map((i) => i.owner)).size;
  const anyEncrypted = sharing.servers.some((s) => serverSwitch(s).on);

  return (
    <div className="ui2-servers">
      <p className="small muted">
        A vfm-server passes your friend list and who spends time with whom to the friends you pick, keeps your devices in sync, and can watch your
        friends around the clock. Encrypted, the server itself can't read any of it.
      </p>

      <section>
        <div className="ui2-section-head">
          <h3>{tr("serversPage.yourServers")}</h3>
          {!adding && (
            <button className="btn small primary" onClick={() => setAdding(true)} disabled={demo}>
              <Icon name="plus" size={14} /> {tr("serversPage.addAServer")}
            </button>
          )}
        </div>
        {adding && <AddServer onDone={() => setAdding(false)} />}
        {sharing.servers.length ? (
          <ul className="ui2-server-list">
            {sharing.servers.map((s) => (
              <ServerRow key={s.id} s={s} open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? null : s.id)} />
            ))}
          </ul>
        ) : (
          !adding && <p className="small muted">{tr("serversPage.noServersYetAddOne")}</p>
        )}
        <div className="row">
          <button className="btn small" onClick={() => syncAllServers({ manual: true })} disabled={busy || !sharing.servers.length || demo}>
            <Icon name="refresh" size={14} /> {busy ? tr("serversPage.syncing2") : tr("serversPage.syncAllNow")}
          </button>
          <span className="small muted">{people ? tr("serversPage.peopleValueWithYou", { people, value: people === 1 ? "person shares" : "people share" }) : tr("serversPage.nothingSharedWithYouYet")}</span>
        </div>
      </section>

      <section>
        <h3>{tr("serversPage.syncing")}</h3>
        <label className="check">
          <input id="ui2-autosync" type="checkbox" checked={sharing.autoSync} onChange={(e) => updateSharing({ autoSync: e.target.checked })} />
          <span>
            {tr("serversPage.syncByItselfWhileThe")}
            <small className="muted ui2-help">Servers that can tell the app about changes get them within seconds; the rest are checked every</small>
          </span>
        </label>
        <div className="indent">
          <select id="ui2-interval" value={sharing.intervalMin} onChange={(e) => updateSharing({ intervalMin: Number(e.target.value) })} disabled={!sharing.autoSync} aria-label={tr("serversPage.howOften")}>
            {[15, 30, 60, 180, 720].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? tr("serversPage.mMinutes", { m }) : tr("serversPage.valueHours", { value: m / 60 })}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section>
        <h3>{tr("serversPage.betweenMyOwnDevices")}</h3>
        <p className="small muted ui2-help">{tr("serversPage.yourCirclesNotesStarsAnd")}</p>
        <label className="check">
          <input id="ui2-syncsettings" type="checkbox" checked={sharing.syncSettings} onChange={(e) => updateSharing({ syncSettings: e.target.checked })} />
          <span>{tr("serversPage.alsoKeepMySettingsThe")}</span>
        </label>
        {sharing.syncSettings && (
          <div className="indent ui2-groups">
            <p className="small muted">{tr("serversPage.whichOnesFrameRateTray")}</p>
            {SETTING_GROUPS.map((g) => {
              const synced = (!sharing.syncGroups.length || sharing.syncGroups.includes(g.id)) && !sharing.localOnly.includes(g.id);
              return (
                <label key={g.id} className="check">
                  <input
                    id={`ui2-group-${g.id}`}
                    type="checkbox"
                    checked={synced}
                    onChange={(e) => {
                      const all = SETTING_GROUPS.map((x) => x.id);
                      const cur = sharing.syncGroups.length ? sharing.syncGroups : all;
                      // Unticked here means "this device keeps its own", ticked means "same everywhere".
                      updateSharing(
                        e.target.checked
                          ? { syncGroups: [...new Set([...cur, g.id])], localOnly: sharing.localOnly.filter((x) => x !== g.id) }
                          : { localOnly: [...new Set([...sharing.localOnly, g.id])] },
                      );
                    }}
                  />
                  <span>{g.label}</span>
                </label>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h3>{tr("serversPage.privacy")}</h3>
        <label className="check">
          <input id="ui2-neverplain" type="checkbox" checked={sharing.neverUnencrypted} onChange={(e) => updateSharing({ neverUnencrypted: e.target.checked })} />
          <span>
            {tr("serversPage.neverSendAnythingUnencrypted")}
            <small className="muted ui2-help">Even where a server allows it. Recommended; a server that only takes unencrypted uploads then gets nothing.</small>
          </span>
        </label>
        <label className="field narrow">
          <span>{tr("serversPage.encryptionOnNewServers")}</span>
          <select
            id="ui2-encdefault"
            value={sharing.encDefault}
            onChange={(e) => updateSharing({ encDefault: e.target.value as typeof sharing.encDefault, servers: sharing.servers.map((x) => ({ ...x, encrypt: null })) })}
          >
            {DEFAULTS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <small className="muted">{DEFAULTS.find((d) => d.value === sharing.encDefault)?.why} Changing it resets every server's own switch.</small>
        </label>
        {!anyEncrypted && sharing.servers.length > 0 && <p className="small warn-text">{tr("serversPage.noneOfYourServersEncrypts")}</p>}
      </section>

      <section>
        <h3>{tr("serversPage.groupSuggestions")}</h3>
        <label className="check">
          <input id="ui2-useshared" type="checkbox" checked={sharing.useShared} onChange={(e) => updateSharing({ useShared: e.target.checked })} />
          <span>
            {tr("serversPage.useWhatFriendsShare")}
            <small className="muted ui2-help">{tr("serversPage.theirWhoSpendsTimeWith")}</small>
          </span>
        </label>
        <label className="check">
          <input id="ui2-uselogger" type="checkbox" checked={sharing.useLogger} onChange={(e) => updateSharing({ useLogger: e.target.checked })} />
          <span>
            {tr("serversPage.useMyServerS24")}
            <small className="muted ui2-help">{tr("serversPage.whereYourFriendsHungOut")}</small>
          </span>
        </label>
      </section>

      <section>
        <button className="btn link small" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}>
          <Icon name={advanced ? "chevron-up" : "chevron-down"} size={14} /> {tr("serversPage.advancedYourKeyAndFriends")}
        </button>
        {advanced && (
          <div className="ui2-advanced">
            <ChangedKeys />
            <KeySection me={me} setMe={setMe} />
          </div>
        )}
      </section>
    </div>
  );
}
