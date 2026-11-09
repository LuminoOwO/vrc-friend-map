// Demo data so the app can be tried without logging in. Everything here is
// made up: names, statuses and connections are generated.
import type { Cache, Circle, Friend, LocalData, MutualInfo, Presence, UserDetail, UserStatus } from "./types";

const PARTS_A = ["Neon", "Moss", "Pixel", "Lumi", "Nova", "Echo", "Frost", "Ember", "Velvet", "Static", "Orbit", "Maple", "Cobalt", "Sunny", "Hollow", "Quartz", "Drift", "Puddle", "Juniper", "Kestrel"];
const PARTS_B = ["Fox", "Moth", "Shark", "Protogen", "Raccoon", "Otter", "Cat", "Wolf", "Bun", "Dragon", "Crow", "Deer", "Axolotl", "Lynx", "Gecko", "Bat"];
const STATUS_TEXT = ["vibing", "in a movie world", "afk, brb", "hosting tonight", "don't ask me to dance", "sleepy", "drawing", "new avatar who dis", "", "", "learning shaders", "pls invite"];
const COMMUNITIES = [
  { name: "Club regulars", hue: 190, size: 22 },
  { name: "Movie night", hue: 320, size: 16 },
  { name: "Avatar creators", hue: 40, size: 18 },
  { name: "Late-night EU", hue: 260, size: 20 },
  { name: "Quest crew", hue: 130, size: 14 },
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function svgData(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function iconFor(name: string, hue: number) {
  const initials = name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  return svgData(
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="hsl(${hue},45%,32%)"/><circle cx="64" cy="54" r="26" fill="hsl(${hue},55%,62%)"/><rect x="26" y="88" width="76" height="50" rx="30" fill="hsl(${hue},55%,62%)"/><text x="64" y="62" font-family="sans-serif" font-size="22" font-weight="700" text-anchor="middle" fill="hsl(${hue},40%,18%)">${initials}</text></svg>`,
  );
}

function bannerFor(hue: number, r: () => number) {
  const h2 = (hue + 40 + Math.round(r() * 60)) % 360;
  const x = Math.round(r() * 300);
  return svgData(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160"><rect width="400" height="160" fill="hsl(${hue},40%,22%)"/><circle cx="${x}" cy="40" r="90" fill="hsl(${h2},50%,35%)"/><circle cx="${400 - x}" cy="150" r="70" fill="hsl(${hue},55%,45%)" opacity="0.7"/></svg>`,
  );
}

export function makeDemo(): { cache: Cache; local: LocalData } {
  const r = rng(42);
  const now = Date.now();
  const friends: Record<string, Friend> = {};
  const presence: Record<string, Presence> = {};
  const details: Record<string, UserDetail> = {};
  const community: Record<string, number> = {};
  const favorites: Record<string, string[]> = {};
  const used = new Set<string>();
  let n = 0;

  COMMUNITIES.forEach((c, ci) => {
    for (let i = 0; i < c.size; i++) {
      let name = "";
      do {
        name = `${PARTS_A[Math.floor(r() * PARTS_A.length)]}${PARTS_B[Math.floor(r() * PARTS_B.length)]}${r() < 0.3 ? Math.floor(r() * 99) : ""}`;
      } while (used.has(name));
      used.add(name);
      const id = `usr_demo-${(n++).toString().padStart(4, "0")}-${Math.floor(r() * 1e8).toString(16)}`;
      const roll = r();
      const p: Presence = roll < 0.28 ? "online" : roll < 0.34 ? "web" : "offline";
      const statuses: UserStatus[] = ["active", "join me", "ask me", "busy", "active", "join me"];
      const status: UserStatus = p === "offline" ? "offline" : statuses[Math.floor(r() * statuses.length)];
      const quest = ci === 4 ? r() < 0.8 : r() < 0.2;
      const lastSeenAgo = p === "offline" ? Math.pow(r(), 2.2) * 200 * 864e5 : 0;
      const loginAgo = p === "offline" ? lastSeenAgo + r() * 6 * 36e5 : r() * 5 * 36e5;
      const hue = (c.hue + Math.round(r() * 40) - 20 + 360) % 360;
      friends[id] = {
        id,
        displayName: name,
        status,
        statusDescription: STATUS_TEXT[Math.floor(r() * STATUS_TEXT.length)],
        location: p === "online" ? (r() < 0.5 ? "private" : "wrld_demo:1234") : "offline",
        platform: p === "online" ? (quest ? "android" : "standalonewindows") : p === "web" ? "web" : "offline",
        last_platform: quest ? "android" : "standalonewindows",
        last_login: new Date(now - loginAgo).toISOString(),
        last_activity: new Date(now - lastSeenAgo).toISOString(),
        iconUrl: iconFor(name, hue),
        bannerUrl: bannerFor(hue, r),
        developerType: "none",
      };
      presence[id] = p;
      const t = r();
      const tags =
        t < 0.04 ? [] : t < 0.12 ? ["system_trust_basic"] : t < 0.3 ? ["system_trust_basic", "system_trust_known"] : t < 0.55 ? ["system_trust_basic", "system_trust_known", "system_trust_trusted"] : ["system_trust_basic", "system_trust_known", "system_trust_trusted", "system_trust_veteran"];
      details[id] = {
        tags: r() < 0.25 ? [...tags, "system_supporter"] : tags,
        date_joined: new Date(now - (60 + r() * 2200) * 864e5).toISOString().slice(0, 10),
        pronouns: ["", "she/her", "he/him", "they/them", "any"][Math.floor(r() * 5)],
        fetchedAt: now,
      };
      community[id] = ci;
      if (r() < 0.12) favorites[id] = [r() < 0.5 ? "Besties" : "Group 2"];
    }
  });

  const ids = Object.keys(friends);
  const adj: Record<string, Set<string>> = Object.fromEntries(ids.map((id) => [id, new Set<string>()]));
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const same = community[a] === community[b];
      const neighbor = Math.abs(community[a] - community[b]) === 1;
      const p = same ? 0.32 : neighbor ? 0.025 : 0.008;
      if (r() < p) {
        adj[a].add(b);
        adj[b].add(a);
      }
    }
  }
  const mutuals: Record<string, MutualInfo> = {};
  for (const id of ids) {
    const hidden = r() < 0.05;
    const extra = Math.floor(r() * 4); // mutuals who aren't in this demo list
    mutuals[id] = hidden
      ? { ids: [], count: 0, hidden: true, fetchedAt: now }
      : { ids: [...adj[id]], count: adj[id].size + extra, hidden: false, fetchedAt: now };
  }

  const byCommunity = (ci: number) => ids.filter((id) => community[id] === ci);
  const circles: Circle[] = [
    { id: "demo-c1", name: "Friday club", color: "#2dd4bf", members: byCommunity(0).slice(0, 9) },
    { id: "demo-c2", name: "Movie buddies", color: "#f472b6", members: [...byCommunity(1).slice(0, 7), ...byCommunity(0).slice(6, 9)] },
  ];

  return {
    cache: {
      me: {
        id: "usr_demo-me",
        displayName: "You (demo)",
        friends: ids,
        onlineFriends: ids.filter((id) => presence[id] === "online"),
        activeFriends: ids.filter((id) => presence[id] === "web"),
        offlineFriends: ids.filter((id) => presence[id] === "offline"),
      },
      friends,
      presence,
      details,
      mutuals,
      favorites,
      lastFriendsSync: now,
    },
    local: {
      logSince: now - 20 * 864e5,
      lastFriendIds: ids,
      circles,
      imports: [],
      friendLog: [],
    },
  };
}
