#!/bin/sh
# Screenshot the mock page with headless Chrome: shot.sh <out.png> <width>x<height> "<query string>"
# Serve the repo root first: python3 -m http.server 8765 --bind 127.0.0.1 (from the repo root).
# Headless Chrome will not go below 500 px wide, so phone widths use a 390 px iframe (phone.html).
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
W=${2%x*}
PAGE=torn.html
[ "$W" -lt 500 ] && PAGE=phone.html
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
  --window-size="$(echo "$2" | tr x ,)" --virtual-time-budget=4000 \
  --screenshot="$1" "http://127.0.0.1:8765/tools/mock/$PAGE?$3" 2>/dev/null
