# GRQ Operations Runbook

Everything assumes `cd /home/camerontora/grq`. Host node needs `source ~/.nvm/nvm.sh` first.
**This host runs legacy docker-compose v1** — the command is `docker-compose` (hyphen), and
the compose file must keep `version: "2.4"`.

## Deploy & lifecycle

```bash
docker-compose build web && docker-compose up -d web   # rebuild + deploy after code changes
docker-compose up -d                                   # bring up everything (web + db)
docker-compose logs -f web                             # tail app logs
docker-compose restart web                             # restart without rebuild
docker ps --format "{{.Names}}\t{{.Status}}" | grep grq
```

Never `stop/rm/up` across projects from inside another compose project (see infra CLAUDE.md
incident note). GRQ's compose project is isolated in this directory; operating here is safe.

## Health & verification suite

```bash
curl -s localhost:3012/api/health                      # {"status":"ok","phase":1,"broker":"sim",...}

E='X-Forwarded-Email: cameron.tora@gmail.com'
for p in / /portfolio /activity /journal /reports /settings; do
  echo "$p → $(curl -s -o /dev/null -w '%{http_code}' -H "$E" localhost:3012$p)"; done
curl -s -o /dev/null -w "%{http_code}\n" localhost:3012/                    # 403 (no header)
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://grq.camerontora.ca/  # 302 → oauth2/start
```

Kill-switch drill (run occasionally; always after touching order paths):

```bash
curl -s -X POST -H "$E" -H 'content-type: application/json' -d '{"engaged":true}'  localhost:3012/api/killswitch
curl -s -X POST -H "$E" -H 'content-type: application/json' \
  -d '{"symbol":"XIC","side":"BUY","type":"MARKET","qty":1}' localhost:3012/api/sim/order   # expect rejection
curl -s -X POST -H "$E" -H 'content-type: application/json' -d '{"engaged":false}' localhost:3012/api/killswitch
```

## Database

```bash
# Schema change: edit web/prisma/schema.prisma, then
source ~/.nvm/nvm.sh && cd web && npx prisma db push        # host-side, hits 127.0.0.1:5434

# Reset sim data (DESTRUCTIVE)
npx tsx prisma/seed.ts

# psql
docker exec -it grq-db psql -U grq grq

# Backups — automated nightly at 04:30 (user crontab) via scripts/backup-db.sh:
#   pg_dump|gzip + chmod-600 .env copy → ~/grq-backups/, 14-day retention,
#   failures ping Discord. Log: ~/grq-backups/backup.log
/home/camerontora/grq/scripts/backup-db.sh        # run manually any time

# Restore (replace target db as needed; tested 2026-06-12):
docker exec grq-db createdb -U grq grq_restore_test
gunzip -c ~/grq-backups/grq-YYYY-MM-DD.sql.gz | docker exec -i grq-db psql -U grq -q grq_restore_test
# verify, then either repoint DATABASE_URL or pg_dump/restore into "grq"
docker exec grq-db dropdb -U grq grq_restore_test
```

Two DATABASE_URLs by design: containers get `db:5432` (root `.env` via env_file); host CLI
gets `127.0.0.1:5434` (`web/.env`, git/docker-ignored). Container process env beats Next's
.env loading, so the wrong one can't leak into production.

## Secrets (`.env`, chmod 600, never committed)

| Key | What |
|---|---|
| `POSTGRES_PASSWORD` / `DATABASE_URL` | grq-db credentials |
| `GRQ_ALLOWED_EMAILS` | extra member emails (named members live in `web/lib/users.ts`) |
| `BROKER` | `sim` now → `ibkr-paper` → `ibkr-live` |
| `CLAUDE_CODE_OAUTH_TOKEN` | Cam's Claude Max token for the agent (verified 2026-06-11) |
| `TZ` | America/Toronto |

House rule: single-quote any value containing `$`. Token rotation: Cam runs
`claude setup-token` in a **real terminal** (interactive browser flow — backgrounded `!`
runs hang with no stdin), paste the new value, `docker-compose restart` whatever uses it.
Verify without leaking it:
`env -i ... CLAUDE_CODE_OAUTH_TOKEN="$(grep ... .env | cut -d= -f2)" claude -p "Reply with exactly: token-ok" --model claude-haiku-4-5-20251001`

## Membership changes

Named members (greeting + role): `web/lib/users.ts` → rebuild web. Quick extra email:
append to `GRQ_ALLOWED_EMAILS` in `.env` → `docker-compose up -d web` (recreate to reload
env). They also need to be on the infra oauth2-proxy allowlist to get past SSO at all.

## Alerting (Discord)

Single chokepoint: `agent/alerts.ts`. `alert(severity, title, body)` → `DISCORD_WEBHOOK_URL`
(empty = journal-only). **`info` is Discord-only and leaves NO journal trace**; `warning`/
`critical` also write a `SYSTEM` journal entry. Discord failures never take the agent down.
`sendDiscord()` is the Discord-only variant for callers that journal themselves (member-action
API routes, `promote.ts`).

**What pings Discord — and what doesn't.** Alerts are tied to *events/outcomes*, not to "a
session ran." The scheduled sessions split into two groups:

| Scheduled session | Pings Discord? |
|---|---|
| Discovery hunt (~10:00), Smart-money scan (~11:00), Midday brief (noon), EOD report (16:15), Weekly review | **Yes** — each fires a dedicated `info` "posted" alert |
| Morning **Game plan** (09:00) · fixed trading **check-ins** (10/11/13/14/15 ET, `runScheduledCheckin`) | **No "ran" alert** — these ping *only when they act*: a **FILLED** trade (`validator.ts` → `Bought/Sold …`), a **self-promote/track** (`promote.ts`), or a system stop/take-profit (runner). A stood-down "no trade" check-in is **intentionally silent on Discord** (it still posts to the dashboard/journal). |

Also always ping: kill-switch flips, daily-loss pause, drawdown checks, session failures,
finalize-pending fills, and member actions (universe add/demote/retire, directive, kill switch).

**"I expected a ping and didn't get one"** — first confirm the session actually *did* something
(a FILLED order, a promotion). The Game plan and the trading check-ins are **outcome-only** by
design (affirmed 2026-06-22, D50): a quiet check-in won't ping. And because `info` alerts don't
journal, the absence of a journal entry does NOT mean the alert didn't fire — verify the *outcome*
(check `Order`/positions) or send a test ping to confirm webhook delivery.

## Agent token usage (`/admin/usage`)

The agent runs on Cam's shared Claude Max token, so its burn **competes with Cam's interactive
Claude Code usage on the same quota**. We log every Claude session to inventory that burn (D67).
Owner-only page `/admin/usage` (`isOwner` → 404 for everyone else) + CLI twin:

```bash
cd web && npx tsx scripts/token-report.ts          # since ET midnight today
cd web && npx tsx scripts/token-report.ts 24h      # last 24h  (also: 7d, or YYYY-MM-DD)
```

**One row per session** (`AgentUsage`), written by `runSession()` (`web/agent/sessions.ts`
`recordUsage`), summed across the subagent fan-out (`modelUsage`, falling back to the aggregate
`usage` shape). Logging is wrapped so it can never break a trading session.

**How to read the page** (`web/lib/usage.ts` does the math):
- **Total tokens = input + output + cache-write + cache-read, all four summed.** Cache reads are
  cheap per-token but still count toward *volume* (and toward the rate-limit window), so they're in
  the total — that's why a big day looks token-heavy even when most of it is cached context replay.
- **By session type** groups by the label prefix before the first `:` — `dossier:ATD` → `dossier`,
  `checkin:11:00` → `checkin` — so the ~24 daily dossiers collapse to one line. This is where you
  see *what* ate the day (usually `startup-universe-review` and `dossier`).
- **Rolling 5-hour window** is the thing that trips the Max limit. It sums rows where `at ≥ now−5h`
  (the page query spans `min(ET-day-start, now−5h)`). The bar turns amber ≥70%, red ≥90%.
- **Est. cost** is integer micro-USD and *is* populated even on the Max OAuth token (`—` when zero).
  It's a what-this-would-cost-metered figure, not a charge — the Max token is unmetered.

**The denominator is an estimate, not a real quota — calibrate it.** Anthropic exposes no true
"remaining" number for a subscription and publishes no token figure for the Max 20x window (only
relative capacity = 20× Pro). So the "headroom" bar is *our* measured burn against the optional
`GRQ_MAX_5H_TOKENS` env var; unset → no bar, raw burn only. To calibrate: watch the rolling-5h total
at the moment sessions start failing with rate-limit `status` (the per-call table flips that row red),
and set `GRQ_MAX_5H_TOKENS` to ~80% of that as a warning line. It's **env-only → no rebuild**:
`docker-compose up -d --force-recreate web`.

**Caveat — the 5h window is probably NOT the binding constraint for GRQ.** Decision sessions are
Opus 4.8 and a single boot library scan burns multiple million tokens; the limit that actually drains
the quota is the **weekly all-models / weekly-Opus cap** (independently estimated ~24–40 Opus-hours/wk,
shared with Cam's own use — Anthropic publishes no token figure for it either). **We don't track the
weekly window at all** — the dashboard is a relative burn tracker, not a true quota gauge. The real
mitigations live elsewhere: the once-per-ET-day boot-scan guard (`runner.ts` ~L367; force a re-scan by
deleting today's `Startup universe review%` journal rows) and batching agent changes into one rebuild.
The bigger un-done lever is giving the agent its own `ANTHROPIC_API_KEY` so its burn stops competing
with Cam's Max quota (a real-cost call, deferred). See `CLAUDE.md` → the boot-scan gotcha, and D67.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `docker: unknown command: docker compose` | legacy compose v1 host | use `docker-compose` |
| Expected a Discord ping, got none | Game plan / check-in stood down (no trade) — outcome-only by design | confirm the session acted (FILLED order / promote); quiet check-ins are dashboard-only |
| compose: `Unsupported config option` | missing `version: "2.4"` | keep the version key |
| web 502 via nginx | container down / wrong port | `docker ps`, health curl, logs |
| 403 for a member | header not arriving (direct LAN hit) or email not in users.ts/env | check `X-Forwarded-Email`, member list |
| `@prisma/client did not initialize` / engine missing in container | standalone build lost engines | Dockerfile copies `node_modules/.prisma`; rebuild |
| Prisma CLI `Can't reach database server` on host | using container URL on host | host uses `web/.env` → 127.0.0.1:5434 |
| Port bind error on 5434 | another listener appeared | pick a free loopback port, update compose + `web/.env` comment trail |
| Pages show stale prices | synthetic walk is per-process | expected; restart resets the walk |
| All orders rejected | kill switch engaged | check NavBar dot / Settings; journal shows who |
| `node: command not found` | nvm not sourced | `source ~/.nvm/nvm.sh` |
| npm scripts die sourcing .env | unquoted `$` in a value | single-quote it |
| Agent sessions fail / quota drained by ~11am | restart-looping the agent re-fires the boot library scan (multi-M tokens) on the shared Max token | check `/admin/usage` for the burn (esp. `startup-universe-review`); confirm the once/day guard held (today's `Startup universe review%` journal rows); batch agent changes into one rebuild |

## Disk & maintenance

`/home` hovers ~89% — the infra repo's nightly `docker image prune` cron handles dangling
images; avoid stacking many image rebuilds without it. DB volume `grq-db-data` is tiny.
SSL/DNS/SSO incidents: that's the infra repo's domain (`~/infrastructure/CLAUDE.md`).
