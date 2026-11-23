// Friend lists shared with you, shown on your own map at the same time: each list gets a colour,
// and everyone on it gets a small dot in that colour next to their picture. Optionally the
// people on a full list you don't know are added to the map too (next to the list's owner).
import { useMemo } from "react";
import { listMemberIds } from "./derived";
import { setState, useApp } from "./store";
import type { Cache, ImportedList } from "./types";

/** Colours for lists on the map (not the status colours). */
export const LIST_COLORS = ["#f59e0b", "#a78bfa", "#f472b6", "#38bdf8", "#a3e635", "#fb923c"];
/** At most this many of a list's friends you don't know are added to the map. */
export const STRANGERS_PER_LIST = 150;

/** Everyone on a list: friends of yours you can match, plus (full lists) everyone else on it. */
export function listAllIds(list: ImportedList, cache: Cache): string[] {
  const known = listMemberIds(list, cache);
  if (list.mode !== "full") return known;
  return [...new Set([...known, ...(list.friends ?? []).map((f) => f.id)])];
}

export interface OverlayList {
  list: ImportedList;
  color: string;
}

/** The lists shown on the map and, per person, the colours of the lists they're on. */
export function useListOverlay(): { lists: OverlayList[]; dots: Map<string, string[]> } {
  const ids = useApp((s) => s.mapLists);
  const imports = useApp((s) => s.local.imports);
  const cache = useApp((s) => s.cache);
  return useMemo(() => {
    const lists = ids
      .map((id) => imports.find((l) => l.id === id))
      .filter((l): l is ImportedList => !!l)
      .map((list, i) => ({ list, color: LIST_COLORS[i % LIST_COLORS.length] }));
    const dots = new Map<string, string[]>();
    for (const { list, color } of lists) {
      for (const id of listAllIds(list, cache)) {
        const d = dots.get(id) ?? [];
        d.push(color);
        dots.set(id, d);
      }
      // The owner wears their own colour too.
      if (list.owner.id) dots.set(list.owner.id, [...(dots.get(list.owner.id) ?? []), color]);
    }
    return { lists, dots };
  }, [ids, imports, cache]);
}

export function toggleMapList(id: string, on?: boolean) {
  setState((s) => {
    const has = s.mapLists.includes(id);
    const want = on ?? !has;
    if (want === has) return {};
    return { mapLists: want ? [...s.mapLists, id] : s.mapLists.filter((x) => x !== id) };
  });
}
