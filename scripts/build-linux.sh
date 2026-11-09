#!/usr/bin/env bash
# Build VRC Friend Map on Linux.
#
#   scripts/build-linux.sh            pick a package type for this distro
#   scripts/build-linux.sh deb        Debian / Ubuntu / Mint package
#   scripts/build-linux.sh rpm        Fedora / openSUSE package
#   scripts/build-linux.sh appimage   portable AppImage
#   scripts/build-linux.sh none       just the program (target/release/vrc-friend-map)
#
# It doesn't install system packages for you; it tells you what's missing.
# See "Building on Linux" in README.md for the install commands per distro.
set -euo pipefail
cd "$(dirname "$0")/.."

missing=0
need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "✗ Missing '$1': $2" >&2
    missing=1
  fi
}
need node  "install Node.js 20 or newer (https://nodejs.org or your package manager)"
need npm   "it comes with Node.js"
need cargo "install Rust: curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh"
need pkg-config "install pkg-config (Debian/Ubuntu: pkg-config, Fedora: pkgconf-pkg-config)"
need cc    "install a C compiler (Debian/Ubuntu: build-essential, Fedora: the c-development group, Arch: base-devel)"

if command -v pkg-config >/dev/null 2>&1; then
  for lib in webkit2gtk-4.1 gtk+-3.0 librsvg-2.0; do
    if ! pkg-config --exists "$lib"; then
      echo "✗ Missing development files for '$lib' (see README: Building on Linux)" >&2
      missing=1
    fi
  done
fi

if command -v node >/dev/null 2>&1; then
  major=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$major" -lt 20 ]; then
    echo "✗ Node.js $major is too old; version 20 or newer is needed" >&2
    missing=1
  fi
fi

if [ "$missing" -ne 0 ]; then
  echo "Install the missing pieces above, then run this script again." >&2
  exit 1
fi

bundle="${1:-auto}"
if [ "$bundle" = "auto" ]; then
  id_like=""
  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    id_like="${ID:-} ${ID_LIKE:-}"
  fi
  case "$id_like" in
    *debian*|*ubuntu*) bundle=deb ;;
    *fedora*|*rhel*|*suse*) bundle=rpm ;;
    *arch*) bundle=none ;;
    *) bundle=appimage ;;
  esac
  echo "→ Building a '$bundle' package for this system (pass deb, rpm, appimage or none to override)"
fi

case "$bundle" in
  deb|rpm|appimage|none) ;;
  *) echo "Unknown package type '$bundle' (use deb, rpm, appimage or none)" >&2; exit 2 ;;
esac

if [ -f package-lock.json ]; then npm ci; else npm install; fi

if [ "$bundle" = "none" ]; then
  npx tauri build --no-bundle
  echo
  echo "✓ Built: src-tauri/target/release/vrc-friend-map"
else
  npx tauri build --bundles "$bundle"
  echo
  echo "✓ Built package(s):"
  find src-tauri/target/release/bundle -maxdepth 2 -type f \( -name '*.deb' -o -name '*.rpm' -o -name '*.AppImage' \) -print
  case "$bundle" in
    deb) echo "Install with: sudo apt install ./src-tauri/target/release/bundle/deb/<file>.deb" ;;
    rpm) echo "Install with: sudo dnf install ./src-tauri/target/release/bundle/rpm/<file>.rpm (or zypper install)" ;;
    appimage) echo "Run with: chmod +x <file>.AppImage && ./<file>.AppImage" ;;
  esac
fi
