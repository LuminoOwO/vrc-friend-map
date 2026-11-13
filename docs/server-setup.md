# Server sync: setup tutorial

This walks you through sharing with friends and 24/7 logging, from "what is this" to a
working setup. The [vfm-server reference](../server/README.md) has every option and
command.

1. [What a server does](#1-what-a-server-does)
2. [Pick a setup](#2-pick-a-setup)
3. [Run the server](#3-run-the-server)
4. [Connect the app](#4-connect-the-app)
5. [Share with friends](#5-share-with-friends)
6. [Turn on the logger](#6-turn-on-the-logger)
7. [Reach it from outside your home](#7-reach-it-from-outside-your-home)
8. [Several servers, several devices](#8-several-servers-several-devices)
9. [Troubleshooting](#9-troubleshooting)

## 1. What a server does

The app works without any server. A server adds two optional jobs:

| Job | What you get | Who needs it |
|---|---|---|
| **Exchange** | You and your friends swap friend lists and "who spends time with whom". You see connections VRChat hides, and everyone's group suggestions get better. | You and at least one friend on the same server |
| **Logger** | The server follows your friends' locations through VRChat's live feed around the clock. Time together keeps counting while your PC is off. | Just you |

The server is one small program (~3 MB, a few MB of memory). It runs on anything that's on
anyway: a Raspberry Pi, an old laptop, a NAS, a home server, a Windows PC, an old Android
phone.

**Privacy in one paragraph.** With encryption on, the app encrypts your upload on your device
for each friend allowed to read it. The server only stores ciphertext: even its owner can't
read it. Everything is signed, so a server can't change what someone shared. The logger is
the exception: to watch your friends it needs your VRChat login. The app sends that login
sealed so only that server can open it, but the server can then use it. So **only pair a
logger on a server you control**.

## 2. Pick a setup

| Situation | Do this |
|---|---|
| A friend already runs a server | Skip to [4. Connect the app](#4-connect-the-app); ask them for the address and an invite code. |
| You have a Linux box, Pi or NAS with Docker / Podman | [3b. Container](#3b-container-docker--podman) |
| You have a Pi or Linux machine without containers | [3a. Program file](#3a-program-file-any-system) + [systemd](#keep-it-running-on-linux-systemd) |
| Only a Windows PC that's on a lot | [3a. Program file](#3a-program-file-any-system) + [Windows autostart](#keep-it-running-on-windows) |
| An old Android phone | [3c. Android phone](#3c-old-android-phone-termux) |
| Friends outside your home network | Any of the above + [7. Outside your home](#7-reach-it-from-outside-your-home) |

iPhones can't run a server (iOS stops background programs), but the app on an iPhone can
use servers.

## 3. Run the server

### 3a. Program file (any system)

1. From the [Releases page](https://github.com/LuminoOwO/vrc-friend-map/releases), download
   `vfm-server-<version>-<platform>`:

   | Device | File |
   |---|---|
   | Raspberry Pi 3/4/5 with 64-bit OS, ARM servers | `linux-arm64` |
   | Raspberry Pi 2/3 with 32-bit OS | `linux-armv7` |
   | Raspberry Pi Zero / 1 | `linux-armv6` |
   | Any 64-bit Linux PC or NAS | `linux-x86_64` (works on every distro) |
   | Windows | `windows-x64.zip` |
   | Mac | `macos-universal` |

2. Unpack it into a folder where it may keep its data, then start it:
   ```sh
   ./vfm-server            # Windows: double-click vfm-server.exe
   ```
3. The first start creates `vfm-server.toml` and prints what you need:
   ```
   App:        add http://192.168.1.20:8787 in Settings → Servers
   Admin page: http://192.168.1.20:8787/admin   token: 3f9c…
   Encryption: recommended   new accounts: Invite
   Logger:     not paired. Pairing code 441974 (valid 15 min)
   ```
   Note the **address**, the **admin token** and, if you want the logger, the **pairing
   code**. On Windows, allow it through the firewall for private networks when asked.

#### Keep it running on Linux (systemd)

```sh
sudo cp vfm-server /usr/local/bin/
sudo useradd --system --create-home --home-dir /var/lib/vfm-server vfm
sudo cp vfm-server.service /etc/systemd/system/      # included in the download
sudo systemctl enable --now vfm-server
journalctl -u vfm-server -f        # shows the address, admin token and pairing code
```

Run commands as that user, for example:
`sudo -u vfm vfm-server --config /var/lib/vfm-server/vfm-server.toml invite`

#### Keep it running on Windows

Put the folder somewhere permanent, then press Win+R, type `shell:startup`, and put a
shortcut to `vfm-server.exe` in the folder that opens. Or use Task Scheduler with
*At log on*, starting in that folder.

### 3b. Container (Docker / Podman)

The image `ghcr.io/luminoowo/vfm-server` is about 7 MB and works on amd64, arm64, arm/v7,
arm/v6 and 386. It runs as an unprivileged user and keeps everything in `/data`.

```sh
docker run -d --name vfm-server --restart unless-stopped \
  -p 8787:8787 -v vfm-data:/data ghcr.io/luminoowo/vfm-server
docker logs vfm-server                      # address, admin token, pairing code
docker exec vfm-server /vfm-server invite   # make an invite code
```

Podman works the same way: replace `docker` with `podman`. Rootless is fine.

**Compose:** [`server/container/compose.yaml`](../server/container/compose.yaml) has every
setting, commented. Download it, adjust it, then run `docker compose up -d` (or
`podman compose up -d`).

**Podman as a systemd service (Quadlet):**
1. Copy [`server/container/vfm-server.container`](../server/container/vfm-server.container) to
   `~/.config/containers/systemd/`.
2. Run `systemctl --user daemon-reload && systemctl --user start vfm-server`.
3. With `podman-auto-update.timer` enabled, it also updates itself.

**Settings from environment variables:** for example `-e VFM_NAME="Lumi's Pi"`,
`-e VFM_ENCRYPTION=force-on` or `-e VFM_REGISTRATION=invite`. The full list is in the
[reference](../server/README.md#container).

### 3c. Old Android phone (Termux)

1. Install [Termux](https://f-droid.org/packages/com.termux/) from F-Droid. The Play Store
   version is outdated.
2. Download `vfm-server-<version>-android-termux-arm64.tar.gz` (or `-armv7`) on the phone.
3. In Termux:
   ```sh
   termux-setup-storage
   tar xzf /sdcard/Download/vfm-server-*-android-termux-arm64.tar.gz
   cd vfm-server-*/ && termux-wake-lock && ./vfm-server
   ```
4. Turn off battery optimization for Termux. To start it after a reboot, use
   [Termux:Boot](https://f-droid.org/packages/com.termux.boot/).

### Choose the server's rules (optional)

Open the admin page (`http://<machine>:8787/admin`, with the token). It's reachable from your
home network by default. There you can set:

- **Name and message** that people see in the app.
- **New accounts:** `open` (anyone who knows the address), `invite` (default: invite code
  needed), or `closed`.
- **Encryption policy:**

  | Policy | Effect in the app |
  |---|---|
  | `force-on` | Only encrypted uploads. Best for servers others can reach. |
  | `recommended` *(default)* | Encryption starts on; people may turn it off. |
  | `optional` | Encryption starts off; people may turn it on. |
  | `force-off` | Never encrypted. The app warns everyone before each upload that the server can read it. |

- **Invite codes:** make them here, or with `vfm-server invite --uses 5 --days 30`.

## 4. Connect the app

1. Open **Settings → Servers and sharing → Servers**.
2. Under **Add a server**, enter the address, for example `192.168.1.20:8787` or
   `vfm.example.com`, and click **Add**.
3. The server appears with its name, encryption policy and message. Enter the **invite code**
   if it asks for one, then click **Join this server**.
4. After joining, two switches appear:
   - **Share my data here:** upload your data to this server (details in the next step).
   - **Get what friends share with me here:** download what friends shared with you.
5. **Syncing** (top of the dialog):
   - **Sync while the app is open, every** 15 min to 12 h.
   - **Use activity friends share with me for group suggestions.**
   - **Use my loggers' history for group suggestions.**
   - **Sync all now** syncs right away.

Your **encryption default**, near the top of the dialog, applies wherever a server lets you
choose:

- *Server-based*: follow each server's suggestion.
- *Always on*.
- *Always off*.

Each server also has its own switch, and its *(?)* explains why it's set the way it is.

## 5. Share with friends

Sharing only works with friends who **joined the same server**.

1. Under the server, tick **Share my data here** and choose what to share:
   - **Friend list:** your friends' names and IDs, so friends see your connections even
     where VRChat hides mutual friends.
   - **Activity:** how much time pairs of your friends spent in the same instance (from
     your game logs, live locations and loggers). This improves their group suggestions.
2. **Who can get it:** *All my friends* or *Some circles* (pick the circles). Friends who
   join later get it on your next sync.
3. Leave **encryption on** unless you fully trust whoever runs the server. On a `force-off`
   server the app asks before every upload, and you can tell it not to ask again.
4. Your friends do the same on their side and tick **Get what friends share with me here**.

What friends share with you shows up in two places:

- their friend lists under **Shared lists**, ready for "also in X's list" filters and
  friends-of-friends on the map
- their activity in your group suggestions

**Keys, in short.** Every app install has its own key. The first time you see a friend's key,
the app remembers it. If a server later hands out a different one, the app holds that person
back under **Changed keys** until you accept. A changed key usually means a reinstall; it could
also be a server trying to read along. To be sure, compare fingerprints, or put the line from
**Your key → Copy bio line** in your VRChat bio. Friends' apps then show your key as confirmed.

## 6. Turn on the logger

Only on a server **you** run (see the privacy note in step 1).

1. Get a pairing code. It's printed on the first start; `vfm-server pair-code` (or
   `docker exec vfm-server /vfm-server pair-code`) makes a new one, valid for 15 minutes.
   The admin page has one too.
2. In the app, under that server: **Logger → enter the 6 digits → Pair logger**.
3. The logger shows **● Logging**, how many friends are online, and how many pairs it has seen
   together. Logging out of the app keeps it running.
4. Make sure **Use my loggers' history for group suggestions** is on (Syncing section).

To stop, use **Unpair (keep history)** or **Unpair and delete history**.

While a logger runs, don't also leave the app open on another always-on device just to log.
That would ask VRChat for the same data twice.

## 7. Reach it from outside your home

At home, nothing else is needed. For friends elsewhere, use HTTPS:

- **[Tailscale](https://tailscale.com)** (easiest, no open ports): friends join your tailnet,
  or you use Tailscale Funnel for a public HTTPS address.
- **Cloudflare Tunnel:** also no open ports; point it at `http://localhost:8787`.
- **Your own domain and a reverse proxy**, for example [Caddy](https://caddyserver.com),
  which gets the certificate by itself:
  ```
  vfm.example.com {
      reverse_proxy 127.0.0.1:8787
  }
  ```
  Then set `listen = "127.0.0.1:8787"` in `vfm-server.toml`, and enter `vfm.example.com` in
  the app. Serve it at the root of a host name, not under a sub-path.

Behind a proxy, set the admin page to `allow = "local"` (or block `/admin` in the proxy):
every request then seems to come from the machine itself. For a server others can reach, the
`force-on` encryption policy is a good idea.

The app warns when a server outside your home network uses plain `http://`.

## 8. Several servers, several devices

- **Several servers:** add as many as you like, for example your own Pi plus a friend's
  server. The app uploads to each one with that server's settings, and merges what comes back.
  One server going away loses nothing.
- **Several devices** (PC and phone): give them **the same key**, or the second device can't
  read what's shared with you:
  1. On the first device: **Your key → Copy key to another device → Copy**. This is your
     private key, so only paste it into your own devices.
  2. On the other device: **Your key → Use key from another device**, paste it, and confirm.

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| App can't reach the server | Same network? Firewall allows port 8787? Try `http://<address>:8787/v1/info` in a browser: it should show JSON. |
| "This server isn't taking new people" | The owner set new accounts to `closed`; ask them for an invite or to open it. |
| Invite code rejected | Codes expire or run out of uses. Make a new one: `vfm-server invite`. |
| "This server's own key changed" | Expected after reinstalling the server or losing `vfm-data/server.key`. If you didn't, don't trust it. |
| A friend is listed under "Changed keys" | They reinstalled or set up a new device without copying their key. Compare fingerprints, then **Accept new key**. |
| Friend's data doesn't show up | Both of you must have joined the same server. They must share with *All my friends* or a circle you're in, and you need **Get what friends share with me here** on. Then **Sync all now**. |
| Logger says "Not connected" | Check `journalctl -u vfm-server` or `docker logs vfm-server`. If the VRChat login expired, pair again. |
| Lost the admin token | `vfm-server token` shows it; `vfm-server token --new` replaces it. |

Back up `vfm-server.toml` and the `vfm-data/` folder (the `vfm-data` volume in a container).
