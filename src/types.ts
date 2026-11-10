export type UserStatus = "active" | "join me" | "ask me" | "busy" | "offline";

/** Friend as returned by GET /auth/user/friends (LimitedUserFriend). Older and
 *  newer VRChat image fields are both kept so either API shape works. */
export interface Friend {
  id: string;
  displayName: string;
  status: UserStatus;
  statusDescription: string;
  location: string;
  platform: string;
  last_platform: string;
  last_login: string | null;
  last_activity: string | null;
  last_mobile?: string | null;
  iconUrl?: string;
  bannerUrl?: string;
  bannerColor?: string;
  currentAvatarImageUrl?: string;
  currentAvatarThumbnailImageUrl?: string;
  profilePicOverride?: string;
  userIcon?: string;
  developerType?: string;
  tags?: string[];
}

export type Presence = "online" | "web" | "offline";

/** Extra profile data from GET /users/{id}. */
export interface UserDetail {
  tags: string[];
  date_joined?: string;
  pronouns?: string;
  bio?: string;
  note?: string;
  bioLinks?: string[];
  badges?: Badge[];
  fetchedAt: number;
}

export interface Badge {
  id: string;
  name: string;
  description?: string;
  imageUrl: string;
  showcased?: boolean;
}

/** One of a user's VRChat groups (GET /users/{id}/groups), loaded when you open their profile. */
export interface UserGroup {
  groupId: string;
  name: string;
  iconUrl?: string;
  memberCount?: number;
  isRepresenting?: boolean;
}

export interface UserGroups {
  list: UserGroup[];
  hidden: boolean;
  fetchedAt: number;
}

/** Mutual friends from GET /users/{id}/mutuals/friends. */
export interface MutualInfo {
  ids: string[];
  count: number;
  /** The person has hidden their mutual connections (or the API refused). */
  hidden: boolean;
  fetchedAt: number;
}

export interface Me {
  id: string;
  displayName: string;
  friends: string[];
  onlineFriends: string[];
  activeFriends: string[];
  offlineFriends: string[];
  iconUrl?: string;
}

export interface Circle {
  id: string;
  name: string;
  color: string;
  members: string[];
  hidden?: boolean;
  /** Created by group detection and still managed by it (until you edit it). */
  auto?: boolean;
}

export interface ImportedList {
  id: string;
  importedAt: number;
  owner: { id?: string; displayName: string };
  exportedAt?: string;
  mode: "full" | "hashed";
  friends?: { id: string; displayName: string }[];
  salt?: string;
  hashes?: string[];
  /** For hashed lists: which of the IDs we know match (computed on import). */
  resolved?: string[];
}

export interface FriendLogEntry {
  t: number;
  id: string;
  name: string;
  type: "added" | "removed";
}

export interface Cache {
  me: Me | null;
  friends: Record<string, Friend>;
  presence: Record<string, Presence>;
  details: Record<string, UserDetail>;
  mutuals: Record<string, MutualInfo>;
  /** userId -> favorite group display names */
  favorites: Record<string, string[]>;
  /** Loaded on demand when a profile is opened. */
  groups?: Record<string, UserGroups>;
  lastFriendsSync: number;
}

export interface LocalData {
  /** When the add/remove log started (first sync). */
  logSince: number;
  /** Friend IDs at the last sync, to spot adds and removals. */
  lastFriendIds: string[];
  circles: Circle[];
  imports: ImportedList[];
  friendLog: FriendLogEntry[];
  /** Suggested groups you dismissed (member IDs), so they don't come back. */
  dismissedGroups: string[][];
}

export type NodeStyle = "dot" | "icon" | "card" | "fullcard";
export type Gravity = "mutuals" | "loners" | "center" | "circles";

export interface SoundSettings {
  /** Play a sound when someone becomes your friend. */
  newFriend: boolean;
  sound: "chime" | "sparkle" | "pop" | "bell";
  /** 0 – 1 */
  volume: number;
}
export type LineMode = "shared" | "plain" | "together" | "none";

export interface MapSettings {
  /** How people are drawn: dot, round picture, compact card, full player card. */
  nodeStyle: NodeStyle;
  /** 0.6 – 2 */
  nodeScale: number;
  sizeBy: "mutuals" | "together" | "same";
  lines: LineMode;
  /** Multipliers, 0.3 – 3 */
  lineWidth: number;
  lineOpacity: number;
  /** Only draw lines for the person you hover or select. */
  focusLinesOnly: boolean;
  /** Layout spread, 0.6 – 2 */
  spacing: number;
  /** How strongly circle members are pulled together, 0 – 2 */
  groupPull: number;
  hulls: boolean;
  /** 0.3 – 2 */
  hullOpacity: number;
  showStars: boolean;
  /** Where people without lines drift, and what pulls the layout together. */
  gravity: Gravity;
  /** Slowly turn the whole map around its center (0 = off, 1 = slow … 3 = fast). */
  orbit: number;
  /** Show the full player card when pointing at someone. */
  hoverCard: boolean;
}

export interface LogSettings {
  /** Read VRChat's log files on this computer. */
  enabled: boolean;
  autoDetect: boolean;
  /** Extra folders added by hand. */
  dirs: string[];
  scanMinutes: number;
  /** 0 = keep forever */
  retentionDays: number;
}

export interface GroupSettings {
  /** How much time in big instances counts: strong = 1/n, mild = 1/√n. */
  crowd: "strong" | "mild" | "off";
  /** Minimum time two people must have spent together, in minutes. */
  minMinutes: number;
  /** …on at least this many different days. */
  minDays: number;
  /** Higher = smaller, tighter groups. 0.5 – 2 */
  resolution: number;
  minSize: number;
  /** Let someone appear in more than one suggested group. */
  overlap: boolean;
  /** Count time together more when the two are VRChat friends with each other. */
  mutualBoost: boolean;
  /** Only use the last N days of history (0 = all). */
  sinceDays: number;
  /** Create and update circles from suggestions automatically. */
  auto: boolean;
}

export interface Settings {
  contact: string;
  intervalMs: number;
  autoRefresh: boolean;
  detailTtlDays: number;
  mutualTtlDays: number;
  ringMode: "status" | "trust";
  showLabels: "auto" | "always" | "never";
  dimMode: "dim" | "hide";
  map: MapSettings;
  logs: LogSettings;
  groups: GroupSettings;
  sounds: SoundSettings;
  /** App version that last ran with this data (for upgrade/downgrade notes). */
  lastVersion: string;
}

// ---- game log statistics (from the Rust side) ----

export interface PersonTime {
  id: string;
  secs: number;
  weighted: number;
  visits: number;
  days: number;
  /** Naive local timestamp (seconds, wall clock read as UTC). */
  last: number;
  worlds: [string, number][];
}

export interface PairTime {
  a: string;
  b: string;
  secs: number;
  weighted: number;
  visits: number;
  days: number;
  last: number;
}

export interface PresenceStats {
  people: PersonTime[];
  pairs: PairTime[];
  visits: number;
  play_secs: number;
  first: number;
  last: number;
}

export interface LogScanReport {
  dirs: string[];
  files_seen: number;
  files_read: number;
  files_stored: number;
  visits: number;
  first: number;
  last: number;
  bytes: number;
  newer_version: number | null;
  errors: string[];
}

export interface Filters {
  search: string;
  presence: "all" | "online" | "offline";
  lastSeen: "any" | "24h" | "7d" | "30d" | "90d" | "older";
  trust: string[];
  platform: string[];
  circleId: string | null;
  favoritesOnly: boolean;
  listId: string | null;
}

export interface SyncState {
  running: boolean;
  phase: string;
  done: number;
  total: number;
  message: string;
  backoffUntil: number;
  error: string;
  paused: boolean;
}
