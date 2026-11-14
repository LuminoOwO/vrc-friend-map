# Changelog

Versions follow [Semantic Versioning](https://semver.org). While the version is 0.x,
minor releases can change behavior.

## 0.9.0 (2026-11-14)

### Changed
- **Linux runs on Chromium now.** WebKitGTK, the engine the Linux build used, draws without
  the graphics card on many systems (NVIDIA on X11 reports no hardware acceleration at all),
  so the map got slower the bigger the window. The Linux packages now bring their own
  Chromium (Tauri's not-yet-released CEF runtime), which uses the GPU like Windows and Android
  already do. The download is much bigger (Chromium is in it), and it needs GTK 4.14 or newer
  (Ubuntu / Mint 24.04+, Debian 13+, Fedora 40+, current Arch), or the Flatpak.
  `scripts/build-linux.sh --webkit` still builds the old WebKitGTK version.
- The map draws at full frame rate whenever its window has focus, also while it only orbits.

### Added (frame rate)
- **Settings → Frame rate**: a vsync switch (on by default; off needs the Chromium build or
  Windows and a restart, which the setting offers) and a frame-rate limit you type in:
  60 by default, -1 for unlimited, 0 for the screen's rate. With vsync off the app sleeps
  between frames instead of asking for frame after frame.
- **Saving power**: the frame rate while the window isn't focused (default 30) and, optionally,
  after a while without input (0 stops the map moving, -1 means no change). Any mouse, key or
  touch input brings the full rate back right away.

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
- Building the Chromium version on systems whose GTK 4 has no Wayland support (X11 only)
  failed looking for `gtk4-wayland`. It now builds for X11 there.
- The Chromium build ignored its own switches (they need a `--` in front), so "Unlimited"
  frame rate and Graphics → "Prefer the graphics card" / "Software" did nothing there.
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
