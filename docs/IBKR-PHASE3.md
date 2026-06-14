# Phase 3 — IBKR paper: bring-up runbook

Written 2026-06-14, the day Graham's IBKR account was approved. This is the step-by-step to
take GRQ from the sim onto IBKR **paper** money. The scaffold is in place (IBeam service,
`IBKRBroker` behind the broker seam, env config); the live wiring happens with the gateway up.

**Account-opening (Phase A/B) lives in `docs/IBKR-SETUP.md`.** This doc starts the moment
the account is approved.

---

## Step 1 — Graham, in IBKR Client Portal (~10 min)

1. **Settings → Account Settings → Paper Trading Account → enable.** The free simulated twin
   GRQ soaks on (instant).
2. **Settings → Users & Access Rights → add a second username** dedicated to the API. The
   bot's gateway session and your interactive logins must not share a username or they kick
   each other out. *This is the single biggest reliability lever.*
3. **Performance & Reports → Flex Queries → Flex Web Service → generate a token.** GRQ uses
   it for statements/NAV without the gateway.

## Step 2 — Credentials into `.env` (Cam or Graham, on the host)

`~/grq/.env` is chmod 600 and never committed. Single-quote anything with a `$`. Add:

```
IBEAM_ACCOUNT='paper-api-username'      # the dedicated secondary username
IBEAM_PASSWORD='...'
IBKR_GATEWAY_URL=https://ibeam:5000
IBKR_ACCOUNT_ID=DU0000000               # the PAPER account id (starts with DU)
IBKR_FLEX_TOKEN='...'
# leave BROKER=sim for now — do NOT flip until Step 4 verifies fills
```

## Step 3 — Bring up the gateway, verify auth

```bash
cd ~/grq
docker-compose up -d ibeam            # starts only the IBeam gateway
docker-compose logs -f ibeam          # watch the headless login; expect a 2FA prompt the first time
```

IBKR almost always requires a **2FA approval** on first login (IBKR Mobile push). Approve it.
Then verify the brokerage session is live (from inside the network):

```bash
docker exec grq-agent sh -c 'curl -sk https://ibeam:5000/v1/api/iserver/auth/status -X POST'
# want: {"authenticated":true,"connected":true,...}
```

If that's green, the gateway works and we proceed to wiring. If it loops / won't authenticate,
that's the known headless-auth pain — see "Realities" below.

## Step 4 — Live wiring (Claude, with the gateway up) — the actual build

The scaffold (`web/lib/broker/ibkr.ts`) has the structure; these are the live tasks, in order:

1. **Self-signed cert** — wire an undici dispatcher so the agent trusts the gateway's cert
   (scoped to `ibeam`, not global `NODE_TLS_REJECT_UNAUTHORIZED`).
2. **conid lookup** — verify `/iserver/secdef/search` returns the right **TSX/CAD** listing
   for our universe; select by exchange/currency, cache it.
3. **Order submission** — complete the `/iserver/account/{id}/orders` flow including the
   **reply/confirm** loop (`/iserver/reply/{id}`), then read back the order id + status.
4. **Async fills** — IBKR fills are not synchronous like the sim. The orchestrator polls
   order status + `/portfolio/{id}/positions` and writes our `Trade`/`Position`/`NavSnapshot`
   rows from broker truth (the DB becomes a *mirror*, reconciled, not the source).
5. **Cash/positions reconciliation** + the **Flex importer** (trades/cash/NAV via the Flex
   token) — flag drift between our accounting and IBKR.
6. **Native brackets** — place the deterministic **stop-loss + take-profit as real IBKR
   orders** so they rest broker-side and survive a dead server/session.
7. **Route the seam** — the runner + validator currently `new SimBroker()` directly; switch
   them to `getBroker()` so `BROKER` actually selects the adapter. (The sim-only
   `sweepPendingOrders` becomes a no-op for IBKR, which handles resting limits natively.)
8. **Health** — the orchestrator calls `IBKRBroker.authStatus()` each tick; a dropped session
   while holding positions is a **critical** alert (Discord @mention + `/api/health`).

## Step 5 — Flip and soak

Only once Step 4 places + reconciles a real paper fill end-to-end: set `BROKER=ibkr-paper`,
rebuild `agent`/`web`, and the **IBKR-paper soak clock starts**. Gate before real money:
**≥ 2 clean weeks on IBKR paper** (sim weeks count toward the 4-week total, but only paper
proves the broker plumbing). Then the Phase 4 go-live ceremony (`docs/IBKR-SETUP.md` Phase C):
link bank, deposit $5,000, TSX L1 data, flip `ibkr-live`, Cautious dial week 1.

## Realities (the hard part)

- **Headless auth is finicky.** Nightly resets, periodic 2FA prompts, and session drops are
  expected. Mitigations: the dedicated secondary username, IBeam's keep-alive + tickle, and
  critical alerts on session loss. Expect iteration here — it's the hardest piece in the project.
- **Paper data is delayed** (~15 min) — fine for swing decisions, same as the sim today.
- **Everything above the seam is unchanged** — the agent, the §6 gate, the 75% conviction
  gate, take-profit, reports. Only the broker behind the seam swaps.
