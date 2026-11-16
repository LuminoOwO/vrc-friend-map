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
        Also read the pages they link to
      </label>
      {a.readLinks && a.enabled && (
        <div className="indent">
          <div className="row">
            <label className="field narrow">
              <span>Read deeper</span>
              <select value={a.linkDepth} onChange={(e) => set({ linkDepth: Number(e.target.value) })}>
                <option value={0}>No: only the links in their bio</option>
                <option value={1}>One step: profiles linked from their link pages</option>
                <option value={2}>Two steps</option>
                <option value={3}>Three steps</option>
              </select>
            </label>
            <label className="field narrow">
              <span>At most pages per person</span>
              <input type="number" min={1} max={30} value={a.maxPages} onChange={(e) => set({ maxPages: Math.min(30, Math.max(1, Number(e.target.value) || 10)) })} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={a.socials} onChange={(e) => set({ socials: e.target.checked })} />
            Read social network profiles (Bluesky, Instagram, TikTok, Steam, Reddit, Mastodon…)
          </label>
          <label className="check">
            <input type="checkbox" checked={a.fxTwitter} disabled={!a.socials} onChange={(e) => set({ fxTwitter: e.target.checked })} />
            X / Twitter through FxTwitter
          </label>
          <p className="small muted">
            X shows profiles only to logged-in visitors, so the app asks fxtwitter.com (a free public service) for the bio; that sends them the
            handle. Deeper reading only follows links to profile sites the app knows (about 50: link pages like Linktree and Carrd, social
            networks, art sites).
          </p>
        </div>
      )}
      <p className="small muted">
        Linked pages: only public websites (never your own network), read once and kept for a week. Each site sees your IP address, like when
        you open it yourself. Also used for guessing friends' time zones.
      </p>
      <p className="small muted">
        Your notes and the hints stay on this device. Notes saying someone is under 18 are never shared, synced or exported, so this can't turn
        into a list of minors. Friends can only share “over 18”, “probably over 18” or a neutral “keep your distance”; no note means nothing.
      </p>
    </>
  );
}
