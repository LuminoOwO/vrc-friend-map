import { t as tr } from "../i18n";
import { getState, updateSettings, useApp } from "../store";

/** Settings → People → Age hints. */
export function AgeSection() {
  const a = useApp((s) => s.settings.age);
  const set = (patch: Partial<typeof a>) => updateSettings({ age: { ...getState().settings.age, ...patch } });
  return (
    <>
      <h3>{tr("ageSettings.ageHints")}</h3>
      <p className="small muted">
        {tr("ageSettings.forAdultsWhoDRather")}
      </p>
      <label className="check">
        <input type="checkbox" checked={a.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        {tr("ageSettings.showAgeHintsAndNotes")}
      </label>
      <label className="check">
        <input type="checkbox" checked={a.warnRequests} disabled={!a.enabled} onChange={(e) => set({ warnRequests: e.target.checked })} />
        {tr("ageSettings.askBeforeISendOr")}
      </label>
      <label className="check">
        <input type="checkbox" checked={a.readLinks} disabled={!a.enabled} onChange={(e) => set({ readLinks: e.target.checked })} />
        {tr("ageSettings.alsoReadThePagesThey")}
      </label>
      {a.readLinks && a.enabled && (
        <div className="indent">
          <div className="row">
            <label className="field narrow">
              <span>{tr("ageSettings.readDeeper")}</span>
              <select value={a.linkDepth} onChange={(e) => set({ linkDepth: Number(e.target.value) })}>
                <option value={0}>{tr("ageSettings.noOnlyTheLinksIn")}</option>
                <option value={1}>{tr("ageSettings.oneStepProfilesLinkedFrom")}</option>
                <option value={2}>{tr("ageSettings.twoSteps")}</option>
                <option value={3}>{tr("ageSettings.threeSteps")}</option>
              </select>
            </label>
            <label className="field narrow">
              <span>{tr("ageSettings.atMostPagesPerPerson")}</span>
              <input type="number" min={1} max={30} value={a.maxPages} onChange={(e) => set({ maxPages: Math.min(30, Math.max(1, Number(e.target.value) || 10)) })} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={a.socials} onChange={(e) => set({ socials: e.target.checked })} />
            {tr("ageSettings.readSocialNetworkProfilesBluesky")}
          </label>
          <label className="check">
            <input type="checkbox" checked={a.fxTwitter} disabled={!a.socials} onChange={(e) => set({ fxTwitter: e.target.checked })} />
            {tr("ageSettings.xTwitterThroughFxtwitter")}
          </label>
          <p className="small muted">
            X shows profiles only to logged-in visitors, so the app asks fxtwitter.com (a free public service) for the bio; that sends them the
            handle. Deeper reading only follows links to profile sites the app knows (about 50: link pages like Linktree and Carrd, social
            networks, art sites).
          </p>
        </div>
      )}
      <p className="small muted">
        {tr("ageSettings.linkedPagesOnlyPublicWebsites")}
      </p>
      <p className="small muted">
        Your notes and the hints stay on this device. Notes saying someone is under 18 are never shared, synced or exported, so this can't turn
        into a list of minors. Friends can only share “over 18”, “probably over 18” or a neutral “keep your distance”; no note means nothing.
      </p>
    </>
  );
}
