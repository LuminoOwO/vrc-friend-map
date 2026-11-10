# vfm-server

A small always-on helper for [VRC Friend Map](https://github.com/LuminoOwO/vrc-friend-map).
It does two things, either or both:

- **Logger.** Pair it with your app once, and it watches your friends' locations through
  VRChat's live feed around the clock. That's the same feed the app uses while it's open.
  It counts who is in the same instance as whom, so circle suggestions get much better
  than from your own game logs alone. Private and invite-only instances are hidden by
  VRChat and don't count.
- **Exchange.** You and your friends upload your friend lists and activity, and download
  what others share with you. Use as many servers as you like (your own, a friend's, a
  public one): the app uploads to all of them and merges what comes back.

It's one file, about 3 MB, with no dependencies. It runs on a Raspberry Pi, an old laptop, a
NAS, a Windows or Mac PC, or an old Android phone (in Termux). Memory use is a few MB, and
it sleeps between events.

## Privacy and encryption

Every app install has its own key pair; the private half never leaves the device. When
encryption is on, the app locks your upload with a fresh key, then wraps that key
separately for each person you share with (X25519 + XChaCha20-Poly1305). **The server
stores only ciphertext. Even its owner, with the files on disk, can't read it.** It can
see who uploads, the list of people allowed to fetch each item (it needs that to enforce
access), sizes and times.

Everything is signed. A server can't change what someone shared or make up uploads in
their name, and requests can't be replayed. The app pins every friend's key the first time
it sees it. If a server later hands out a different key (a reinstall, or a server trying
to read along), the app holds that person back until you accept the new key. Friends can
also put a `vfm-key:…` line in their VRChat bio, and the app then confirms their key.

The server owner picks the encryption policy:

| `encryption =` | In the app |
|---|---|
| `"force-off"` | The switch is locked to off. Before every upload the app warns that the server can read the data, and that people who don't fully trust the server shouldn't upload. |
| `"optional"` | Either; the switch starts off. |
| `"recommended"` | Either; the switch starts on. *(default)* |
| `"force-on"` | The switch is locked to on: only encrypted uploads are accepted. Good for public servers. |

The logger is different by nature: it needs your VRChat login to watch your friends. The
app sends the login sealed so only that server can open it. Run the logger only on a
machine you control.

## Start it

1. Download the file for your device from the
   [Releases page](https://github.com/LuminoOwO/vrc-friend-map/releases) (`vfm-server-<version>-<platform>`).
2. Unpack it and run `vfm-server` in a folder where it may keep its data.
3. The first start creates `vfm-server.toml`, and prints the address to enter in the app,
   the admin page link with its token, and a pairing code for the logger:

```
vfm-server 0.7.0 – VRC Friend Map server
App:        add http://192.168.1.20:8787 in Settings → Servers
Admin page: http://192.168.1.20:8787/admin   token: 3f9c…
Encryption: recommended   new accounts: Invite
Logger:     not paired. Pairing code 441974 (valid 15 min; `vfm-server pair-code` makes a new one)
```

4. In the app: **Settings → Servers → Add server**, enter the address, then
   **Join this server**. By default joining needs an invite code: run
   `vfm-server invite`, or make one on the admin page. To use the logger, enter the
   pairing code under *Logger → Pair logger*.

| Device | File | Notes |
|---|---|---|
| Raspberry Pi 3/4/5 (64-bit OS), ARM servers | `linux-arm64` | |
| Raspberry Pi 2/3 (32-bit OS) | `linux-armv7` | |
| Raspberry Pi Zero / 1 | `linux-armv6` | |
| Any 64-bit Linux PC / NAS | `linux-x86_64` | Static: works on any distro, Alpine included. |
| Old 32-bit PC | `linux-x86` | |
| Android phone or tablet | `android-termux-arm64` (or `-armv7`) | See below. |
| Windows | `windows-x64.zip` | Allow it through the firewall when Windows asks (private networks). |
| Mac | `macos-universal` | First start: right-click → Open (not notarized). |
| Docker / Podman (NAS, home server) | `ghcr.io/luminoowo/vfm-server` | See [Container](#container). |

**iPhone / iPad:** iOS stops background programs, so it can't run a server. The app on an
iPhone can still upload to and download from servers, and its own live tracking works
while it's open.

### Keep it running

**Linux (systemd).** Copy the binary to `/usr/local/bin/`, then:

```sh
sudo useradd --system --create-home --home-dir /var/lib/vfm-server vfm
sudo cp vfm-server.service /etc/systemd/system/
sudo systemctl enable --now vfm-server
journalctl -u vfm-server -f        # shows the address, admin token and pairing code
```

Settings and data live in `/var/lib/vfm-server/`. Run commands as that user:
`sudo -u vfm vfm-server --config /var/lib/vfm-server/vfm-server.toml invite`.

**Android (Termux).** Install [Termux](https://f-droid.org/packages/com.termux/) from
F-Droid (the Play Store version is outdated), then:

```sh
termux-setup-storage            # optional
tar xzf /sdcard/Download/vfm-server-*-android-termux-arm64.tar.gz
cd vfm-server-*/ && termux-wake-lock && ./vfm-server
```

`termux-wake-lock` keeps Android from pausing it. Also turn off battery optimization for
Termux. To start it after a reboot, use [Termux:Boot](https://f-droid.org/packages/com.termux.boot/)
with a script in `~/.termux/boot/`.

**Windows.** Put the folder somewhere permanent and add a shortcut to `vfm-server.exe` in
`shell:startup`. You can also create a Task Scheduler task "At log on" that starts in
that folder.

**Docker / Podman.** See [Container](#container) below.

### Reaching it from outside your home

On your home network nothing else is needed. For friends elsewhere, put it behind HTTPS:

- [Tailscale](https://tailscale.com) or similar: no open ports. Friends join your tailnet,
  or you use Tailscale Funnel for a public HTTPS address.
- A reverse proxy with a certificate: [Caddy](https://caddyserver.com) does it in two lines:
  ```
  vfm.example.com {
      reverse_proxy 127.0.0.1:8787
  }
  ```
  Then set `listen = "127.0.0.1:8787"` so it's only reachable through Caddy, and enter
  `vfm.example.com` in the app. Serve it at the root of a host name, not under a sub-path.
- Cloudflare Tunnel works the same way.

Behind a proxy every request comes from 127.0.0.1, so the admin page's `allow = "lan"`
would let anyone through the proxy reach the page (they still need the token). Set
`allow = "local"` and open the admin page on the machine itself, or block `/admin` in the
proxy.

## Container

A ready-made image for amd64, arm64 (Pi 3/4/5 on a 64-bit OS), arm/v7, arm/v6 (Pi Zero/1)
and 386:

```
ghcr.io/luminoowo/vfm-server:latest        (or a version: :0.7.0)
```

It's about 7 MB: just the static server binary, built on nothing (`FROM scratch`). It runs
as an unprivileged user (65532) and keeps everything in the `/data` volume. A health
check is built in, and it stops cleanly on `docker stop` (it saves first).

**Docker:**

```sh
docker run -d --name vfm-server --restart unless-stopped -p 8787:8787 -v vfm-data:/data ghcr.io/luminoowo/vfm-server
docker logs vfm-server                       # admin token + logger pairing code
docker exec vfm-server /vfm-server invite    # every command works like this
```

**Podman:** the same command with `podman` instead of `docker`. Rootless works.

**Compose (Docker or Podman):** [`container/compose.yaml`](container/compose.yaml) has every
setting, commented. Run `docker compose up -d`, or `podman compose up -d`.

**Podman as a systemd service:** [`container/vfm-server.container`](container/vfm-server.container)
is a Quadlet file. Copy it to `~/.config/containers/systemd/`, then run
`systemctl --user daemon-reload && systemctl --user start vfm-server`. With
`AutoUpdate=registry` and the `podman-auto-update.timer` enabled, it updates itself.

**Settings by environment variable.** These win over `vfm-server.toml` on every start. The
admin page shows them as fixed. Leave them out to manage everything on the admin page.

| Variable | Example |
|---|---|
| `VFM_NAME`, `VFM_MOTD` | `"Lumi's Pi"` |
| `VFM_ENCRYPTION` | `force-off`, `optional`, `recommended`, `force-on` |
| `VFM_REGISTRATION` | `open`, `invite`, `closed` |
| `VFM_LOGGER` | `true` / `false` |
| `VFM_CONTACT` | added to the User-Agent VRChat sees |
| `VFM_ADMIN_ALLOW` | `off`, `local`, `lan`, `any` |
| `VFM_ADMIN_TOKEN` | at least 16 characters (otherwise one is generated) |
| `VFM_MAX_ITEM_KB`, `VFM_MAX_USERS`, `VFM_RESYNC_MINUTES`, `VFM_KEEP_HOPS_MONTHS` | numbers |
| `VFM_PUBLIC_URL` | only changes what the startup message tells you to enter in the app |

**Binding a folder instead of a volume:** the server runs as user 65532, so give it the
folder: `sudo chown 65532:65532 ./data`. With rootless Podman, add `:U` instead
(`-v ./data:/data:U`).

**Admin page in a container:** Docker's port forwarding makes visitors appear to come from
a private address, so `allow = "lan"` lets in anyone who can reach the port. That's fine
at home. If the port is open to the internet, set `VFM_ADMIN_ALLOW=off` and use
`docker exec`. The page still needs the token either way.

**Building it yourself** from the repository root:
`docker build -f server/Dockerfile -t vfm-server .` (or `podman build`).

## Admin page

`http://<machine>:8787/admin`, with the token from `vfm-server.toml`. On it you can:

- See how many people use the server and what they share (encrypted items show only
  sizes and recipient counts).
- See the logger's state and make pairing codes.
- Change the name, the note shown in the app, sign-up rules and encryption policy.
- Make and delete invite codes.
- Remove an account: for someone who lost their key, so they can sign up again.

The page is served by the server itself; nothing else runs in the background. By default
it only answers on your home network (`[admin] allow`).

## Commands

```
vfm-server                       start (same as `vfm-server run`)
vfm-server invite --uses 5 --days 30 --note "Friday crew"
vfm-server pair-code             one-time logger pairing code (15 minutes)
vfm-server status                accounts, shared items, logger
vfm-server remove-user usr_…     delete an account and what it shared
vfm-server token [--new]         show or replace the admin token
vfm-server healthcheck           exit 0 if the running server answers
--config FILE                    use another settings file (also $VFM_CONFIG)
```

## Files

```
vfm-server.toml          settings (commented; the admin page keeps the comments)
vfm-data/
  server.key             the server's own key (secret)
  users.json             accounts: VRChat ID + public keys
  invites.json           open invite codes
  items/<user>/*.json    uploads exactly as received (encrypted ones are unreadable)
  logger/
    owner.json           who paired the logger
    session.json         that VRChat login (secret)
    totals.json          time together per pair, per person, per world
    hops-YYYY-MM.jsonl   raw location changes, kept `keep_hops_months` (default 12)
```

Back up `vfm-server.toml` and `vfm-data/`. If you lose `server.key`, everyone's app warns
that the server's key changed, and they have to confirm it.

## Being nice to VRChat

The logger uses one live connection, like the app. It refreshes the friend list every 30
minutes with a 2-second pause between pages, waits on HTTP 429, and sends a User-Agent
naming the project. Add your contact under `[logger] contact` if you like. While the
logger runs, don't also run the app's own background refresh on another always-on device.

## Protocol

For other clients:

- **Requests:** HTTP+JSON under `/v1`. Signed requests carry
  `Authorization: VFM1 u=<user>;t=<unix>;n=<nonce>;s=<sig>`, an Ed25519 signature over
  method, path with query, time, nonce and the body's SHA-256.
- **Envelopes:** owner-signed. Sealed ones carry a content key wrapped per recipient
  (ephemeral X25519 → HKDF-SHA256 → XChaCha20-Poly1305).
- **Code:** see `crates/vfm-share` for both.

| Endpoint | |
|---|---|
| `GET /v1/info` | name, policy, keys, limits |
| `POST /v1/register` | `{identity, invite?}`, signed with that identity |
| `GET /v1/users?ids=` | public keys of registered people |
| `PUT/DELETE /v1/items/{friends\|activity}` | your uploads |
| `GET /v1/inbox` | items addressed to you, with their owners' keys |
| `GET/DELETE /v1/me` | your account |
| `POST/DELETE /v1/logger/pair`, `GET /v1/logger/status`, `GET /v1/logger/stats` | logger (owner only; stats come sealed and signed by the server) |
