# GRQ — Claude Operating Reference

Read this in full before touching anything. Deeper detail lives in `docs/` and
`PROJECT_PLAN.md` — this file is the operational quick-reference.

**What this is:** GRQ ("Get Rich Quick") — an autonomous Claude-powered investing fund for
Cam & Graham at https://grq.camerontora.ca. A trading agent (Phase 2+) manages a real
brokerage account within hard code-enforced guardrails; the web app is the dashboard.
Tagline: *"Get rich quick, slowly, with receipts."*

**Status (2026-06-11):** Phases 0–1 shipped — site live behind SSO, SimBroker paper engine +
full dashboard running on synthetic quotes. Next: Phase 2 (agent live-fire on the sim, spec
in `docs/AGENT-SPEC.md`). External dependency: Cam opening the IBKR Canada account (gates
Phase 3 only).

---

## Non-negotiable rules

1. **Hard guardrails live in code and only humans change them** (`PROJECT_PLAN.md` §6).
   The agent proposes; the deterministic gate in `web/lib/broker/sim.ts` disposes. Never
   wire a path that lets model output bypass or modify the gate.
2. **Kill switch is sacred.** Checked before every order inside `placeOrder`. Both members
   can flip it; nothing trades while engaged. Any new order path must go through the same gate.
3. **No shorting, no margin borrowing, no options** — shorting is a config *toggle* that is
   OFF and stays off until Cam flips it after the paper soak.
4. **Money is integer cents, quantities are whole shares.** No floats, anywhere, ever.
5. **`.env` is chmod 600, never committed**; any value containing `$` must be single-quoted
   (house-wide rule — unquoted `$` kills scripts that source `.env`).
6. **Real money never trades until the soak gate passes:** ≥ 4 clean weeks total on
   sim/paper, of which ≥ 2 on IBKR paper. Defined precisely in `PROJECT_PLAN.md` §9.
7. Trading hours are 9:30–16:00 ET (TSX & NYSE close at 4:00pm, not 4:30).

## Environment gotchas (will bite you)

- **Legacy docker-compose v1** on this host: use `docker-compose` (hyphen), and
  `docker-compose.yaml` must keep `version: "2.4"`. `docker compose` (space) does not exist.
- **Host node is via nvm** — non-login shells need `source ~/.nvm/nvm.sh` first.
- **Ports:** web 3012→3000 · grq-db loopback-only `127.0.0.1:5434→5432` (host 5432 is
  haymaker's postgres, 5433 was taken). Inside compose, containers use `db:5432`.
- **Two DATABASE_URLs by design:** root `.env` → `db:5432` (containers, via env_file);
  `web/.env` → `127.0.0.1:5434` (host-side prisma CLI / seed / next dev). `web/.env` is
  git- and docker-ignored. Container process env wins over Next's .env loading.
- **React SSR splits dynamic text with `<!-- -->`** — grep rendered HTML loosely
  (e.g. `Welcome back,[^<]*<!-- -->Cam`).
- Server disk hovers ~89% — a nightly `docker image prune` cron exists (infra repo).
- The infra repo (`~/infrastructure/CLAUDE.md`) owns nginx/SSL/DNS/SSO. GRQ's nginx file is
  `~/infrastructure/nginx/conf.d/29-grq.conf`. Don't duplicate that knowledge here.

## Commands

```bash
cd /home/camerontora/grq

# Deploy / rebuild after code changes
docker-compose build web && docker-compose up -d web

# Logs / status / health
docker-compose logs -f web
curl -s localhost:3012/api/health

# Schema change → push to db (host-side)
source ~/.nvm/nvm.sh && cd web && npx prisma db push

# Reset the sim (DESTRUCTIVE — wipes all fund data, reseeds demo trades)
source ~/.nvm/nvm.sh && cd web && npx tsx prisma/seed.ts

# Poke the db directly
docker exec -it grq-db psql -U grq grq

# Act as a member from the LAN (bypasses SSO by supplying the header nginx would set)
curl -s -H "X-Forwarded-Email: cameron.tora@gmail.com" localhost:3012/
```

Full verification suite + troubleshooting: `docs/OPERATIONS.md`.

## Auth model

nginx + oauth2-proxy (infra repo) authenticate the Google account and pass
`X-Forwarded-Email`. The app's own door is `web/middleware.ts`: member list =
`web/lib/users.ts` (Cam, Graham — both admin, both hold the kill switch) ∪
`GRQ_ALLOWED_EMAILS` env. Everyone else gets a teal 403. `/api/health` is exempt
(LAN monitoring). Adding a member: edit `lib/users.ts` (named) or the env var (anonymous),
rebuild web.

## File map

| Path | What |
|---|---|
| `PROJECT_PLAN.md` | The plan: architecture, guardrails (§6), phases (§9), decisions log (§10), runbook (§12), backlog (§13) |
| `CLAUDE.md` | This file |
| `docs/ARCHITECTURE.md` | System design, data flow, broker seam, schema tour |
| `docs/DECISIONS.md` | Engineering decision record with rationale |
| `docs/PHASES.md` | Detailed phase-by-phase roadmap & exit criteria |
| `docs/SIM-ENGINE.md` | SimBroker spec: fills, commissions, ACB, gate order |
| `docs/AGENT-SPEC.md` | **Phase 2 blueprint — start here when building the agent** |
| `docs/OPERATIONS.md` | Runbook: deploy, db, backups, troubleshooting |
| `docs/DATA-SOURCES.md` | 10-tier data taxonomy + source scoring system |
| `docs/IBKR-SETUP.md` | Forwardable account-opening guide |
| `docs/OWNERSHIP.md` | Whose money/account: options, tax notes, open decision |
| `web/lib/broker/` | BrokerAdapter seam: `types.ts`, `sim.ts` (engine), `quotes.ts`, `index.ts` |
| `web/prisma/schema.prisma` | Data model (int cents everywhere) |
| `web/prisma/seed.ts` | Destructive sim reset + demo trades |
| `web/lib/users.ts` | Member list (the app-level allowlist) |
| `web/middleware.ts` | The door |
| `.env` | Secrets: db password, `BROKER=sim`, `CLAUDE_CODE_OAUTH_TOKEN` (Cam's Max token, verified working) |

## Working agreements

- Document significant decisions in `docs/DECISIONS.md`; keep `PROJECT_PLAN.md` §10/§13 in
  sync for plan-level items. Update phase status in `docs/PHASES.md` + the Settings-page
  roadmap + plan header when a phase ships.
- Commit at phase boundaries with descriptive messages; remote is private GitHub.
- Cam & Graham read the dashboards — keep UI copy in GRQ's voice (honest, lightly funny,
  teal). The fund's money rules are never funny: rejections state the guardrail plainly.
- When the user reports a bug mid-market-hours (Phase 2+), check kill switch state FIRST.
