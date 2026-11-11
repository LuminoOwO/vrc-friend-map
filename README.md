# VRC Friend Map

A local app that maps your VRChat friends: VRChat-style friend cards, a network map where
lines connect friends who are friends with each other (VRChat "mutuals"), your own
overlapping friend circles, filters, live updates, and comparisons with friend lists other
people share with you.

One codebase, built with [Tauri 2](https://v2.tauri.app): a web UI (React + TypeScript + d3)
on top of a small Rust core. Releases are built for **Windows, Linux, Android, iOS
(sideload) and macOS**. Free and open source under the [MIT license](LICENSE).

## Download

Get the newest version from the [Releases page](https://github.com/LuminoOwO/vrc-friend-map/releases).
File names follow one pattern: `vrc-friend-map_<version>_<platform>-<arch>`, except the Linux
packages, which follow each package format's own naming rules.

| You have | Take | Notes |
|---|---|---|
| Windows 10/11 | `…_windows-x64-setup.exe` | Normal installer. The `.msi` is the same thing for managed PCs; `…-portable.exe` runs without installing. Windows may warn that the app is unrecognized (it isn't code-signed): *More info → Run anyway*. |
| Linux | see [Installing on Linux](#installing-on-linux) | `.deb`, `.rpm`, AppImage or tarball; x86_64 and ARM64. |
| Android 7+ | `…_android.apk` | Allow installing from your browser/file manager when asked. Updates install over the old version and keep your data. |
| iPhone / iPad | `…_ios-unsigned.ipa` | Apple only allows signed apps, so this needs a sideloading tool that signs it with your own Apple ID (AltStore, SideStore, Sideloadly). With a free Apple ID it has to be refreshed every 7 days. Untested on real devices so far. |
| Mac | `…_macos-universal.dmg` | Not notarized: right-click the app → Open the first time. VRChat itself doesn't run on macOS, so game-log features don't apply. |

Running a server on a spare device (Pi, old PC, NAS, Android phone)? Take `vfm-server-<version>-<platform>`, or the container image `ghcr.io/luminoowo/vfm-server` for Docker / Podman; see [server/README.md](server/README.md).

`SHA256SUMS` lists checksums for every file.

## What it does

- **Friend groups from your game logs** (Windows/Linux PC): the app reads VRChat's own log
  files to learn who was in the same instance as whom and for how long, and suggests friend
  groups from that. Accept a suggestion as a circle, add the missing people to a circle you
  already have, dismiss it, or let the app create and update circles automatically.
  [How it works](#friend-groups-from-game-logs).
- **Map**: every friend is a node, and a line joins two friends when VRChat lists them as
  mutual friends (or, optionally, when they spent time together in your instances).
  - **Line color** shows how many friends the two connected people have in common (among
    your friends): cool blue-gray = few, teal/yellow = more, pink = a tight-knit pair. The
    bands adapt to your friend list, and the legend shows the actual numbers.
  - **Node size** = number of mutual friends with you. **Ring** = online status (or trust
    rank). ★ = in one of your VRChat favorite groups. **Dashed outline** = they hide their
    mutuals.
  - **Map options**: draw people as dots, round pictures, compact cards or the **full
    VRChat player card**; change size, what size means, line style/thickness/visibility,
    show lines only for the person you point at, spacing, how strongly circles pull their
    members together, and circle outlines. Avatar preview pictures are cropped, not stretched.
- **Circles**: your own groups, drawn as soft outlines that can overlap. Drag a person into
  an outline, or onto a circle in the sidebar, to add them. Remove people from the detail
  panel. 24 distinct colors; new circles always get a color nobody uses yet (after 24, new
  distinct colors are generated), and the color picker shows which ones are taken.
- **Cards view**: VRChat-style cards (banner, icon, status, trust rank, platform, online for /
  last seen, mutual count), grouped by online status, sortable, draggable onto circles.
- **Filters**: online/offline, last online (24 h … 90 days+), trust rank, platform, circle,
  VRChat favorites only, "also in X's shared list".
- **Detail panel**: trust rank, VRC+, pronouns, platform, how long they've been online, last
  login, account creation date, mutual count and list, circles, your VRChat note.
- **Live updates**: the app keeps a connection to VRChat's event stream. When someone
  accepts your friend request (or you accept theirs, on any device), they appear right away
  with a notification. Unfriending, people coming online or going offline, and status
  changes show up instantly too. The "Live" badge in the top bar shows the connection.
- **Friend changes**: the sidebar lists friends added or removed since your first sync.
- **Shared lists**: export your list and import other people's.
  - *Only people we both know* (default): IDs are salted and hashed, so the person you send
    it to can only match people they already know.
  - *Full list*: IDs and names. This also reveals friends who turned off "Show mutual
    connections", so only use it with people you trust.

### Why live updates don't come from the game's log files

VRChat's `output_log` files record incoming friend requests and the moment *you* accept one
in-game, but not when someone accepts *your* request. They also only cover sessions played
on that PC (not Quest or phone). The live event stream covers every case on every device,
so the app uses that for friend changes, and the logs only for "who was where together".

## Friend groups from game logs

VRChat writes `output_log_*.txt` while it runs, including every instance you join and every
player who joins or leaves it. The desktop app reads those files (it never changes them):

1. **Finding the logs.** On Windows they're in `%USERPROFILE%\AppData\LocalLow\VRChat\VRChat`.
   On Linux (Proton) the app looks through every Steam library listed in Steam's
   `libraryfolders.vdf`, so games on other drives are found too, including Flatpak and Snap
   Steam. Other folders can be added in Settings → Game logs.
2. **History.** Each file becomes a list of instance visits with who was present when. This
   history is kept in the app's data folder, so it survives VRChat deleting old logs. New
   entries are read every few minutes (only changed files are re-read). You choose how long
   history is kept, and can forget it at any time.
3. **Time together.** For every pair of your friends, the app adds up the time both were in
   the same instance as you, and on how many different days. Time in big instances counts
   less (by default 1/n for n other people present, so 2 hours in an 80-person public world
   counts far less than 2 hours with four friends).
4. **Groups.** Pairs with enough time together on enough different days (default: 30 min on
   2+ days) form a weighted graph. [Louvain community detection](https://en.wikipedia.org/wiki/Louvain_method)
   splits it into groups that are much more connected inside than outside; people with only
   a weak tie to a group are left out, and people who are nearly as close to a second group
   are added to it too (circles can overlap).
5. **Suggestions.** Groups you already have as a circle are hidden; close matches turn into
   "add these people to *circle*". Automatic mode creates circles marked *auto* and keeps
   adding people to them; renaming one or changing who's in it makes it yours, and the app
   never changes circles you made yourself.

**Without you, from live locations.** Independently of the logs, the app (on any device,
while it's open) notes every minute which friends are in the same instance according to
VRChat's live friend updates, whether or not you're there, and adds that time to the
pairs. Private and invite-only instances are hidden by VRChat, so they don't count. Both
sources can be switched off in Settings; the location history is in `store/observed.json`.

All of this stays on your PC. Quest and phone sessions don't write logs the app can read, so
time spent there isn't counted. The detail panel also shows your time together with each
person and who they're most often with; the map can draw lines and sizes from it.

## Servers: sharing and 24/7 logging

[vfm-server](server/README.md) is an optional small program for a device that's on anyway. It
does two jobs:

- **Logger:** it follows your friends' locations through VRChat's live feed around the
  clock, and the app uses that time together for circle suggestions. The app itself only
  sees what happens while it's open.
- **Exchange:** you and friends share friend lists and activity with each other.

In the app: **Settings → Servers**. Add as many servers as you like. The app uploads to all
of them and merges what comes back, so one server going away loses nothing.

Encryption is end to end and set per server. With it on, the app seals your upload on your
device, separately for each friend allowed to read it, and the server stores ciphertext
it can't open. A server owner chooses whether encryption is forced off, optional,
recommended or forced on. The app's switch follows that, and a (?) explains it. A
force-off server makes the app warn before every upload. Your own default (server-based,
always on, always off) applies wherever a server lets you choose. Details, threat model and
setup for every platform: [server/README.md](server/README.md).

## How login works (and what's stored)

- You log in on **vrchat.com itself**, inside a window of this app (desktop) or inside the
  app's own view (Android). Whatever the website offers works: username/email + password,
  2FA, and any other sign-in buttons it shows (pop-up sign-ins open in a linked window).
- The app never sees your password. When the website login finishes, the Rust side reads the
  session cookie from that embedded browser, checks it against the API, and stores it in the
  app's data folder (owner-only permissions on Linux). The UI never gets the token.
- "Log out" ends the session on VRChat's side, closes the live connection and clears the
  embedded browser's cookies.

Accounts that exist only as Steam/Meta platform accounts (never linked to a VRChat account)
can't sign in on vrchat.com, so they can't use this either. Link the account in-game first
(Settings → Link Account).

## Being nice to VRChat's API

The API is unofficial and VRChat's Creator Guidelines ask tools to limit request volume,
cache, back off on errors, and identify themselves. This app:

- only makes **GET** requests to a short allow-list of endpoints (plus logout),
- spaces requests **at least 1 s apart** (default 1.2 s + random jitter), app-wide,
- backs off on HTTP 429 (honours `Retry-After`, otherwise 30 s doubling up to 10 min),
- uses **one live connection** for changes instead of frequent polling. It does a full
  refresh about every 30 minutes while live (every ~5 minutes if the live connection is
  down), and reconnects with backoff,
- caches profiles and mutual lists for 7 days (configurable),
- sends `User-Agent: VRCFriendMap/<version> <your contact>`. Set the contact on the login screen
  or in Settings.

The first full sync makes roughly *2 × number of friends* requests (one profile + one mutual
list each). With 300 friends that's about 12–15 minutes in the background. The map fills in
as data arrives, and later syncs only refresh what's stale.

## Installing on Linux

Every release comes in four formats. Pick the one for your distro:

| File (example: 0.3.0 on x86_64) | For | Install |
|---|---|---|
| `vrc-friend-map_0.3.0_amd64.deb` | Debian, Ubuntu, Linux Mint, Pop!_OS | `sudo apt install ./vrc-friend-map_0.3.0_amd64.deb` |
| `vrc-friend-map-0.3.0-1.x86_64.rpm` | Fedora, RHEL/Alma/Rocky, openSUSE | `sudo dnf install ./vrc-friend-map-0.3.0-1.x86_64.rpm` (openSUSE: `sudo zypper install …`) |
| `vrc-friend-map-0.3.0-x86_64.AppImage` | any distro, no install | `chmod +x` it, then run it |
| `vrc-friend-map-0.3.0-linux-x86_64.tar.gz` | Arch and anything else | unpack, then `./install.sh` (per-user, no root; `./install.sh --uninstall` removes it) |

ARM64 builds use `arm64` (deb) or `aarch64` (everything else) in place of `amd64`/`x86_64`.

`SHA256SUMS` lists the checksums: `sha256sum -c SHA256SUMS --ignore-missing`.

Runtime dependencies (the .deb and .rpm pull these in by themselves):

- **WebKitGTK 4.1**:
  - `libwebkit2gtk-4.1-0` on Debian, Ubuntu and Mint
  - `webkit2gtk4.1` on Fedora
  - `webkit2gtk-4.1` on Arch
  - `libwebkit2gtk-4_1-0` on openSUSE
- **The AppImage** also needs FUSE 2: `sudo apt install libfuse2t64` on Ubuntu 24.04 / Mint 22 (older releases: `libfuse2`). Without FUSE you can run it as `./vrc-friend-map-….AppImage --appimage-extract-and-run`.

The AppImage bundles WebKit, so it's much bigger (~80 MB vs ~5 MB).

Files are named the way each format expects:

- `name_version_arch.deb`, using Debian architecture names like `amd64`.
- `name-version-release.arch.rpm`, using RPM architecture names like `x86_64`.
- `name-version-arch` for the AppImage and the tarball.

Versions follow [Semantic Versioning](https://semver.org). Changes are listed in [CHANGELOG.md](CHANGELOG.md).

## Updating, downgrading and switching versions

Install a newer (or older) version over the old one. Your circles, cache and settings stay
where they are (see [Where data lives](#where-data-lives)), whatever the format:

- **Upgrading**: every stored file carries a format number. When a new version changes a
  format, it first saves a copy of the old file in `store/backups/`, then converts it.
  The app tells you what's new after an update.
- **Going back to an older version** (or skipping versions back and forth): the older app
  still loads the data. Anything it doesn't understand (settings or circle details added
  later) is written back unchanged, so returning to the newer version loses nothing. You get
  a note that the data came from a newer version, and a backup copy is made first.
- **Game-log history** has its own format number; a version that finds history from a newer
  format leaves it untouched instead of rewriting it.
- **Packages**: `.deb`/`.rpm` upgrade in place (`sudo apt install ./older.deb
  --allow-downgrades` to go back). The Windows installer upgrades in place; uninstall first
  to go back to an older version (your data stays). Android updates install over the old app
  as long as both are official release builds (same signing key).

## Building on Linux

You need **Node.js 20+**, **Rust**, a C toolchain and the **WebKitGTK 4.1** development
files. Install the system packages for your distro (list from Tauri's
[prerequisites](https://v2.tauri.app/start/prerequisites/)):

**Debian / Ubuntu / Linux Mint / Pop!_OS**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

**Fedora**
```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel libxdo-devel
sudo dnf group install "c-development"
```

**Arch / Manjaro / EndeavourOS**
```bash
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl \
  appmenu-gtk-module libappindicator-gtk3 librsvg xdotool
```

**openSUSE**
```bash
sudo zypper in webkit2gtk3-devel libopenssl-devel curl wget file libappindicator3-1 librsvg-devel
sudo zypper in -t pattern devel_basis
```

Other distros (Gentoo, Alpine, NixOS…): see Tauri's prerequisites page linked above.

**Rust** (any distro): `curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh`,
then open a new terminal.
**Node.js**: from your package manager if it's version 20 or newer, otherwise from
[nodejs.org](https://nodejs.org) or via [nvm](https://github.com/nvm-sh/nvm).

Then build:

```bash
git clone https://github.com/LuminoOwO/vrc-friend-map.git
cd vrc-friend-map
./scripts/build-linux.sh          # checks prerequisites, then builds a package for your distro
```

The script picks the format that fits your distro:

- `.deb` on Debian-based systems
- `.rpm` on Fedora and openSUSE
- the tarball on Arch
- an AppImage elsewhere

To choose yourself, pass one or more formats: `./scripts/build-linux.sh deb rpm appimage tarball`. `all` builds every format, and `none` builds just the binary.

GTK 3 built without Wayland (X11 only) works too. The build notices it, prints `GTK 3 here has no Wayland support: building for X11 only`, and adds stand-ins for the two Wayland functions the window library links. To force it either way, set `VFM_GDK_WAYLAND=0` or `VFM_GDK_WAYLAND=1`.

Finished packages are copied to `release/`, named as in the table above, along with a `SHA256SUMS` file. The script then prints the install command for each one.

By hand, the script runs:

```bash
npm ci
npx tauri build --bundles deb     # or rpm / appimage, or --no-bundle
```

On Linux, `src-tauri/tauri.linux.conf.json` overrides a few settings:

- the package and file name (`vrc-friend-map`, so there are no spaces)
- the icon sizes
- the desktop entry, which comes from `packaging/linux/`

To release a new version, follow these steps:

1. Bump the version with `npm version X.Y.Z --no-git-tag-version`.
2. Set the same version in `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
3. Add a section for it to `CHANGELOG.md`.
4. Run `./scripts/build-linux.sh all`.
5. Tag the commit `vX.Y.Z`.

For development with hot reload: `npm run tauri dev`. `npm run dev` alone starts just the UI
at http://localhost:1420 in a browser. Only demo mode works there, since login needs the app.

## Releases (for maintainers)

`.github/workflows/release.yml` builds everything on GitHub's machines: Linux x86_64 (and
ARM64 once the repository is public), Windows, macOS, Android and iOS. Then it publishes a
GitHub Release with all files, a combined `SHA256SUMS`, and notes taken from `CHANGELOG.md`.

To release a version:

1. Bump the version with `npm version X.Y.Z --no-git-tag-version`.
2. Set the same version in `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
3. Add a section for it to `CHANGELOG.md`, then commit and push.
4. Start the build in one of two ways:
   - **In the browser:** go to Actions → *Release builds* → *Run workflow*, and enter `vX.Y.Z`.
   - **From a terminal:** run `git tag vX.Y.Z && git push origin vX.Y.Z`.
5. Wait about 20–40 minutes. The release stays a draft until the files are attached, then it's published.

The workflow refuses to run if the tag and the three version numbers don't match. If one platform
fails, the others are still published; fix the problem and use *Re-run failed jobs*. Running it again
for a tag that already exists rebuilds that tag's commit and replaces the files.

**Android signing key (one-time setup).** Android only installs an update if it's signed with
the same key as the installed app, so the key must never change. Make one keystore, keep a
backup, and add it as four repository secrets (Settings → Secrets and variables → Actions):

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore vrc-friend-map.keystore \
  -alias vrc-friend-map -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=VRC Friend Map"
base64 -w0 vrc-friend-map.keystore   # -> ANDROID_KEYSTORE_BASE64
```

- `ANDROID_KEYSTORE_BASE64`: the base64 output.
- `ANDROID_KEYSTORE_PASSWORD`: the password you typed.
- `ANDROID_KEY_ALIAS`: `vrc-friend-map`.
- `ANDROID_KEY_PASSWORD`: the same password.

Without these secrets the Android job stops with an explanation; the other platforms still
publish. After adding them, re-run the failed job from the Actions tab.

## Building on Windows

Install the "Desktop development with C++" workload from Visual Studio Build Tools,
[Rust](https://rustup.rs) and [Node.js 20+](https://nodejs.org). WebView2 ships with
Windows 10/11. Then `npm ci` and `npx tauri build`. The installers end up in
`src-tauri\target\release\bundle\` (`.msi` and NSIS `.exe`).

## Building for Android and iOS

**iOS** needs a Mac with Xcode: `rustup target add aarch64-apple-ios`, `brew install xcodegen`,
then `npx tauri ios init` and `npx tauri ios build --no-sign` for an unsigned `.ipa`
(or set `APPLE_DEVELOPMENT_TEAM` and drop `--no-sign` to sign with your developer account).

### Android

1. Install Android Studio, then SDK Platform 34+, NDK, build-tools and command-line tools
   from its SDK Manager.
2. Set `JAVA_HOME` (Android Studio's bundled JBR works), `ANDROID_HOME` and `NDK_HOME`.
3. Add the Rust targets:
   `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`
4. Then:
   ```bash
   npm ci
   npx tauri android init      # generates src-tauri/gen/android (once)
   npx tauri android dev       # run on a connected phone / emulator
   npx tauri android build --apk
   ```
On Android, the app's view switches to vrchat.com for login and comes back on its own
afterwards (the system back button cancels). Exporting a list uses **Copy** (paste it into a
message). Saving to a file is desktop-only for now. The Android build hasn't been tested on a
device yet.

## Where data lives

All under the app's data folder (Settings shows the exact path; on Linux
`~/.local/share/app.vrcfriendmap`):

- `session.json`: the VRChat session cookie (owner-only on Linux).
- `store/cache.json`: friends, profiles, mutuals, favorites (cache, safe to delete).
- `store/local.json`: your circles, imported lists, friend change log.
- `store/settings.json`: preferences.
- `store/backups/`: copies made before a format change or when data came from a newer version.
- `gamelogs/history.json`: instance visits read from VRChat's logs (desktop).
- `share/identity.json`: your sharing keys (secret, owner-only). `share/pins.json`: friends'
  and servers' public keys as first seen. `store/shared.json`: what friends shared with you.
- Images are cached separately in the app cache folder (pruned at 600 MB).

## Project layout

```
src/                     UI (React + TypeScript)
  components/GraphView   canvas map: d3-force layout, node styles, line colors, zoom, drag-into-circle
  components/MapOptions  the map options panel
  components/CardsView   VRChat-style friend cards
  components/SharedLists export/import/compare
  sync.ts                API sync engine (queue, caching, backoff) + live event handling
  model.ts               trust ranks, status colors, filters, mutual edges
src-tauri/src/
  api.rs                 VRChat client: session, rate limiter, GET allow-list
  auth.rs                embedded vrchat.com login + cookie capture
  pipeline.rs            live event stream (wss://pipeline.vrchat.cloud) with reconnect
  images.rs              vrcimg:// image proxy with disk cache
  storage.rs             JSON store, hashing for shared lists
  gamelogs.rs            VRChat log folder detection, parser, history, time-together stats
src/groups.ts            friend group detection (Louvain + overlap + matching circles)
src/logs.ts              log scanning schedule, suggestions, automatic circles
src/colors.ts            circle palette and color picking
src/store.ts             state, saving, data format versions and migrations
src/__tests__/           frontend tests (npm test); Rust tests: cargo test --lib
scripts/build-linux.sh   prerequisite check + Linux packages into release/
scripts/collect-release.mjs  names Windows/macOS/Android/iOS build outputs
src/share.ts             server sync: what to upload where, encryption switch rules, merging
src/components/ServersModal  Settings → Servers
src-tauri/src/share.rs   keys, key pinning, signed requests to servers, sealing/opening
crates/vfm-share/        protocol shared by app and server (identities, envelopes, policy)
server/                  vfm-server: exchange + logger + admin page (see server/README.md)
.github/workflows/       CI tests and release builds
packaging/linux/         desktop entry, tarball installer and README
```

## Known limits

- VRChat's API is unofficial and can change without notice. If something breaks after a
  VRChat update, the community docs at https://vrchat.community are the place to check.
- Live updates only arrive while the app is running. Changes that happen while it's closed
  are picked up by the sync when it starts. A [vfm-server](server/README.md) logger fills
  that gap for time-together.
- On Linux the app turns off WebKitGTK's DMA-BUF renderer, which made the map several times
  slower (and misbehaves on NVIDIA). If the window stays blank or flickers on your system, start
  it with `VRC_FRIEND_MAP_DMABUF=1` to use WebKit's default instead, and please open an issue.
- iPhones can't run vfm-server (iOS stops background programs); they can use servers.
- People who hide their mutual connections show up without lines, by design.
- Game-log features need the desktop app on the PC that runs VRChat. Quest/phone sessions
  aren't in any log the app can read.
- The iOS build is unsigned and hasn't been tested on a device yet; the Android build has
  been built but not widely tested.

## License

MIT. See [LICENSE](LICENSE). Not affiliated with or endorsed by VRChat Inc.
