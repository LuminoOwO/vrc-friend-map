# Changelog

Versions follow [Semantic Versioning](https://semver.org). While the version is 0.x,
minor releases can change behavior.

## Unreleased

### Changed
- **The new interface is the start for new installs.** Updating keeps the interface you use; on
  the classic one, a one-time hint offers to try the new one (*Try it* / *Not now*). Settings →
  Appearance → Interface switches either way, any time.
- **Beta UI: see your servers at a glance**: a chip in the top bar (green when every server is
  connected live, grey when connected, amber when one isn't joined, red when one has a problem;
  click it for Sharing & servers), and the same status on the phone's Me page.
- **Beta UI on phones: a slightly taller bottom bar** with bigger icons.
- **Beta UI: a server's settings in sections**: Join, What I share here (each item with a line
  saying what it is, which friends it's about, who may get it, encryption), What I receive, My
  other devices (with the ones connected right now), and the 24/7 logger; last sync, Sync now and
  Remove at the bottom. Same options as before, just sorted.
- **Invite links: join a server in one step.** The server's admin page has *Copy invite link*
  next to each invite code (`vfm-server invite` prints it too). Paste the link into *Add a server*
  and the app adds the server, joins with the code and syncs. Opened in a browser, the link says
  what to do with it. Needs the new vfm-server for the links; codes work as before.
- **Beta UI: every Settings section has an icon and a line saying what it's for**, so you find
  things faster (e.g. "Frame rate: smoothness against battery and fan noise").

### Fixed
- **Beta UI: the sync status was cut off** in the top bar on narrower windows. It shortens with
  "…" now, and on narrow windows shows just its buttons (the text is in the tooltip and the log).

## 0.12.4 (2026-11-20)

Fixes switching between the classic and the beta UI, which flipped back and forth with
settings synced between your devices. Also brings the Linux input fixes from 0.12.3 (focus,
mouse wheel, dropdowns) to everyone. vfm-server has no changes beyond the version.

### Fixed
- **Switching between the classic and the beta UI flipped back and forth** with settings
  synced between devices: the choice synced to your other devices, which sent it back. Which UI
  a device shows is now that device's own choice; the rest of the Look settings still sync.

## 0.12.3 (2026-11-20, pre-release)

A preview of the Linux input fixes from #17 (thanks!): the app no longer takes the keyboard
focus back from other windows, the mouse wheel works on X11 systems where Chromium never got it,
and dropdown lists open inside the app in its own look. Not offered as an update; on most
systems nothing changes except the dropdowns' look.

### Fixed
- **Linux (X11): the mouse wheel did nothing on some systems** (seen on Gentoo + Xfce + XLibre
  with high-resolution wheels): Chromium in the app gets no wheel events there at all. The wheel
  fallback (Settings → Performance → Mouse wheel) is now on by default in the Linux app. On
  systems where Chromium gets the wheel fine it stands down by itself after a few wheel steps,
  so nothing scrolls twice there; it keeps working where steps go missing.
  `VRC_FRIEND_MAP_WHEEL_FIX=0` turns it off. The fallback also zooms around the pointer now (it
  was off by Chromium's own scaling), and wheel events from Chromium that move nothing no longer
  count as "the wheel works".
- **Linux (X11): dropdowns couldn't be used on the same systems**: their option list was a
  separate X11 popup window that Chromium in the app got no clicks for. The list is now drawn
  inside the page, in the app's own look.
- **Linux (X11): the app took the keyboard focus back** right after you switched to another
  window, e.g. a password manager asking whether the app may use the keyring at start. Chromium
  focused itself after page loads and window events, straight through the X server, past the
  window manager's focus-stealing prevention. The Chromium build now patches Tauri's Chromium
  runtime (src-tauri/chromium/patches) so it doesn't focus itself while another window has the
  focus. `VRC_FRIEND_MAP_FOCUS_GUARD=0` turns that off.

## 0.12.2 (2026-11-19)

Mostly fixes: much less CPU on Linux (also in the tray), a map that stays still, settings that
no longer snap back between devices, and Android 17 reaching a server at home. Update your
**vfm-server** too if you like; it has no changes of its own beyond the version.

### Changed
- **Beta UI: Sharing & servers on one page** (Settings → Sharing & servers): your servers are
  listed right away, each with a plain status ("Connected · live", "Not joined yet", "Last sync
  failed") and what it does for you; tap one for its settings. *Add a server* is its own step
  with what happens next. The general options are grouped (Syncing, Between my own devices,
  Privacy, Group suggestions), each with a line saying what it does; keys sit under Advanced.
  The classic UI keeps its Servers dialog.
- **Picking someone's time zone** (profile → Local time): a short list of the world's 38 time
  zones by UTC offset ("UTC+1 · Central Europe: Germany, France, Spain…", with the time there
  now) and a filter, in the app's own look, instead of a browser list of hundreds of cities.
- **Local time says which part of the day it is** there: night, early morning, morning,
  afternoon, evening or late evening (only night is highlighted).

### Fixed
- **Linux: the app used a full CPU core all the time**, also in the tray with nothing to do.
  With Chromium's way of hooking into the window system's event loop there, the loop kept
  checking for events without ever pausing (a known Chromium Embedded problem). The app now
  lets that loop rest for a moment when it finds nothing to do; events still arrive at once.
  `VRC_FRIEND_MAP_POLL_THROTTLE=0` turns this off.
- **The map shifted a little every few seconds**: each live status update from VRChat restarted
  the layout (the list of friends you're placed between was rebuilt each time, same people). It
  now restarts only when those people change.
- **Less CPU in the tray:** a window hidden to the tray kept drawing the map (30 frames a second
  with the orbit on) and running animations, since hiding doesn't tell the page it's hidden.
  Now the app tells it, and the map and animations pause until the window is back.
- **Settings that synced between your devices could snap back** when changed on a device that
  had just joined (switches you unticked turned themselves on again). Now the newer change
  wins; both devices need this version for it.
- **Android 17: a vfm-server on your home network couldn't be reached** ("can't reach the
  server", while the phone's browser could). Android 17 makes home-network access a permission
  (*Nearby devices*); the app now asks for it when you add or use a server at home.
- "It's night for …" showed in the afternoon with a 12-hour clock (3 PM was read as 3 am).

## 0.12.1 (2026-11-16)

### Fixed
- Uploading a sticker failed with "Only emoji can have animation styles": the in-game effect is
  now offered for emojis only.

## 0.12.0 (2026-11-16)

Update your **vfm-server** too: live changes instead of polling, devices syncing with each
other, hiding who you share with and "nothing changed" answers need the new server (older
servers keep working as before). The **new beta UI** is in this release as an opt-in preview
(Settings → Appearance → Interface); it becomes the main UI in a later release.

### Added
- **Sync log** (click the sync status, or the ⓘ next to it): every sync step with time, result and
  the exact error, like "server.example: 404 Not Found" or "VRChat: 429 Too Many Requests";
  copyable. A sync cut off because the app went to the background (phones) shows as
  *interrupted*, not failed, and runs again once the app is back.
- **Linked pages, many more sites** (Settings → People → Age hints → *Also read the pages they
  link to*): each of about 50 sites is read the most direct public way: Bluesky, Mastodon and
  other fediverse servers, GitHub, Reddit, Steam, Pixiv and ArtStation through their public
  APIs; Threads, Tumblr, Telegram, YouTube, Twitch, TikTok, link pages (Linktree, Carrd, Beacons,
  bio.link, guns.lol, Ko-fi, Throne, VGen…) and art sites (Fur Affinity, DeviantArt, Toyhouse…)
  from their pages. X / Twitter through FxTwitter, behind its own switch (the handle goes to
  fxtwitter.com). *Read deeper* follows profile links found on link pages (none, 1–3 steps), with
  a page limit per person, and social networks can be left out entirely. The profile shows each
  link as read / login needed / unreachable / skipped.
- **Bios in the background** (Settings → People, on): reads everyone's profile slowly (one
  person every 45 s, adjustable), friends first, so bios, age hints and time zone guesses are
  there when you open a profile.
- **Settings → Appearance → Interface**: *Hide features not available on this platform* (on;
  off shows them greyed out with the reason), *haptics* on phones (off), text size, fewer
  animations, color-blind friendly status colors.

- **Insights** (new tab): what changed since you were last here (who came online, renames, new
  and removed friends); missed notifications, with read / unread; friend requests you sent and
  still wait on (cancel old ones); friend groups found on your map (from mutual friends) with
  *Make a circle*; bridges (who connects your groups); a path between any two people and their
  shared and separate friends; drifting apart (off by default: people you used to spend time
  with, from the game logs); your friend list size and adds / removes per month.
- **On profiles**: star a friend (top of lists, a gold star on the map); your own nickname for
  them (shown on the map, found by search); snooze their notifications (an hour … a week);
  their **local time**, either set by you, shared by them, or a *probably* suggestion from their
  bio, status, linked pages (X, Instagram, Bluesky… bios and "Location" fields), languages,
  groups and usual online hours, with ranked candidates and reasons when hints disagree;
  last seen, usual online hours as a week heatmap, the best time to catch them, friends since,
  earlier display names; VRChat's own note on them, editable (shown in game).
- **Block reasons** (part of the red flags): after you block someone (here or in game: the app
  notices new blocks in VRChat's block list), pick reasons (soundboard spam, music too loud,
  mic spam, annoying avatar, trolling, anti-queer, racism, harassment, unwanted sexual advances,
  following, crasher, seizure / flashing avatar, malicious links, ripped avatar, ban evasion and
  more) and optionally your own words. Shared with friends like friend removals (per server, off
  by default; your own words never). Friends' block reasons show on that person's profile.
- **Red flags in VRChat notes** (Settings → People, off by default): a short line at the top of
  your VRChat note on flagged people, readable in game: only your reasons, or also how many
  friends blocked / removed them, or each friend by name; compact or long. Your own note text
  stays below it, untouched. Nothing about age goes there.
- **Invites**: *Request invite* (also with one of your saved messages), *Invite me* (VRChat sends
  you an invite you accept in game), and *Tell me when a slot opens* for a full instance.
  Settings → People → Invite messages shows and edits VRChat's 12 saved messages per kind.
- **Notifications**: quiet hours (a schedule; starred friends and chosen circles still get
  through; everything is kept as missed), rules per circle (e.g. Close friends: came online),
  friendiversaries (a year, 6 months, 100 days), close friends gathering (several starred or
  circle friends in one instance), a slot opened, invites and invite requests.
- **Map time travel** (Map options): the map as it was at an earlier date (who was a friend
  then).
- **Shared circles**: share a circle with friends (sidebar → share icon) to edit it together;
  it travels in the friend list you share through your servers, the newest change wins.
- **Sharing your time zone** (per server, off) so friends see your local time.
- Stars, nicknames, time zones, block reasons, invite messages and shared circles sync between
  your devices.

- **Logbook** (new tab, from your game logs; all on this device):
  - *Day by day*: when you played (sessions from–to), every instance in order with who was there,
    who joined and left when, video links, pictures taken; your own diary note for the day;
    "a year ago" on this day; an **instance replay** (scrub through a visit and see who was there,
    and in which avatar, minute by minute).
  - *Rankings*: worlds by time (and who's most often with you there), people by time together
    with first met, when you play (week heatmap), longest sessions, streaks, busiest day, and
    worlds popular among your friends this week (from their live locations).
  - *Video links*: every link a video player loaded, with time, world and who asked for it
    (where the player logs it); open, copy, search, export as CSV.
  - *Pictures*: your VRChat pictures (found automatically on Windows and in the Proton folder on
    Linux; add your own in Settings → Game logs), each tagged with the world and the people there
    at that minute; search by world or person, full view, show in folder, save a copy.
  - *Year in review*: hours, top worlds and people, streaks, pictures and videos, new friends;
    save it as a picture.
- **Profiles**: avatars someone was seen in (game logs) and your pictures with them.
- **Who's here**: *now playing* (the video loaded in your instance).

- **VRChat tab**:
  - *Groups & events*: your groups and the upcoming events of all of them.
  - *Favorites*: your friend, world and avatar favorite groups with what's in them; rename
    groups, remove favorites, show a friend group alone on the map (also Filters → *Favorite
    group*).
  - *Avatars*: your uploaded avatars and favorite avatars with platforms and performance, the
    one you're wearing, and switching to one.
  - *Prints, stickers, emojis* (and gallery pictures and icons): view, open, delete, and upload
    with a cropper that fits each kind; an animated GIF becomes an animated emoji (frames, speed
    and the in-game effect).
  - *World notes*: your notes and tags on worlds, filterable by tag.
  - *Open a VRChat link*: paste a profile, world, group or instance link (also anywhere in the
    app with Ctrl+V).
- **Instance view**: click the people under a friend's world card: world, type, region,
  owner, slots, every friend inside, and "and N others" (your own instance lists everyone from
  the game log); *Invite me*, launch, world.
- **World pages**: description, author, visits, favorites, open public instances, friends there
  now, your notes and tags.
- **Group pages**: about (description, links, rules, your roles), join / leave, posts (and
  writing them), events, open group instances (and opening one), gallery, members (find,
  only friends); management as far as your roles allow: join requests, invites, kick, ban and
  unban, roles, group settings, audit log. Every change asks first.
- **Your own sound per friend** (next to the bell on their profile): plays instead of their
  generated tune.

- **Android: phone in the background** (Settings → Notifications): stay connected with a
  permanent notification, stay connected quietly (a silent, minimised notification; on Android
  13+ mostly under "Active apps"), or **push through UnifiedPush** (Sunup, ntfy…): your PC app
  sends your notifications to the phone, encrypted with a key only your devices know, so the
  phone needs no connection of its own. Asking to be left out of battery optimisation.
- **Invites and invite requests** as notifications (from the live connection), with their own
  sounds.
- **Android: above 60 Hz**: asks for the screen's highest refresh rate (or one you pick).
- **Android: home-screen widget** with your starred friends who are online.
- **Android: open VRChat links shared to the app** (share menu → VRC Friend Map).
- **Android: game logs with root** (rooted phones, or a rooted Quest such as with Singularity):
  VRChat's logs are copied every few minutes and read like on a PC.

- **Server: admin accounts** instead of only the admin token: name, password and an
  authenticator code (standard TOTP: Ente Auth, Aegis, Google Authenticator…; on by default,
  `totp = false` turns it off). The first account is made on the admin page with a one-time
  code from the console (`vfm-server admin-code`, 30 minutes). The token still works.
- **Server: who uses it and bans**: the admin page lists accounts with last seen, last address,
  app version and storage used (never contents). Ban by account (optionally deleting what they
  stored) or by IP address, with a reason; banned people see the reason and your
  `appeal_contact` in the app. `trusted_proxy` reads the visitor's address behind a reverse
  proxy on the same machine or network.
- **Server: your VRChat login on the admin page** (owner only; the app can't set it): username,
  password and 2FA code, for the logger around the clock. **Hand-off** (on by default): while
  your PC app runs, the server lets go of VRChat's live connection, and takes it back a few
  minutes after the PC app is gone. Invites reach your phone as push while the server holds it.
- **Server: shared cache of public VRChat info** (worlds, groups, avatars, each with its own
  switch, on by default; per server in the app): apps read public info from your server first,
  so VRChat gets fewer requests. Entries show their age and expire within a week.
- **Hide who you share with** (Servers → a server → *Hide who I share with from this server*,
  off by default, needs encryption and the new vfm-server): your uploads there no longer list
  who may read them, not even as key labels. Your friends' apps find out themselves whether an
  item is for them, and look up only the friends who use this, not your whole friend list. The
  server can still see whose items each app downloads. Friends on an app older than this one
  don't get those items until they update.
- **Your devices sync with each other live** (with *Sync my circles and notes with my other
  devices* on a new vfm-server): your devices find each other through the server's live
  connection, then talk straight over your home network, or through the server live when
  they're apart. Circles, notes and settings go across within seconds and are merged like
  before, and **your own notification sounds** now reach your other devices too. Everything is
  sealed and signed with your own key; the server passes it along without storing it (the
  server owner can turn off passing along bigger messages such as sounds; at home they still
  go directly).
- **Several VRChat accounts on one map** (Settings → Account & data → *Your other accounts*,
  on a computer): log in with your other accounts too, in a private window so your main
  account stays logged in. Their friends join the map, cards and search, mixed with your main
  account's: each gets a small colored dot per account that knows them, and friends of two or
  more of your accounts get a dashed ring (*crossover*). The filter menu has *Account* (main,
  one account, or only crossover), and profiles say "Friends with … and …". Lines between
  friends are loaded through the account that's their friend. Per account: show its friends,
  its own live connection (instant online / world changes), and notifications for its friends.
  *Act as any of my accounts* (off by default) adds an *Act as* picker to profiles for friend
  requests, unfriending, blocking and muting. Sharing, the friend log and "since you were last
  here" stay about your main account.
- **Settings sync, finer**: pick which groups of settings sync, and keep some on this device
  only.
- **Never send anything unencrypted** (per server), and a short **safety code** per friend to
  compare once, with a warning when a friend's key changes.

- **Chatbox over OSC** (Settings → Notifications): a line of your own every few minutes (template with
  now playing, play time…) and "★ X came online" for starred friends, in VRChat's chatbox.
  Only to this PC or your home network (a Quest too); only while VRChat runs.
- **Listening to VRChat over OSC** (Settings → Notifications → Chatbox (OSC) → *Listen to
  VRChat*, off by default): VRChat tab → Avatars shows the avatar you're wearing in game, AFK /
  muted / earmuffs, and its toggles, which you can set from the app (on / off, numbers,
  sliders, from the OSC file VRChat writes for each avatar); plus a history of the avatars you
  wore, on this device. Only from this PC, or from your Quest's address.
- **Now playing in your status** (Linux, through `playerctl`): the song in your VRChat status
  text after it played for 20 seconds, at most every 90 seconds; your own status comes back
  when the music stops.
- **Steam hours in your bio**: once a day, one marked line ("⏱ 2,431 h in VRChat") from Steam's
  own files; the rest of your bio stays as it is, within 512 characters.
- **Steam play time per day** in the Logbook's day view ("Steam counted 2 h 10 min this day"),
  from the total the app notes once a day on this device. Days the app didn't run are counted
  together ("since Nov 12").
- **Encrypted backup** (Settings → Account & data): notes, circles, local data, settings and your own
  sounds in one password-protected file (in Downloads; on phones to the clipboard), restored
  from a file or the clipboard, with or without the settings. Age notes are never in it.
- **Tray menu**: how many friends are in VRChat, starred friends online (opens their profile),
  your status, *Sync now*.

- **New beta UI** (Settings → Appearance → Interface, off by default; `--classic-ui` always
  starts the classic one): on desktop an icon rail, a floating search bar with filter chips and
  a person panel with section tabs; on phones bottom tabs (Map, Cards, Here, Insights, Me),
  full-screen filters and a person sheet you drag up.
- **Command palette** (Ctrl+K): jump to friends, views, settings sections and actions.
- **Filter: only starred friends.**

### Changed
- **Update checks every few hours** instead of once a day, and the app asks you to update when a
  new version is out. You can still turn it off (Settings → Account & data → Updates), but the
  app now says why that isn't recommended.
- **vfm-server looks for new versions too** (every 12 hours, `[admin] update_check`, on by
  default) and shows "vfm-server x.y.z is out" with how to update at the top of the admin page,
  and in its log. It never updates itself.
- **Less load on your servers**: a sync where nothing changed is now a few tiny requests. The
  app only uploads your friend list or activity again when it changed (or every 6 hours, so
  friends who joined the server since get it; *Sync now* always uploads), and the server
  answers "nothing new" instead of sending everything that's shared with you again. Needs the
  new vfm-server for the second part; older servers keep working as before.
- **Live changes instead of polling**: with the new vfm-server the app keeps one quiet
  connection open, and the server says when a friend shared something new or your other device
  changed something. The app then syncs that server within seconds, and polls only hourly as a
  safety net. Reconnects by itself; older servers are polled as before.
- Map: panning stops before everyone leaves the screen.
- Phones: the filter menu stays inside the screen; the settings button sits in the top right
  and is a real cogwheel; checkboxes have room between them.
- **Age hints read a number alone at the start of a line** as a likely age: a bio of just "18",
  or "19" / "21 | he/him" as its first line, now counts (as a weaker hint than "I'm 19", so the
  profile says "probably over 18"; numbers under 18 count the same way). A link to an
  adults-only site (OnlyFans, Fansly and similar, which check ID) counts as an adult hint.
  Hints already worked out are worked out again with the new rules.

### Fixed
- Opening a profile could freeze the app (it kept redrawing itself).

## 0.11.0 (2026-11-15)

### Added
- **Updates from inside the app**: the app checks GitHub once a day (can be turned off in
  Settings → Account & data → Updates), shows what's new, and updates with one click: it
  downloads the file for how you installed it, checks it against the release's checksums,
  installs it and restarts. Windows (installer, MSI, portable), Mac, AppImage, .deb / .rpm
  (with your password) and the tarball update themselves; Flatpak, Android and iPhone get the
  download or the release page.
- **Your circles and notes on all your devices**: per server, *Sync my circles and notes with my
  other devices* (on by default; needs the same key on each device and encryption on that
  server). Circles, dismissed group suggestions, what you tell friends about people and
  per-person notification rules travel end-to-end encrypted for your own key only; edits on two
  devices are merged (members added or removed on either side both apply). *Also sync settings*
  takes theme, map, groups and age-hint settings along; frame rate, tray and graphics stay per
  device. Age notes never leave a device.
- **vfm-server upgrades its own files**: a newer vfm-server installed over an older one backs the
  data up to `data/backups/` and upgrades it at its first start; an older one refuses newer data
  instead of damaging it. The app shows in a server's card when the server is older than the app.
- **Filters → Who → Only friends of friends I'm not friends with**: shows people who aren't your
  friends yet but share at least one friend with you (in your instance, people you've met, and
  friends of friends from shared lists), with lines to the friends you share. Your friends stay
  dimmed for context. *Only friends* hides everyone else.

## 0.10.0 (2026-11-14)

### Added (profiles and people)
- **Age hints** (profile → Age; Settings → People → Age hints): hints whether someone is over or
  under 18 from what they wrote (bio, pronouns, status, links; optionally one read of each page
  they link to, public websites only), your own note (only on this device; guesses fade after
  6–12 months), and a question before you send or accept a friend request when there are
  concerns. VRChat's 18+ badge isn't counted. Friends can share only "most certainly over 18",
  "probably over 18" or a reasonless "keep your distance"; notes saying someone is under 18 never
  leave your device, and other values are dropped when received.
- **Red flag**: when a friend shares their friend removals (new server option, off by default),
  that person's profile says so: "X removed them as a friend [while they were in the same
  instance]", or "X and they stopped being friends" when VRChat can't tell who did it.
- **Edit your own profile**: status, status text, pronouns, about me, links, languages, and the
  look the API allows (theme, background, banner color).
- **Who's here in the sidebar** by default (it no longer covers the Activity tab), with the
  world's picture, instance type, region and people / slots. A button moves it over the map.
- **Map zoom without a wheel**: + / − / fit buttons, and + / − / 0 on the keyboard.
- **F11** switches the window to real fullscreen.
- **Catppuccin**: all four flavors (Frappé is new) with any of the 14 accent colors.

### Changed (frame rate)
- **Settings → Frame rate**: the limit is a number you type in now (60 by default, -1 for
  unlimited, 0 for the screen's rate), with its own vsync switch (on by default; off needs the
  Chromium build or Windows and a restart). With vsync off the app sleeps between frames
  instead of asking for frame after frame, which fixes the lag at "unlimited".
- **Saving power** takes numbers too: the rate while the window isn't focused (default 30) and,
  optionally, after a while without input (0 stops the map moving, -1 means no change).

### Added (notifications)
- **Settings → Notifications**: notify about friends who add you, remove you, come online, go
  offline, join your instance or leave it (the last two from the game log, PC). Each event has
  its own switch and sound.
  - *Came online / went offline* for all friends, the people in some circles, or only people
    you pick.
  - **Per person** (bell on their profile, or the list in Settings): *always*, *next time they
    come online* (once, then back to normal: for when you're waiting for someone), or *never*,
    which also works when notifications are on for everyone.
  - **Sounds**: a sound for what happened, then the person's own short tune, made from their
    name (always the same for them; on by default): short, cheerful, in the same key as the
    event sounds, and starting right as the event sound lands. Choose from 20 built-in sounds or add
    your own audio files.
  - **Mute** for 30 min / 1 h / 4 h or until you unmute (also from the tray).
  - **System notifications** on Windows, Linux, macOS, Android and iOS, when the app is in the
    background (or always, or never). Phones use the system's notification sound; the app's own
    sounds play while it's open.
- **Tray icon (desktop)**: the app can keep running in the tray with the window closed. It keeps
  notifying and collecting live updates and game logs, and draws nothing. The first time you
  close the window it asks: tray (recommended) or quit, and whether to ask every time
  (Settings → Notifications → Closing the window). The tray menu opens the window, mutes
  notifications (30 min, 1 h, 4 h, 8 h, until tomorrow morning, until you turn them back on)
  or quits.

### Added (sharing)
- **Hand-pick people** for sharing: the list you send by hand, what you share through a server
  (whose names and time together go in) and who may get it can each be all friends, some
  circles, or people you pick from a searchable list. *Add new friends to this list
  automatically* keeps picked lists up to date.

### Added (more)
- **Image viewer**: click a profile picture, banner, world picture, badge or group picture to see
  it full size, with zoom (wheel, pinch, buttons, double click), panning, flipping through a
  profile's pictures, and **Download** (saved to Downloads / VRC Friend Map).
- **Who's here, as a real list**: the world, then friends and people who aren't friends yet,
  each with picture, status or friends in common, and how long they've been there. Switch
  between the full list, a row of pictures, or just a button; a search field appears in
  busy instances.
- **Your picture in the top bar** (where the logo was): opens your profile.
- **Shared lists tab**: explains servers, lists yours with their state, and adds new ones
  right there (no more digging in Settings).
- **Settings, sorted**: categories on the side (Appearance, Performance, People, Game logs &
  groups, Sharing & servers, Notifications, Account & data) and a search that understands other
  words for things ("ui style" finds Themes, "lag" finds Frame rate) and small typos.

### Changed (more)
- The sidebar's *Friend changes* list moved into the Activity tab (with the full history since
  your first sync, not only 4 days). The sidebar shows the latest activity instead.
- Settings → *Sounds* is now *Notifications*; your new-friend sound settings carry over.
- Full player cards on the map keep their name, status and details at every zoom level.
- Phones: the app itself no longer zooms with pinch or double tap (the map and the image
  viewer still do).

### Added (mouse wheel fix)
- **Settings → Performance → Mouse wheel** (Linux): on some X11 systems (seen with XLibre) the
  map didn't zoom and nothing scrolled with the wheel, because Chromium never passed the wheel
  on. *Fix the mouse wheel* reads the wheel from the X server instead, only when the page got
  nothing, so nothing scrolls twice. Also on with the start option `--wheel-fix` (or
  `VRC_FRIEND_MAP_WHEEL_FIX=1`). Diagnostics counts wheel events from both paths.

### Added (Linux packages)
- **AppImage** again (one file, any distro with GTK 4.14+), now made by the build script
  itself instead of Tauri's packaging.
- **Flatpak** (`.flatpak` file, GNOME 48 runtime): brings its own GTK, so it also runs on
  distros older than the Chromium build otherwise needs.

### Docs
- The project page is short now. The details moved to `docs/`: a full feature list, a guide to
  the app, a step-by-step server sync tutorial (program, Docker / Podman, Pi, Android,
  HTTPS, connecting the app, sharing, logger), installing, privacy, and building.

### Fixed
- **Bio, links, badges and languages were missing on profiles.** VRChat moved them to a new
  endpoint (`/profile/{id}`) in September 2026; the app reads it when a profile is opened.
- Starting the app a second time crashed (Chromium build). Now it brings the running window to
  the front, also from the tray.
- F7 opened Chromium's "caret browsing" question; it and other browser shortcuts (print, save
  page, view source) are ignored now.
- Linux: system notifications no longer play the desktop's own sound on top of the app's.
- A short pause between the event sound and the person's tune.
- Release builds use the Node 24 versions of GitHub's actions (Node 20 is being retired).
- The Chromium build ignored its own switches (they need a `--` in front), so "Unlimited"
  frame rate and Graphics → "Prefer the graphics card" / "Software" did nothing there.

## 0.9.0 (2026-11-13)

### Changed
- **Linux runs on Chromium now.** WebKitGTK, the engine the Linux build used, draws without
  the graphics card on many systems (NVIDIA on X11 reports no hardware acceleration at all),
  so the map got slower the bigger the window. The Linux packages now bring their own
  Chromium (Tauri's not-yet-released CEF runtime), which uses the GPU like Windows and Android
  already do. The download is much bigger (Chromium is in it), and it needs GTK 4.14 or newer
  (Ubuntu / Mint 24.04+, Debian 13+, Fedora 40+, current Arch). There's no AppImage for now
  (Tauri's AppImage packaging for Chromium doesn't finish); the tarball works on any distro.
  `scripts/build-linux.sh --webkit` still builds the old WebKitGTK version.
- The map draws at full frame rate whenever its window has focus, also while it only orbits.

### Added (frame rate)
- **Settings → Frame rate**: a limit from 30 fps up to 360 fps or unlimited (default: match the
  screen). Faster than the screen turns vsync off for the app (Chromium on Linux, WebView2 on
  Windows; needs a restart, which the setting offers).
- **Saving power**: how fast the map moves while the window isn't focused (default 30 fps,
  down to stopping, or no change), and optionally a lower rate after a while without input.
  Any mouse, key or touch input brings the full rate back right away.

### Added
- **Activity tab**: who joined and left your instance, your world changes, VRChat closing or
  crashing (from the game log), and friends coming online, going offline, changing worlds,
  being added or removed. Filters, search, a day-by-day list, kept 4 days on this device.
- **Profile actions**: unfriend, block / unblock, mute / unmute, hide avatar. Each is one
  click, unfriend and block ask first, and like friend requests they go out at most one
  every 3 seconds.
- **Settings → People who aren't friends**: load the profile of everyone in your instance (not
  only the first 25; also a switch in the instance strip), which of their profiles to keep on
  this device (none, potential friends, everyone), and whether to show people you've blocked
  (hidden by default, in the strip, on the map and in the activity log).
- **Settings → Diagnostics**: frame rate, drawing time, canvas size, the GPU the web view uses
  (and a warning when it's software rendering), web engine, environment flags, a quick drawing
  benchmark and a *Copy diagnostics* button.

### Fixed
- Building the Chromium version on systems whose GTK 4 has no Wayland support (X11 only)
  failed looking for `gtk4-wayland`. It now builds for X11 there.
- Scrollbars use the theme's colors (Chromium showed its plain light ones).
- Phones: the profile's close button sat under the status bar and was hard to hit. It's bigger
  now, below the status bar, and stays in place while the profile scrolls.

## 0.8.0 (2026-11-12)

### Added
- **You on the map** (#3). Your picture floats at the weighted middle of the friends you spend
  the most time with and follows them. Nobody is pulled towards you. Double ring and a "You" label.
  Map options → *Show me*.
- **Who's in your instance right now** (#4), from VRChat's log as it's written (desktop, same
  PC as VRChat, no VRChat requests). A strip at the top lists everyone, friends first, one click
  from their profile. Friends who are there get a pink halo on the map. It notices VRChat
  quitting or crashing. Settings → Game logs → *Show who's in my instance right now*.
- **Friend requests from profiles** (#5): *Send friend request*, *Cancel request*, and whether
  they already sent you one. The only call the app makes that changes anything on VRChat. One
  per click, with a 3-second cooldown.
- **People who aren't friends yet** (#6). Map options → *Not friends yet*: in your instance,
  plus people you've spent time with (game logs), plus friends of friends (people at least two
  friends list in shared friend lists). They have a dashed outline and faint lines to the
  friends you share; their hover cards and profiles say "Not a friend yet" and how you're
  connected. Their profiles and mutual friends load in the background, 2.5 s apart, only for
  people shown, at most 200 per session.
- Profiles work for non-friends and for yourself (no circle controls there).
- The demo has a made-up instance with four friends and two strangers.

### Changed
- On the map, non-friend lines are solid and faint rather than dashed, and the "here" strip has
  no shadow. Both were measurably slower to draw in WebKitGTK without a GPU.

## 0.7.4 (2026-11-12)

### Added
- Settings → Graphics → **Map rendering**: *Automatic*, *Prefer the graphics card (GPU)* or
  *Software (CPU only)*, on Linux and Windows. Takes effect after a restart (there is a "Restart now" button). "Prefer the GPU"
  also asks the web view to use the GPU on drivers it would normally avoid. `VRC_FRIEND_MAP_GPU=auto|gpu|software`
  overrides the saved choice, e.g. to get a blank window working again. Variables you set yourself
  are left alone. (Contributed by cldghfuckpanopticon, #2.)

## 0.7.3 (2026-11-11)

### Fixed
- Building from source on systems whose GTK 3 has no Wayland support (X11-only builds, e.g.
  Gentoo with `-wayland`) failed to link with `undefined symbol: gdk_wayland_window_get_wl_surface`.
  The window library always links two GDK Wayland functions, though it only calls them on
  Wayland. The build now detects such a GTK and adds stand-ins for them. `VFM_GDK_WAYLAND=0`
  or `=1` forces the choice. Normal systems build exactly as before.

## 0.7.2 (2026-11-10)

### Fixed
- **Much smoother map on Linux.** WebKitGTK's DMA-BUF renderer made the map's canvas about
  three times slower (measured 17–22 fps → 52–67 fps with the same drawing) and is known to
  misbehave with NVIDIA drivers. The app now uses WebKit's other GPU path. To get WebKit's
  default back, start the app with `VRC_FRIEND_MAP_DMABUF=1`. A `WEBKIT_DISABLE_DMABUF_RENDERER`
  you set yourself is left alone.
- The orbit animation drew the map twice per frame. Now it's once, and only every other frame
  while nothing but the orbit moves: it's under a pixel per frame either way, and it halves the
  cost, which helps laptop batteries. Panning, zooming and dragging stay at full rate.

### Added
- Map options → **Show frame rate**: frames per second, draw time and slowest frame, in the
  corner of the map.

## 0.7.1 (2026-11-10)

### Added
- vfm-server **container image** for Docker and Podman: `ghcr.io/luminoowo/vfm-server`,
  covering amd64, arm64, arm/v7, arm/v6 and 386. It's about 7 MB, runs as an unprivileged
  user and has a health check. Also: a compose file, a Podman Quadlet for systemd, and
  settings through `VFM_*` environment variables (the admin page shows those as fixed).
- `vfm-server healthcheck` command.

### Changed
- In a container, the server's startup message no longer shows the container's internal
  address (set `VFM_PUBLIC_URL` to show the real one).

## 0.7.0 (2026-11-10)

### Added
- **vfm-server**, a small program for a spare or always-on device (Raspberry Pi, old PC,
  NAS, Windows, Mac, Android phone with Termux). It's one file of about 3 MB with no
  dependencies, and its admin page is built in. See [server/README.md](server/README.md).
  - **Logger:** pair it with the app once. It then follows your friends' locations through
    VRChat's live feed 24/7 and counts who is in the same instance as whom. The app merges
    that into circle suggestions.
  - **Exchange:** upload your friend list and activity, download what friends share with
    you. Use any number of servers at once (your own, a friend's, a public one) for
    redundancy.
- Settings → Servers: add servers, join with an invite code, and choose per server what you
  share (friend list, activity) and with whom (all friends, or chosen circles). Friend
  lists you receive appear under Shared lists, update on every sync, and add the mutual
  lines VRChat hides.
- End-to-end encryption, set per server. When it's on, uploads are sealed on your device for
  exactly the people you share with, and the server can't read them. Servers choose
  force-off, optional, recommended or force-on, and the switch follows that: the side a
  server doesn't allow is greyed out, and a (?) explains why. Force-off servers ask before
  every upload, unless you tick "don't ask again". Your own default (server-based, always
  on, always off) applies wherever a server lets you choose.
- Keys stay on the device. Each friend's key is pinned the first time it's seen. A changed
  key is held back until you accept it. A `vfm-key:…` line in a VRChat bio confirms a key
  in their profile. "Copy key to another device" lets your phone and PC read the same
  shares.

### Changed
- Logging out keeps your VRChat login valid when a logger is paired with it, so the logger
  keeps running. Unpair it to stop it.

## 0.6.0 (2026-11-10)

### Added
- Friend groups from friends' live locations: while the app is open (any device), it notes
  which friends are in the same instance, even when you aren't there, and uses that time
  together for group suggestions alongside your game logs. Both sources can be switched
  off. Private instances are hidden by VRChat and don't count.
- Overview tiles filter: point at "in VRChat" or "web / app" to preview, click to apply or
  undo; "friends" clears every filter. Legend entries (statuses, ranks, favorites) work the
  same way, and the Filters menu has a status filter.
- Profiles closer to vrchat.com: VRC+ next to the name, pronouns, "Verified 18+", trust
  rank, represented group, mutual friends and mutual groups, bio with "Read more", linked
  profiles, icons for platform / last login / join date / mutuals.
- Current world card: picture, name, region, instance number and type, how full it is,
  which of your friends are there; click the picture to open the world on vrchat.com, or
  "Launch in VRChat".
- Groups: the represented group is pinned on top; "View all" opens a grid of group cards
  like on the website (banner, icon, description, members, short code). Clicking a group
  opens it in your browser.
- Trust-rank shield next to names on cards (map option, on by default).
- Links open in your browser (world, group, profile and bio links).

### Changed
- Opening a profile from a card now also moves the trust rank, mutual friends, platform and
  status into place; text scales by font size and the banner keeps its proportions.

### Fixed
- Bios and links could go missing: a live "new friend" event replaced the stored profile
  with a partial one. Profiles are now merged, and older ones load again when opened.

## 0.5.1 (2026-11-10)

### Added
- Opening a profile from a card animates: the profile grows out of the card, and the card's
  banner, picture, name and status move to their places in the profile. On phones it grows
  out of the picture you tapped. Respects "reduce motion".

### Fixed
- Dithering brightened the background. It's now zero-mean noise in sRGB, which keeps the
  brightness the same and only breaks up the bands.
- OLED black: the map background is pure black (no gradient, no noise showing).
- Catppuccin themes now use the official Mocha, Macchiato and Latte palettes throughout
  (base/mantle/crust, surfaces, text and subtext, mauve accent), including status colors,
  trust rank colors, line colors, stars and highlights. Nord and Dracula got the same
  treatment.

## 0.5.0 (2026-11-10)

### Added
- Color themes: Dark, OLED black, Light, Catppuccin Mocha / Macchiato / Latte, Nord and
  Dracula (Settings → Display). The map follows the theme too.
- Profiles open as a popup by default (better on phones); the side panel is still
  available under Settings → Display → Open profiles.
- Turning direction for the slowly turning map.

### Changed
- The hover card now grows out of the person's picture: its round picture sits exactly on
  their picture on the map, and it follows them while the map turns or zooms.
- "Each circle in its own spot" also gives people without any lines a spot of their own.
- New defaults: the map turns slowly (medium) and each circle gets its own spot. If you
  still had the old defaults, you get the new ones; choices you made are kept.
- Background gradients are dithered so they don't show bands.

## 0.4.0 (2026-11-10)

### Added
- Profiles are laid out like VRChat's profile page: big banner and picture with a status
  pill, name, status and trust rank, represented group, about me, languages, links, your
  note, a status card ("Offline for 3 days", "In a private world"), badges and groups
  (loaded when you open the profile), plus this app's circles, time together and shared
  friends. Two columns when there's room. Esc closes it.
- Pointing at someone on the map shows their full player card (can be turned off).
- Map gravity options: loners float in a ring (as before), loners gather in one spot,
  everyone close together, or each circle in its own spot.
- "Slowly turn the map": an optional slow orbit around the center.
- New friends: an optional sound (chime, sparkle, pop or bell, with volume) and a pop-in
  animation with rings on the map and in the cards view. A new friend appears in the
  middle of what you're looking at. Works on every device through VRChat's live events.
- Phones start zoomed in further so pictures are recognizable.

### Changed
- Faster map: people off screen aren't drawn, and pictures and cards are drawn once per
  zoom level and reused instead of being redrawn every frame.

### Fixed
- The map options panel could scroll sideways into empty space.

## 0.3.2 (2026-11-10)

### Fixed
- Android: signing in still crashed, now with a `NullPointerException` in
  `RustWebView.getCookies`. Android returns "no cookies" as null before you've
  signed in, and the webview library didn't handle that. The app now reads
  cookies through Android's CookieManager itself.

## 0.3.1 (2026-11-10)

### Fixed
- Android: the app crashed about a second after the VRChat sign-in page opened
  (`NoSuchMethodError: getCookies`). The release build's code shrinker removed
  methods the app calls from Rust; they're now kept, and the build checks for them.
  Logging out on Android had the same problem.

## 0.3.0 (2026-11-10)

### Added
- **Friend groups from game logs** (Windows/Linux): reads VRChat's `output_log` files to see
  who was in the same instance as whom, keeps that history (even after VRChat deletes old
  logs), and suggests friend groups with Louvain community detection. Accept a suggestion as
  a circle, add missing people to an existing circle, dismiss it, or turn on automatic circles.
  Settings for minimum time and days together, group size, overlap, crowd weighting and
  history range.
- Log folders are found automatically on Windows and in every Steam library on Linux
  (other drives, Flatpak, Snap); extra folders can be added.
- Detail panel shows time together and who someone is most often with.
- **Map options**: dots, pictures, compact cards or full VRChat player cards; size and what it
  means (mutuals / time together); line style (friends in common, single color, time
  together, none), thickness, visibility and "only for the person I point at"; spacing;
  circle pull strength; circle outlines and their strength.
- 24 circle colors. New circles get an unused color; after 24 the app generates new
  distinct ones. A color picker shows which colors are taken, and duplicate colors can be
  fixed with one click.
- Data format versions with backups before migrations, tolerant loading of data from newer
  versions (unknown fields are kept), and a note after updating or downgrading.
- Release builds for Windows (installer, MSI, portable), Android (APK), iOS (unsigned IPA for
  sideloading), macOS (universal dmg) and Linux ARM64, built and attached to GitHub Releases
  automatically.
- MIT license.
- Tests for the log parser, group detection, colors and data migrations.

### Fixed
- Avatar preview pictures (4:3) were stretched into circles on the map; they're now cropped.

## 0.2.0 (2026-11-10)

### Added
- Live updates through VRChat's event stream: new friends appear the moment a friend
  request is accepted (on any device), and unfriending, online/offline and status changes
  show up instantly. A "Live" badge shows the connection; full refreshes drop to every
  ~30 minutes while live.
- Map lines are colored by how many friends the two connected people have in common, with
  bands that adapt to your friend list and a legend with the actual numbers. Settings can
  switch back to a single color.
- Sign-in pop-ups on vrchat.com open in a linked window.
- Linux packages: `.deb`, `.rpm`, AppImage and a portable `.tar.gz` with a user-level installer.
- `scripts/build-linux.sh` checks prerequisites and builds any or all Linux formats.
- App version shown in Settings and on the login screen.

### Removed
- "Known since" dates (VRChat doesn't provide friendship dates, so they weren't meaningful).
  The sidebar's list of friends added and removed stays.

## 0.1.0 (2026-11-09)

First build: VRChat login through vrchat.com, friend cards, mutual-friend map, overlapping
circles with drag and drop, filters, shared friend-list export/import, demo mode.
