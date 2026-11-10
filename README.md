# VRC Friend Map

A local app that maps your VRChat friends: VRChat-style friend cards, a network map where
lines connect friends who are friends with each other (VRChat "mutuals"), your own
overlapping friend circles, filters, live updates, and comparisons with friend lists other
people share with you.

One codebase, built with [Tauri 2](https://v2.tauri.app): a web UI (React + TypeScript + d3)
on top of a small Rust core. It builds for **Linux, Windows and Android** (and macOS).

## What it does

- **Map**: every friend is a node, and a line joins two friends when VRChat lists them as
  mutual friends.
  - **Line color** shows how many friends the two connected people have in common (among
    your friends): cool blue-gray = few, teal/yellow = more, pink = a tight-knit pair. The
    bands adapt to your friend list, and the legend shows the actual numbers.
  - **Node size** = number of mutual friends with you. **Ring** = online status (or trust
    rank). ★ = in one of your VRChat favorite groups. **Dashed outline** = they hide their
    mutuals.
- **Circles**: your own groups, drawn as soft outlines that can overlap. Drag a person into
  an outline, or onto a circle in the sidebar, to add them. Remove people from the detail panel.
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

### Why not the game's log files?

VRChat's `output_log` files record incoming friend requests and the moment *you* accept one
in-game, but not when someone accepts *your* request. They also only cover sessions played
on that PC (not Quest or phone). The live event stream covers every case on every device,
so the app uses that instead.

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

| File | For | Install |
|---|---|---|
| `vrc-friend-map_0.2.0_amd64.deb` | Debian, Ubuntu, Linux Mint, Pop!_OS | `sudo apt install ./vrc-friend-map_0.2.0_amd64.deb` |
| `vrc-friend-map-0.2.0-1.x86_64.rpm` | Fedora, RHEL/Alma/Rocky, openSUSE | `sudo dnf install ./vrc-friend-map-0.2.0-1.x86_64.rpm` (openSUSE: `sudo zypper install …`) |
| `vrc-friend-map-0.2.0-x86_64.AppImage` | any distro, no install | `chmod +x` it, then run it |
| `vrc-friend-map-0.2.0-linux-x86_64.tar.gz` | Arch and anything else | unpack, then `./install.sh` (per-user, no root; `./install.sh --uninstall` removes it) |

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

## Building on Windows

Install the "Desktop development with C++" workload from Visual Studio Build Tools,
[Rust](https://rustup.rs) and [Node.js 20+](https://nodejs.org). WebView2 ships with
Windows 10/11. Then `npm ci` and `npx tauri build`. The installers end up in
`src-tauri\target\release\bundle\` (`.msi` and NSIS `.exe`).

## Building for Android

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
- Images are cached separately in the app cache folder (pruned at 600 MB).

## Project layout

```
src/                     UI (React + TypeScript)
  components/GraphView   canvas map: d3-force layout, line colors, zoom, drag-into-circle
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
scripts/build-linux.sh   prerequisite check + Linux packages into release/
packaging/linux/         desktop entry, tarball installer and README
```

## Known limits

- VRChat's API is unofficial and can change without notice. If something breaks after a
  VRChat update, the community docs at https://vrchat.community are the place to check.
- Live updates only arrive while the app is running. Changes that happen while it's closed
  are picked up by the sync when it starts.
- People who hide their mutual connections show up without lines, by design.
