# Installing and updating

Downloads are on the [Releases page](https://github.com/LuminoOwO/vrc-friend-map/releases).
`SHA256SUMS` lists a checksum for every file.

## Windows 10 / 11

Take `…_windows-x64-setup.exe` (normal installer). The `.msi` is the same thing for managed
PCs, and `…-portable.exe` runs without installing.

The app isn't code-signed, so Windows may say it's unrecognized: *More info → Run anyway*.

## Linux

| File (example: 0.9.0 on x86_64) | For | Install |
|---|---|---|
| `vrc-friend-map_0.9.0_amd64.deb` | Debian, Ubuntu, Linux Mint, Pop!_OS | `sudo apt install ./vrc-friend-map_0.9.0_amd64.deb` |
| `vrc-friend-map-0.9.0-1.x86_64.rpm` | Fedora, RHEL/Alma/Rocky, openSUSE | `sudo dnf install ./vrc-friend-map-0.9.0-1.x86_64.rpm` (openSUSE: `sudo zypper install …`) |
| `vrc-friend-map-0.9.0-linux-x86_64.tar.gz` | Arch and any other distro | unpack, then `./install.sh` (per user, no root; `./install.sh --uninstall` removes it) |

ARM64 builds say `arm64` (deb) or `aarch64` (the others) instead of `amd64`/`x86_64`.
Check the files with `sha256sum -c SHA256SUMS --ignore-missing`.

**Requirements.** Since 0.9.0 the Linux app comes with its own **Chromium**, which draws the
map on the graphics card. That makes the download much bigger than before (~110–140 MB), and
it needs:

- **GTK 4.14 or newer**: Ubuntu / Linux Mint 24.04+, Debian 13+, Fedora 40+, current Arch,
  openSUSE Tumbleweed. The .deb and .rpm pull it in by themselves.
- No AppImage for now: Tauri's AppImage packaging for Chromium doesn't work yet. The tarball
  runs on any distro.

On older systems, [build](building.md#linux) the previous WebKitGTK version with
`scripts/build-linux.sh --webkit`.

## Android 7+

Take `…_android.apk` and allow installing from your browser or file manager when asked.
Updates install over the old version and keep your data.

## iPhone / iPad

`…_ios-unsigned.ipa`. Apple only allows signed apps, so this needs a sideloading tool that
signs it with your own Apple ID (AltStore, SideStore, Sideloadly). With a free Apple ID it has
to be refreshed every 7 days. Not tested on real devices yet.

## Mac

`…_macos-universal.dmg`. It isn't notarized: right-click the app → *Open* the first time.
VRChat doesn't run on macOS, so the game-log features don't apply there.

## Server

`vfm-server-<version>-<platform>` or the container image `ghcr.io/luminoowo/vfm-server`. See the
[server sync tutorial](server-setup.md).

## Updating, going back, switching formats

Install a newer (or older) version over the old one. Your circles, cache and settings stay
where they are ([where data lives](privacy.md#where-data-lives)):

- **Upgrading:** every stored file has a format number. Before a new version converts a file,
  it saves a copy in `store/backups/`. The app shows what's new after an update.
- **Going back to an older version:** the older app still loads the data. Anything it doesn't
  understand is written back unchanged, so going forward again loses nothing. It makes a
  backup first and tells you the data came from a newer version.
- **Game-log history** has its own format number. A version that finds history from a newer
  format leaves it alone.
- **Packages:**
  - `.deb` and `.rpm` upgrade in place. To go back: `sudo apt install ./older.deb
    --allow-downgrades`.
  - The Windows installer upgrades in place; uninstall first to go back (your data stays).
  - Android updates install over the old app as long as both are official release builds
    (same signing key).

Versions follow [Semantic Versioning](https://semver.org); changes are in the
[changelog](../CHANGELOG.md).

## Known limits

- VRChat's API is unofficial and can change without notice. If something breaks after a
  VRChat update, check the community docs at https://vrchat.community.
- Live updates only arrive while the app runs; it catches up when it starts. A
  [server logger](server-setup.md#6-turn-on-the-logger) fills that gap for time together.
- The Linux build uses Tauri's Chromium runtime before Tauri has released it. If the window
  stays blank, crashes or acts up, please open an issue with Settings → Diagnostics copied in.
- `VRC_FRIEND_MAP_GPU=auto|gpu|software` overrides Settings → Graphics from the command line.
  In the WebKitGTK build (`--webkit`), `VRC_FRIEND_MAP_DMABUF=1` keeps WebKit's DMA-BUF
  renderer, which the app otherwise turns off.
- People who hide their mutual connections show up without lines, by design.
- Game-log features need the desktop app on the PC that runs VRChat. Quest and phone sessions
  aren't in any log the app can read.
- iPhones can't run vfm-server; they can use servers.
