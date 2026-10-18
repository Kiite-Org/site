#!/bin/sh
# Renders tools/og-card.html to src/assets/og.png, the 1200×630 link preview image.
# Needs Python 3 and Chrome or Chromium.
set -e
cd "$(dirname "$0")/.."
chrome=$(command -v google-chrome-stable || command -v google-chrome || command -v chromium || command -v chromium-browser)
python3 -m http.server 4199 --bind 127.0.0.1 >/dev/null 2>&1 &
server=$!
trap 'kill $server' EXIT
sleep 1
profile=$(mktemp -d)
"$chrome" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$profile" \
  --virtual-time-budget=4000 --window-size=1200,630 \
  --screenshot="$PWD/src/assets/og.png" http://127.0.0.1:4199/tools/og-card.html >/dev/null 2>&1
rm -rf "$profile"
echo "Wrote src/assets/og.png"
