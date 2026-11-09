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
  lineColors: "shared" | "plain";
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
