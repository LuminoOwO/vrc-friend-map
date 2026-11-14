import { getState, updateSettings, useApp } from "../store";

/** Settings → People → Age hints. */
export function AgeSection() {
  const a = useApp((s) => s.settings.age);
  const set = (patch: Partial<typeof a>) => updateSettings({ age: { ...getState().settings.age, ...patch } });
  return (
    <>
      <h3>Age hints</h3>
      <p className="small muted">
        For adults who'd rather not have minors on their friend list. A profile's “Age” part shows hints from what the person wrote (bio,
        pronouns, status, links), your own note, and notes friends shared. VRChat's 18+ badge isn't counted: verified accounts get sold.
      </p>
      <label className="check">
        <input type="checkbox" checked={a.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        Show age hints and notes on profiles
      </label>
      <label className="check">
        <input type="checkbox" checked={a.warnRequests} disabled={!a.enabled} onChange={(e) => set({ warnRequests: e.target.checked })} />
        Ask before I send or accept a friend request when there are concerns
      </label>
      <label className="check">
        <input type="checkbox" checked={a.readLinks} disabled={!a.enabled} onChange={(e) => set({ readLinks: e.target.checked })} />
        Also read the pages they link to (once, when I open their profile)
      </label>
      <p className="small muted">
        Linked pages: only that one page per link, nothing it links to; only public websites (never your own network). The site sees your IP
        address, like when you open it yourself.
      </p>
      <p className="small muted">
        Your notes and the hints stay on this device. Notes saying someone is under 18 are never shared, synced or exported, so this can't turn
        into a list of minors. Friends can only share “over 18”, “probably over 18” or a neutral “keep your distance”; no note means nothing.
      </p>
    </>
  );
}
