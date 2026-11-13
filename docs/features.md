# Features

Everything VRC Friend Map does, by area. For how to use it, see the
[guide](using-the-app.md); for the full history, the [changelog](../CHANGELOG.md).

**Platforms:** Windows, Linux (x86_64 and ARM64), Android, macOS, iOS (sideload).
Features marked **(PC)** need the desktop app on the computer that runs VRChat, because
they read VRChat's own log files.

## The map

- **Friend network.** Every friend is a point; a line joins two friends when VRChat lists
  them as mutual friends. Optionally, lines also come from time spent together.
- **Line colors** show how many friends two people have in common, from cool blue-gray (few)
  through teal and yellow to pink (a tight-knit pair). The bands adapt to your friend list;
  the legend shows the real numbers.
- **What a point shows:**
  - size: number of mutual friends with you (or something else, see Map options)
  - ring: online status or trust rank
  - ★: in one of your VRChat favorite groups
  - dashed outline: they hide their mutual friends
  - pink halo: in your instance right now **(PC)**
- **Four looks for people:** dots, round pictures, compact cards, or the full VRChat player
  card. Avatar pictures are cropped, never stretched.
- **Pointing at someone** shows their player card, growing out of their picture. Optionally,
  only that person's lines are shown.
- **Layout:**
  - each circle gets its own spot
  - adjustable spacing
  - how strongly circles pull their members together
  - where people without lines go: a ring around everyone, or one shared spot
- **Slowly turning map**, with direction and speed settings.
- **You on the map:** your picture floats between the friends you spend the most time with.
  Nothing is pulled towards you.
- **People who aren't friends yet**, drawn with a dashed outline and faint lines to the
  friends you share:
  - people in your instance
  - people you've spent time with
  - friends of friends from shared lists
- **Smooth on big screens:**
  - GPU drawing everywhere (Chromium on Linux since 0.9.0)
  - off-screen people aren't drawn, and pictures are drawn once and reused
- **Frame rate settings:**
  - a vsync switch
  - a limit you type in: 60 by default, -1 = unlimited, 0 = the screen's rate
  - power saving: lower rate when the window isn't focused (default 30) or after a while
    without input
- **Frame-rate readout** (Map options → Show frame rate).

## Circles (your own groups)

- Soft outlines on the map that can overlap.
- Drag someone into an outline, or onto a circle in the sidebar, to add them. Remove people
  from their profile.
- 24 distinct colors, and new circles get a color nobody uses yet. The picker shows which
  colors are taken.
- Show, hide, rename and recolor circles.

## Friend groups from game logs **(PC)**

- Reads VRChat's `output_log` files (never changes them) to learn who was in your instance,
  with whom, and for how long.
- Finds the log folder by itself on Windows and on Linux (every Steam library, on any drive,
  including Flatpak and Snap Steam). Extra folders can be added by hand.
- Keeps its own history, so it survives VRChat deleting old logs. How long it's kept is up to
  you.
- **Time together** for every pair of friends. Big instances count less: two hours in an
  80-person world counts far less than two hours with four friends.
- **Group suggestions** (Louvain community detection, with overlap). You can:
  - accept one as a circle, add the missing people to a circle you already have, or dismiss it
  - turn on automatic mode, which creates and updates circles marked *auto*
- **Also without you:** while the app is open (any device), friends who share an instance
  according to VRChat's live data count too.
- Your profile view shows your time together with each person and who they're most often
  with.

## Who's in your instance right now **(PC)**

- Follows VRChat's log as it's written: world name, and everyone in the instance, friends
  first.
- Click anyone to open their profile. It needs no requests to VRChat.
- Option to show the people who aren't friends on the map too.
- Option to load everyone's profile in the instance (otherwise the first 25).
- People you've blocked are hidden unless you choose to show them.

## Activity tab

A readable log of what happened around you, kept 4 days on this device.

- **From the game log (PC):**
  - who joined and who left your instance
  - your world changes
  - VRChat closing or crashing
- **From VRChat's live updates (any device):** friends coming online, going offline,
  changing worlds, being added or removed.
- **Filters:**
  - by type
  - "people already there when I arrived"
  - search by name or world
- Click a name to open the profile.

## Profiles

- Laid out like VRChat's profile page, with:
  - banner, picture and status
  - trust rank, VRC+, pronouns and Verified 18+
  - platform, online for / last seen, account creation date
  - bio and links
- **Current world card:** picture, name, region, instance number and type, how full it is.
- **Groups:** the represented group is pinned on top; "View all" opens a grid.
- **Mutual friends** list and count, the **circles** they're in, and your **VRChat note**.
- Opens as a popup (default, best on phones) or as a side panel. Opening it from a card
  animates out of that card.
- **Actions:**
  - send or cancel a friend request
  - unfriend
  - block / unblock, mute / unmute, hide their avatar
  - copy the profile link

  Each action happens only when you click, unfriend and block ask first, and actions go out
  at most one every 3 seconds.

## Cards view

- VRChat-style friend cards: banner, icon, status, trust rank, platform, online for or last
  seen, and mutual count.
- Grouped by online status and sortable. Drag cards onto circles.

## Filters and search

- Online / offline, last online (24 h to 90 days+), trust rank, platform, circle, VRChat
  favorites only, and "also in X's shared list".
- People who don't match can be dimmed or hidden.
- Overview tiles (in VRChat / web or app) work as quick filters.
- Search by name.

## Live updates

- One live connection to VRChat's event stream. New friends appear right away, with an
  optional sound and a pop-in on the map.
- People coming online or going offline, unfriending and status changes all show instantly.
- The sidebar keeps a list of friends added or removed since your first sync.

## Sharing and servers (optional)

- **Shared lists:** export your friend list as a file or text, and import other people's to
  compare.
  - *Only people we both know* (salted hashes): the other person only sees people they
    already know.
  - *Full list*: names and IDs, for people you trust.
- **[vfm-server](server-setup.md)**, a small program for a device that's on anyway (Pi, old PC,
  NAS, Android phone, Docker / Podman):
  - **Exchange:** friends share friend lists and activity with each other automatically.
  - **Logger:** follows your friends' locations around the clock, so time-together and group
    suggestions don't depend on the app being open.
- **As many servers as you like.** The app uploads to all of them and merges what comes back.
- **End-to-end encryption** per server: the server stores ciphertext it can't open. Server
  owners choose force-off, optional, recommended or force-on.
- **Signed uploads and key pinning:** a server can't fake what someone shared or swap their
  key without the app noticing. Friends can confirm keys with a line in their VRChat bio.
- **Choose who gets your data:** all friends or some circles. Share your friend list, your
  activity, or both.

## Look and feel

- **Themes:**
  - Dark, OLED black and Light
  - Catppuccin Mocha, Macchiato and Latte
  - Nord and Dracula
- The scrollbars follow the theme.
- Works on phones: popup profiles, a bigger close button below the status bar, and a
  zoomed-in start.

## Settings and tools

- **Diagnostics:** frame rate, drawing time, the GPU the app draws with (warns about software
  rendering), web engine, a quick benchmark and "Copy diagnostics".
- **Graphics:** automatic, prefer the graphics card, or software (Linux, Windows).
- **People who aren't friends:** load everyone in the instance; which profiles to keep on
  this device (none, potential friends, everyone); show blocked people.
- **Updates keep your data:** stored files carry format numbers and are backed up before any
  conversion. Going back to an older version works too.

## Privacy and VRChat's API

- You sign in on vrchat.com itself (2FA and any sign-in option it offers). The app never sees
  your password.
- **Only GET requests** to a short list of endpoints. Writes happen only from the profile
  buttons.
- **Gentle on VRChat:**
  - requests at least 1 s apart
  - backs off on rate limits
  - one live connection instead of polling
  - 7-day profile cache
  - identifies itself with a User-Agent that includes your contact
- **Everything stays on your device** unless you add a server.

Details: [Privacy, login and data](privacy.md).
