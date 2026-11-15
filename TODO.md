# Ideas for later

Features to consider, not planned for a specific version yet. Add new ones at the bottom.
The bigger, discussed list lives in GitHub issue #14.

- [ ] **Custom sounds.** (Asked 2026-11-13.) Uploading your own sound files per event already
  exists (Settings → Notifications → Add a sound file). To clarify what's wanted beyond that:
  e.g. a sound for one specific person, making sounds in the app, or sound packs.
- [ ] **No scrolling / zooming on a friend's Gentoo + Xfce + XLibre (X11) system.** Workaround
  shipped (*Fix the mouse wheel* / `--wheel-fix`), but it didn't help on his system yet; parked
  since WayVR works for him. Still open:
  why Chromium in the app gets no wheel there (not keyd: same with keyd stopped). The same
  AppImage scrolls fine on Mint (X.Org), and Chromium 146 scrolls fine on his system, so it's
  our app (CEF / Chromium 151, or the way its window sits inside the GTK 4 window) with his X
  server. `xinput test-xi2` shows only *emulated* wheel buttons (4/5); Chromium ignores those
  when it expects smooth-scroll values instead. Needs: the full xinput output (are there
  Motion events with scroll values?) and `xinput list --long` for his mouse.
- [ ] **Friends together in one instance, on the "instance preview in the upper right corner".**
  (Asked 2026-11-13.) A friend's profile already lists "N of your friends" in their instance
  in its top-right world card. To clarify which preview is meant (the map's hover card? a list
  of all instances your friends are in?).
- [ ] **Updates from inside the app.** (Asked 2026-11-15.) Check GitHub Releases for a newer
  version (at start and once a day, can be turned off), show what's new from the changelog, and
  update with one click, then restart. Per platform, as far as each allows:
  - **Windows, macOS, Linux AppImage:** Tauri's updater (download, check the signature,
    install, restart). Needs an update signing key (a new repository secret) and the release
    workflow publishing `latest.json` and `.sig` files.
  - **Linux .deb / .rpm:** download the new package and install it with the system's password
    prompt (pkexec), or hand it to the software center.
  - **Linux tarball:** replace the files in its own folder (per-user install, no password).
  - **Flatpak:** updates come through Flatpak; show the command / open the software center.
  - **Android:** download the new APK and open Android's installer (needs the "install
    unknown apps" permission once).
  - **iOS (sideloaded):** can't install itself; say there's an update and link the release.
  - **vfm-server:** show the server owner (Shared lists → servers) that their server is older
    than the app expects, with the update command.
