#!/usr/bin/env bash
# GRQ nightly backup — database dump + .env copy, 14-day retention.
# Cron: user crontab, 04:30 daily (before the 5 AM docker prune).
# Log: ~/grq-backups/backup.log · Failures ping the Discord webhook.
set -euo pipefail

BACKUP_DIR="$HOME/grq-backups"
ENV_FILE="/home/camerontora/grq/.env"
STAMP="$(date +%F)"
LOG="$BACKUP_DIR/backup.log"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

fail() {
  local msg="GRQ backup FAILED ($STAMP): $1"
  echo "$(date -Is) $msg" >> "$LOG"
  # grep, never source — .env may contain $ values (house rule)
  local webhook
  webhook="$(grep '^DISCORD_WEBHOOK_URL=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)"
  if [ -n "${webhook:-}" ]; then
    curl -s -m 10 -X POST -H 'content-type: application/json' \
      -d "{\"content\":\"🚨 **GRQ CRITICAL** — $msg\"}" "$webhook" > /dev/null || true
  fi
  exit 1
}

DUMP="$BACKUP_DIR/grq-$STAMP.sql.gz"
docker exec grq-db pg_dump -U grq grq 2>>"$LOG" | gzip > "$DUMP" || fail "pg_dump/gzip error"
[ -s "$DUMP" ] || fail "dump file is empty"
gunzip -t "$DUMP" || fail "gzip integrity check"

install -m 600 "$ENV_FILE" "$BACKUP_DIR/env-$STAMP" || fail ".env copy"

find "$BACKUP_DIR" -name 'grq-*.sql.gz' -mtime +14 -delete
find "$BACKUP_DIR" -name 'env-*' -mtime +14 -delete

echo "$(date -Is) OK $DUMP ($(du -h "$DUMP" | cut -f1))" >> "$LOG"
