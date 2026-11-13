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
- [ ] **Age concerns (needs a design decision first; see the notes).** Help adults who don't
  want minors on their friend list notice likely minors. Wished for:
  - read hints from the profile (bio, links in it) and from linked accounts and link pages
    (Linktree etc.), also indirectly linked ones;
  - a manual "I'm sure they're an adult" override;
  - for friends who sync through a server: notes per person, *most certainly over 18*,
    *probably over 18*, *probably under 18*, *most certainly under 18*;
  - age notes shared separately from everything else, with syncing turned off per person;
  - VRChat's 18+ verification ignored as a signal (accounts get bought).

  Open questions before building (see the discussion of 2026-11-13):
  - Following every linked and indirectly linked profile builds a cross-platform file on
    each person, many of them minors. It's also scraping other sites.
  - Notes saying *under 18*, synced between people, add up to a shared list of minors with
    their accounts. That list would be valuable to exactly the people minors need protection
    from. Ideas: keep under-18 notes on your own device only, and share only *adult* vouches,
    or a neutral "keep your distance" flag without the reason.
  - False labels stick to people; notes need an author, a date and a way to take them back.
