#!/bin/sh
# Starts the program; libraries the Flatpak runtime lacks sit in extra-libs.
DIR=/app/lib/vrc-friend-map
export LD_LIBRARY_PATH="$DIR/extra-libs${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$DIR/vrc-friend-map" "$@"
