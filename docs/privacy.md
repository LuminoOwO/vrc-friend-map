# Privacy, login and data

## How login works

- You log in on **vrchat.com itself**: in a window of this app (desktop) or in the app's own
  view (Android). Whatever the website offers works, including 2FA and other sign-in buttons;
  pop-up sign-ins open in a linked window.
- The app never sees your password. When the login finishes, the Rust side reads the session
  cookie from that built-in browser, checks it with the API, and stores it in the app's data
  folder (owner-only on Linux). The interface never gets the token.
- **Log out** ends the session on VRChat's side, closes the live connection and clears the
  built-in browser's cookies.

## Being nice to VRChat's API

The API is unofficial. VRChat's Creator Guidelines ask tools to limit requests, cache, back
off on errors and identify themselves. This app:

- makes **GET** requests only, to a short allow-list of endpoints (plus logout). The exceptions
  are the profile buttons: friend request, unfriend, block, mute, hide avatar. Each one goes
  out only when you press it, unfriend and block ask first, and they're spaced at least 3
  seconds apart.
- spaces requests **at least 1 s apart** (default 1.2 s plus random jitter), across the whole
  app.
- backs off on HTTP 429: it honors `Retry-After`, otherwise waits 30 s, doubling up to 10 min.
- uses **one live connection** for changes instead of frequent polling. It does a full refresh
  about every 30 minutes while live (every ~5 minutes if the connection is down) and
  reconnects with backoff.
- caches profiles and mutual lists for 7 days (adjustable).
- loads profiles of people who aren't friends only for people shown, a few seconds apart, at
  most 200 per session.
- sends `User-Agent: VRCFriendMap/<version> <your contact>`. Set the contact on the login
  screen or in Settings.

The first full sync makes about *2 × number of friends* requests. With 300 friends that's
12–15 minutes in the background; later syncs only refresh what's stale.

## What leaves your device

Only what you choose:

- **Requests to VRChat**, as above.
- **Shared lists** you export yourself.
- **Server uploads**, if you add a server and turn on *Share my data here*. With encryption,
  the server only sees ciphertext; see the [server tutorial](server-setup.md).

Game logs, time together, circles, the activity log and settings all stay on your device.

## Where data lives

In the app's data folder (Settings shows the exact path; on Linux
`~/.local/share/app.vrcfriendmap`):

| File | What |
|---|---|
| `session.json` | The VRChat session cookie (owner-only on Linux). |
| `store/cache.json` | Friends, profiles, mutuals, favorites. A cache: safe to delete. |
| `store/local.json` | Your circles, imported lists, friend change log. |
| `store/settings.json` | Preferences. |
| `store/activity.json` | The activity log (4 days). |
| `store/sounds.json` | Sound files you added for notifications. |
| `store/observed.json` | Time together from live locations. |
| `store/shared.json` | What friends shared with you through servers. |
| `store/backups/` | Copies made before a format change, or when data came from a newer version. |
| `gamelogs/history.json` | Instance visits read from VRChat's logs (desktop). |
| `share/identity.json` | Your sharing keys (secret, owner-only). |
| `share/pins.json` | Friends' and servers' public keys as first seen. |
| `graphics.json` | Graphics mode and vsync (read at startup). |

Images are cached separately in the app's cache folder and pruned at 600 MB.
