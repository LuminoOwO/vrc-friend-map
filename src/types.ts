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
  /** VRChat's 18+ age verification. */
  ageVerified?: boolean;
  fetchedAt: number;
}

export interface WorldInfo {
  id: string;
  name: string;
  imageUrl?: string;
  thumbnailImageUrl?: string;
  capacity?: number;
  authorName?: string;
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
  bannerUrl?: string;
  description?: string;
  shortCode?: string;
  discriminator?: string;
  memberCount?: number;
  isRepresenting?: boolean;
  /** You're in this group too. */
  mutual?: boolean;
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
  /** Your own profile in the shape friends have (picture, status…), for the map. */
  profile?: Friend;
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
  /** Received through vfm-servers (names of the servers), kept up to date by syncing. */
  via?: string[];
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
  /** World names and pictures, loaded when a profile shows someone's location. */
  worlds?: Record<string, WorldInfo>;
  /** Profiles of people who aren't friends (instance mates, potential friends). */
  others?: Record<string, Friend & { fetchedAt: number }>;
  /** Your blocks, mutes, hidden avatars (VRChat "player moderations"), by user. */
  moderations?: { byUser: Record<string, string[]>; fetchedAt: number };
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
  /** 1 = clockwise, -1 = counter-clockwise */
  orbitDir: 1 | -1;
  /** Small trust-rank shield next to names on cards. */
  showShield: boolean;
  /** Small frame-rate readout in the corner of the map. */
  showFps: boolean;
  /** Your own picture, floating between the friends you're closest to. */
  showMe: boolean;
  /** People who aren't friends: none, only those in your instance, plus people
   *  you've spent time with (game logs), plus friends of friends (shared lists). */
  showOthers: "off" | "here" | "met" | "all";
}

export type Theme = "dark" | "oled" | "light" | "mocha" | "macchiato" | "latte" | "nord" | "dracula";

export interface LogSettings {
  /** Read VRChat's log files on this computer. */
  enabled: boolean;
  autoDetect: boolean;
  /** Extra folders added by hand. */
  dirs: string[];
  scanMinutes: number;
  /** 0 = keep forever */
  retentionDays: number;
  /** Follow the log as VRChat writes it: who's in your instance right now. */
  live: boolean;
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
  /** Use your game logs (time with you). */
  useLogs: boolean;
  /** Use friends' live locations (time friends spend together, even without you). */
  useLive: boolean;
}

// ---- sharing through vfm-servers ----

/** What a server allows for uploads. */
export type EncPolicy = "force-off" | "optional" | "recommended" | "force-on";
/** Your default for the encryption switch on servers that let you choose. */
export type EncDefault = "server" | "on" | "off";

export interface ServerInfoLite {
  name: string;
  version: string;
  encryption: EncPolicy;
  registration: "open" | "invite" | "closed";
  motd: string;
  loggerEnabled: boolean;
  loggerPaired: boolean;
  maxItemBytes: number;
}

export interface ShareServer {
  id: string;
  url: string;
  addedAt: number;
  info: ServerInfoLite | null;
  infoAt: number;
  /** The server's own key differs from when it was added. */
  keyChanged: boolean;
  registered: boolean;
  /** Upload my data here. */
  upload: boolean;
  /** Your choice for the encryption switch; null = the default. */
  encrypt: boolean | null;
  shareFriends: boolean;
  shareActivity: boolean;
  /** Who may receive it: all friends, or the members of some circles. */
  audience: "all" | "circles";
  circleIds: string[];
  /** Fetch what others share with me here. */
  download: boolean;
  /** You paired this server's logger. */
  loggerOwner: boolean;
  /** You confirmed uploading unencrypted to this server ("don't ask again"). */
  ackUnencrypted: boolean;
  /** Kinds currently uploaded, to remove them when you stop sharing. */
  published: string[];
  lastSync: number;
  lastError: string;
  lastNote: string;
}

export interface SharingSettings {
  encDefault: EncDefault;
  autoSync: boolean;
  /** Minutes between syncs while the app is open. */
  intervalMin: number;
  /** Use activity friends shared with you for group suggestions. */
  useShared: boolean;
  /** Use your own loggers' totals for group suggestions. */
  useLogger: boolean;
  servers: ShareServer[];
}

export interface SharedItem {
  owner: string;
  kind: string;
  created: number;
  sealed: boolean;
  /** Server IDs it came from. */
  servers: string[];
  payload: unknown;
}

/** What came from servers (store/shared.json). */
export interface SharedData {
  items: Record<string, SharedItem>;
  /** server id -> logger totals */
  logger: Record<string, { pairs: PairTime[]; since: number; updated: number; people: number }>;
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
  theme: Theme;
  /** Open profiles as a popup over everything, or as a panel at the side. */
  profileAs: "popup" | "sidebar";
  sharing: SharingSettings;
  people: PeopleSettings;
  /** App version that last ran with this data (for upgrade/downgrade notes). */
  lastVersion: string;
}

/** People who aren't friends: whose profiles to load and keep. */
export interface PeopleSettings {
  /** Load the profile of everyone in my instance (not only the first 25). */
  loadEveryone: boolean;
  /** Which non-friend profiles are kept on this device between sessions:
   *  none, only potential friends (shared friends or time spent together), or everyone. */
  keep: "none" | "potential" | "everyone";
  /** Show people I've blocked (in my instance, on the map, in the activity log). */
  showBlocked: boolean;
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
  /** Status keys: "join me", "active", "ask me", "busy", "web", "offline". Empty = any. */
  statuses: string[];
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

/** Who's in your instance right now (from the live game log). */
export interface LivePlayer {
  id: string;
  name: string;
  since: number;
}

export interface LiveSnapshot {
  active: boolean;
  location: string;
  worldId: string;
  worldName: string;
  since: number;
  players: LivePlayer[];
  localId: string | null;
  file: string;
  closed: boolean;
}

/** Someone from the game logs who isn't a friend. */
export interface MetPerson {
  id: string;
  name: string;
  secs: number;
  visits: number;
  last: number;
}
