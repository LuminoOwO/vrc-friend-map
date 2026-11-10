# Changelog

Versions follow [Semantic Versioning](https://semver.org). While the version is 0.x,
minor releases can change behavior.

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
