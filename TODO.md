# Ideas for later

Features to consider, not planned for a specific version yet. Add new ones at the bottom of
their round. The bigger, discussed list lives in GitHub issue #14.

Rounds are in the suggested order (2026-11-16): all features first, the UI rework last so it
can be designed around everything. Nothing here is started.

## Bugs found in a test pass (2026-11-23)

Found by clicking through the new features with the demo (PC 1400/1100 px wide, Pixel 7,
English + German). Smoke test (every view, Settings tab, profile, inbox, who's here) had no
errors or raw text keys.

1. ~~Online times: a lone "·" sits at the end of the legend line (it belongs before the counts,
   which wrap to the next line).~~ (fixed)
2. ~~Map toolbar: the Friend groups button doesn't show that the panel is open, and clicking it
   again doesn't close it.~~ (fixed)
3. ~~Friend groups panel: Escape doesn't close it (only the back arrow does), unlike every other
   panel and dialog.~~ (fixed)
4. ~~Phones: Media → Pictures says pictures are looked for in "Pictures/VRChat (Windows) and the
   Proton folder (Linux)", which makes no sense on a phone (VRChat doesn't save pictures there).~~ (fixed)

## Priorities (owner, 2026-11-20)

Work through these in this order, one at a time; the rest of the file is the detail.

1. ~~Bug: devices keep swapping changes~~ (fixed, owner to confirm)
2. ~~Beta UI: the sync status gets cut off~~ (done)
3. ~~Server connection status~~ (done)
4. ~~App and server versions that don't fit together~~ (done)
5. ~~The UI release~~ (done on main, 2026-11-20; goes out as 0.13.0)
6. ~~Sharing choices per account, not per device~~ (done)
7. ~~Notice when the server's VRChat login expires~~ (done; renew from the app with a password: not started, owner to decide)
8. Use the app without logging in to VRChat in it
9. ~~In gaps: Door / Knock sounds, the pause before a person's tune~~ (done, owner to listen)

Not ranked yet: everything under "More (owner, 2026-11-20)", the rest of Round 8 (keyboard
navigation, translations), log out everywhere, the in-VR overlay, the renderer's CPU in the
tray. On hold: Discord rich presence.

## Round 1: fixes and basics

- [x] **Why a sync failed.** Tapping the sync status opens a sync log: every step (VRChat,
  each server, device sync) with time, result and the exact error ("server.example: 404 Not
  Found", "VRChat: 429"), copyable. A sync cut off by switching apps counts as "interrupted",
  retries quietly and isn't shown as failed.
- [x] **Filter menu goes off-screen on phones.** Keep the popover inside the screen.
- [x] **Don't get lost in the void.** The map only scrolls as far as the people on it, plus a
  margin.
- [x] **Checkboxes stuck together on Android** (seen in Settings → People). Spacing.
- [x] **Settings icon** looks like a sun: make it a real cogwheel, and put it back in the top
  right on Android.
- [x] **Hide features not available on this platform** (on by default): Settings hides what
  can't work here; off shows them greyed out with why.
- [x] **Haptics on phones** (off by default): short taps on buttons, toggles, long-press.

- [x] **Read many more linked profiles for age hints** (with *read linked pages* on). Per site
  the most direct public way, each tested before it's turned on:
  - Bluesky (public API), X / Twitter through FxTwitter (its own opt-in switch: the handle goes
    to fxtwitter.com), Mastodon / fediverse (public profile JSON), Misskey, Threads, Tumblr,
    Reddit, Telegram (t.me pages show the bio), Steam, YouTube, Twitch, Kick, TikTok, Instagram
    (often behind a login: try, give up quietly), GitHub, SoundCloud, Last.fm.
  - Link pages: Linktree, Carrd, beacons.ai, bio.link, lnk.bio, solo.to, guns.lol, e-z.bio,
    Throne, Ko-fi, Patreon, VGen, Gumroad, itch.io, Booth.
  - Art sites: Fur Affinity, DeviantArt, ArtStation, Pixiv, Toyhouse, Weasyl.
  - Shows per link whether it could be read ("read", "login needed", "unreachable").

## Round 2: friends and the map

- [x] **Last seen and online history.** Offline friends show "last seen 3 days ago"; each
  friend gets a small heatmap of the hours they're usually online. Built only from this app's
  own syncs, kept on the device.
- [x] **Best time to catch someone:** your usual online hours against a friend's, shown as the
  overlap ("you're both usually on weekdays 20–23").
- [x] **Star friends:** starred people stay at the top of lists and stand out on the map.
- [x] **Quiet hours:** a do-not-disturb schedule for notifications, with exceptions (starred
  friends, chosen circles).
- [x] **Notification rules per circle:** e.g. "Close friends: tell me when anyone comes
  online", without a bell on each person.
- [x] **Friendiversaries:** "You've been friends with X for a year today" (from the friend
  date the app already records).
- [x] **Clusters as circles:** find the friend groups in the graph (community detection) and
  offer them as circles with one click.
- [x] **Bridges:** who connects two of your friend groups; which mutual friend could introduce
  you to a friend of a friend.
- [x] **Drifting apart** (off by default, never shared): people you used to see a lot but
  haven't in a while, as a gentle list to reconnect.
- [x] **Gathering alerts:** "3 of your close friends are in the same instance right now", with
  a button to request an invite.
- [x] **Invite templates:** saved invite / request-invite messages, sent from the map in one
  click.
- [x] **Map time travel:** a slider showing the map as it was a month or a year ago (who
  joined, who drifted, how clusters changed). Needs keeping snapshots of the graph.

- [x] **Friends' local time** ("it's 3 am for them"), with where it comes from:
  - **Verified:** you set their time zone yourself, or they share it through the app (their
    choice). Your own settings sync only between your devices (device sync), never to anyone.
  - **Suggested** until you confirm it, shown as "probably" with the reasons: hints in bio,
    status, pronouns and links ("german fur", flags, city / country names, "EST", "UTC+9"),
    VRChat's languages field, the groups they're in (a group "Germany VRC" points to Germany),
    and their usual online hours (weak). When hints disagree (groups "America" and "Japan"),
    offer the candidates ranked, each with its reasons, and let you pick. Overridable anytime.
- [x] **Snooze a friend:** mute one person's notifications for an hour or until tomorrow,
  without removing their bell.
- [x] **Missed notifications:** a list with read / unread, so a dismissed one isn't gone.
- [x] **Pending friend requests:** the ones you sent and still wait on; cancel old ones.
- [x] **Display name history:** names you've seen someone use (kept on this device), so you
  know who "xX_Neo_Xx" used to be.
- [x] **Your own nicknames:** a private alias per friend, shown on the map instead of or next
  to their name.
- [x] **"Since you were last here":** short summary on opening: who came online, renames, new
  and removed friends.
- [x] **Slot watcher:** a friend's instance is full; notify when a slot opens.
- [x] **Path between two people:** the shortest chain of mutual friends connecting them.
- [x] **Compare two friends:** shared and non-shared mutuals side by side.
- [x] **Your friend list over time:** size, adds and removes per month as a small chart.
- [x] **Shared circles:** a circle you and trusted friends edit together, synced over the
  encrypted sharing.

- [x] **Block reasons** (part of the red flag system, built like the age hints): when you block
  someone (in the app, in game: detected from VRChat's block list, or on the VR watch), pick
  reasons. Shared with friends through the encrypted sharing (preset reasons only; your own
  free text stays on this device), shown on their profile as a red flag ("Blocked by Luna:
  crasher, trolling"). Never a reason about age.
- [x] **Red flags at the top of VRChat notes** (readable in game): a short line the app writes
  first ("⚑ crasher, trolling · blocked by 2 friends"), your existing note moved below it;
  updated when flags change, removed when they're gone, within VRChat's note length.

## Round 3: more from the game logs

- [x] **Instance timeline per day:** when you played (from–to), instances in order with times,
  who joined / left when, video links. A "today" summary.
- [x] **Rankings and stats:** worlds by time, people by time together, who with whom in which
  world, play-time heatmap, longest sessions, streaks, first met, most often together per world.
- [x] **Video player links:** list with time, world, link (copy / open), who requested it where
  the player logs that, titles via oEmbed (optional), search, export, "now playing" in who's here.
- [x] **Screenshots:** gallery of the VRChat pictures folder; each picture tagged with the world
  and people present at that minute (from the logs); full-screen, copy, save, share. Phone: its
  own pictures (photo permission) and the PC's through device sync.
- [x] **Other people's avatars from the log:** the log records which avatar each person in your
  instance switches to; show their current avatar and a history on their profile.

- [x] **Diary:** an automatic journal per day (worlds, people met, screenshots, your own
  short note), with "on this day a year ago".
- [x] **Year in review:** a Wrapped-style summary of your year; private unless you export it
  as a picture.
- [x] **Popular among your friends:** the worlds your friends visit most this week (from what
  friends share and your own logs).

- [x] **Photo albums per person:** with screenshots tagged by who was there, each profile shows
  "your pictures with them".
- [x] **Instance replay:** scrub through a past evening in the timeline and watch who was where
  on the map, minute by minute (game logs + map time travel).

## Round 4: VRChat content in the app

- [x] **Friends in the same instance.** (Clarified 2026-11-16.) Clicking the player pictures
  under a friend's world card opens an instance view: world picture, instance type, region,
  owner, people / slots, every friend inside (clickable), "and N others" (VRChat doesn't list
  the rest; your own instance shows everyone from the game log).
- [x] **Groups ("clubs"):** description, banner, rules, members (if visible), posts and
  announcements, open instances, gallery. Worlds: pictures, description, open instances.
- [x] **Group events:** calendar with details.
- [x] **Group management**, as far as your roles allow: members and roles, join requests,
  invites, kick / ban, posts and announcements, gallery, audit logs, creating group instances,
  group settings. Every change confirmed; requests spaced out.
- [x] **Notes on people:** VRChat's own user notes shown and editable on profiles.
- [x] **Favorites:** VRChat's favorite friend groups (Group 1–3) and world / avatar favorite
  lists: show and edit; filter the map by a favorite group.
- [x] **Avatars:** your own fully (current, uploaded, favorites, details, platforms,
  performance); others as far as VRChat allows (picture, name from the image file) plus the
  game-log names (round 3).
- [x] **Prints, stickers, emojis** (VRC+): view, download, delete, and upload with a cropper
  that fits each kind (animated emojis too).
- [x] **Custom sounds per friend.** (Clarified 2026-11-16.) Per-event sound files exist; add a
  sound per friend (from the bell on their profile) that plays instead of their generated tune.

- [x] **World notes and tags:** your own notes and tags on worlds.
- [x] **Join from the PC app:** launch VRChat straight into a friend's instance or a world
  (VRChat launch links; on Linux through Steam / Proton).
- [x] **Open VRChat links in the app:** paste or share any VRChat link (profile, world, group,
  instance) and the app opens it, including from Android's share menu.

## Round 5: phone in the background

- [x] **Android background, three ways** (pick in Settings):
  1. Push through UnifiedPush (Sunup, ntfy…), sent by your PC app or your own server (round 6);
     no extra battery on the phone.
  2. The app's own background connection with a permanent notification.
  3. The same, quiet: a hidden, silent notification, so on Android 13+ it only shows under
     "Active apps" (like Sunup).
- [x] **Game invites as notifications** (and invite requests), as fast as the connection
  allows. iPhone: only while the app is open (no background connections without Apple push).
- [x] **Custom sounds on the phone in the background:** the background service plays the app's
  own sound (per event, per friend); the system notification stays silent.
- [x] **More than 60 fps on Android:** ask for the screen's top refresh rate (and raise the
  default limit on phones that can). iPhone ProMotion: try; uncertain for web content.
- [x] **Game logs on the phone through Shizuku or root.** (Root done; Shizuku still open: needs its API library and testing on a device.) VRChat's logs sit in its app folder,
  which other apps can't read since Android 11. Shizuku (needs starting again after each reboot
  without root) or root (`su`: rooted phones, or a rooted Quest such as with Singularity) can
  read them.
- [x] **Game-log data from the PC to the phone**, local first: on the same network directly
  from the PC app (time together, groups, activity, live who's here); through the server only
  with a separate server option, off by default.

- [x] **Android home-screen widget:** starred friends online right now.

## Round 6: server

- [x] **Your VRChat login on your own server** (Done, with hand-off; *appear offline* still open: not researched.) (owner only). Set up only in the admin dashboard
  (username, password, 2FA code); the app can't, and other users never get near it. Stored
  encrypted. Keeps VRChat's live connection 24/7 for:
  - pushing invites and friend events to your phone (UnifiedPush / Sunup);
  - logging friends' locations around the clock, PC off.

  Caveats: VRChat may end the session now and then (new 2FA in the dashboard); a server IP can
  trigger VRChat's security checks.
  - **Appear offline while connected:** to check whether VRChat allows it at all. An open API
    session normally shows you as "active on the website"; if there's a way to keep the live
    connection without that, make it a switch (note: you may not be invitable then).
  - **Hand-off to the PC:** a server setting, default "hand off": when the PC app starts, the
    server lets go of the connection and the PC session takes over; when the PC app stops (no
    heartbeat for a few minutes), the server picks it up again. Alternative: "keep it on the
    server".
- [x] **Shared cache of public VRChat info** (separate server option, on by default; switches
  for worlds, groups, avatars, each on its own): clients put public info they fetched on the
  server, others read it from there first. Only public data; every entry shows its age and
  expires; "load fresh from VRChat" button.
- [x] **Web dashboard:** small, mobile-friendly. Multiple admin accounts (login, password,
  authenticator codes: standard TOTP, so Ente Auth / Aegis / Google Authenticator work). 2FA on
  by default, first setup with a one-time code from the server console, can be turned off.
- [x] **Who uses the server:** VRChat name and ID, registered, last seen, app version, IP,
  storage used (not contents).
- [x] **Bans:** by account and by IP (caveats: changing home IPs, mobile carriers share IPs,
  reverse proxies need a trusted-proxy setting). Banned users get the reason (if given) and the
  owner's appeal / support email, shown in the app.
- [x] **Less load on the server:** (Done except own devices syncing directly, which is the device-to-device item below.) "nothing changed" answers instead of resending, one open
  connection instead of polling, own devices syncing directly.
- [x] **Device-to-device sync:** (Done: direct at home, else live through the server; directly across routers (hole punching) not done.) devices on the same network find each other and sync directly
  (circles, notes, settings, notification sounds); the server only says "your other device is
  online" over a light open connection. Outside the network: direct if the routers allow it,
  else passed through the server live without storing (server option).
- [x] **Notification sounds synced between your devices** through the device-to-device sync
  (server setting whether it may pass them along; never stored there).
- [x] **Settings sync, finer:** exists since 0.11 (*Also sync settings*); add choosing which
  groups of settings sync, and per-device overrides.
- [x] **Harder for server owners to snoop:** a "never send anything unencrypted" switch in the
  app; a short code per friend to compare once (key verification) and a loud warning when a
  friend's key changes; hide more of who shares with whom.

## Round 7: extras

- [x] **OSC** (VRChat's official interface, PC and Quest over the network; only your own data):
  chatbox messages ("Lumi just came online", now playing, play time), a history of your own
  avatars, avatar toggles from the app, AFK / muted shown in the app.
- [x] **Steam play time into your bio:** read VRChat's play time from Steam's files (or the web
  API with a key) and update a marked line in your VRChat bio once a day ("⏱ 2,431 h in
  VRChat"), leaving the rest alone, within 512 characters. Plus play time per day in the
  timeline.

- [ ] **In-VR overlay:** a small wrist panel in WayVR (Linux) and SteamVR (Windows): who's
  here, recent notifications, a mini map. Optional text-to-speech for joins.
  - **Block dialog on the watch:** when you block someone, a small dialog on the WayVR watch
    with their name, picture and age hint ("probably over 18"), the block reason chips and
    Skip.
- [x] **Backup and export:** notes, circles, settings and sounds in one encrypted file, to move
  devices without a server.
- [x] **Multiple VRChat accounts:** (Done as mixed friend lists on one map, with per-account live updates and notifications and an optional act-as; adding accounts on phones still open.) switch between main and alt; each has its own map and data.

- [x] **Tray menu extras:** online count, starred friends online, quick status switch.
- [x] **Now playing in your status** (optional): the song from your music player (MPRIS on
  Linux) in your status text, with a template and an off switch.
- [ ] **Discord rich presence** (On hold, owner 2026-11-19.) (optional): "in VRChat", never showing private instances unless
  you allow it.

## Round 8: UI rework (last)

- [x] **New beta UI** behind a "New beta UI" setting (off by default); the current UI stays
  untouched and primary until we switch over. Own folder (`src/ui2/`), sharing the store, sync
  and graph; switches live; a "Back to classic UI" option and a `--classic-ui` start option.
  Designed around every feature from rounds 1–7.
  - Desktop: icon rail (Map, People, Here now, Activity, Notifications, Settings), map nearly
    full-window with a slim top bar (search, filter chips), person panel with tabs (Overview,
    Notes, Age, History, Sharing), who's here as a floating card, Ctrl+K command palette,
    calmer look.
  - Phone (redone 2026-11-21 in the computer's look): frame-style title bar, bottom tabs
    Map · People · Party · Insights · Menu, profiles / settings (Discord style) / filters full
    screen, 44 px touch targets, haptics.
- [ ] **Accessibility:** text size, reduced motion, colorblind-safe status colors, full
  keyboard navigation. (2026-11-21: every control has a name, focus rings show, dialogs take,
  keep and return the focus (`src/focustrap.ts`). Arrow keys in the menus and around the map (`src/mapkeys.ts`)
  done too. First screen-reader pass done (dialogs modal + named, pressed states,
  landmarks). Arrow keys in People cards, Activity and Online now done. Still open: testing with a real screen reader (Orca / NVDA / TalkBack).)
- [x] **Easier server connections.** (Invite links done; the server settings are sorted by purpose in the beta UI.) (Owner, 2026-11-18: setting one up is confusing.) Joining
  should be one step: the admin page makes an invite link that holds the address and the invite
  code, and the app opens it (paste or share) and joins. In the app, the server settings start
  from what you want (share with friends, sync my devices, log around the clock) and keep the
  rest under "More options"; plain words for status ("Connected, live", "Needs an update").
- [ ] **Translations:** move all text into one place so friends can add languages.
  (2026-11-21: step 1 (`src/i18n`, setting, tests, `docs/translating.md`) and step 2 (all ~2,040
  texts in en.json, dates/numbers in the app language) done. Step 3 under way: section 1 (menus,
  People, filters, Party, map; 339 texts) in de, fr, es, it, pl, pt-BR, ru. Next: sections 2+
  (~1,700 texts) for those, then ja, zh-CN, zh-TW, the other EU languages by speakers, then
  uk, ko, tr, id, vi, th, hi; Arabic/Hebrew need right-to-left first. A few complex sentences
  are still English in the code. Owner: make the repo public + open-source licence, set up
  Weblate or Crowdin on `src/i18n/locales/*.json`.)

## Round 9: the server's VRChat login (owner, 2026-11-18)

- [ ] **Use the app without logging in to VRChat in it:** the server owner's app does everything
  through their own server's VRChat login (friends, live updates, profiles, writes), so the app
  itself never holds a VRChat session. Only for the owner of that server (the account paired as
  its logger); everyone else logs in as before.
- [x] **Tell the owner when the server's VRChat login expires:** (done 2026-11-20 in the app and as a push; the admin page shows the logger's message) push to their devices and a
  notice in the app and on the admin page ("Your server's VRChat login expired: log in again").
  - [ ] **Renew it from the app** (a server setting, off by default for the security-conscious):
    the owner enters username, password and 2FA code in their own app, sent sealed to the
    server. Off: renewing stays on the admin page only.
- [x] **Log out everywhere** (2026-11-21: done for every device where the app syncs; VRChat's API has no "end all sessions" (only PUT /logout for one session), so the app points to a password change on vrchat.com) (in case an account was hacked): end every VRChat session of your
  account, not just this device's. To research first: whether VRChat's API offers this at all
  (changing the password may be the only way); if not, say so and link to VRChat's own page.

## Notifications and sharing (owner, 2026-11-18)

- [x] **Door and Knock sounds:** hard to hear; make them clearer (louder attack, more distinct).
- [x] **Pause between the event sound and the person's own tune:** a little longer by default,
  and a setting to choose it freely.
- [x] **Sharing choices per account, not per device:** (done 2026-11-20: `serverShare` in the device-sync data, newer `shareAt` wins) which friends go into what you share,
  and who may get it, are set per device today, which can conflict between devices. Keep them
  with the account (synced), per server.

## Beta UI and servers (owner, 2026-11-20)

- [x] **Server connection status:** (Done for the beta UI: top-bar chip and the phone's Me page.) show whether the app is connected to each server (and live)
  where you see your servers and in the main view, not only in the sync log.
- [x] **Beta UI: the sync status gets cut off** (the sync line / log in the beta shell). Fix the
  layout so it fits on phones and narrow windows.
- [x] **Beta UI: less confusing**, (Icons and a description for every Settings section, a server's settings in sections; more per-option icons later.) with icons next to many options so they're quicker to find
  and recognize.
- [x] **Bug: devices keep swapping changes** (fixed 2026-11-20: key order in comparisons, `ui.beta` in the payload, unsynced settings counted as changes; owner to confirm) ("Took over changes from your other devices" on
  almost every sync, and the server answered "slow down"). Check once phone and PC both run
  0.12.2+ (the newer change wins since then); if it still happens, find which value flips.

## Compatibility (owner, 2026-11-20)

- [x] **App and server versions that don't fit together:** (done 2026-11-20: `src/compat.ts` MIN_SERVER, server `MIN_APP` in `api.rs`, both 0.12.0) the server says the oldest app
  version it works with, the app the oldest server version; when they don't fit, the app shows
  "This server needs a newer app" (or "is too old for this app") with what to update, instead of
  failing in odd ways, and stops syncing with it until then.

## More (owner, 2026-11-20)

- [ ] **Move your setup to another device:** export the app's settings in a form every platform
  reads, and import them there, so a new device doesn't need setting up by hand. With a QR code
  for phones: every platform can show one, and scanning works wherever there's a camera (phones,
  and PCs that have one), else paste or open the file.
- [x] **First setup with a server is too slow:** (done 2026-11-20: default 2000, `requests_per_10min` / `VFM_REQUEST_LIMIT` / admin page) a new device's first sync can hit the server's
  request limit (600 per account per 10 minutes; "slow down"). Raise the default and make it a
  server setting; maybe a higher allowance in the first minutes after joining.
- [x] **A better admin page for vfm-server**, in the spirit of the beta UI. (2026-11-21: the app's look, a menu with one page at a time, "At a glance", tabs on phones.)
- [x] **Invites in the Activity log:** when someone invites you (or asks for an invite), it shows
  there too, not only as a notification.
- [x] **More themes, and your own colors** (pick the main colors yourself). (8 themes + own colors done 2026-11-20)
- [ ] **Keep the main thread free on every platform:** move heavy work off it so the window
  stays responsive (the Linux spinning is fixed; this is the general version).
  (2026-11-21: measured long tasks per action in the browser, normal and 4x slowed phone. Fixed
  the worst: opening a profile (time zone hints) 1.4 s → 0.12 s on the slow phone. Left: Party and
  Settings ~250 ms on the slow phone, mostly layout, not script; nothing over 60 ms on a PC.)
- [ ] **A general check of every feature on every platform** (very late, before 1.0).
- [ ] **Split the server's sync part from the rest:** the part that syncs between your own
  devices should be able to run on its own (e.g. a public sync server), separate from sharing
  with friends.

## Open after the Lobby redesign (2026-11-20, evening)

- [x] **Map still not smooth on the owner's PC** (RTX 3080 Ti, GPU mode, 2560x1440 at 60 Hz). Ask for (2026-11-21: solved; the slow one was the WebKit dev build, the real Chromium app runs at 60 fps; test with `npm run chromium`)
  Map options → Show frame rate (fps, draw ms, slowest) to see whether drawing or the browser is slow.
- [x] **Views inside Lobby still look like the classic ones** (People, Activity, Insights, Logbook, (2026-11-21: restyled)
  VRChat, Lists); the mockup (`../mockup-redesign/App2.dc.html`) redesigns them too.
- [ ] Owner to check: Lobby menu, settings in the frame, party banner/fold, the new logo, the
  picture flying into the profile, device sync on phone + PC, Door/Knock sounds.
- [ ] Decide: minimum versions (both 0.12.0); renewing the server login from the app with a password;
  QR setup move; better admin page; splitting the server's sync part.
- [x] Before 0.13.0: the "New beta UI" texts in Settings still call it beta/classic default. (2026-11-21: done, it's now a "Classic interface" switch)

## Redesign notes (owner, 2026-11-20, from the mockups)

- [x] Keep the classic **Activity log** (filter chips, day sections): one of the most important features.
- [x] Sliders like VRChat's: a rounded bar that fills, the percent on the right.
- [x] Side panels can be resized and snap back near their default width; they can collapse
  completely, leaving a small "wing" tab on the edge to reopen them.
- [x] Settings: an icon on every page; the group headings (User, App, People, ...) sit a bit
  further left than the pages and have icons too, so headings and buttons are easy to tell apart.
- [x] Keep the settings cogwheel.
- [x] Phone: "Online now" lives in the People tab.
- [x] Side panel holds more than "Online now": where you are (world card with everyone there),
  the Overview tiles (hover says what a click does, click filters the map), Online now with each
  world collapsed (hover peeks at who's there, click keeps it open), and recent Activity. Each
  part can be folded.
- [x] Top bar: not Mac-like. Docked, flat, game-menu style (liquid glass stays inside its own theme later).
- [x] The side panel can sit on the left or the right.
- [x] Profiles open as a popup in the middle, like the classic UI (not in the side panel).
- [x] Online now and Activity scroll inside their own space, so Activity is always visible.
  New Activity entries show a dot; scrolled down, a "back to top" button appears.
- [x] Settings: your account card sits at the top of the settings sidebar (where "User" is), not at the bottom.
- [x] Notifications get their own bell button in the top right, after the server status.
- [x] Server status dropdown also shows which of your devices are online and which servers each one is connected to.
- [x] Clicking your own bubble (map) or your picture (top left) opens your own profile.
- [x] No gradients on the top bar tabs.
- [x] Clicking a world in "Online now" opens a world overview popup (no expanding inside the side panel).
- [x] Put the OSC chatbox features aside: taken out of the app (may be scrapped for good; the owner's other programs do the same).

## Parked

- [ ] **"Liquid glass" theme** like Apple's, on every platform (put aside for now).

## Bored tasks (owner, 2026-11-21)

Only once everything else is done and total perfection is the task.

- [ ] **Why Chromium in the app gets no XInput2 wheel / popup input on XLibre** (Gentoo + Xfce +
  XLibre; Chromium 146 on the same system is fine, and so is the app on Mint/X.Org). His mouse
  has smooth-scroll valuators (increment 120) with emulated buttons 4/5, and the raw events
  reach the root window, so the wheel fallback works there; it's now on by default, and dropdown
  lists are drawn in the page. Root cause in CEF / Chromium 151 (or the way its window sits
  inside the GTK 4 window) still unknown.
