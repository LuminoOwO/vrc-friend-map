// Ctrl+K: find anything. Friends (by name or your nickname), views, settings
// sections and actions, keyboard first.
import { useMemo, useState } from "react";
import { isMuted, muteFor } from "../notifications";
import { getState, setState, updateUi, useApp, type View } from "../store";
import { syncAll } from "../sync";
import { syncAllServers } from "../share";
import { Icon } from "../components/Icon";

const NO_NICKS: Record<string, string> = {};

interface Item {
  id: string;
  label: string;
  hint: string;
  icon: string;
  run: () => void;
}

const VIEWS: [View, string, string][] = [
  ["graph", "Map", "graph"],
  ["cards", "People", "users"],
  ["activity", "Activity", "clock"],
  ["insights", "Insights", "bulb"],
  ["logbook", "Logbook", "calendar"],
  ["vrchat", "VRChat (groups, favorites, avatars…)", "world"],
  ["lists", "Shared lists", "share"],
];

const SETTINGS: [string, string][] = [
  ["interface", "Interface (beta UI, text size, haptics)"],
  ["display", "Themes"],
  ["mapdisplay", "Map and profiles"],
  ["framerate", "Frame rate"],
  ["age", "Age hints and linked pages"],
  ["redflags", "Red flags in VRChat notes"],
  ["invites", "Invite messages"],
  ["bios", "Reading bios in the background"],
  ["notify", "Notifications, quiet hours, rules per circle"],
  ["phone", "Phone in the background"],
  ["logs", "Game logs and picture folders"],
  ["nowplaying", "Now playing in your status"],
  ["playtime", "Steam play time in your bio"],
  ["backup", "Backup to another device"],
  ["groups", "Friend group detection"],
  ["servers", "Servers and sharing"],
  ["updates", "Updates"],
  ["data", "Local data"],
];

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const friends = useApp((s) => s.cache.friends);
  const nicknames = useApp((s) => s.local.nicknames ?? NO_NICKS);
  const items = useMemo<Item[]>(() => {
    const ql = q.trim().toLowerCase();
    const match = (t: string, hint = "") => !ql || t.toLowerCase().includes(ql) || hint.toLowerCase().startsWith(ql);
    const out: Item[] = [];
    const people = Object.values(friends)
      .filter((f) => ql && (match(f.displayName) || match(nicknames[f.id] ?? "")))
      .slice(0, 8)
      .map((f) => ({ id: f.id, label: nicknames[f.id] ? `${nicknames[f.id]} (${f.displayName})` : f.displayName, hint: "Friend", icon: "user", run: () => setState({ selectedId: f.id }) }));
    out.push(...people);
    for (const [v, l, i] of VIEWS) if (match(l, "view")) out.push({ id: `view:${v}`, label: l, hint: "View", icon: i, run: () => setState({ view: v }) });
    for (const [id, l] of SETTINGS) if (match(l, "settings")) out.push({ id: `set:${id}`, label: l, hint: "Settings", icon: "settings", run: () => setState({ settingsOpen: true, settingsTab: id }) });
    const actions: Item[] = [
      { id: "a:sync", label: "Sync with VRChat now", hint: "Action", icon: "refresh", run: () => void syncAll() },
      { id: "a:servers", label: "Sync with my servers now", hint: "Action", icon: "server", run: () => void syncAllServers({ manual: true }) },
      { id: "a:mute", label: isMuted() ? "Unmute notifications" : "Mute notifications for an hour", hint: "Action", icon: "bell-off", run: () => muteFor(isMuted() ? 0 : 3600e3) },
      { id: "a:classic", label: "Back to the classic UI", hint: "Action", icon: "eye", run: () => updateUi({ beta: false }) },
      { id: "a:me", label: "My profile", hint: "Action", icon: "user", run: () => getState().cache.me && setState({ selectedId: getState().cache.me!.id }) },
    ];
    out.push(...actions.filter((a) => match(a.label, "action")));
    return out.slice(0, 30);
  }, [q, friends, nicknames]);
  const run = (i: Item | undefined) => {
    if (!i) return;
    onClose();
    i.run();
  };
  return (
    <div className="modal-backdrop top ui2-palette-wrap" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ui2-palette" role="dialog" aria-label="Search everything">
        <div className="ui2-search">
          <Icon name="search" size={16} />
          <input
            autoFocus
            value={q}
            placeholder="Friends, views, settings, actions…"
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((x) => Math.min(items.length - 1, x + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((x) => Math.max(0, x - 1));
              } else if (e.key === "Enter") run(items[sel]);
            }}
          />
        </div>
        <ul className="ui2-palette-list" role="listbox">
          {items.map((i, n) => (
            <li key={i.id} role="option" aria-selected={n === sel}>
              <button className={n === sel ? "on" : ""} onMouseEnter={() => setSel(n)} onClick={() => run(i)}>
                <Icon name={i.icon} size={16} /> <span className="ui2-grow">{i.label}</span> <span className="muted small">{i.hint}</span>
              </button>
            </li>
          ))}
          {!items.length && <li className="muted small ui2-empty">Nothing found.</li>}
        </ul>
      </div>
    </div>
  );
}
