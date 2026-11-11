# Changelog

Versions follow [Semantic Versioning](https://semver.org). While the version is 0.x,
minor releases can change behavior.

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
