# Using the app

- [Finding your way around](#finding-your-way-around)
- [First start and signing in](#first-start-and-signing-in)
- [The map](#the-map)
- [Circles](#circles)
- [Friend groups from game logs](#friend-groups-from-game-logs)
- [You, who's here, and people who aren't friends yet](#you-whos-here-and-people-who-arent-friends-yet)
- [Activity](#activity)
- [Profiles](#profiles)
- [Shared lists and servers](#shared-lists-and-servers)
- [Settings worth knowing](#settings-worth-knowing)
- [Live updates](#live-updates)

## Finding your way around

| Where | What's there |
|---|---|
| **Top bar** | ☰ (sidebar), tabs (Map, Cards, Shared lists, Activity), search, Filters, how many friends match, the sync / *Live* badge (connection to VRChat), ⚙ Settings. |
| **Left sidebar** | Overview tiles (friends, in VRChat, web / app, connections; click one to filter), your circles, group suggestions, friend changes. ☰ shows or hides it. |
| **Map** | Your friend network. Scroll or pinch to zoom, drag the background to move, drag people to place them or drop them on a circle. *Map options* (top right) changes how it looks. |
| **Who's here** | On the map, top left, while VRChat runs on this PC: the world you're in and everyone there, as a list, a row of pictures, or just a button. |
| **Cards** | VRChat-style cards grouped by online status; sort them, drag them onto circles. |
| **Shared lists** | Servers for automatic sharing (add them right there), and exporting / importing lists by hand. |
| **Activity** | Joins and leaves, world changes, friends online and offline, over the last 4 days. |
| **Settings** | ⚙ at the top right. Sorted into categories, with a search that also understands other words ("ui style" → Themes, "lag" → Frame rate). |
| **Your picture** | Top left, next to the app name: opens your own profile. |

Clicking anyone, anywhere (map, card, who's here, activity), opens their profile. Clicking a
picture in a profile (profile picture, banner, world, badge, group) opens it full size: zoom
with the wheel, pinch or the buttons, drag to move, and **Download** saves it to
Downloads / VRC Friend Map.

## First start and signing in

1. Optional: enter a contact (Discord name or email) on the login screen. It's added to the
   User-Agent so VRChat can reach the tool's user if something goes wrong.
2. **Log in with VRChat.** The real vrchat.com sign-in page opens inside the app. Use whatever
   it offers: password, 2FA, other sign-in buttons. The app never sees your password; it keeps
   only the session cookie.
3. The first sync loads every friend's profile and mutual friends, about 2 requests per friend,
   spaced out to go easy on VRChat's API. With 300 friends that takes 12–15 minutes in the
   background. The map fills in as data arrives.

Accounts that only exist as Steam or Meta accounts can't sign in on vrchat.com. Link the
account in-game first (Settings → Link Account).

**Demo mode** on the login screen shows the app with made-up friends, without an account.

## The map

- **Lines** join friends who are friends with each other. The color shows how many friends
  they share; the legend at the bottom has the numbers.
- **Size** = mutual friends with you. **Ring** = online status (or trust rank). **★** = VRChat
  favorite. **Dashed outline** = they hide their mutual friends.
- **Point at someone** for their player card. **Click** for their profile.
- **Map options**:
  - how people look: dots, pictures, compact cards, full player cards
  - size and what size means
  - lines: style, thickness, visibility, only for the person you point at
  - spacing, and how strongly circles pull their members together
  - what to do with people without lines
  - slow turning (direction and speed)
  - *Show me*, *Not friends yet*
  - *Show frame rate*

## Circles

Your own groups, drawn as soft outlines that can overlap.

- **New circle:** type a name in the sidebar under *Circles*.
- **Add people:** drag them into the circle's outline on the map, or onto the circle in the
  sidebar (cards can be dragged too).
- **Remove people:** in their profile, under *Circles*.
- Circles can be hidden, renamed and recolored in the sidebar. New circles always get an
  unused color.

## Friend groups from game logs

On the PC that runs VRChat, the app reads VRChat's own `output_log` files (it never changes
them) and works out who spends time together.

1. **Finding the logs.**
   - Windows: `%USERPROFILE%\AppData\LocalLow\VRChat\VRChat`.
   - Linux (Proton): every Steam library listed in Steam's `libraryfolders.vdf`, so games on
     other drives are found too, including Flatpak and Snap Steam.
   - Anything else: add the folder in **Settings → Game logs → Extra folders**.
2. **History.** Each file becomes a list of instance visits with who was there when. The app
   keeps this history itself, so it survives VRChat deleting old logs. You choose how long to
   keep it, and can forget it at any time.
3. **Time together.** For every pair of your friends: the time both were in the same instance
   as you, and on how many different days. Big instances count less (1/n for n other people),
   so two hours with four friends weighs far more than two hours in an 80-person world.
4. **Groups.** Pairs with enough time together form a graph that's split into groups
   ([Louvain](https://en.wikipedia.org/wiki/Louvain_method)). People with only a weak tie are
   left out; people nearly as close to a second group are in both.
5. **Suggestions** in the sidebar:
   - *Create circle*
   - *Add these people to* an existing circle
   - *Dismiss*

   Groups you already have are hidden. **Automatic mode** creates circles marked *auto* and
   keeps adding people to them. Once you rename one or change who's in it, it's yours, and the
   app never changes circles you made yourself.

**Without you:** while the app is open (any device), it also notes every minute which friends
share an instance according to VRChat's live data. Private and invite-only instances are
hidden by VRChat. A [server logger](server-setup.md#6-turn-on-the-logger) does the same
around the clock. Every source can be switched off in Settings.

## You, who's here, and people who aren't friends yet

- **You on the map** (Map options → *Show me*). Your picture floats between the friends you
  spend the most time with, or share the most mutuals with. Nothing is pulled towards you.
- **Who's in your instance** (Settings → Game logs → *Show who's in my instance right now*,
  on the VRChat PC). The panel on the map lists the world and everyone there, friends first,
  with their status or friends in common and how long they've been there, and gives them a
  pink halo on the map. Its buttons switch between the full list, a row of pictures, and a
  small button.
  - *Show the N who aren't friends on the map* adds the others.
  - *Load everyone's profile* loads all of them (otherwise the first 25).
- **People who aren't friends yet** (Map options → *Not friends yet*):
  - *In my instance now*
  - *+ people I've spent time with* (game logs)
  - *+ friends of friends (shared lists)*

  They get a dashed outline and faint lines to the friends you share. Their profiles load
  slowly in the background, only for people actually shown, at most 200 per session.
- **Settings → People who aren't friends:**
  - which of their profiles to keep on this device: none, potential friends (shared friends
    or time spent together), or everyone
  - whether to show people you've blocked

## Activity

The Activity tab lists, newest first and grouped by day:

- **From the game log (VRChat PC):** who joined and left your instance, your world changes,
  VRChat closing or crashing.
- **From live updates (any device):** friends online / offline, changing worlds, added /
  removed.

The chips at the top filter by type. *People already there when I arrived* hides the burst of
joins you see when you load into a world. Search finds names and worlds; click a name to open
the profile. The log stays on this device for 4 days; *Clear* empties it.

## Profiles

Laid out like VRChat's own profile page:

- status, trust rank, VRC+, pronouns, platform
- online for / last seen, account age
- bio and links (they open in your browser)
- current world card and groups
- mutual friends, circles, your VRChat note, time together

**Actions** (each only when you click; at most one every 3 seconds):

| Button | Notes |
|---|---|
| Send friend request / Cancel request | For people who aren't friends. |
| Unfriend | Asks first. |
| Block / Unblock | Block asks first. |
| Mute / Unmute | |
| Hide avatar / Stop hiding avatar | "Stop hiding" goes back to what your safety settings decide. |
| 🔗 | Copies the vrchat.com profile link. |

## Shared lists and servers

- **Shared lists tab:** export your list and send it to someone; import theirs to compare.
  - *Only people we both know* (default): salted hashes, so they only match people they
    already know.
  - *Full list*: names and IDs. This also reveals friends who hide their mutuals, so only use
    it with people you trust.
- **Automatic sharing and 24/7 logging** need a server. See the
  [server sync tutorial](server-setup.md).

## Settings worth knowing

- **Frame rate:**
  - **Vsync** (on by default). Turning it off needs the Linux Chromium build or Windows, plus
    a restart.
  - **Limit:** 60 by default; -1 = unlimited, 0 = the screen's rate. Your screen can't show
    more frames than its refresh rate, so vsync on at the screen's rate is the smoothest.
  - **Saving power:** the rate while the window isn't focused (default 30), and optionally
    after a while without input (0 = stop moving, -1 = no change).
- **Graphics:** automatic, prefer the graphics card, or software. Use software if the window
  stays blank or flickers.
- **Diagnostics:** frame rate, GPU, web engine, benchmark. Use *Copy diagnostics* when you
  report a problem.
- **Game logs:** read logs, find the folder automatically, follow the log live, extra folders,
  how often to check, how long to keep history.
- **New friends:** a sound (chime, sparkle, pop, bell) and volume.
- **Open profiles** as a popup or in a side panel.
- **Themes:** Dark, OLED black, Light, Catppuccin Mocha / Macchiato / Latte, Nord, Dracula.

## Live updates

The app keeps one connection to VRChat's event stream. When someone accepts your friend request
(or you accept theirs, on any device), they appear right away with a pop-in and optional sound.
People coming online or going offline, unfriending and status changes show up instantly. A
full refresh runs about every 30 minutes while live.

Why not from the game's log files? VRChat's logs don't record when someone accepts *your*
request, and they only cover sessions on that PC (not Quest or phone). The live stream covers
every case on every device, so the app uses it for friend changes and the logs only for "who
was where together".
