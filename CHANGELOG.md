# Changelog

Versions follow [Semantic Versioning](https://semver.org). While the version is 0.x,
minor releases can change behavior.

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
