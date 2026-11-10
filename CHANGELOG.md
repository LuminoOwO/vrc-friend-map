# Changelog

Versions follow [Semantic Versioning](https://semver.org). While the version is 0.x,
minor releases can change behavior.

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
