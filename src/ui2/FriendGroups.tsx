// Friend groups on your map, found from who is friends with whom. On computers they open in the
// side panel (for a while, instead of where you are, Online now, Activity): pointing at a group
// lights it up on the map, clicking keeps it lit. On phones the same list sits in Insights and
// "Show on the map" switches to the map with the group lit. A lit group can be turned off with
// the chip on the map.
import { t as tr, useT } from "../i18n";
import { useMemo, useState } from "react";
import { bridges, clusters, friendGraph } from "../insights";
import { shownName } from "../personal";
import { createCircle, setState, useApp } from "../store";
import { imgSrc } from "../backend";
import { iconUrl } from "../model";
import { Icon } from "../components/Icon";
import { Range } from "../components/Range";

/** Show these people on the map (everyone else dimmed); `label` keeps it until turned off. */
export function lightUp(ids: string[] | null, label: string | null = null) {
  setState({ spotlight: ids, spotlightLabel: ids ? label : null });
}

function useGroups(resolution: number) {
  const friends = useApp((s) => s.cache.friends);
  const mutuals = useApp((s) => s.cache.mutuals);
  const g = useMemo(() => friendGraph({ friends, mutuals }), [friends, mutuals]);
  const groups = useMemo(() => clusters(g, resolution, 3), [g, resolution]);
  const br = useMemo(() => bridges(g, groups).slice(0, 8), [g, groups]);
  return { groups, br };
}

function Faces({ ids, max = 9 }: { ids: string[]; max?: number }) {
  const people = useApp((s) => s.cache.friends);
  return (
    <span className="fg-faces">
      {ids.slice(0, max).map((id) => {
        const f = people[id];
        const src = f ? imgSrc(iconUrl(f)) : undefined;
        return (
          <span key={id} className="fg-face" title={shownName(id, id)}>
            {src ? <img src={src} alt="" loading="lazy" /> : shownName(id, "?").slice(0, 1)}
          </span>
        );
      })}
      {ids.length > max && <span className="small muted">+{ids.length - max}</span>}
    </span>
  );
}

/** The list of groups: point to light one up, click to keep it lit. */
export function FriendGroupsList({ phone = false }: { phone?: boolean }) {
  const t = useT();
  const [resolution, setResolution] = useState(1);
  const { groups, br } = useGroups(resolution);
  const circles = useApp((s) => s.local.circles);
  const pinned = useApp((s) => s.spotlightLabel);
  const [open, setOpen] = useState<number | null>(null);
  const label = (i: number) => t("insights.groupValueLengthPeople", { value: i + 1, length: groups[i].length });
  const covered = (m: string[]) => circles.find((c) => m.filter((x) => c.members.includes(x)).length >= m.length * 0.7);
  if (!groups.length) return <p className="small muted">{t("fgroups.none")}</p>;
  return (
    <div className="fg">
      <label className="fg-size" title={t("insights.howBigTheGroupsAre")}>
        <span className="small muted">{t("insights.bigger")}</span>
        <Range min={0.5} max={2} step={0.1} value={resolution} onChange={(e) => setResolution(Number(e.target.value))} aria-label={t("insights.groupSize")} />
        <span className="small muted">{t("insights.smaller")}</span>
        <output className="fg-count">{t("fgroups.count", { count: groups.length })}</output>
      </label>
      <ul className="fg-list" onMouseLeave={() => !phone && !pinned && lightUp(null)}>
        {groups.map((m, i) => {
          const c = covered(m);
          const on = pinned === label(i);
          return (
            <li key={i} className={`fg-item ${on ? "on" : ""}`} onMouseEnter={() => !phone && !pinned && lightUp(m)}>
              <button
                className="fg-main"
                aria-pressed={on}
                onClick={() => {
                  if (on) lightUp(null);
                  else {
                    lightUp(m, label(i));
                    if (phone) setState({ view: "graph" });
                  }
                  setOpen(open === i ? null : i);
                }}
              >
                <span className="fg-head">
                  <b>{label(i)}</b>
                  {c && <span className="small muted">{t("insights.mostlyYourCircleName", { name: c.name })}</span>}
                </span>
                <Faces ids={m} />
              </button>
              {open === i && (
                <div className="fg-actions">
                  {!c && (
                    <button
                      className="btn small"
                      onClick={() => {
                        const name = window.prompt(t("insights.nameForTheNewCircle"), `${shownName(m[0])}'s group`);
                        if (name) createCircle(name, m);
                      }}
                    >
                      <Icon name="plus" size={14} /> {t("insights.makeACircle")}
                    </button>
                  )}
                  <span className="small muted fg-names">{m.map((id) => shownName(id, id)).join(", ")}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {br.length > 0 && (
        <details className="fg-bridges">
          <summary className="small">{t("insights.bridges")}</summary>
          <p className="small muted">{t("insights.peopleWhoConnectTwoOr")}</p>
          <ul>
            {br.map((b) => (
              <li key={b.id}>
                <button className="link-btn" onClick={() => setState({ selectedId: b.id })} onMouseEnter={() => !phone && !pinned && lightUp([b.id, ...b.groups.flatMap((x) => groups[x.index] ?? [])])}>
                  {shownName(b.id, b.id)}
                </button>{" "}
                <span className="small muted">{t("fgroups.connects", { groups: b.groups.map((x) => x.index + 1).join(", ") })}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Computers: the side panel's temporary "Friend groups" page. */
export function FriendGroupsPanel() {
  const t = useT();
  const close = () => {
    lightUp(null);
    setState({ sidePanel: null });
  };
  return (
    <section className="fg-panel" aria-label={t("fgroups.title")}>
      <div className="fg-panel-head">
        <button className="icon-btn small" aria-label={t("common.back")} title={t("common.back")} onClick={close}>
          <Icon name="chevron-left" size={16} />
        </button>
        <h2>{t("fgroups.title")}</h2>
      </div>
      <p className="small muted">{t("fgroups.help")}</p>
      <FriendGroupsList />
    </section>
  );
}

/** Opens the groups (side panel on computers). */
export function openFriendGroups() {
  setState({ sidePanel: "groups", view: "graph", settingsOpen: false });
}

/** On the map while a group is kept lit: what's lit, and a way to turn it off. */
export function SpotlightChip() {
  const label = useApp((s) => s.spotlightLabel);
  if (!label) return null;
  return (
    <div className="spot-chip" role="status">
      <Icon name="users" size={14} />
      <span>{tr("fgroups.showing", { name: label })}</span>
      <button aria-label={tr("common.close")} onClick={() => lightUp(null)}>
        <Icon name="close" size={13} />
      </button>
    </div>
  );
}
