#!/usr/bin/env bash
# Install VRC Friend Map for the current user (no root needed).
#
#   ./install.sh               install or update
#   ./install.sh --uninstall   remove (your saved data is kept)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
bin_dir="${XDG_BIN_HOME:-$HOME/.local/bin}"
data_home="${XDG_DATA_HOME:-$HOME/.local/share}"
app_dir="$data_home/applications"
icon_dir="$data_home/icons/hicolor"

if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$bin_dir/vrc-friend-map" "$app_dir/vrc-friend-map.desktop"
  rm -f "$icon_dir"/{32x32,128x128,256x256,512x512}/apps/vrc-friend-map.png
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$app_dir" || true
  echo "Removed VRC Friend Map."
  echo "Your data is still in $data_home/app.vrcfriendmap; delete that folder to remove it too."
  exit 0
fi

install -Dm755 "$here/vrc-friend-map" "$bin_dir/vrc-friend-map"
for size in 32 128 256 512; do
  install -Dm644 "$here/icons/${size}x${size}.png" "$icon_dir/${size}x${size}/apps/vrc-friend-map.png"
done
mkdir -p "$app_dir"
sed "s|^Exec=.*|Exec=$bin_dir/vrc-friend-map|" "$here/vrc-friend-map.desktop" > "$app_dir/vrc-friend-map.desktop"
chmod 644 "$app_dir/vrc-friend-map.desktop"
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$app_dir" || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t "$icon_dir" || true

# Check the system libraries the app needs.
if command -v ldd >/dev/null 2>&1 && ldd "$bin_dir/vrc-friend-map" | grep -q "not found"; then
  echo
  echo "⚠ Some system libraries are missing:"
  ldd "$bin_dir/vrc-friend-map" | grep "not found" | sed 's/^/    /'
  echo "  Install WebKitGTK 4.1 for your distro (see README.txt), then start the app."
fi

echo "Installed VRC Friend Map to $bin_dir/vrc-friend-map"
echo "Start it from your app menu, or run: $bin_dir/vrc-friend-map"
