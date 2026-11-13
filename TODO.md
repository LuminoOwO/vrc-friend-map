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
