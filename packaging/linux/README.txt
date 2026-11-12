VRC Friend Map @VERSION@ (Linux, portable)
==========================================

Install for your user (no root needed):

    ./install.sh

This copies the program to ~/.local/share/vrc-friend-map-app (linked from ~/.local/bin),
adds it to your app menu and installs the icon. Run ./install.sh --uninstall to remove it
again. You can also just run ./vrc-friend-map from this folder without installing.

This build runs on Chromium, which comes with it (that's why the download is big). It
needs GTK 3 and 4 and the usual desktop libraries, which most desktops already have. If it
doesn't start, install them:

    Debian / Ubuntu / Mint:  sudo apt install libgtk-3-0 libgtk-4-1 libnss3 libasound2t64  (older: libasound2)
    Fedora:                  sudo dnf install gtk3 gtk4 nss alsa-lib
    Arch / Manjaro:          sudo pacman -S gtk3 gtk4 nss alsa-lib
    openSUSE:                sudo zypper install gtk3 gtk4 mozilla-nss alsa

Installed this way, Chromium's sandbox works only where the system allows unprivileged
user namespaces; where it doesn't (Ubuntu 24.04 and later restrict them), the app starts
without Chromium's sandbox. The .deb and .rpm packages always keep it.

Your data (session, cache, circles) is stored in ~/.local/share/app.vrcfriendmap.

Source code and other packages: https://github.com/LuminoOwO/vrc-friend-map
