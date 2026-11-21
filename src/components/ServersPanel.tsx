// Servers on the Shared lists tab: what they're for, the ones you use, and
// adding one, without digging through Settings.
import { t as tr } from "../i18n";
import { useState } from "react";
import { backend } from "../backend";
import { addServerFromInput, mismatchOf, serverName, serverSwitch, syncAllServers } from "../share";
import { useApp } from "../store";
import { Icon } from "./Icon";
import { ago, openServers, POLICY_LABEL } from "./ServersModal";

const TUTORIAL = "https://github.com/LuminoOwO/vrc-friend-map/blob/main/docs/server-setup.md";

export function ServersPanel() {
  const servers = useApp((s) => s.settings.sharing.servers);
  const shared = useApp((s) => s.shared);
  const demo = useApp((s) => s.demo);
  const busy = useApp((s) => s.shareBusy);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [about, setAbout] = useState(servers.length === 0);
  const people = new Set(Object.values(shared?.items ?? {}).map((i) => i.owner)).size;

  const add = async () => {
    setAdding(true);
    setError("");
    try {
      await addServerFromInput(url);
      setUrl("");
      openServers(); // joining (invite code, sharing choices) happens there
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="panel servers-panel">
      <div className="section-head">
        <h2>
          <Icon name="server" size={18} /> {tr("serversPanel.shareAutomaticallyThroughServers")}
        </h2>
        <button className="btn link small" onClick={() => setAbout(!about)}>
          {about ? "Less" : tr("serversPanel.whatSThis")}
        </button>
      </div>

      {about && (
        <div className="servers-about">
          <p>
            Instead of sending lists back and forth, you and your friends can share through a <b>vfm-server</b>: a small program on a
            device that's on anyway (a Raspberry Pi, an old PC, a NAS, Docker, even an old Android phone), yours or a friend's.
          </p>
          <ul>
            <li>
              <b>{tr("serversPanel.exchange")}</b> friend lists and "who spends time with whom" go to the friends you pick and update by themselves. You see
              connections VRChat hides, and everyone's group suggestions get better.
            </li>
            <li>
              <b>{tr("serversPanel.logger")}</b> a server you run can follow your friends' locations around the clock, so time together keeps counting while
              your PC is off.
            </li>
            <li>
              <b>{tr("serversPanel.private")}</b> uploads are end-to-end encrypted for the friends you choose; the server only stores what it can't read. Use as
              many servers as you like.
            </li>
          </ul>
          <button className="btn small" onClick={() => backend.openUrl(TUTORIAL).catch(() => {})}>
            <Icon name="external" size={14} /> {tr("serversPanel.stepByStepSetupGuide")}
          </button>
        </div>
      )}

      {servers.length > 0 && (
        <ul className="server-list">
          {servers.map((s) => {
            const sw = serverSwitch(s);
            const state = !s.registered ? tr("serversPanel.notJoinedYet") : s.upload ? `Sharing${sw.on ? ", encrypted" : ", not encrypted"}` : tr("serversPanel.joinedNotSharing");
            return (
              <li key={s.id}>
                <button className="server-row" onClick={openServers} title={tr("serversPanel.manageThisServer")}>
                  <span className={`server-state ${s.lastError || s.loggerExpired || mismatchOf(s) ? "bad" : s.registered ? "ok" : ""}`} />
                  <span className="server-text">
                    <b>{serverName(s)}</b>
                    <span className="small muted">
                      {state}
                      {s.info?.encryption ? ` · ${POLICY_LABEL[s.info.encryption]}` : ""}
                      {s.loggerOwner ? (s.loggerExpired ? tr("serversPanel.serverLoginExpired") : tr("serversPanel.loggerPaired")) : ""} · last sync {ago(s.lastSync)}
                    </span>
                    {mismatchOf(s) && <span className="small error-text">{mismatchOf(s)!.text}</span>}
                    {s.lastError && <span className="small error-text">{s.lastError}</span>}
                  </span>
                  <Icon name="chevron-right" size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="row servers-add">
        <input
          className="grow"
          value={url}
          placeholder={tr("serversPanel.serverAddressEG192")}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && url.trim() && add()}
          disabled={demo}
        />
        <button className="btn primary" onClick={add} disabled={!url.trim() || adding || demo}>
          <Icon name="plus" size={16} /> {adding ? tr("serversPanel.checking") : tr("serversPanel.addServer")}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {demo && <p className="small muted">{tr("serversPanel.serversArenTAvailableIn")}</p>}

      <div className="row servers-foot">
        <span className="small muted grow">
          {servers.length ? (people ? tr("serversPanel.peopleValueWithYou", { count: people }) : tr("serversPanel.nobodySharesWithYouYet")) : tr("serversPanel.noServersYet")}
        </span>
        {servers.length > 0 && (
          <button className="btn small" disabled={busy || demo} onClick={() => syncAllServers({ manual: true })}>
            <Icon name="refresh" size={14} /> {busy ? tr("serversPanel.syncing") : tr("serversPanel.syncNow")}
          </button>
        )}
        <button className="btn small" onClick={openServers}>
          <Icon name="settings" size={14} /> {servers.length ? tr("serversPanel.manageServers") : tr("serversPanel.serverSettings")}
        </button>
      </div>
    </section>
  );
}
