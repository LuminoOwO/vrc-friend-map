// Mixing your accounts' friend lists into one map. Pure functions (tested in
// __tests__/accounts.test.ts); src/accounts.ts and src/sync.ts use them.

import type { Cache, Friend, Presence } from "./types";

/** The main account in `friendOf` lists. */
export const MAIN = "main";

const rank: Record<Presence, number> = { online: 2, web: 1, offline: 0 };

/**
 * Everyone who is a friend of the main account or one of the shown extra
 * accounts. The main account's data wins for people both know; for the rest
 * the "most online" view any account has. `friendOf` lists who knows whom, for
 * everyone at least one extra account knows.
 */
export function mergeAccounts(
  mainFriends: Record<string, Friend>,
  mainPresence: Record<string, Presence>,
  alts: NonNullable<Cache["alts"]>,
  shown: string[],
  /** All your own account IDs (the main one too): never friends on the map. */
  yours: string[] = [],
): { friends: Record<string, Friend>; presence: Record<string, Presence>; friendOf: Record<string, string[]> } {
  const friends: Record<string, Friend> = {};
  const presence: Record<string, Presence> = {};
  const friendOf: Record<string, string[]> = {};
  for (const acc of shown) {
    const a = alts[acc];
    if (!a) continue;
    for (const [id, f] of Object.entries(a.friends)) {
      if (id === acc || shown.includes(id) || yours.includes(id)) continue; // your own accounts aren't friends on the map
      (friendOf[id] ??= mainFriends[id] ? [MAIN] : []).push(acc);
      if (mainFriends[id]) continue;
      const p = a.presence[id] ?? "offline";
      if (!friends[id] || rank[p] > rank[presence[id] ?? "offline"]) {
        friends[id] = f;
        presence[id] = p;
      }
    }
  }
  for (const [id, f] of Object.entries(mainFriends)) {
    friends[id] = f;
    presence[id] = mainPresence[id] ?? "offline";
  }
  return { friends, presence, friendOf };
}

/** Whether the main account is friends with `id`. */
export function isMainFriend(c: Pick<Cache, "friendOf" | "me">, id: string): boolean {
  const of = c.friendOf?.[id];
  return !of || of.includes(MAIN) || !!c.me?.friends.includes(id);
}

/** Which of your accounts are friends with `id` ("main" and/or account IDs). */
export function accountsOf(c: Pick<Cache, "friendOf" | "me" | "friends">, id: string): string[] {
  if (!c.friends[id]) return [];
  return c.friendOf?.[id] ?? [MAIN];
}

/** Friends of two or more of your accounts. */
export function isCrossover(c: Pick<Cache, "friendOf">, id: string): boolean {
  return (c.friendOf?.[id]?.length ?? 0) >= 2;
}

/** Re-mix the cache: the main account's friends (as they are) plus the shown extra accounts'. */
export function applyAlts(c: Cache, shown: string[], yours: string[] = []): Cache {
  const mainFriends: Record<string, Friend> = {};
  const mainPresence: Record<string, Presence> = {};
  for (const [id, f] of Object.entries(c.friends)) {
    if (!isMainFriend(c, id)) continue;
    mainFriends[id] = f;
    if (c.presence[id]) mainPresence[id] = c.presence[id];
  }
  if (!shown.length && !c.friendOf) return c;
  const r = mergeAccounts(mainFriends, mainPresence, c.alts ?? {}, shown, [...yours, ...(c.me ? [c.me.id] : [])]);
  return { ...c, friends: r.friends, presence: r.presence, friendOf: Object.keys(r.friendOf).length ? r.friendOf : undefined };
}

/** The account to ask VRChat about `id` as: the main one if it's their friend, else one that is. */
export function accountFor(c: Pick<Cache, "friendOf" | "me">, id: string): string | undefined {
  if (isMainFriend(c, id)) return undefined;
  return c.friendOf?.[id]?.find((a) => a !== MAIN);
}

/** The main account's friends: what sharing, the friend log and "since you were last here" are about. */
export function mainFriendIds(c: Pick<Cache, "friendOf" | "me" | "friends">): string[] {
  return Object.keys(c.friends).filter((id) => isMainFriend(c, id));
}

/** Mid-tone colors that read on light and dark maps, in a fixed order per account. */
export const ACCOUNT_COLORS = ["#2a78d6", "#d0672b", "#2b9d66", "#9b55d0", "#c49a1d", "#d04f87"];

/** The map mark color of one of your extra accounts (by its place in the list). */
export function accountColor(list: { id: string }[], id: string): string {
  const i = list.findIndex((a) => a.id === id);
  return ACCOUNT_COLORS[(i < 0 ? 0 : i) % ACCOUNT_COLORS.length];
}

/** The account filter: "main", an account ID, or "crossover" (friends of two or more of your accounts). */
export function matchesAccount(friendOf: Record<string, string[]> | undefined, id: string, want: string): boolean {
  const of = friendOf?.[id] ?? [MAIN];
  return want === "crossover" ? of.length >= 2 : of.includes(want);
}
