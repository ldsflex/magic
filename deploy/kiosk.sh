#!/usr/bin/env bash
# Launch the dashboard full-screen on a Raspberry Pi.
#
# Wire it into the desktop session (LXDE/Wayfire autostart) or run it from a
# systemd user unit once the graphical target is up.
set -euo pipefail

URL="${MAGIC_URL:-http://localhost:8080/}"
PROFILE="${MAGIC_KIOSK_PROFILE:-$HOME/.config/magic-kiosk}"

# Wait for the server: on a cold boot the browser usually wins the race.
for _ in $(seq 1 60); do
  if curl -sf "${URL%/}/api/health" >/dev/null 2>&1; then break; fi
  sleep 2
done

# Stop the screen blanking and the mouse pointer parking itself mid-screen.
if command -v xset >/dev/null 2>&1; then
  xset s off
  xset -dpms
  xset s noblank
fi
command -v unclutter >/dev/null 2>&1 && unclutter -idle 0.5 -root &

BROWSER=""
for candidate in chromium-browser chromium google-chrome; do
  if command -v "$candidate" >/dev/null 2>&1; then BROWSER="$candidate"; break; fi
done
if [ -z "$BROWSER" ]; then
  echo "no chromium found — install with: sudo apt install chromium-browser" >&2
  exit 1
fi

# A previous unclean shutdown otherwise greets you with a restore-pages bubble
# on the wall, which nobody is there to dismiss.
if [ -f "$PROFILE/Default/Preferences" ]; then
  sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' "$PROFILE/Default/Preferences" || true
fi

exec "$BROWSER" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  --user-data-dir="$PROFILE" \
  --app="$URL"
