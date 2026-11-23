// Ctrl+K: find anything. Friends (by name or your nickname), views, settings
// sections and actions, keyboard first.
import { t as tr, lazy } from "../i18n";
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

const VIEWS: [View, string, string][] = lazy(() => [
  ["graph", tr("palette.map"), "graph"],
  ["cards", tr("palette.people"), "users"],
  ["activity", tr("palette.activity"), "clock"],
  ["insights", tr("palette.insights"), "bulb"],
  ["logbook", tr("palette.logbook"), "calendar"],
  ["vrchat", tr("palette.groupsEvents"), "flag"],
  ["media", tr("palette.media"), "image"],
  ["times", tr("palette.times"), "chart"],
  ["lists", tr("palette.sharedLists"), "share"],
]);

const SETTINGS: [string, string][] = lazy(() => [
  ["interface", tr("palette.interfaceBetaUiTextSize")],
  ["display", tr("palette.themes")],
  ["mapdisplay", tr("palette.mapAndProfiles")],
  ["framerate", tr("palette.frameRate")],
  ["age", tr("palette.ageHintsAndLinkedPages")],
  ["blocked", tr("blocked.title")],
  ["redflags", tr("palette.redFlagsInVrchatNotes")],
  ["invites", tr("palette.inviteMessages")],
  ["bios", tr("palette.readingBiosInTheBackground")],
  ["notify", tr("palette.notificationsQuietHoursRulesPer")],
  ["phone", tr("palette.phoneInTheBackground")],
  ["logs", tr("palette.gameLogsAndPictureFolders")],
  ["nowplaying", tr("palette.nowPlayingInYourStatus")],
  ["playtime", tr("palette.steamPlayTimeInYour")],
  ["backup", tr("palette.backupToAnotherDevice")],
  ["groups", tr("palette.friendGroupDetection")],
  ["servers", tr("palette.serversAndSharing")],
  ["updates", tr("palette.updates")],
  ["data", tr("palette.localData")],
]);

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
      .map((f) => ({ id: f.id, label: nicknames[f.id] ? tr("palette.valueName", { value: nicknames[f.id], name: f.displayName }) : f.displayName, hint: tr("palette.friend"), icon: "user", run: () => setState({ selectedId: f.id }) }));
    out.push(...people);
    for (const [v, l, i] of VIEWS) if (match(l, "view")) out.push({ id: `view:${v}`, label: l, hint: tr("palette.view"), icon: i, run: () => setState({ view: v }) });
    for (const [id, l] of SETTINGS) if (match(l, "settings")) out.push({ id: `set:${id}`, label: l, hint: tr("palette.settings"), icon: "settings", run: () => setState({ settingsOpen: true, settingsTab: id }) });
    const actions: Item[] = [
      { id: "a:sync", label: tr("palette.syncWithVrchatNow"), hint: tr("palette.action"), icon: "refresh", run: () => void syncAll() },
      { id: "a:servers", label: tr("palette.syncWithMyServersNow"), hint: tr("palette.action"), icon: "server", run: () => void syncAllServers({ manual: true }) },
      { id: "a:mute", label: isMuted() ? tr("palette.unmuteNotifications") : tr("palette.muteNotificationsForAnHour"), hint: tr("palette.action"), icon: "bell-off", run: () => muteFor(isMuted() ? 0 : 3600e3) },
      { id: "a:classic", label: tr("palette.backToTheClassicUi"), hint: tr("palette.action"), icon: "eye", run: () => updateUi({ beta: false }) },
      { id: "a:me", label: tr("palette.myProfile"), hint: tr("palette.action"), icon: "user", run: () => getState().cache.me && setState({ selectedId: getState().cache.me!.id }) },
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
    <div
      className="modal-backdrop top ui2-palette-wrap"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      // Esc closes it wherever the focus is inside (not only in the search box).
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <div className="ui2-palette" role="dialog" aria-label={tr("palette.searchEverything")}>
        <div className="ui2-search">
          <Icon name="search" size={16} />
          <input
            autoFocus
            value={q}
            placeholder={tr("palette.friendsViewsSettingsActions")}
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
          {!items.length && <li className="muted small ui2-empty">{tr("palette.nothingFound")}</li>}
        </ul>
      </div>
    </div>
  );
}
