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
  /** Language codes from the profile (VRChat moved them there in 2026). */
  languages?: string[];
  /** When bio, links, badges and languages last came from GET /profile/{id}. */
  profileFetchedAt?: number;
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
  /** People the owner stopped being friends with, if they share that. */
  removals?: SharedRemoval[];
  /** The owner's notes about people (adult vouches, "keep your distance"). */
  notes?: (ShareNote & { id: string })[];
  /** Why the owner blocked people (preset reason ids). */
  blocks?: { id: string; reasons: string[]; t: number }[];
  /** The owner's time zone (IANA), if they share it. */
  tz?: string;
  /** Circles the owner shares with some friends, to edit together. */
  circles?: SharedCircle[];
}

export interface SharedCircle {
  /** "<owner id>:<circle id>" so the same circle is the same everywhere. */
  key: string;
  name: string;
  color: string;
  members: string[];
  /** Who may edit it (friend IDs), besides the owner. */
  with: string[];
  owner: string;
  /** Last change (ms): the newest version wins. */
  t: number;
}

export interface FriendLogEntry {
  t: number;
  id: string;
  name: string;
  type: "added" | "removed";
  /** Removed with the app's own Unfriend button (otherwise we can't tell who removed whom). */
  byMe?: boolean;
  /** Removed while that person was in your instance (or had just left it). */
  together?: boolean;
}

/** A removal a friend shared with you (Settings → server → "Share my friend removals"). */
export interface SharedRemoval {
  id: string;
  t: number;
  byMe?: boolean;
  together?: boolean;
}

export interface Cache {
  me: Me | null;
  friends: Record<string, Friend>;
  presence: Record<string, Presence>;
  details: Record<string, UserDetail>;
  /** Your VRChat notes on people (GET /userNotes). */
  userNotes?: { byUser: Record<string, string>; fetchedAt: number };
  /** Linked pages read for age hints and time zones (this device only). */
  linkReads?: Record<string, LinkReadsEntry>;
  /** Age hints worked out on this device (never shared). */
  ageHints?: Record<string, { t: number; profileAt: number; hints: AgeHint[]; /** Rules version (src/age.ts RULES_VERSION). */ v?: number }>;
  mutuals: Record<string, MutualInfo>;
  /** userId -> favorite group display names */
  favorites: Record<string, string[]>;
  /** Loaded on demand when a profile is opened. */
  groups?: Record<string, UserGroups>;
  /** World names and pictures, loaded when a profile shows someone's location. */
  worlds?: Record<string, WorldInfo>;
  /** Profiles of people who aren't friends (instance mates, potential friends). */
  others?: Record<string, Friend & { fetchedAt: number }>;
  /** Your extra accounts' friend lists (user ID of the account -> its friends). */
  alts?: Record<string, { friends: Record<string, Friend>; presence: Record<string, Presence>; fetchedAt: number }>;
  /**
   * Who is whose friend, for people your extra accounts know: "main" and/or
   * account IDs. Missing: only the main account's friend.
   */
  friendOf?: Record<string, string[]>;
  /** Your blocks, mutes, hidden avatars (VRChat "player moderations"), by user. */
  moderations?: {
    byUser: Record<string, string[]>;
    fetchedAt: number;
    /** Their display name as VRChat sent it with the moderation (works for anyone, friend or not). */
    names?: Record<string, string>;
    /** When you blocked them (VRChat's time, ISO). */
    blockedAt?: Record<string, string>;
  };
  lastFriendsSync: number;
}

export type AgeRating = "sure-adult" | "adult" | "likely-adult" | "likely-minor" | "minor";
/** Your own note about someone's age. Stays on this device. */
export interface AgeNote {
  rating: AgeRating;
  t: number;
}
/** What you tell friends about someone (never "under 18"). */
export interface ShareNote {
  v: "adult" | "likely-adult" | "distance";
  t: number;
}
export interface AgeHint {
  dir: "adult" | "minor";
  weight: 1 | 2;
  why: string;
  source: string;
  snippet: string;
}
export interface AgeSettings {
  /** Show age hints and notes on profiles. */
  enabled: boolean;
  /** Also read each page linked in the bio, once (off by default). */
  readLinks: boolean;
  /** Ask before sending or accepting a friend request when there are concerns. */
  warnRequests: boolean;
  /** How far to follow links from link pages (0: only the bio's own links). */
  linkDepth: number;
  /** Most pages read per person. */
  maxPages: number;
  /** Read social network profiles (X, Bluesky, Instagram…) at all. */
  socials: boolean;
  /** X / Twitter through fxtwitter.com (the handle goes to them). */
  fxTwitter: boolean;
}

/** What reading someone's linked pages gave (cache; texts are short). */
export interface LinkReadsEntry {
  t: number;
  reads: import("./linkreaders").LinkRead[];
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
  /** Your age notes (this device only, never shared). */
  ageNotes: Record<string, AgeNote>;
  /** What you share with friends about people: adult vouches or "keep your distance". */
  shareNotes: Record<string, ShareNote>;
  /** Device sync: the state this device and your others last agreed on. */
  selfBase?: import("./devicesync").SelfData | null;
  /** When this device last logged in to VRChat (for "log out everywhere"). */
  loginAt?: number;
  /** The latest "log out everywhere" this device knows of (from any of your devices). */
  logoutAt?: number;
  /** The one-time "try the new interface" hint was answered (classic UI users). */
  betaHintSeen?: boolean;
  /** Set once the 0.13.0 switch to the new interface has happened on this device. */
  newUiSwitched?: boolean;
  /** When each settings group was last changed (ms), so device sync knows which change is newer. */
  settingsAt?: Record<string, number>;
  /** Starred friends (top of lists, stand out on the map). Synced between your devices. */
  starred?: string[];
  /** Your own names for people, shown on the map. Synced between your devices. */
  nicknames?: Record<string, string>;
  /** Notifications snoozed until (ms), per person. */
  snoozed?: Record<string, number>;
  /** Time zones you set for people (IANA name), or confirmed suggestions. Synced between your devices. */
  timezones?: Record<string, { tz: string; t: number; how: "set" | "confirmed" }>;
  /** Saved invite / request-invite messages. */
  inviteTemplates?: InviteTemplate[];
  /** Why you blocked people (presets shared like removals; free text stays here). */
  blockReasons?: Record<string, BlockReason>;
  /** Instances you watch for a free slot (location → when you started watching). */
  slotWatch?: Record<string, { t: number; name: string }>;
  /** This install's random ID (for your devices' push targets). */
  deviceId?: string;
  /** This phone's UnifiedPush registration (push mode). */
  push?: { endpoint: string; key: string; distributor?: string; t?: number };
  /** Your phones that take pushes (synced between your devices). */
  pushTargets?: Record<string, { endpoint: string; key: string; t: number; name: string }>;
  /** Your notes and tags on worlds. */
  worldNotes?: Record<string, { text: string; tags: string[]; t: number }>;
  /** Circles you share with friends (circle id → who may edit it with you). */
  sharedCircles?: Record<string, { with: string[]; owner: string; t: number }>;
}

export interface InviteTemplate {
  id: string;
  text: string;
  /** Which kind: an invite you send, or a request for an invite. */
  kind: "invite" | "request";
  /** VRChat's message slot (0–11) it's stored in, once saved there. */
  slot?: number;
}

export interface BlockReason {
  reasons: string[];
  /** Your own words (never shared). */
  text?: string;
  t: number;
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
  /** The "who's here" panel: full list, one row of pictures, or just a button. */
  hereView: "list" | "compact" | "hidden";
  /** Where "who's here" sits: at the top of the sidebar, or over the map. */
  herePlace: "sidebar" | "map";
}

export type Theme = "dark" | "oled" | "light" | "mocha" | "macchiato" | "frappe" | "latte" | "nord" | "dracula" | "graphite" | "tokyonight" | "gruvbox" | "rosepine" | "onedark" | "everforest" | "solarized" | "solarizedlight";

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
  /** Picture folders added by hand (VRChat's own are found automatically). */
  pictureDirs: string[];
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
  /** The server stores items that don't say who they're for. */
  hiddenRecipients?: boolean;
  /** The server can tell the app about changes over one open connection. */
  liveChanges?: boolean;
  /** The server passes messages between your own devices live. */
  deviceRelay?: boolean;
  /** The oldest app version the server works with (src/compat.ts). */
  minApp?: string;
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
  /** Who may receive it: all friends, the members of some circles, or people you picked. */
  audience: "all" | "circles" | "picked";
  circleIds: string[];
  /** audience "picked": these friends. */
  audiencePicked: string[];
  /** Put new friends on the picked recipients automatically. */
  audienceAutoAdd: boolean;
  /** Which friends the shared friend list and activity cover. */
  include: PeopleSelection;
  /** Also share whom you stopped being friends with (shown to them as a note on that person). */
  shareRemovals: boolean;
  /** Also share why you blocked people (preset reasons only), like removals. */
  shareBlocks: boolean;
  /** Share your own time zone, so friends see your local time. */
  shareTimezone: boolean;
  /** Use this server's shared cache of public VRChat info (worlds, groups, avatars). */
  useCache?: boolean;
  /** Encrypted uploads don't say who they're for (servers that can; friends need a new app). */
  hideAudience?: boolean;
  /** Sync your circles and notes with your other devices through this server (encrypted). */
  syncMine: boolean;
  /** Share your notes about people (adult vouches, "keep your distance"). */
  shareNotes: boolean;
  /** Fetch what others share with me here. */
  download: boolean;
  /** You paired this server's logger. */
  loggerOwner: boolean;
  /** The server's VRChat login (for the logger) expired: log in again. */
  loggerExpired?: boolean;
  /** You confirmed uploading unencrypted to this server ("don't ask again"). */
  ackUnencrypted: boolean;
  /** When you last changed this server's sharing choices (they sync with your account; the newer wins). */
  shareAt?: number;
  /** Kinds currently uploaded, to remove them when you stop sharing. */
  published: string[];
  lastSync: number;
  lastError: string;
  /** Failed syncs in a row (one is usually a hiccup and shows as "Retrying…", not red). */
  failedSyncs?: number;
  lastNote: string;
}

/** A choice of friends: everyone, the members of some circles, or hand-picked people. */
export interface PeopleSelection {
  who: "all" | "circles" | "picked";
  circleIds: string[];
  picked: string[];
  /** Add new friends to `picked` automatically. */
  autoAdd: boolean;
}

export interface SharingSettings {
  /** Who goes into a list shared by hand (Shared lists → Share your list). */
  exportPick: PeopleSelection;
  encDefault: EncDefault;
  autoSync: boolean;
  /** Also sync settings between your devices (not per-device ones like the frame rate). */
  syncSettings: boolean;
  /** Minutes between syncs while the app is open. */
  intervalMin: number;
  /** Use activity friends shared with you for group suggestions. */
  useShared: boolean;
  /** Use your own loggers' totals for group suggestions. */
  useLogger: boolean;
  /** Which groups of settings sync (when syncSettings is on); empty = all. */
  syncGroups: string[];
  /** Settings groups this device keeps to itself even when they sync elsewhere. */
  localOnly: string[];
  /** Never upload anything that isn't end-to-end encrypted, whatever a server allows. */
  neverUnencrypted: boolean;
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
  notify: NotifySettings;
  /** Desktop: what closing the window does. */
  closeAction: "ask" | "tray" | "quit";
  /** Linux/X11: take mouse wheel steps from the X server when the web view gets none. */
  wheelFix: boolean;
  age: AgeSettings;
  updates: { check: boolean; skipped: string };
  theme: Theme;
  /** Accent color for the Catppuccin themes. */
  catAccent: import("./catppuccin").CatAccent;
  /** Your own colors on top of the theme ("" = the theme's). */
  ownColors: import("./owncolors").OwnColors;
  /** Open profiles as a popup over everything, or as a panel at the side. */
  profileAs: "popup" | "sidebar";
  sharing: SharingSettings;
  people: PeopleSettings;
  perf: PerfSettings;
  /** App version that last ran with this data (for upgrade/downgrade notes). */
  lastVersion: string;
  ui: UiSettings;
  bios: BioSettings;
  /** The red-flag line at the top of VRChat notes (src/notesline.ts). */
  notesLine: import("./notesline").NotesLineSettings;
  insights: { drifting: boolean };
  /** Android: background mode, refresh rate, widget, root log reading (src/phone.ts). */
  phone: PhoneSettings;
  /** Now playing in your status, Steam play time in your bio (src/extras.ts). */
  extras: ExtrasSettings;
  /** Your other VRChat accounts on this device (src/accounts.ts). */
  accounts: AccountsSettings;
}

export interface AccountEntry {
  /** The account's VRChat user ID. */
  id: string;
  name: string;
  /** Its friends on the map, cards and search. */
  show: boolean;
  /** Its own live connection (instant online / world changes). */
  live: boolean;
  /** Notifications for its friends (same rules as the main account's). */
  notify: boolean;
}

export interface AccountsSettings {
  /** On profiles, pick which of your accounts sends friend requests, unfriends, blocks… */
  actAs: boolean;
  list: AccountEntry[];
}

export interface PhoneSettings {
  background: "off" | "visible" | "quiet" | "push";
  /** Screen refresh rate to ask for: 0 = the highest the screen can do, -1 = leave it to the system. */
  refreshRate: number;
  widget: boolean;
  /** Read VRChat's logs with root (rooted phones, rooted Quest). */
  rootLogs: boolean;
}

/** Desktop extras, all off by default and kept on this device. */
export interface ExtrasSettings {
  nowPlaying: {
    /** Put the song into your VRChat status text (32 characters). */
    status: boolean;
    /** {title} {artist} {song} (= "artist – title"). */
    template: string;
  };
  playtime: {
    /** Keep a line with your VRChat hours in your bio, once a day. */
    bio: boolean;
    /** {hours}: your total hours. The line is found again by this template. */
    template: string;
  };
}

/** Reading everyone's profile slowly in the background (src/biocache.ts). */
export interface BioSettings {
  background: boolean;
  /** Seconds between two people (10 or more). */
  everySecs: number;
}

export interface UiSettings {
  /** Settings hides what can't work on this platform (else greyed out with why). */
  hideUnavailable: boolean;
  /** Phones: short vibrations on taps, toggles and long-press. */
  haptics: boolean;
  /** The new beta UI (src/ui2); the classic one stays the default for now. */
  beta: boolean;
  /** Text size factor (0.8–1.6). */
  textScale: number;
  /** Animations: follow the system, always reduce, or never. */
  reducedMotion: "system" | "on" | "off";
  /** Status colors that also differ for red/green color blindness. */
  colorblind: boolean;
  /** The app's language: "system" (the device's) or a code from src/i18n/locales. Per device. */
  language: string;
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
  /** Everyone, only friends, or only people who aren't friends yet but share friends with you. */
  who: "all" | "friends" | "potential";
  presence: "all" | "online" | "offline";
  lastSeen: "any" | "24h" | "7d" | "30d" | "90d" | "older";
  trust: string[];
  /** Status keys: "join me", "active", "ask me", "busy", "web", "offline". Empty = any. */
  statuses: string[];
  platform: string[];
  circleId: string | null;
  favoritesOnly: boolean;
  /** Only people in this VRChat favorite friend group (its display name). */
  favoriteGroup?: string | null;
  /** Only your starred friends. */
  starredOnly?: boolean;
  /** Only friends of one of your accounts ("main" or its ID), or "crossover". */
  account?: string | null;
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
  /** The avatar they switched to last (game log). */
  avatar?: string;
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
  /** Now playing: the last video link loaded in this instance. */
  video?: { t: number; url: string; by?: string };
}

/** Someone from the game logs who isn't a friend. */
export interface MetPerson {
  id: string;
  name: string;
  secs: number;
  visits: number;
  last: number;
}

/** Frame rate and power saving (Settings → Frame rate). All rates: -1 = no limit. */
export interface PerfSettings {
  /** Limit: -1 = unlimited, 0 = the screen's refresh rate, otherwise frames per second. */
  fps: number;
  /** While the window isn't focused: -1 = no change, 0 = stop moving, otherwise fps. */
  unfocusedFps: number;
  /** After this many seconds without mouse or keyboard input… (0 = never) */
  idleAfter: number;
  /** …limit to this (-1 = no change, 0 = stop moving). */
  idleFps: number;
  /** The screen's refresh rate as last measured (0 = not yet). */
  screenHz: number;
  /** Wait for the screen (on) or draw as soon as a frame is due (off; Chromium / WebView2, next start). */
  vsync: boolean;
}

// ---------- notifications (src/notifications.ts) ----------

export type NotifyEvent =
  | "added"
  | "removed"
  | "online"
  | "offline"
  | "joined"
  | "left"
  /** A friendiversary (a year, or a round number of months). */
  | "anniversary"
  /** Several of your close friends in the same instance. */
  | "gathering"
  /** A slot opened in an instance you're watching. */
  | "slotOpen"
  /** Someone invited you to their instance. */
  | "invite"
  /** Someone asks you for an invite. */
  | "requestInvite";

/** Per person: follow the general rules (no entry), always, only the next time they come online, or never. */
export interface NotifyPerson {
  mode: "always" | "once" | "never";
}

export interface NotifySettings {
  /** Version of the default sounds, to move older settings to newer defaults once. */
  soundsRev: number;
  /** Master switch. */
  enabled: boolean;
  events: Record<NotifyEvent, boolean>;
  /** Who counts for "came online" / "went offline": everyone, people in some circles, or only people you picked. */
  scope: "everyone" | "circles" | "picked";
  circleIds: string[];
  people: Record<string, NotifyPerson>;
  /** Play sounds. */
  sound: boolean;
  /** 0 – 1 */
  volume: number;
  /** Seconds between the event's sound and the person's own tune. */
  pause: number;
  /** Per event: a built-in sound's name, "custom:<id>", or "none". */
  actionSounds: Record<NotifyEvent, string>;
  /** After the action sound: each person's own tune, made from their name. */
  personTune: boolean;
  /** System notifications: always, only while the app is in the background, or never. */
  system: "always" | "background" | "never";
  /** Muted until this time (ms); 0 = not muted, -1 = until unmuted. */
  muteUntil: number;
  /** Do not disturb on a schedule (silent, kept in "missed notifications"). */
  quiet: QuietHours;
  /** Per circle: events that always notify for its members (e.g. Close friends: came online). */
  circleRules: Record<string, NotifyEvent[]>;
  /** Per friend: a sound that plays instead of their generated tune ("custom:<id>" or a built-in). */
  personSounds: Record<string, string>;
  /** Gathering alerts: how many of the chosen people in one instance count. */
  gathering: { min: number; who: "starred" | "circles" | "both"; circleIds: string[] };
}

export interface QuietHours {
  enabled: boolean;
  /** "HH:MM", local time; from > to means over midnight. */
  from: string;
  to: string;
  /** Days it applies, 0 = Sunday. */
  days: number[];
  /** Starred friends still get through. */
  allowStarred: boolean;
  /** Members of these circles still get through. */
  allowCircleIds: string[];
}

/** A sound file you added (kept in store/sounds.json). */
export interface CustomSound {
  id: string;
  name: string;
  /** data: URL */
  data: string;
}
