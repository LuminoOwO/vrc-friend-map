VRC Friend Map @VERSION@ (Linux, portable)
==========================================

Install for your user (no root needed):

    ./install.sh

This copies the program to ~/.local/bin, adds it to your app menu and installs the icon.
Run ./install.sh --uninstall to remove it again. You can also just run ./vrc-friend-map
from this folder without installing.

The app needs WebKitGTK 4.1 and GTK 3, which most desktops already have. If it doesn't
start, install them:

    Debian / Ubuntu / Mint:  sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0
    Fedora:                  sudo dnf install webkit2gtk4.1 gtk3
    Arch / Manjaro:          sudo pacman -S webkit2gtk-4.1 gtk3
    openSUSE:                sudo zypper install libwebkit2gtk-4_1-0 gtk3

Your data (session, cache, circles) is stored in ~/.local/share/app.vrcfriendmap.

Source code and other packages: https://github.com/LuminoOwO/vrc-friend-map
