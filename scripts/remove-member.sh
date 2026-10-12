#!/usr/bin/env bash
# Take someone out of GRQ: access only. Runbook: docs/OPERATIONS.md → "Removing someone entirely".
#
#   scripts/remove-member.sh <email> [<email> ...]     # every address the person has
#
# What it does, and nothing more:
#   1. ADDS the addresses to GRQ_REMOVED_EMAILS in the root .env (keeps whoever is already there)
#   2. recreates the web container so the list is live (env-only, no rebuild, agent untouched)
#   3. deletes their push device records, so the phone stops getting notifications
#   4. checks each address now gets the removed page, and that Cam still gets in
#
# What it deliberately leaves alone: their SnapTrade keys and accounts, watches, profile, and
# every row of history that names them. Those are decisions, not side effects.
#
# Safe to run twice. Undo: take the addresses back out of GRQ_REMOVED_EMAILS, recreate web.
set -euo pipefail

[ "$#" -ge 1 ] || { echo "usage: $0 <email> [<email> ...]" >&2; exit 2; }
cd "$(dirname "$0")/.."   # compose reads .env from the CURRENT directory — must be the repo root
ENV=.env
[ -f "$ENV" ] || { echo "no $ENV in $(pwd)" >&2; exit 1; }
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] $*"; }

for e in "$@"; do
  [[ "$e" =~ ^[^[:space:]@,\']+@[^[:space:]@,\']+\.[^[:space:]@,\']+$ ]] || { echo "not an email address: $e" >&2; exit 2; }
done

# 1. merge into the list (lowercase, de-duplicated, existing entries kept)
current=$(grep -E '^GRQ_REMOVED_EMAILS=' "$ENV" | tail -1 | cut -d= -f2- || true)
merged=$(printf '%s\n' ${current//,/ } "$@" | tr 'A-Z' 'a-z' | awk 'NF && !seen[$0]++' | paste -sd, -)
if grep -qE '^GRQ_REMOVED_EMAILS=' "$ENV"; then
  sed -i "s|^GRQ_REMOVED_EMAILS=.*|GRQ_REMOVED_EMAILS=${merged}|" "$ENV"
else
  printf '\nGRQ_REMOVED_EMAILS=%s\n' "$merged" >> "$ENV"
fi
chmod 600 "$ENV"
log "removed list is now: $merged"

# 2. make it live
set -a; . "./$ENV"; set +a
docker-compose up -d --force-recreate --no-deps web
for _ in $(seq 1 30); do
  curl -fsS -o /dev/null localhost:3012/api/health && break
  sleep 2
done

# 3. stop pushes
list=$(printf "'%s'," "$@" | tr 'A-Z' 'a-z'); list=${list%,}
docker exec grq-db psql -U grq grq -Atc "delete from \"DeviceToken\" where lower(email) in (${list})" | sed 's/^/push devices: /'

# 4. verify
fail=0
for e in "$@"; do
  code=$(curl -s -o /tmp/grq-removed-check.html -w '%{http_code}' -H "X-Forwarded-Email: $e" localhost:3012/)
  if [ "$code" = 403 ] && grep -q "Your access to GRQ has been removed" /tmp/grq-removed-check.html; then
    log "OK   $e → 403, removed page"
  else
    log "FAIL $e → $code (expected 403 + the removed page)"; fail=1
  fi
done
code=$(curl -s -o /dev/null -w '%{http_code}' -H "X-Forwarded-Email: cameron.tora@gmail.com" localhost:3012/portfolio)
[ "$code" = 200 ] && log "OK   Cam still opens the portfolio" || { log "FAIL Cam's portfolio → $code"; fail=1; }
exit $fail
