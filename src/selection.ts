import { getState, updateSharing } from "./store";
import type { PeopleSelection } from "./types";

/** The friend IDs a selection stands for right now. */
export function selectedIds(sel: PeopleSelection): string[] {
  const st = getState();
  const friends = st.cache.friends;
  if (sel.who === "all") return Object.keys(friends);
  if (sel.who === "circles") {
    const ids = new Set<string>();
    for (const c of st.local.circles) if (sel.circleIds.includes(c.id)) for (const m of c.members) ids.add(m);
    return [...ids].filter((id) => friends[id]);
  }
  return sel.picked.filter((id) => friends[id]);
}

/** New friends join the hand-picked selections that ask for it (sharing). */
export function addNewFriendsToPicks(ids: string[]) {
  if (!ids.length) return;
  const st = getState();
  const add = (list: string[]) => [...new Set([...list, ...ids])];
  const sh = st.settings.sharing;
  const exportPick = sh.exportPick.who === "picked" && sh.exportPick.autoAdd ? { ...sh.exportPick, picked: add(sh.exportPick.picked) } : sh.exportPick;
  const servers = sh.servers.map((s) => ({
    ...s,
    include: s.include.who === "picked" && s.include.autoAdd ? { ...s.include, picked: add(s.include.picked) } : s.include,
    audiencePicked: s.audience === "picked" && s.audienceAutoAdd ? add(s.audiencePicked) : s.audiencePicked,
  }));
  updateSharing({ exportPick, servers });
}
