import { useMemo } from "react";
import { matchesFilters, mutualEdges, type MatchContext } from "./model";
import { useApp } from "./store";
import type { Cache, Friend, ImportedList } from "./types";

/** IDs from an imported list that we can resolve to our own friends. */
export function listMemberIds(list: ImportedList, cache: Cache): string[] {
  if (list.mode === "full") return (list.friends ?? []).map((f) => f.id).filter((id) => cache.friends[id]);
  return (list.resolved ?? []).filter((id) => cache.friends[id]);
}

export interface Derived {
  friends: Friend[];
  /** Stable key for the set of friend IDs (changes only when people are added/removed). */
  idsKey: string;
  matched: Set<string>;
  edges: [string, string][];
  degree: Map<string, number>;
  ctx: MatchContext;
  circleCount: Map<string, number>;
}

export function useDerived(): Derived {
  const cache = useApp((s) => s.cache);
  const local = useApp((s) => s.local);
  const baseFilters = useApp((s) => s.filters);
  const preview = useApp((s) => s.previewFilters);
  const filters = useMemo(() => (preview ? { ...baseFilters, ...preview } : baseFilters), [baseFilters, preview]);

  const friends = useMemo(() => Object.values(cache.friends), [cache.friends]);
  const idsKey = useMemo(() => friends.map((f) => f.id).sort().join("|"), [friends]);

  const { edges, degree } = useMemo(() => {
    const friendSet = new Set(Object.keys(cache.friends));
    const edges = mutualEdges(friendSet, cache.mutuals);
    // Friend lists your friends shared (file or server) fill in mutuals that
    // VRChat doesn't show (hidden mutuals, not fetched yet).
    const seen = new Set(edges.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
    for (const list of local.imports) {
      const owner = list.owner.id;
      if (!owner || list.mode !== "full" || !friendSet.has(owner)) continue;
      for (const f of list.friends ?? []) {
        if (f.id === owner || !friendSet.has(f.id)) continue;
        const k = owner < f.id ? `${owner}|${f.id}` : `${f.id}|${owner}`;
        if (seen.has(k)) continue;
        seen.add(k);
        edges.push(owner < f.id ? [owner, f.id] : [f.id, owner]);
      }
    }
    const degree = new Map<string, number>();
    for (const [a, b] of edges) {
      degree.set(a, (degree.get(a) ?? 0) + 1);
      degree.set(b, (degree.get(b) ?? 0) + 1);
    }
    return { edges, degree };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, cache.mutuals, local.imports]);

  const circleCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of local.circles) for (const id of c.members) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [local.circles]);

  const { matched, ctx } = useMemo(() => {
    const circle = filters.circleId ? local.circles.find((c) => c.id === filters.circleId) : null;
    const list = filters.listId ? local.imports.find((l) => l.id === filters.listId) : null;
    const ctx: MatchContext = {
      presence: cache.presence,
      details: cache.details,
      favorites: cache.favorites,
      circleMembers: circle ? new Set(circle.members) : null,
      listMembers: list ? new Set(listMemberIds(list, cache)) : null,
      now: Date.now(),
    };
    const matched = new Set(friends.filter((f) => matchesFilters(f, filters, ctx)).map((f) => f.id));
    return { matched, ctx };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friends, cache.presence, cache.details, cache.favorites, local.circles, local.imports, filters]);

  return { friends, idsKey, matched, edges, degree, ctx, circleCount };
}
