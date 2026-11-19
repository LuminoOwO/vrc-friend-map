// The servers at a glance (beta UI): one chip in the top bar, and a line on the phone's Me page.
// Green: every server you joined is connected live. Grey: connected, checked now and then.
// Amber: one isn't joined yet. Red: one can't be reached or its last sync failed.
import { useEffect, useState } from "react";
import { isLive, onLiveChange } from "../share";
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
