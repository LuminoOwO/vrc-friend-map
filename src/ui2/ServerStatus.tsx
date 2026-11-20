// The servers at a glance (beta UI): one chip in the top bar, and a line on the phone's Me page.
// Green: every server you joined is connected live. Grey: connected, checked now and then.
// Amber: one isn't joined yet. Red: one can't be reached or its last sync failed.
import { useCallback, useEffect, useState } from "react";
import { isLive, onLiveChange, serverName } from "../share";
import { knownPeers, onPeers, type Peer } from "../peers";
import { useDismiss } from "./dismiss";
import { useApp } from "../store";
import { openServers } from "../components/ServersModal";
import { Icon } from "../components/Icon";
import { serverStatus } from "./ServersPage";

export function useServersSummary(): { tone: "ok" | "warn" | "bad" | ""; text: string } | null {
  const servers = useApp((s) => s.settings.sharing.servers);
  const [, tick] = useState(0);
  useEffect(() => onLiveChange(() => tick((n) => n + 1)), []);
  if (!servers.length) return null;
  const states = servers.map((s) => serverStatus(s, isLive(s.url)));
  const bad = states.filter((x) => x.tone === "bad").length;
  const warn = states.filter((x) => x.tone === "warn").length;
  const live = servers.filter((s) => s.registered && isLive(s.url)).length;
  const n = servers.length;
  if (bad) return { tone: "bad", text: n === 1 ? states[0].text : `${bad} of ${n} servers have a problem` };
  if (warn) return { tone: "warn", text: n === 1 ? states[0].text : `${warn} of ${n} servers not joined yet` };
  if (live === n) return { tone: "ok", text: n === 1 ? "Server live" : `${n} servers live` };
  return { tone: "", text: n === 1 ? "Server connected" : `${n} servers connected` };
}

export function ServerStatusChip() {
  const sum = useServersSummary();
  if (!sum) return null;
  return (
    <button className="ui2-srv" onClick={openServers} title={`${sum.text}. Open Sharing & servers`} aria-label={`Servers: ${sum.text}`}>
      <Icon name="server" size={14} />
      <span className={`ui2-srv-dot ${sum.tone}`} />
      <span className="ui2-srv-text">{sum.text}</span>
    </button>
  );
}

/** A device counts as online when it said hello in the last few minutes. */
const PEER_ONLINE_MS = 5 * 60_000;

/**
 * Top bar (computers): the status chip opens a dropdown with every server and its state, and
 * which of your devices are online right now and which server each one is connected through.
 */
export function ServerMenu() {
  const sum = useServersSummary();
  const servers = useApp((s) => s.settings.sharing.servers);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const [peers, setPeers] = useState<Peer[]>(() => knownPeers());
  useEffect(() => onPeers(() => setPeers(knownPeers())), []);
  if (!sum) return null;
  const now = Date.now();
  const online = peers.filter((p) => now - p.seen < PEER_ONLINE_MS);
  const nameOf = (url: string) => {
    const s = servers.find((x) => x.url === url);
    return s ? serverName(s) : url.replace(/^https?:\/\//, "");
  };
  const liveHere = servers.filter((s) => s.registered && isLive(s.url));
  return (
    <div className="ui2-drop-wrap" ref={ref}>
      <button className={`ui2-srv ${open ? "on" : ""}`} onClick={() => setOpen(!open)} title={sum.text} aria-label={`Servers: ${sum.text}`} aria-expanded={open}>
        <Icon name="server" size={14} />
        <span className={`ui2-srv-dot ${sum.tone}`} />
        <span className="ui2-srv-text">{sum.text}</span>
        <Icon name="chevron-down" size={12} />
      </button>
      {open && (
        <div className="ui2-drop" role="dialog" aria-label="Servers and devices">
          <div className="ui2-drop-head">
            <b>Servers</b>
          </div>
          <ul className="ui2-drop-rows">
            {servers.map((s) => {
              const st = serverStatus(s, isLive(s.url));
              return (
                <li key={s.id}>
                  <span className={`ui2-srv-dot ${st.tone}`} />
                  <span className="ui2-grow ui2-ellipsis">{serverName(s)}</span>
                  <span className="small muted">{st.text}</span>
                </li>
              );
            })}
          </ul>
          <div className="ui2-drop-head sub">
            <b>Your devices</b>
          </div>
          <ul className="ui2-drop-rows">
            <li>
              <Icon name="desktop" size={14} />
              <span className="ui2-grow">This device</span>
              <span className="small muted ui2-ellipsis">{liveHere.length ? liveHere.map(serverName).join(", ") : "not connected live"}</span>
            </li>
            {online.map((p) => (
              <li key={p.device}>
                <Icon name={/phone|android|ios|quest/i.test(p.name) ? "phone" : "desktop"} size={14} />
                <span className="ui2-grow ui2-ellipsis">{p.name}</span>
                <span className="small muted ui2-ellipsis">{p.direct ? "directly, at home" : nameOf(p.via)}</span>
              </li>
            ))}
            {online.length === 0 && <li className="small muted">No other device of yours is online right now.</li>}
          </ul>
          <button
            className="ui2-drop-foot"
            onClick={() => {
              close();
              openServers();
            }}
          >
            Sharing & servers
          </button>
        </div>
      )}
    </div>
  );
}
