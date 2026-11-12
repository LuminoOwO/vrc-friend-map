#!/usr/bin/env bash
# Build VRC Friend Map on Linux.
#
#   scripts/build-linux.sh                 pick a package type for this distro
#   scripts/build-linux.sh all             every format below
#   scripts/build-linux.sh deb rpm ...     any of: deb rpm appimage tarball none
#
#   deb       Debian / Ubuntu / Mint package
#   rpm       Fedora / openSUSE / RHEL package
#   appimage  portable AppImage (runs on most distros)
#   tarball   portable .tar.gz with a per-user install script (no root needed)
#   none      just the program: src-tauri/target/release/vrc-friend-map
#
# Web engine: Chromium (CEF) by default; add --webkit (or VFM_ENGINE=webkit)
# for the older WebKitGTK build. WebKitGTK draws the map on the CPU on many
# systems, so big windows get slow; Chromium uses the GPU. The Chromium build
# needs GTK 4 development files instead of WebKitGTK, downloads Chromium
# (about 1 GB, kept in ~/.cache/tauri-cef) and, once, builds Tauri's command
# line tool from the branch with Chromium support into .tools/ (a few minutes).
#
# Finished files are copied to release/ with standard names, plus SHA256SUMS:
#   vrc-friend-map_<version>_amd64.deb
#   vrc-friend-map-<version>-1.x86_64.rpm
#   vrc-friend-map-<version>-x86_64.AppImage
#   vrc-friend-map-<version>-linux-x86_64.tar.gz
#
# It doesn't install system packages for you; it tells you what's missing.
# See "Building on Linux" in README.md for the install commands per distro.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# ---------- web engine ----------
ENGINE="${VFM_ENGINE:-chromium}"
rest=()
for a in "$@"; do
  case "$a" in
    --webkit) ENGINE=webkit ;;
    --chromium) ENGINE=chromium ;;
    *) rest+=("$a") ;;
  esac
done
set -- "${rest[@]+"${rest[@]}"}"
case "$ENGINE" in
  chromium|webkit) ;;
  *) echo "Unknown engine '$ENGINE' (use chromium or webkit)" >&2; exit 2 ;;
esac

# ---------- prerequisites ----------
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
  if [ "$ENGINE" = chromium ]; then libs=(gtk4 gtk+-3.0 librsvg-2.0); else libs=(webkit2gtk-4.1 gtk+-3.0 librsvg-2.0); fi
  for lib in "${libs[@]}"; do
    if ! pkg-config --exists "$lib"; then
      echo "✗ Missing development files for '$lib' (see README: Building on Linux)" >&2
      missing=1
    fi
  done
fi
[ "$ENGINE" = chromium ] && need python3 "install Python 3 (it sets up the Chromium build)"
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

# ---------- what to build ----------
formats=("$@")
if [ ${#formats[@]} -eq 0 ] || [ "${formats[0]}" = "auto" ]; then
  id_like=""
  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    id_like="${ID:-} ${ID_LIKE:-}"
  fi
  case "$id_like" in
    *debian*|*ubuntu*) formats=(deb) ;;
    *fedora*|*rhel*|*suse*) formats=(rpm) ;;
    *arch*) formats=(tarball) ;;
    *) formats=(appimage) ;;
  esac
  echo "→ Building '${formats[*]}' for this system (pass all, deb, rpm, appimage, tarball or none to choose)"
elif [ "${formats[0]}" = "all" ]; then
  formats=(deb rpm appimage tarball)
fi
bundles=()
for f in "${formats[@]}"; do
  case "$f" in
    deb|rpm|appimage) bundles+=("$f") ;;
    tarball|none) ;;
    *) echo "Unknown format '$f' (use all, deb, rpm, appimage, tarball or none)" >&2; exit 2 ;;
  esac
done
# The Chromium tarball is put together from the .deb's files (the program
# plus Chromium), so build the .deb too.
if [ "$ENGINE" = chromium ] && [[ " ${formats[*]} " == *" tarball "* ]] && [[ " ${bundles[*]-} " != *" deb "* ]]; then
  bundles+=(deb)
fi

VERSION=$(node -p 'require("./package.json").version')
CARGO_VERSION=$(sed -n 's/^version *= *"\(.*\)"/\1/p' src-tauri/Cargo.toml | head -n1)
TAURI_VERSION=$(node -p 'require("./src-tauri/tauri.conf.json").version')
if [ "$VERSION" != "$CARGO_VERSION" ] || [ "$VERSION" != "$TAURI_VERSION" ]; then
  echo "Version mismatch: package.json $VERSION, Cargo.toml $CARGO_VERSION, tauri.conf.json $TAURI_VERSION" >&2
  echo "Set all three to the same version before building." >&2
  exit 1
fi
case "$(uname -m)" in
  x86_64)  ARCH=x86_64;  DEB_ARCH=amd64; RPM_ARCH=x86_64 ;;
  aarch64) ARCH=aarch64; DEB_ARCH=arm64; RPM_ARCH=aarch64 ;;
  *)       ARCH=$(uname -m); DEB_ARCH=$ARCH; RPM_ARCH=$ARCH ;;
esac

# ---------- build ----------
if [ -f package-lock.json ]; then npm ci; else npm install; fi
if [ "$ENGINE" = chromium ]; then
  echo "→ Web engine: Chromium (pass --webkit for the WebKitGTK build)"
  python3 scripts/chromium.py apply
  trap 'python3 scripts/chromium.py revert >/dev/null' EXIT
  CEF_REV=$(python3 -c 'import runpy, sys; print(runpy.run_path(sys.argv[1])["REV"])' scripts/chromium.py)
  TOOLS="$ROOT/.tools"
  if [ ! -x "$TOOLS/bin/cargo-tauri" ] || [ "$(cat "$TOOLS/tauri-rev" 2>/dev/null)" != "$CEF_REV" ]; then
    echo "→ Building Tauri's command line tool with Chromium support (once; takes a few minutes)"
    cargo install --locked --force --root "$TOOLS" --git https://github.com/tauri-apps/tauri --rev "$CEF_REV" tauri-cli
    echo "$CEF_REV" > "$TOOLS/tauri-rev"
  fi
  # The npm packages (@tauri-apps/api 2.12) are newer than that branch (2.11); they talk the same way.
  TAURI=("$TOOLS/bin/cargo-tauri" build --features chromium --ignore-version-mismatches)
else
  echo "→ Web engine: WebKitGTK"
  TAURI=(npx tauri build)
fi
if [ ${#bundles[@]} -gt 0 ]; then
  "${TAURI[@]}" --bundles "$(IFS=,; echo "${bundles[*]}")"
else
  "${TAURI[@]}" --no-bundle
fi

BIN="src-tauri/target/release/vrc-friend-map"
BUNDLE_DIR="src-tauri/target/release/bundle"
OUT="release"
mkdir -p "$OUT"

pick() { # newest file matching a glob
  local f
  f=$(ls -t $1 2>/dev/null | head -n 1 || true)
  if [ -z "$f" ]; then echo "✗ Expected build output not found: $1" >&2; exit 1; fi
  printf '%s' "$f"
}

make_tarball() {
  local name="vrc-friend-map-${VERSION}-linux-${ARCH}"
  local stage
  stage=$(mktemp -d)
  local dir="$stage/$name"
  mkdir -p "$dir/icons"
  if [ "$ENGINE" = chromium ]; then
    # The program and Chromium's files, as the .deb lays them out.
    local share
    share=$(ls -d "$BUNDLE_DIR"/deb/*_"${VERSION}"_*/data/usr/share/"VRC Friend Map" 2>/dev/null | head -n 1)
    if [ -z "$share" ]; then echo "✗ Chromium files not found in the .deb build" >&2; exit 1; fi
    mkdir -p "$dir/app"
    cp -a "$share/." "$dir/app/"
    # Run from this folder: a link next to the scripts.
    ln -s app/vrc-friend-map "$dir/vrc-friend-map"
  else
    install -m755 "$BIN" "$dir/vrc-friend-map"
  fi
  install -m755 packaging/linux/install.sh "$dir/install.sh"
  install -m644 packaging/linux/vrc-friend-map.desktop "$dir/vrc-friend-map.desktop"
  install -m644 packaging/linux/README.txt "$dir/README.txt"
  install -m644 src-tauri/icons/32x32.png "$dir/icons/32x32.png"
  install -m644 src-tauri/icons/128x128.png "$dir/icons/128x128.png"
  install -m644 src-tauri/icons/128x128@2x.png "$dir/icons/256x256.png"
  install -m644 src-tauri/icons/icon.png "$dir/icons/512x512.png"
  sed -i "s/@VERSION@/${VERSION}/g" "$dir/README.txt"
  tar -C "$stage" --owner=0 --group=0 -czf "$OUT/$name.tar.gz" "$name"
  rm -rf "$stage"
}

made=()
for f in "${formats[@]}"; do
  case "$f" in
    deb)
      dest="vrc-friend-map_${VERSION}_${DEB_ARCH}.deb"
      cp "$(pick "$BUNDLE_DIR/deb/*_${VERSION}_*.deb")" "$OUT/$dest"; made+=("$dest") ;;
    rpm)
      dest="vrc-friend-map-${VERSION}-1.${RPM_ARCH}.rpm"
      cp "$(pick "$BUNDLE_DIR/rpm/*-${VERSION}-*.rpm")" "$OUT/$dest"; made+=("$dest") ;;
    appimage)
      dest="vrc-friend-map-${VERSION}-${ARCH}.AppImage"
      cp "$(pick "$BUNDLE_DIR/appimage/*_${VERSION}_*.AppImage")" "$OUT/$dest"
      chmod +x "$OUT/$dest"; made+=("$dest") ;;
    tarball)
      make_tarball; made+=("vrc-friend-map-${VERSION}-linux-${ARCH}.tar.gz") ;;
    none) ;;
  esac
done

echo
if [ ${#made[@]} -eq 0 ]; then
  echo "✓ Built: $BIN"
  exit 0
fi
# Checksums for every package of this version in release/.
(cd "$OUT" && sha256sum vrc-friend-map[-_]"${VERSION}"[-_]* > SHA256SUMS)
echo "✓ Packages in $ROOT/$OUT:"
for m in "${made[@]}"; do echo "    $m"; done
echo "    SHA256SUMS"
echo
echo "Install:"
echo "  .deb       sudo apt install ./release/vrc-friend-map_${VERSION}_${DEB_ARCH}.deb"
echo "  .rpm       sudo dnf install ./release/vrc-friend-map-${VERSION}-1.${RPM_ARCH}.rpm   (or: sudo zypper install …)"
echo "  AppImage   chmod +x vrc-friend-map-${VERSION}-${ARCH}.AppImage && ./vrc-friend-map-${VERSION}-${ARCH}.AppImage"
echo "  .tar.gz    tar xzf vrc-friend-map-${VERSION}-linux-${ARCH}.tar.gz && ./vrc-friend-map-${VERSION}-linux-${ARCH}/install.sh"
