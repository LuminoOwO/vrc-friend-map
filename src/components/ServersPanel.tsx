// Servers on the Shared lists tab: what they're for, the ones you use, and
// adding one, without digging through Settings.
import { useState } from "react";
import { backend } from "../backend";
import { addServer, serverName, serverSwitch, syncAllServers } from "../share";
import { setState, useApp } from "../store";
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
      await addServer(url);
      setUrl("");
      setState({ serversOpen: true }); // joining (invite code, sharing choices) happens there
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
          <Icon name="server" size={18} /> Share automatically through servers
        </h2>
        <button className="btn link small" onClick={() => setAbout(!about)}>
          {about ? "Less" : "What's this?"}
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
              <b>Exchange:</b> friend lists and "who spends time with whom" go to the friends you pick and update by themselves. You see
              connections VRChat hides, and everyone's group suggestions get better.
            </li>
            <li>
              <b>Logger:</b> a server you run can follow your friends' locations around the clock, so time together keeps counting while
              your PC is off.
            </li>
            <li>
              <b>Private:</b> uploads are end-to-end encrypted for the friends you choose; the server only stores what it can't read. Use as
              many servers as you like.
            </li>
          </ul>
          <button className="btn small" onClick={() => backend.openUrl(TUTORIAL).catch(() => {})}>
            <Icon name="external" size={14} /> Step-by-step setup guide
          </button>
        </div>
      )}

      {servers.length > 0 && (
        <ul className="server-list">
          {servers.map((s) => {
            const sw = serverSwitch(s);
            const state = !s.registered ? "Not joined yet" : s.upload ? `Sharing${sw.on ? ", encrypted" : ", not encrypted"}` : "Joined, not sharing";
            return (
              <li key={s.id}>
                <button className="server-row" onClick={openServers} title="Manage this server">
                  <span className={`server-state ${s.lastError ? "bad" : s.registered ? "ok" : ""}`} />
                  <span className="server-text">
                    <b>{serverName(s)}</b>
                    <span className="small muted">
                      {state}
                      {s.info?.encryption ? ` · ${POLICY_LABEL[s.info.encryption]}` : ""}
                      {s.loggerOwner ? " · logger paired" : ""} · last sync {ago(s.lastSync)}
                    </span>
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
          placeholder="Server address, e.g. 192.168.1.20:8787 or vfm.example.com"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && url.trim() && add()}
          disabled={demo}
        />
        <button className="btn primary" onClick={add} disabled={!url.trim() || adding || demo}>
          <Icon name="plus" size={16} /> {adding ? "Checking…" : "Add server"}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      {demo && <p className="small muted">Servers aren't available in demo mode.</p>}

      <div className="row servers-foot">
        <span className="small muted grow">
          {servers.length ? (people ? `${people} ${people === 1 ? "person shares" : "people share"} with you.` : "Nobody shares with you yet.") : "No servers yet."}
        </span>
        {servers.length > 0 && (
          <button className="btn small" disabled={busy || demo} onClick={() => syncAllServers({ manual: true })}>
            <Icon name="refresh" size={14} /> {busy ? "Syncing…" : "Sync now"}
          </button>
        )}
        <button className="btn small" onClick={openServers}>
          <Icon name="settings" size={14} /> {servers.length ? "Manage servers" : "Server settings"}
        </button>
      </div>
    </section>
  );
}
