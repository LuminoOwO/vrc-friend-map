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
