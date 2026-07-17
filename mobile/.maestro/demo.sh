#!/bin/bash
# GRQ Go — the side-by-side demo. Drives the iPhone and the iPad through the SAME tour at the SAME
# time, for filming. Run it ON THE MAC (or: macbridge run '~/Developer/.../demo.sh').
#
#   Today → Portfolio → Personal → The Wire → Watchlist → More → (finale) → close
#   iPhone finale: Options Desk     iPad finale: How GRQ works
#
# "Reset" here means BACK TO THE HOME SCREEN, not `simctl erase` — erasing wipes the Google session
# and only Cameron can sign back in. Never erase these two sims.
set -u

# Homebrew + maestro are NOT on a non-login shell's PATH, and openjdk is keg-only.
export PATH="/opt/homebrew/opt/openjdk/bin:/opt/homebrew/bin:$HOME/.maestro/bin:$PATH"
export MAESTRO_CLI_NO_ANALYTICS=1

PHONE=2AE351D0-24F1-4DB5-985A-093AB1DC23C7   # iPhone 17 Pro Max, iOS 26.5  (portrait)
IPAD=64FAF948-D4F3-41D7-88C6-2DF081D8E47F    # iPad Pro 13" M5,  iOS 26.5  (LANDSCAPE — how Cam uses it)
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "▸ Resetting both to the home screen (app closed, session kept)..."
for d in "$PHONE" "$IPAD"; do
  xcrun simctl bootstatus "$d" >/dev/null 2>&1 || xcrun simctl boot "$d" >/dev/null 2>&1
  xcrun simctl terminate "$d" com.camerontora.grqgo >/dev/null 2>&1
done
open -a Simulator
sleep 3
echo "  ✓ both on the home screen — arrange the windows, then press Return to roll"
read -r _

echo "▸ Rolling both devices..."
maestro --device "$PHONE" test "$HERE/demo-iphone.yaml" > /tmp/demo-iphone.log 2>&1 &
P=$!
maestro --device "$IPAD"  test "$HERE/demo-ipad.yaml"  > /tmp/demo-ipad.log  2>&1 &
I=$!
wait $P; RP=$?
wait $I; RI=$?

echo ""
echo "  iPhone: $([ $RP -eq 0 ] && echo '✓ completed' || echo "✖ failed (rc=$RP) — see /tmp/demo-iphone.log")"
echo "  iPad:   $([ $RI -eq 0 ] && echo '✓ completed' || echo "✖ failed (rc=$RI) — see /tmp/demo-ipad.log")"
exit $(( RP | RI ))
