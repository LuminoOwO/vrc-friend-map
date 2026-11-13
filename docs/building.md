# Building from source

- [Linux](#linux)
- [Windows](#windows)
- [Android and iOS](#android-and-ios)
- [Releases (for maintainers)](#releases-for-maintainers)
- [Project layout](#project-layout)

## Linux

`scripts/build-linux.sh` builds the Chromium version by default: it needs **GTK 4.14+
development files** (`libgtk-4-dev` on Debian/Ubuntu, `gtk4-devel` on Fedora) and Python 3,
downloads Chromium (CEF, about 1 GB, kept in `~/.cache/tauri-cef`), and the first time builds
Tauri's command line tool from its Chromium branch into `.tools/` (a few minutes). Tauri's
Chromium runtime isn't released yet, so this takes Tauri from that branch, pinned to one
commit in `scripts/chromium.py`; the script switches `src-tauri/Cargo.toml` over for the build
and back afterwards. Add `--webkit` for the WebKitGTK version, which needs the packages below.

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
- the tarball on Arch and everything else (the WebKitGTK build, `--webkit`, uses an AppImage there)

To choose yourself, pass one or more formats: `./scripts/build-linux.sh deb rpm tarball` (`appimage` only with `--webkit`). `all` builds every format, and `none` builds just the binary.

GTK built without Wayland (X11 only) works too:

- **GTK 4** (Chromium build): the script notices the missing `gtk4-wayland`, prints `GTK 4 has
  no Wayland support here: building for X11 only`, and the build adds stand-ins for GTK 4's
  Wayland functions. To force it, set `VFM_GTK4_WAYLAND=0` or `VFM_GTK4_WAYLAND=1`.
- **GTK 3** (WebKitGTK build): it prints `GTK 3 here has no Wayland support: building for X11
  only` and adds stand-ins for the two Wayland functions the window library links. To force
  it, set `VFM_GDK_WAYLAND=0` or `VFM_GDK_WAYLAND=1`.

Finished packages are copied to `release/`, named as in [Installing](install.md#linux), along with a `SHA256SUMS` file. The script then prints the install command for each one.

By hand, the WebKitGTK build is:

```bash
npm ci
npx tauri build --bundles deb     # or rpm / appimage, or --no-bundle
```

The Chromium build needs the extra steps in the script (`scripts/chromium.py apply`, Tauri's
CLI from the pinned commit, `scripts/fetch-cef.py`, `--features chromium`), so use the script.

On Linux, `src-tauri/tauri.linux.conf.json` overrides a few settings:

- the package and file name (`vrc-friend-map`, so there are no spaces)
- the icon sizes
- the desktop entry, which comes from `packaging/linux/`

For development with hot reload: `npm run tauri dev`. `npm run dev` alone starts just the UI
at http://localhost:1420 in a browser. Only demo mode works there, since login needs the app.

## Windows

Install the "Desktop development with C++" workload from Visual Studio Build Tools,
[Rust](https://rustup.rs) and [Node.js 20+](https://nodejs.org). WebView2 ships with
Windows 10/11. Then `npm ci` and `npx tauri build`. The installers end up in
`src-tauri\target\release\bundle\` (`.msi` and NSIS `.exe`).

## Android and iOS

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
src/live.ts, src-tauri/src/livelog.rs   who's in your instance + activity events (live game log)
src/activity.ts          the Activity tab's log
src/diag.ts              Settings → Diagnostics
scripts/chromium.py      switches the Linux build to Chromium (CEF) and back
scripts/fetch-cef.py     downloads Chromium for the build
src/people.ts            you and non-friends on the map, their profiles, friend requests
src/share.ts             server sync: what to upload where, encryption switch rules, merging
src/components/ServersModal  Settings → Servers
src-tauri/src/share.rs   keys, key pinning, signed requests to servers, sealing/opening
crates/vfm-share/        protocol shared by app and server (identities, envelopes, policy)
server/                  vfm-server: exchange + logger + admin page (see ../server/README.md)
.github/workflows/       CI tests and release builds
packaging/linux/         desktop entry, tarball installer and README
```
