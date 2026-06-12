# GRQ Architecture

Last updated: 2026-06-11 (Phase 1).

## Topology

```
                          INTERNET
                             │
              nginx-proxy (80/443, SSL, HTTP/2)          ← infra repo
              oauth2-proxy (Google SSO, cookie domain    ← infra repo
                            .camerontora.ca)
                             │  X-Forwarded-Email: <google account>
                             ▼  host.docker.internal:3012
   ┌──────────────────────────────────────────────────────────────┐
   │ grq-web — Next.js 15 (App Router, standalone, node:22-alpine)│
   │   middleware.ts ── app-level allowlist (the fund's own door) │
   │   server components ── read via Prisma directly              │
   │   API routes ── mutations only: /api/killswitch,             │
   │                 /api/settings, /api/sim/order                │
   │   /api/health ── open (LAN monitoring)                       │
   └───────────────┬──────────────────────────────────────────────┘
                   │ DATABASE_URL (db:5432 in-network)
   ┌───────────────▼──────────────────────────────────────────────┐
   │ grq-db — postgres:16-alpine                                  │
   │   volume grq-db-data · loopback host port 5434 for CLI       │
   └───────────────▲──────────────────────────────────────────────┘
                   │ (Phase 2)
   ┌───────────────┴──────────────────────────────────────────────┐
   │ grq-agent — Node/TS worker (NOT YET BUILT — docs/AGENT-SPEC) │
   │   orchestrator · guardrail validator · Agent SDK sessions    │
   └───────────────┬──────────────────────────────────────────────┘
                   │ BrokerAdapter seam (BROKER env)
        ┌──────────┴───────────┬───────────────────────┐
        ▼ sim (now)            ▼ ibkr-paper (Phase 3)  ▼ ibkr-live (Phase 4)
   SimBroker engine        IBeam gateway + IBKR Web API + Flex reports
   synthetic quotes        (real broker, fake money)   (real everything)
   → yahoo delayed (Ph 2)
```

## Request flow (today)

1. Browser → `grq.camerontora.ca` → nginx: SSL, then `auth_request` to oauth2-proxy.
   Unauthenticated → 302 Google sign-in. Authenticated-but-not-on-the-global-allowlist →
   blocked at oauth2-proxy.
2. nginx proxies to `host.docker.internal:3012` with `X-Forwarded-Email` set.
3. `web/middleware.ts` checks the email against the **fund member list**
   (`lib/users.ts` ∪ `GRQ_ALLOWED_EMAILS`). Non-members get an inline teal 403 page.
   This matters because the global SSO list has ~7 people; the fund admits 2.
4. Server components call Prisma directly (no internal HTTP). Mutations go through the three
   API routes, which re-derive identity from the header (`lib/session.ts`).

## The broker seam

`web/lib/broker/types.ts` defines `BrokerAdapter`:
`getQuote / getQuotes / listSymbols / placeOrder`. `getBroker()` (in `index.ts`) selects the
implementation from `BROKER` env. Everything above the seam — pages, API, future agent — is
broker-agnostic. Three planned implementations:

| BROKER | Implementation | Data | Phase |
|---|---|---|---|
| `sim` | `SimBroker` (`sim.ts`) — full paper engine, fills + accounting in Postgres | synthetic random-walk (`quotes.ts`) now; Yahoo delayed in Phase 2 | 1–2 |
| `ibkr-paper` | `IBKRBroker` via IBeam-managed Client Portal Gateway | IBKR delayed (free) | 3 |
| `ibkr-live` | same adapter, live credentials + real-time TSX L1 sub | IBKR streaming | 4 |

Engine details (fill rules, commissions, gate order, ACB math): `docs/SIM-ENGINE.md`.

## Data model (Prisma, all money = integer cents CAD, shares = int)

| Model | Purpose | Notes |
|---|---|---|
| `Account` | singleton (id=1) cash balance | updated atomically inside fill transactions |
| `Settings` | singleton: risk level, monthly fee budget, kill switch (+who/when), agentVersion | the only model the UI mutates |
| `Contribution` | money in (later: out) | total = denominator for "Total P&L" |
| `Order` | every order ever, incl. REJECTED (with `rejectReason` = which guardrail fired) | statuses: PENDING / FILLED / CANCELLED / REJECTED |
| `Trade` | fills (1 per order today; partial fills would add rows) | `realizedPnlCents` set on sells |
| `Position` | current holdings, ACB-with-commission avg cost | deleted at qty 0 |
| `NavSnapshot` | NAV time series (cash + marked positions) | written post-fill + by seed; Phase 2 adds scheduled snapshots |
| `JournalEntry` | the agent's memory + audit trail: SYSTEM / RESEARCH / DECISION / TRADE / RETRO / LESSON | `agentVersion` stamped for measurable improvement |
| `Report` | EOD + WEEKLY reports (markdown body + stats JSON) | unique (date, kind) |

Why integer cents: float drift is unacceptable in accounting; BigInt was rejected for JSON
serialization friction; int cents covers ±$21M, far beyond this fund's ambitions (for now).

## Quote source (Phase 1)

`SyntheticQuoteSource` — 10 plausible TSX symbols, random-walk with gentle mean reversion
(one step per 5s of elapsed time, per-symbol vol/spread in bps), module-level singleton so
prices are consistent across requests within a server process. Restart = fresh walk from
base prices. Phase 2 replaces this with a Yahoo-delayed source behind the same `QuoteSource`
interface; the engine doesn't change.

## UI composition

- Server components fetch and render everything; the only client components are the
  interactive bits: `NavBar` (active link), `KillSwitch`, `SettingsForm`, `OrderTicket`.
- `components/ui.tsx` holds the design system primitives (Card, StatCard, Chip, Pnl…);
  `components/Md.tsx` is a deliberate zero-dependency mini-markdown renderer (bold, code,
  paragraphs, italic blocks) — agent output is simple; no remark pipeline needed.
- Root layout is `force-dynamic` (reads session headers + settings every request), which
  also keeps `next build` from trying to prerender DB-backed pages inside Docker where no
  DB exists.
- Theme: near-black `#060d0c` with teal radial glows; accent teal-300→500 gradients;
  red reserved for the kill switch and losses.

## Deployment

Docker Compose (**v2.4 file format — host runs legacy docker-compose v1**): `web`
(3012→3000, healthcheck on `/api/health`) + `db` (volume `grq-db-data`, loopback 5434).
Web image: multi-stage node:22-alpine → `next build` standalone → runtime with
`node_modules/.prisma` copied in for the query engine. Schema changes are applied
**host-side** (`npx prisma db push` against 5434), not at container start.
