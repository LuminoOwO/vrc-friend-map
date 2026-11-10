// Friend group detection from game-log co-presence.
//
// 1. Every pair of friends gets a weight: hours spent in the same instance,
//    with big instances counting less (crowd weighting happens in Rust).
//    Pairs need a minimum amount of time on a minimum number of days, so a
//    single evening in a crowded public world doesn't make a "group".
// 2. Louvain community detection splits that weighted graph into groups that
//    are much more connected inside than to the outside.
// 3. Overlap: someone who spends nearly as much time with another group as
//    with their own is added to it too (circles can overlap).
// 4. Groups are compared with your circles: already covered ones are hidden,
//    close matches become "add these people", the rest are new suggestions.
import type { Circle, GroupSettings, PresenceStats } from "./types";

export interface GroupCandidate {
  key: string;
  /** Core members first, strongest ties first. */
  members: string[];
  /** Overlapping members whose main group is another one. */
  extra: string[];
  /** Median hours together per connected pair, and median days. */
  hours: number;
  days: number;
  /** Share of the members' time-together that stays inside the group (0–1). */
  cohesion: number;
  worlds: string[];
}

export interface Suggestion extends GroupCandidate {
  /** Existing circle this mostly matches, with the people it's missing. */
  match: { circleId: string; add: string[]; auto: boolean } | null;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Louvain modularity optimisation (Blondel et al. 2008) with a resolution
 * parameter. Nodes are visited in index order so results are stable.
 * Returns a community index per node.
 */
export function louvain(n: number, edges: [number, number, number][], resolution = 1): number[] {
  let adj: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  for (const [a, b, w] of edges) {
    if (a === b || w <= 0) continue;
    adj[a].set(b, (adj[a].get(b) ?? 0) + w);
    adj[b].set(a, (adj[b].get(a) ?? 0) + w);
  }
  let membership = Array.from({ length: n }, (_, i) => i);
  for (let level = 0; level < 12; level++) {
    const size = adj.length;
    const k = adj.map((m) => {
      let s = 0;
      for (const w of m.values()) s += w;
      return s;
    });
    const m2 = k.reduce((a, b) => a + b, 0);
    if (m2 <= 0) break;
    const comm = Array.from({ length: size }, (_, i) => i);
    const tot = [...k];
    let moved = false;
    for (let pass = 0; pass < 50; pass++) {
      let changed = false;
      for (let i = 0; i < size; i++) {
        const ci = comm[i];
        tot[ci] -= k[i];
        const links = new Map<number, number>();
        for (const [j, w] of adj[i]) {
          if (j === i) continue;
          links.set(comm[j], (links.get(comm[j]) ?? 0) + w);
        }
        let best = ci;
        let bestGain = (links.get(ci) ?? 0) - (resolution * tot[ci] * k[i]) / m2;
        for (const [c, w] of links) {
          const gain = w - (resolution * tot[c] * k[i]) / m2;
          if (gain > bestGain + 1e-12) {
            bestGain = gain;
            best = c;
          }
        }
        comm[i] = best;
        tot[best] += k[i];
        if (best !== ci) changed = moved = true;
      }
      if (!changed) break;
    }
    if (!moved) break;
    // Renumber and collapse communities into single nodes.
    const ids = new Map<number, number>();
    for (const c of comm) if (!ids.has(c)) ids.set(c, ids.size);
    const next: Map<number, number>[] = Array.from({ length: ids.size }, () => new Map());
    for (let i = 0; i < size; i++) {
      const ci = ids.get(comm[i])!;
      for (const [j, w] of adj[i]) {
        const cj = ids.get(comm[j])!;
        next[ci].set(cj, (next[ci].get(cj) ?? 0) + w);
      }
    }
    membership = membership.map((c) => ids.get(comm[c])!);
    adj = next;
  }
  return membership;
}

export function detectGroups(
  stats: PresenceStats,
  friendIds: Set<string>,
  mutualPairs: Set<string>,
  g: GroupSettings,
): GroupCandidate[] {
  const pairs = stats.pairs.filter(
    (p) => friendIds.has(p.a) && friendIds.has(p.b) && p.secs >= g.minMinutes * 60 && p.days >= g.minDays,
  );
  if (!pairs.length) return [];
  const ids = [...new Set(pairs.flatMap((p) => [p.a, p.b]))].sort();
  const index = new Map(ids.map((id, i) => [id, i]));
  const weight = new Map<string, number>();
  const pairInfo = new Map<string, { secs: number; days: number }>();
  const edges: [number, number, number][] = [];
  for (const p of pairs) {
    const boost = g.mutualBoost && mutualPairs.has(pairKey(p.a, p.b)) ? 1.5 : 1;
    const w = (p.weighted / 3600) * boost;
    weight.set(pairKey(p.a, p.b), w);
    pairInfo.set(pairKey(p.a, p.b), { secs: p.secs, days: p.days });
    edges.push([index.get(p.a)!, index.get(p.b)!, w]);
  }
  const comm = louvain(ids.length, edges, g.resolution);
  const groups = new Map<number, string[]>();
  ids.forEach((id, i) => {
    if (!groups.has(comm[i])) groups.set(comm[i], []);
    groups.get(comm[i])!.push(id);
  });

  const neighbors = new Map<string, Map<string, number>>();
  for (const p of pairs) {
    const w = weight.get(pairKey(p.a, p.b))!;
    if (!neighbors.has(p.a)) neighbors.set(p.a, new Map());
    if (!neighbors.has(p.b)) neighbors.set(p.b, new Map());
    neighbors.get(p.a)!.set(p.b, w);
    neighbors.get(p.b)!.set(p.a, w);
  }
  const strengthTo = (v: string, members: Iterable<string>) => {
    let s = 0;
    let links = 0;
    const nb = neighbors.get(v);
    if (!nb) return { s, links };
    for (const u of members) {
      if (u === v) continue;
      const w = nb.get(u);
      if (w) {
        s += w;
        links++;
      }
    }
    return { s, links };
  };

  // Louvain puts everyone somewhere, so someone with a single short overlap
  // gets absorbed into a group. Keep only members who are clearly part of it:
  // linked to at least two members (or all, in tiny groups) and with ties
  // worth at least 15% of a typical member's.
  const core: string[][] = [];
  for (const members of groups.values()) {
    let kept = members;
    for (let round = 0; round < 2; round++) {
      const st = kept.map((v) => ({ v, ...strengthTo(v, kept) }));
      const med = median(st.map((x) => x.s));
      kept = st.filter((x) => x.links >= Math.min(2, kept.length - 1) && x.s >= 0.15 * med).map((x) => x.v);
    }
    if (kept.length >= g.minSize) core.push(kept);
  }
  const worldsOf = new Map(stats.people.map((p) => [p.id, p.worlds]));
  const out: GroupCandidate[] = core.map((members) => {
    const set = new Set(members);
    const extra: string[] = [];
    if (g.overlap) {
      for (const v of ids) {
        if (set.has(v)) continue;
        const own = core.find((m) => m.includes(v)) ?? groups.get(comm[index.get(v)!])!;
        const inOwn = strengthTo(v, own).s;
        const { s, links } = strengthTo(v, members);
        const needLinks = Math.min(members.length, Math.max(2, Math.ceil(members.length * 0.4)));
        if (links >= needLinks && s >= 0.6 * inOwn) extra.push(v);
      }
    }
    const strength = new Map(members.map((v) => [v, strengthTo(v, members).s]));
    members.sort((a, b) => strength.get(b)! - strength.get(a)!);
    let inside = 0;
    let total = 0;
    const hours: number[] = [];
    const days: number[] = [];
    for (const v of members) {
      for (const [u, w] of neighbors.get(v) ?? []) {
        total += w;
        if (set.has(u)) {
          inside += w;
          if (v < u) {
            const info = pairInfo.get(pairKey(v, u))!;
            hours.push(info.secs / 3600);
            days.push(info.days);
          }
        }
      }
    }
    const worldTime = new Map<string, number>();
    for (const v of members) for (const [w, secs] of worldsOf.get(v) ?? []) worldTime.set(w, (worldTime.get(w) ?? 0) + secs);
    const worlds = [...worldTime.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w]) => w);
    const all = [...members, ...extra];
    return {
      key: [...all].sort().join(","),
      members,
      extra,
      hours: median(hours),
      days: median(days),
      cohesion: total > 0 ? inside / total : 0,
      worlds,
    };
  });
  return out.sort((a, b) => b.members.length * b.hours - a.members.length * a.hours);
}

export function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union ? inter / union : 0;
}

/** Drop suggestions you already have or dismissed; link close ones to a circle. */
export function toSuggestions(groups: GroupCandidate[], circles: Circle[], dismissed: string[][]): Suggestion[] {
  const out: Suggestion[] = [];
  for (const g of groups) {
    const all = [...g.members, ...g.extra];
    if (dismissed.some((d) => jaccard(d, all) >= 0.7)) continue;
    let best: Circle | null = null;
    let bestJ = 0;
    for (const c of circles) {
      const j = jaccard(c.members, all);
      if (j > bestJ) {
        bestJ = j;
        best = c;
      }
    }
    if (best && bestJ >= 0.5) {
      const add = all.filter((id) => !best!.members.includes(id));
      if (!add.length) continue; // already covered by that circle
      out.push({ ...g, match: { circleId: best.id, add, auto: !!best.auto } });
    } else {
      out.push({ ...g, match: null });
    }
  }
  return out;
}

export function suggestionName(s: GroupCandidate, nameOf: (id: string) => string): string {
  const names = s.members.slice(0, 2).map(nameOf);
  const rest = s.members.length + s.extra.length - names.length;
  return rest > 0 ? `${names.join(", ")} & ${rest} more` : names.join(" & ");
}
