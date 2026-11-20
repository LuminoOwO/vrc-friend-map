#!/usr/bin/env bash
# Build and start the Chromium (CEF) version of the app on Linux: the same engine
# the release packages use. Use this to judge speed; `npm run tauri dev` runs on
# WebKitGTK, which draws the map on the CPU on many systems and feels much slower.
#
#   npm run chromium                 build (release, only what changed) and start
#   npm run chromium -- --no-build   start the last build
#
# Live profiling: VFM_REMOTE_DEBUG_PORT=9222 npm run chromium
# opens Chromium's DevTools port on 127.0.0.1 (attach with chrome://inspect or a
# CDP client). Never set it in normal use: anything on this computer can then
# read and change what the app shows.
set -euo pipefail
cd "$(dirname "$0")/.."

build=1
for a in "$@"; do
  case "$a" in
    --no-build) build=0 ;;
    *) echo "Unknown option '$a'" >&2; exit 2 ;;
  esac
done

if [ "$build" = 1 ]; then
  scripts/build-linux.sh none
fi

bin=src-tauri/target/release/vrc-friend-map
[ -x "$bin" ] || { echo "No build at $bin yet: run without --no-build" >&2; exit 1; }

# Chromium's own library, downloaded by the build into ~/.cache/tauri-cef.
cef=$(find "${XDG_CACHE_HOME:-$HOME/.cache}/tauri-cef" -name libcef.so -printf '%T@ %h\n' 2>/dev/null | sort -nr | head -n 1 | cut -d' ' -f2-)
[ -n "$cef" ] || { echo "libcef.so not found in ~/.cache/tauri-cef: build first" >&2; exit 1; }

if [ -n "${VFM_REMOTE_DEBUG_PORT:-}" ]; then
  # The runtime saves "remote debugging not allowed" in Chromium's Local State on every
  # normal start, and turning the port on doesn't clear it: allow it for this run.
  state="${XDG_CACHE_HOME:-$HOME/.cache}/app.vrcfriendmap/cef/Local State"
  if [ -f "$state" ]; then
    python3 - "$state" <<'EOF'
import json, sys
p = sys.argv[1]
d = json.load(open(p))
d.setdefault("devtools", {}).setdefault("remote_debugging", {})["allowed"] = True
json.dump(d, open(p, "w"))
EOF
  fi
fi

exec env LD_LIBRARY_PATH="$cef${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" "$bin"
