# Ideas for later

Features to consider, not planned for a specific version yet. Add new ones at the bottom of
their round. The bigger, discussed list lives in GitHub issue #14.

Rounds are in the suggested order (2026-11-16); nothing here is started.

## Round 1: fixes and basics

- [ ] **Why a sync failed.** Tapping the sync status opens a sync log: every step (VRChat,
  each server, device sync) with time, result and the exact error ("server.example: 404 Not
  Found", "VRChat: 429"), copyable. A sync cut off by switching apps counts as "interrupted",
  retries quietly and isn't shown as failed.
- [ ] **Filter menu goes off-screen on phones.** Keep the popover inside the screen.
- [ ] **Don't get lost in the void.** The map only scrolls as far as the people on it, plus a
  margin.
- [ ] **Checkboxes stuck together on Android** (seen in Settings → People). Spacing.
- [ ] **Settings icon** looks like a sun: make it a real cogwheel, and put it back in the top
  right on Android.
- [ ] **Hide features not available on this platform** (on by default): Settings hides what
  can't work here; off shows them greyed out with why.
- [ ] **Haptics on phones** (off by default): short taps on buttons, toggles, long-press.

## Round 2: UI rework

- [ ] **Mockups first** (desktop and phone), then build. The app is getting cluttered and the
  phone version feels like a ported desktop app.
  - Phone: bottom tab bar, profiles and settings as full-screen pages you swipe away, bigger
    touch targets, fewer controls at once.
  - Desktop: calmer sidebar with collapsible sections, shorter top bar, consistent spacing.

## Round 3: more from the game logs

- [ ] **Instance timeline per day:** when you played (from–to), instances in order with times,
  who joined / left when, video links. A "today" summary.
- [ ] **Rankings and stats:** worlds by time, people by time together, who with whom in which
  world, play-time heatmap, longest sessions, streaks, first met, most often together per world.
- [ ] **Video player links:** list with time, world, link (copy / open), who requested it where
  the player logs that, titles via oEmbed (optional), search, export, "now playing" in who's here.
- [ ] **Screenshots:** gallery of the VRChat pictures folder; each picture tagged with the world
  and people present at that minute (from the logs); full-screen, copy, save, share. Phone: its
  own pictures (photo permission) and the PC's through device sync.
- [ ] **Other people's avatars from the log:** the log records which avatar each person in your
  instance switches to; show their current avatar and a history on their profile.

## Round 4: VRChat content in the app

- [ ] **Friends in the same instance.** (Clarified 2026-11-16.) Clicking the player pictures
  under a friend's world card opens an instance view: world picture, instance type, region,
  owner, people / slots, every friend inside (clickable), "and N others" (VRChat doesn't list
  the rest; your own instance shows everyone from the game log).
- [ ] **Groups ("clubs"):** description, banner, rules, members (if visible), posts and
  announcements, open instances, gallery. Worlds: pictures, description, open instances.
- [ ] **Group events:** calendar with details.
- [ ] **Group management**, as far as your roles allow: members and roles, join requests,
  invites, kick / ban, posts and announcements, gallery, audit logs, creating group instances,
  group settings. Every change confirmed; requests spaced out.
- [ ] **Notes on people:** VRChat's own user notes shown and editable on profiles.
- [ ] **Favorites:** VRChat's favorite friend groups (Group 1–3) and world / avatar favorite
  lists: show and edit; filter the map by a favorite group.
- [ ] **Avatars:** your own fully (current, uploaded, favorites, details, platforms,
  performance); others as far as VRChat allows (picture, name from the image file) plus the
  game-log names (round 3).
- [ ] **Prints, stickers, emojis** (VRC+): view, download, delete, and upload with a cropper
  that fits each kind (animated emojis too).
- [ ] **Custom sounds per friend.** (Clarified 2026-11-16.) Per-event sound files exist; add a
  sound per friend (from the bell on their profile) that plays instead of their generated tune.

## Round 5: phone in the background

- [ ] **Android background, three ways** (pick in Settings):
  1. Push through UnifiedPush (Sunup, ntfy…), sent by your PC app or your own server (round 6);
     no extra battery on the phone.
  2. The app's own background connection with a permanent notification.
  3. The same, quiet: a hidden, silent notification, so on Android 13+ it only shows under
     "Active apps" (like Sunup).
- [ ] **Game invites as notifications** (and invite requests), as fast as the connection
  allows. iPhone: only while the app is open (no background connections without Apple push).
- [ ] **Custom sounds on the phone in the background:** the background service plays the app's
  own sound (per event, per friend); the system notification stays silent.
- [ ] **More than 60 fps on Android:** ask for the screen's top refresh rate (and raise the
  default limit on phones that can). iPhone ProMotion: try; uncertain for web content.
- [ ] **Game logs on the phone through Shizuku or root.** VRChat's logs sit in its app folder,
  which other apps can't read since Android 11. Shizuku (needs starting again after each reboot
  without root) or root (`su`: rooted phones, or a rooted Quest such as with Singularity) can
  read them.
- [ ] **Game-log data from the PC to the phone**, local first: on the same network directly
  from the PC app (time together, groups, activity, live who's here); through the server only
  with a separate server option, off by default.

## Round 6: server

- [ ] **Your VRChat login on your own server** (owner only). Set up only in the admin dashboard
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
- [ ] **Shared cache of public VRChat info** (separate server option, on by default; switches
  for worlds, groups, avatars, each on its own): clients put public info they fetched on the
  server, others read it from there first. Only public data; every entry shows its age and
  expires; "load fresh from VRChat" button.
- [ ] **Web dashboard:** small, mobile-friendly. Multiple admin accounts (login, password,
  authenticator codes: standard TOTP, so Ente Auth / Aegis / Google Authenticator work). 2FA on
  by default, first setup with a one-time code from the server console, can be turned off.
- [ ] **Who uses the server:** VRChat name and ID, registered, last seen, app version, IP,
  storage used (not contents).
- [ ] **Bans:** by account and by IP (caveats: changing home IPs, mobile carriers share IPs,
  reverse proxies need a trusted-proxy setting). Banned users get the reason (if given) and the
  owner's appeal / support email, shown in the app.
- [ ] **Less load on the server:** "nothing changed" answers instead of resending, one open
  connection instead of polling, own devices syncing directly.
- [ ] **Device-to-device sync:** devices on the same network find each other and sync directly
  (circles, notes, settings, notification sounds); the server only says "your other device is
  online" over a light open connection. Outside the network: direct if the routers allow it,
  else passed through the server live without storing (server option).
- [ ] **Notification sounds synced between your devices** through the device-to-device sync
  (server setting whether it may pass them along; never stored there).
- [ ] **Settings sync, finer:** exists since 0.11 (*Also sync settings*); add choosing which
  groups of settings sync, and per-device overrides.
- [ ] **Harder for server owners to snoop:** a "never send anything unencrypted" switch in the
  app; a short code per friend to compare once (key verification) and a loud warning when a
  friend's key changes; hide more of who shares with whom.

## Round 7: extras

- [ ] **OSC** (VRChat's official interface, PC and Quest over the network; only your own data):
  chatbox messages ("Lumi just came online", now playing, play time), a history of your own
  avatars, avatar toggles from the app, AFK / muted shown in the app.
- [ ] **Steam play time into your bio:** read VRChat's play time from Steam's files (or the web
  API with a key) and update a marked line in your VRChat bio once a day ("⏱ 2,431 h in
  VRChat"), leaving the rest alone, within 512 characters. Plus play time per day in the
  timeline.

## Parked

- [ ] **No scrolling / zooming on a friend's Gentoo + Xfce + XLibre (X11) system.** Workaround
  shipped (*Fix the mouse wheel* / `--wheel-fix`), but it didn't help on his system yet; parked
  since WayVR works for him. Still open: why Chromium in the app gets no wheel there (not keyd:
  same with keyd stopped). The same AppImage scrolls fine on Mint (X.Org), and Chromium 146
  scrolls fine on his system, so it's our app (CEF / Chromium 151, or the way its window sits
  inside the GTK 4 window) with his X server. `xinput test-xi2` shows only *emulated* wheel
  buttons (4/5); Chromium ignores those when it expects smooth-scroll values instead. Needs: the
  full xinput output (are there Motion events with scroll values?) and `xinput list --long` for
  his mouse.
