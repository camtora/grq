#!/bin/bash
# GRQ Go iOS sync — run on the MAC when you need to build.
# One-time install on the Mac:
#   scp -P 2222 camerontora@camerontora.ca:/home/camerontora/grq/scripts/grqgo-mac-sync.sh ~/bin/grqgo-sync && chmod +x ~/bin/grqgo-sync
# (or from the LAN: scp camerontora@192.168.2.34:/home/camerontora/grq/scripts/grqgo-mac-sync.sh ~/bin/grqgo-sync)
#
# ⚠ After editing THIS file, re-scp it to the Mac — ~/bin/grqgo-sync is a COPY, not a link.
set -e

# Homebrew's bin is on an interactive shell's PATH via ~/.zprofile, but NOT on a non-login shell's
# (`ssh mac '<cmd>'` gets /usr/bin:/bin:/usr/sbin:/sbin). So this script worked when Cam ran it in a
# terminal and died with "pod: command not found" the first time it was driven over macbridge — AFTER
# the ios/ rsync had already stripped the Pods integration out of the Mac's pbxproj, leaving the
# project unbuildable until pod install re-ran. Put brew on PATH ourselves so the script behaves the
# same either way. (2026-07-16)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

REMOTE_APP="/home/camerontora/grq/mobile"
LOCAL="$HOME/Developer/Projects/personal/grqgo-build"

# Auto-detect: use LAN when reachable, external otherwise
if nc -z -w1 192.168.2.34 22 2>/dev/null; then
  UBUNTU="camerontora@192.168.2.34"
  RSYNC_SSH="ssh"
else
  UBUNTU="camerontora@camerontora.ca"
  RSYNC_SSH="ssh -p 2222"
fi

mkdir -p "$LOCAL/ios"

# PREFLIGHT — check the tools BEFORE touching anything. Step 4 rsyncs ios/, which strips the Pods
# integration out of the Mac's pbxproj; step 5's pod install is what puts it back. So a missing tool
# discovered at step 5 doesn't just fail the run, it leaves the project UNBUILDABLE ("sandbox is not
# in sync with the Podfile.lock"). Bail while everything is still intact. (2026-07-16)
for tool in pod rsync npm; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "✖ '$tool' not found on PATH (PATH=$PATH)"
    echo "  Nothing has been synced — the build copy is untouched."
    [ "$tool" = "pod" ] && echo "  CocoaPods lives in Homebrew; this script adds /opt/homebrew/bin itself, so if it's still"
    [ "$tool" = "pod" ] && echo "  missing, install it: brew install cocoapods"
    exit 1
  }
done

echo ""
echo "┌─────────────────────────────┐"
echo "│  GRQ Go iOS Sync            │"
echo "└─────────────────────────────┘"

# ── 1. Sync package files first (must happen before npm ci) ──────────────────
echo ""
echo "▸ Syncing app.json, package.json, .env, assets/..."
rsync -aq -e "$RSYNC_SSH" "$UBUNTU:$REMOTE_APP/app.json" "$LOCAL/"
rsync -aq -e "$RSYNC_SSH" "$UBUNTU:$REMOTE_APP/.env"     "$LOCAL/"
rsync -aq -e "$RSYNC_SSH" "$UBUNTU:$REMOTE_APP/package.json" "$LOCAL/"
rsync -aq -e "$RSYNC_SSH" "$UBUNTU:$REMOTE_APP/package-lock.json" "$LOCAL/"
rsync -aq --delete -e "$RSYNC_SSH" \
  --exclude='.DS_Store' --exclude='._*' \
  "$UBUNTU:$REMOTE_APP/assets/" "$LOCAL/assets/"
echo "  ✓ app.json + package.json + .env + assets/ synced"

# ── 2. Install node_modules locally ──────────────────────────────────────────
# pod install uses use_expo_modules! which calls Node.js to resolve packages.
# Node following a symlink to a network mount is too slow and silently skips
# packages, so node_modules is installed locally on the Mac for reliable pod
# autolinking. (Same lesson as the SBCA pipeline.)
NM_HASH_FILE="$LOCAL/.grqgo_nm_hash"
NM_HASH_NOW=$(cat "$LOCAL/package.json" "$LOCAL/package-lock.json" 2>/dev/null | md5 -q || echo "")
echo ""
echo "▸ Checking node_modules..."
if [ ! -d "$LOCAL/node_modules" ] || [ "$(cat "$NM_HASH_FILE" 2>/dev/null)" != "$NM_HASH_NOW" ]; then
  echo "  package.json changed — running npm ci..."
  cd "$LOCAL" && npm ci --legacy-peer-deps 2>&1 | grep -E "^added|error" | tail -3
  echo "$NM_HASH_NOW" > "$NM_HASH_FILE"
  echo "  ✓ node_modules installed locally"
else
  echo "  ✓ node_modules up to date"
fi

# ── 3. Sync JS source ────────────────────────────────────────────────────────
# Required for Release builds: expo export:embed runs a local Metro rooted at
# grqgo-build/ and calls require.context('./app') to discover Expo Router routes.
echo ""
echo "▸ Syncing JS source..."
for dir in app components constants services lib store; do
  rsync -aq --delete -e "$RSYNC_SSH" \
    --exclude='.DS_Store' --exclude='._*' \
    "$UBUNTU:$REMOTE_APP/$dir/" "$LOCAL/$dir/"
done
rsync -aq -e "$RSYNC_SSH" "$UBUNTU:$REMOTE_APP/babel.config.js" "$LOCAL/"
rsync -aq -e "$RSYNC_SSH" "$UBUNTU:$REMOTE_APP/tsconfig.json"   "$LOCAL/"
rsync -aq -e "$RSYNC_SSH" "$UBUNTU:$REMOTE_APP/metro.config.js" "$LOCAL/"
# shared/ (the wire-shape source) syncs INSIDE the build copy — metro.config
# resolves ./shared first, ../shared second.
rsync -aq --delete -e "$RSYNC_SSH" \
  --exclude='.DS_Store' --exclude='._*' \
  "$UBUNTU:/home/camerontora/grq/shared/" "$LOCAL/shared/"
echo "  ✓ JS source synced"

# ── 4. Sync ios/ source files ─────────────────────────────────────────────────
# Excludes everything Mac-generated: Pods, build output, xcworkspace, Podfile.lock
# (Podfile.lock lives only on the Mac — generated by pod install, never on Ubuntu)
echo ""
echo "▸ Syncing ios/..."
IOS_CHANGES=$(rsync -ai --delete -e "$RSYNC_SSH" \
  --exclude='Pods/'           \
  --exclude='build/'          \
  --exclude='*.xcworkspace'   \
  --exclude='Podfile.lock'    \
  --exclude='.xcode.env.local' \
  --exclude='.DS_Store'       \
  --exclude='._*'             \
  "$UBUNTU:$REMOTE_APP/ios/" "$LOCAL/ios/")
echo "  ✓ source files synced"

# ── 5. pod install ────────────────────────────────────────────────────────────
# Runs when: xcworkspace is missing (first time), Podfile/properties/packages
# changed, OR project.pbxproj was re-synced. That last one is load-bearing:
# pod install writes its integration INTO the Mac's pbxproj, and Ubuntu's copy
# (regenerated by expo prebuild) is always the clean pre-integration version —
# so any sync that touches pbxproj strips the integration and Xcode fails with
# "The sandbox is not in sync with the Podfile.lock" until pod install re-runs.
POD_HASH_FILE="$LOCAL/.grqgo_pod_hash"
POD_HASH_NOW=$(cat "$LOCAL/ios/Podfile" "$LOCAL/ios/Podfile.properties.json" "$LOCAL/package.json" 2>/dev/null | md5 -q)
PBX_RESYNCED=$(echo "$IOS_CHANGES" | grep -c "project.pbxproj" || true)

if [ ! -d "$LOCAL/ios/GRQGo.xcworkspace" ] || \
   [ "$PBX_RESYNCED" -gt 0 ] || \
   [ "$(cat "$POD_HASH_FILE" 2>/dev/null)" != "$POD_HASH_NOW" ]; then
  echo ""
  echo "▸ Running pod install — grab a coffee, first run takes 20-40 min..."
  cd "$LOCAL/ios" && pod install
  echo "$POD_HASH_NOW" > "$POD_HASH_FILE"
  echo "  ✓ Pods installed"
else
  echo ""
  echo "▸ Pods up to date — skipping pod install"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "┌───────────────────────────────────────────────────────────────────────┐"
echo "│  ✓ Ready to build                                                     │"
echo "│  Open:   ~/Developer/Projects/personal/grqgo-build/ios/GRQGo.xcworkspace │"
echo "│  Metro:  ssh into Ubuntu, run: ~/grq/scripts/grq-metro.sh (port 8082) │"
echo "│  Tunnel (LAN):    ssh -N -L 8081:localhost:8082 camerontora@192.168.2.34 &          │"
echo "│  Tunnel (remote): ssh -N -L 8081:localhost:8082 -p 2222 camerontora@camerontora.ca & │"
echo "│          (simulator then finds Metro on localhost:8081 as usual)      │"
echo "└───────────────────────────────────────────────────────────────────────┘"
echo ""
