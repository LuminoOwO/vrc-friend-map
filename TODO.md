# Ideas for later

Features to consider, not planned for a specific version yet. Add new ones at the bottom.
The bigger, discussed list lives in GitHub issue #14.

- [ ] **Fully themeable Catppuccin.** Catppuccin has four flavors (Latte, Frappé, Macchiato,
  Mocha), each with 14 accent colors (Rosewater … Lavender) on top of its base colors
  (https://catppuccin.com/palette/). Let people pick the flavor *and* the accent, instead of
  the three fixed Catppuccin themes now (Frappé is missing too).
- [ ] **Red flag: a friend unfriended this person.** On someone's profile, note when one of your
  friends removed them, so you can ask that friend why. Two different messages:
  - *"XYZ removed them as a friend while they were in the same instance"* (the removal happened
    while both were in one instance, from game logs, live locations or a logger), and
  - *"XYZ removed them as a friend"* (no shared instance at that moment).

  Where the data could come from: VRChat only tells you about your *own* friend list, so this
  needs friends who share their friend list through a server. A person disappearing from
  XYZ's shared list between two syncs is the removal; the timing is only as exact as the
  sync interval. To decide: whether XYZ has to opt in to this separately (they shared their
  list for mutual connections, not to have their unfriendings shown), and whether it's shown
  for removals that happened before the feature existed.
- [ ] **Edit your own profile in the app.** Status, status text, bio, pronouns, links,
  languages, profile picture choice, and the profile theming the website shows (VRC+). Needs
  research: which fields VRChat's API lets you change, and how vrchat.com stores and renders
  profile themes, so the app can show and edit them the same way.
- [ ] **Age concerns.** Help adults who don't want minors on their friend list notice likely
  minors. Decided 2026-11-13:
  - **Signals:** the VRChat profile itself (bio, pronouns, status text) and the links the
    person posted there, each read once when you open their profile. No following links
    further, no crawling of linked accounts or link pages beyond that.
  - **Ignored:** VRChat's 18+ verification (accounts get bought).
  - **Your own notes:** *most certainly over 18*, *probably over 18*, *probably under 18*,
    *most certainly under 18*, plus a manual "I'm sure they're an adult" override. Each with a
    date, editable, and expiring after a while so old guesses don't stick.
  - **Under-18 notes are never shared:** age hints and *probably / most certainly under 18*
    stay on this device. Never synced through servers, never in exports, never in backups sent
    anywhere. (Synced under-18 notes would add up to a shared list of minors with their
    accounts, which endangers them.)
  - **What friends can share** (through servers, only with the recipients you chose, and
    turned off per person if you like), one of:
    - *(nothing)*: the default, no note;
    - *most certainly over 18*;
    - *probably over 18*;
    - *keep your distance*: a neutral flag with no reason attached. It's meant for any reason
      (age, behavior, drama), so it can't be read as "this is a minor", and the app never
      shows *why* someone set it.

    Missing vouches mean nothing; the app must never treat "no adult vouch" as a hint. Each
    shared note shows who set it and when, and its author can take it back.
  - **Where it shows** (defaults, adjustable): a mark on the profile; a warning before you send
    or accept a friend request; for people already on your friend list, only on their profile,
    no pop-ups.
- [ ] **F7 opens Chromium's "Turn on caret browsing?" dialog.** Swallow F7 (and other browser
  shortcuts that make no sense in the app) in the Chromium build.
- [ ] **F11 for real fullscreen.** F11 currently does Chromium's page fullscreen ("press and
  hold Esc to exit") inside the window. Make it toggle the app window's fullscreen instead.
- [ ] **Custom sounds.** (Asked 2026-11-13.) Uploading your own sound files per event already
  exists (Settings → Notifications → Add a sound file). To clarify what's wanted beyond that:
  e.g. a sound for one specific person, making sounds in the app, or sound packs.
- [ ] **A tiny pause between the event sound and the person's tune.** Right now the tune starts
  the moment the event sound's last note lands; add a short gap (about 0.08–0.12 s) so the
  two read as separate sounds.
- [ ] **Bio and links missing on profiles (bug).** A friend's profile shows "Nothing written"
  and no links, while vrchat.com shows their About me (several lines) and three links
  (Discord and two others). Find out whether the profile data loaded has `bio` / `bioLinks`
  at all (maybe VRChat stopped sending them in the friends list, or the full profile isn't
  loaded / merged), and fix it.
- [ ] **"Who's here" panel into the sidebar by default.** On the Activity tab (and elsewhere)
  the instance pill overlaps the content. Put it in the sidebar by default, with: the world
  banner, the instance (name / type), region, people in the instance and the instance's total
  slots (e.g. 12 / 32).
- [ ] **Build instructions for every version.** One page (docs/building.md) that walks through
  building each package: .deb, .rpm, AppImage, tarball, Flatpak, the WebKitGTK version,
  X11-only systems, Windows, macOS, Android, iOS and the server, with the exact commands and
  what each needs installed.
- [ ] **Starting the app a second time crashes (Chromium build).** With the app already running
  (also hidden in the tray), a second start prints "Opening in existing browser session" and
  panics with `WebviewRuntimeNotInstalled`: Chromium's lock on the shared data folder hands the
  start over to the running copy, and Tauri's CEF runtime then fails. Make a second start bring
  the running window to the front (single instance) and exit quietly.
- [ ] **No scrolling / zooming on a friend's Gentoo + Xfce + XLibre (X11) system.** Workaround
  shipped: *Fix the mouse wheel* / `--wheel-fix` (reads the wheel from the X server). Still open:
  why Chromium in the app gets no wheel there (not keyd: same with keyd stopped). The same
  AppImage scrolls fine on Mint (X.Org), and Chromium 146 scrolls fine on his system, so it's
  our app (CEF / Chromium 151, or the way its window sits inside the GTK 4 window) with his X
  server. `xinput test-xi2` shows only *emulated* wheel buttons (4/5); Chromium ignores those
  when it expects smooth-scroll values instead. Needs: the full xinput output (are there
  Motion events with scroll values?) and `xinput list --long` for his mouse.
- [ ] **Zoom without a scroll wheel.** + / − buttons on the map and keyboard zoom (+, −, 0 to
  fit), so the map is usable where wheel events don't arrive (see the XLibre item) and with
  touchpads that only click.
- [ ] **Friends together in one instance, on the "instance preview in the upper right corner".**
  (Asked 2026-11-13.) A friend's profile already lists "N of your friends" in their instance
  in its top-right world card. To clarify which preview is meant (the map's hover card? a list
  of all instances your friends are in?).
