# GRQ — Claude Operating Reference

Read this in full before touching anything. Deeper detail lives in `docs/` and
`PROJECT_PLAN.md` — this file is the operational quick-reference.

**What this is:** GRQ ("Get Rich Quick") — an autonomous Claude-powered investing fund for
Cam & Graham at https://grq.camerontora.ca. A trading agent (Phase 2+) manages a real
brokerage account within hard code-enforced guardrails; the web app is the dashboard.
Tagline: *"Get rich quick, slowly, with receipts."*

**Status (2026-06-16):** Phases 0–2.7 shipped — site live behind SSO; the agent is
live-firing on the sim on real Yahoo-delayed quotes (soak running since 2026-06-12), with
per-member themes, stocks one-pagers, signals v1, source scoreboard, member directives
(pin/no-fly), the UI-managed universe pipeline + research dossiers, and the read-only agent
chat. Decision sessions run on **Opus 4.8** (`claude-opus-4-8`), triage on Haiku 4.5 — Fable 5
access via the Max token broke 2026-06-13 (see `docs/DECISIONS.md` D17). **Data layer
live on FMP Ultimate + free BoC feeds (D21):** earnings/news/grades/13F + structured macro,
on the stock pages (honest 10-tier coverage map) AND fed into the agent's decision context;
tier-4 insider via the agent's per-dossier web research (paid INK feed deferred). **Real-time
on-page price ticker** (`<LiveQuote>` → `/api/quotes`, FMP — *verify TSX-realtime vs delayed at
market open*). **Rating: GRQ's call unified to a 7-point scale** (Strong Buy→Strong Sell, same
vocabulary as the signal; D23) — `lib/stance.ts` + `RatingBar`. **IA-v5 (D26):** the four market
destinations **Watchlist · Universe · The Hunt · Browse** are now **top-level header nav** (the
`MarketTabs` sub-nav is gone). **Watchlist** rows are Universe-style; **Universe**+Watchlist show GRQ's
call as the **RatingBar** and **click-to-expand** (D29) into an in-table panel — GRQ's call + blurb, the
dossier's plain-English *why* (`bottomLine`) + targets, **+ lazily-loaded earnings/analyst ratings**
(`/api/stock-extras/[symbol]` → `RowExtras`, fetched on expand), full-dossier link (`components/ExpandableRow.tsx`,
a client wrapper so `StockTable` stays server). Universe has a **Demoted** shelf; **"Research now" lives only on the stock page** (off the
list tables — `UniverseActions hideResearch`). **The Hunt** (was Discover; D30) = the hunt (8–12 names · **↻ refresh** via
`AgentState.huntRequestedAt` · **✕ dismiss**→RETIRED); hunt cards are **leads, not verdicts**
(`IdeaCard discovery` — lead with 12-mo upside + conviction, no Buy/Hold/Sell). **Every hunt find is now
auto-promoted to a CANDIDATE** (`lib/hunt.ts`, `requestedBy:"hunt"`) so it gets a **full dossier + full stock
page**, not just the lead — the agent still can't trade it (D30). **Browse** has an inline
**name/ticker search** that narrows the screener result set (fmpSearch+fmpProfile; Watch from the row).
**Smart Money (D28)** is a fifth top-level destination (`/market/smart-money`): **tracked-portfolio cards**
(curated 13F filers by CIK — Buffett/Burry/Ackman/Wood/**Aschenbrenner**, + Pelosi by name; expand into
holdings with NEW/ADD/TRIM diffs + **PUT/CALL flags**), **Congress/funds/insider leaderboards** + cluster
buys, and a GRQ narrative — all from FMP structured feeds + a nightly **OpenInsider** scrape, ingested
**daily** (13Fs only on a new filing) by the runner. Honest: 13F lags ~45d & longs+options-only; congress
amounts are ranges; most names US-listed → leads, not trades. Also surfaced **per-stock** (`StockSmartMoney` on
`/stocks/[symbol]`) and **fed into the agent** (`buildContext` holdings/focus section + the dossier prompt) — an
input it weighs, never the gate. (`lib/smart-money/*`, `components/smart-money/*`.)
**Today** gained a **live indices strip** (`/api/indices`, polls till close) + movers-beside-industry (expandable) + the **market pulse**;
**The Tape sits above the headlines**, and **today's biggest movers are clickable + auto-researched** — Today queues a `movers`
dossier for any it doesn't track, and the stock page shows a *researching…* state until it lands (D29). The stock page also shows the **company logo**.
stock search does **name + multi-listing** (ANET→NYSE). **Phase 3 — IBKR paper CONNECTED (D22):**
the gateway authenticates + reconciles the paper account **`DUQ774890`** (CAD 5k mirrored) via a
**loopback proxy** (`grq-ibeam-proxy` socat sidecar → `IBKR_GATEWAY_URL=https://ibeam:5002`); the
adapter's conid/error bugs are fixed. **Still `BROKER=sim`** — the last blocker is the Stocks-Canada
trading permission syncing to the paper twin on IBKR's nightly reset (re-test next market day, then
flip). **NB SPCX = the SpaceX *CDR* (`SPCX.TO`, CAD-hedged ~$36), not the Nasdaq underlying.**

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
   (house-wide rule — unquoted `$` kills scripts that source `.env`). **But never wrap a
   docker-compose `env_file` value in quotes** — legacy compose v1 passes the quote
   characters into the container *literally* (this silently broke `FMP_API_KEY` 2026-06-15:
   the container saw `'key'` and FMP rejected it). Quote only shell-sourced `$` values.
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
- **Docker's data-root is `/var/lib/docker` on `/dev/sda5` (mounted `/var`, a 60G volume that
  runs ~95–100% full)** — NOT on `/` (sda2 is roomy at ~23%). `/home` (sda6) is separate at
  ~92%. Rebuild marathons fill `/var` faster than the nightly 5AM prune; this took the db down
  once (2026-06-12). **When `/var` is full a build can silently bake STALE code** — `COPY . .`
  fails to write a new layer and the image keeps old pages (bit us 2026-06-16: a "successful"
  deploy served old code). Always verify a fresh image before trusting a deploy:
  `docker run --rm --entrypoint sh grq_web:latest -c "grep -l <new-string> /app/.next/server/app/.../page.js"`.
  Reclaim: `docker container prune -f` (stopped) + `docker image prune -f` (dangling — note it
  only frees the OLD image's layers AFTER `up -d` swaps to the new one). Shared host (tdarr,
  seerr, minecraft, infra…) so **never `image prune -a` / `system prune`** — too broad.
- The infra repo (`~/infrastructure/CLAUDE.md`) owns nginx/SSL/DNS/SSO. GRQ's nginx file is
  `~/infrastructure/nginx/conf.d/29-grq.conf`. Don't duplicate that knowledge here.

## Commands

```bash
cd /home/camerontora/grq

# Deploy / rebuild after code changes (4 services: web · agent · chat · db).
# agent + chat share web/Dockerfile.agent and the web/ source tree (no bind mounts —
# a source change needs a rebuild, not just a restart).
docker-compose build web && docker-compose up -d web
docker-compose build agent chat && docker-compose up -d agent chat
docker image prune -f   # after any heavy build — Docker root is on / and fills fast

# Logs / status / health
docker-compose logs -f web        # or: agent (orchestrator) · chat (read-only chat server)
curl -s localhost:3012/api/health  # includes agent heartbeat: bootAt, lastTickAt, lastSessionAt

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
`X-Forwarded-Email`. oauth2-proxy already rejects anyone not in the infra
allowlist (`~/infrastructure/oauth2-proxy/authenticated_emails.txt`) at login, so
a valid header == an allowlisted user. **Two tiers** (`web/lib/users.ts` →
`roleForEmail`): **members** = `lib/users.ts` (Cam, Graham — admins, both hold the
kill switch) ∪ `GRQ_ALLOWED_EMAILS` env → full access; **viewers** = any other
allowlisted email → **read-only** (full read, no writes). A header-less hit (direct
LAN, no SSO) has no identity → 403. `/api/health` is exempt (LAN monitoring).

The read-only enforcement is **server-side, not cosmetic**: every mutating route
guards with `memberFromRequest()` (`web/lib/session.ts`) → viewers get 403 on
`killswitch`, `settings`, `sim/order`, `stocks/directive`, `universe`, `chat`.
`explain` (the literacy explainer) is open to viewers by design. The UI also
hides/disables member-only controls and shows a "read-only" badge, but that's
defense-in-depth — the route guards are the lock. Promote a viewer to member:
edit `lib/users.ts` (named) or `GRQ_ALLOWED_EMAILS` (anonymous), rebuild web.

**Mobile auth (2026-06-16, docs/IOS-PLAN.md):** the iOS app has no oauth2-proxy
cookie, so `session.ts` also resolves identity from a verified **GRQ-JWT Bearer**
(`lib/auth-jwt.ts`, `GRQ_JWT_SECRET`). The app trades a Google ID token at
`POST /api/auth/google` for that JWT; `middleware.ts` admits `/api/auth/*` + the
listed mobile read routes (Bearer present) while keeping chat/explain/quotes
cookie-only. Members-only on mobile. The GRQ-iOS OAuth client + an nginx
bypass-location are the remaining human steps before a phone can fetch live.

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
| `docs/IBKR-PHASE3.md` | **IBKR-paper bring-up runbook** — gateway/proxy, 2FA, the connection saga (D22) |
| `ibeam/conf.yaml` · `docker-compose.yaml ibeam-proxy` | The CP-gateway loopback proxy: socat sidecar (`network_mode: service:ibeam`) `:5002→127.0.0.1:5000` so the agent can reach the gateway (which is loopback-only). Agent → `IBKR_GATEWAY_URL=https://ibeam:5002` (D22) |
| `docs/OWNERSHIP.md` | Whose money/account: options, tax notes, open decision |
| `docs/LITERACY.md` | **Financial-literacy product pillar** — every number explainable; glossary + agent explainers |
| `docs/NEWSPAPER.md` | "The Daily" — Today-as-newspaper: editions by time of day, sections, imagery roadmap |
| `web/lib/broker/` | BrokerAdapter seam: `types.ts`, `sim.ts` (engine), `ibkr.ts` (IBKR adapter — conid/orders/reconcile), `quotes.ts` (Yahoo delayed, DB-cached), `yahoo.ts`, `index.ts` (`getBroker()`) |
| `web/lib/stance.ts` · `web/components/RatingBar.tsx` | GRQ's call = the 7-point scale (Strong Buy→Strong Sell) + slider; back-compat maps retired words (D23) |
| `web/agent/` | The agent worker (Phase 2): `runner.ts` (orchestrator/tick loop), `validator.ts` (§6 gate), `policy.ts` (hard limits + model IDs), `sessions.ts` (LLM sessions), `tools.ts`, `context.ts`, `signals.ts`, `calendar.ts`, `alerts.ts`, `chat-server.ts` |
| `web/lib/feed.ts` · `web/lib/auth-jwt.ts` | Mobile API: contract-shaped builders + GRQ-JWT mint/verify. Routes: `web/app/api/{portfolio,market,ideas,today,dossier/[symbol],auth/google,auth/me,auth/dev}` + GET on `settings`. Verify: `web/scripts/verify-mobile-api.ts` |
| `ios/GRQ/Services/Services.swift` | iOS data layer: `APIClient` (real URLSession GETs, Bearer), `AuthManager` (Keychain token, Google/dev login), `GoogleAuth` stub |
| `shared/contract.ts` | The one wire-shape source (zod → TS + Swift). Keep in lockstep with `lib/feed.ts` |
| `web/prisma/schema.prisma` | Data model (int cents everywhere) |
| `web/prisma/seed.ts` | Destructive sim reset + demo trades |
| `web/lib/users.ts` | Member list (the app-level allowlist) |
| `web/middleware.ts` | The door |
| `.env` | Secrets/config: db password, `BROKER=sim`, `CLAUDE_CODE_OAUTH_TOKEN` (Cam's Max token), `DISCORD_WEBHOOK_URL` (alerts), `FMP_API_KEY`, optional `GRQ_MODEL_DECISION` (default `claude-opus-4-8`); **IBKR (D22):** `IBEAM_ACCOUNT`/`IBEAM_PASSWORD` (the PAPER login `cwiaiu983` — UNQUOTED, env_file rule), `IBEAM_USE_PAPER_ACCOUNT=True`, `IBKR_ACCOUNT_ID=DUQ774890`, `IBKR_GATEWAY_URL=https://ibeam:5002` (the loopback proxy, not :5000) |

## Working agreements

- Document significant decisions in `docs/DECISIONS.md`; keep `PROJECT_PLAN.md` §10/§13 in
  sync for plan-level items. Update phase status in `docs/PHASES.md` + the Settings-page
  roadmap + plan header when a phase ships.
- Commit at phase boundaries with descriptive messages; remote is private GitHub.
- Cam & Graham read the dashboards — keep UI copy in GRQ's voice (honest, lightly funny,
  teal). The fund's money rules are never funny: rejections state the guardrail plainly.
- **Financial literacy is a product pillar** (`docs/LITERACY.md`): every number, acronym, and
  concept on screen should be explainable — inline or by the agent. A figure the app shows but
  can't explain is a bug. GRQ is being built as a product, not a single-user tool (multi-tenancy
  deferred; the content layers come first). The Today page is "The Daily" newspaper (`docs/NEWSPAPER.md`).
- When the user reports a bug mid-market-hours (Phase 2+), check kill switch state FIRST.
