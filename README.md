# VRC Friend Map

See your VRChat friends as a map: who's friends with whom, which groups you spend time with,
who's in your instance right now. VRChat-style profiles and cards, your own overlapping
circles, live updates, and optional sharing with friends.

Built with [Tauri 2](https://v2.tauri.app) (React + TypeScript + d3 on a small Rust core) for
**Windows, Linux, Android, macOS and iOS**. Free and open source ([MIT](LICENSE)). Not
affiliated with VRChat Inc.

## Highlights

- **Friend network map:** lines between friends who know each other, colored by how close-knit
  they are.
- **Friend groups from your game logs:** finds who you actually hang out with and suggests
  circles.
- **Who's in your instance**, live, plus an **activity log** of joins, leaves, world changes
  and friends coming online.
- **Notifications with sounds** when friends come online, join your world, add or remove you:
  for everyone or only people you pick, even just once. Each friend gets their own little tune.
  Keeps running in the tray.
- **Profiles like VRChat's**, with friend requests, unfriend, block and mute.
- **Optional servers** to share with friends (end-to-end encrypted) and log around the clock.
- **Gentle on VRChat's API**, and everything stays on your device unless you add a server.

→ **[Full feature list](docs/features.md)**

## Download

Get the newest version from **[Releases](https://github.com/LuminoOwO/vrc-friend-map/releases)**.

| You have | Take |
|---|---|
| Windows 10/11 | `…_windows-x64-setup.exe` (or `.msi`, or `-portable.exe`) |
| Linux | `.deb`, `.rpm` or tarball, x86_64 and ARM64. Needs GTK 4.14+ ([details](docs/install.md#linux)) |
| Android 7+ | `…_android.apk` |
| iPhone / iPad | `…_ios-unsigned.ipa` (sideload) |
| Mac | `…_macos-universal.dmg` |
| A server for sharing / logging | `vfm-server-…` or `ghcr.io/luminoowo/vfm-server` |

Install notes, updating and known limits: **[Installing](docs/install.md)**.

## Documentation

| | |
|---|---|
| [Features](docs/features.md) | Everything the app does |
| [Using the app](docs/using-the-app.md) | Finding your way around, circles, game logs, activity, profiles, settings |
| [Server sync tutorial](docs/server-setup.md) | Run a server (program, Docker/Podman, Pi, Android), connect the app, share, logger, HTTPS |
| [Installing and updating](docs/install.md) | Every platform, upgrading, going back, known limits |
| [Privacy, login and data](docs/privacy.md) | How login works, API etiquette, what's stored where |
| [Building from source](docs/building.md) | Linux, Windows, Android, iOS, releases, project layout |
| [vfm-server reference](server/README.md) | Every server option, command and the protocol |
| [Changelog](CHANGELOG.md) | What changed in each version |

## License

MIT. See [LICENSE](LICENSE). Not affiliated with or endorsed by VRChat Inc.
