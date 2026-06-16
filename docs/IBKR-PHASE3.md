# Phase 3 — IBKR paper: bring-up runbook

Written 2026-06-14, the day Graham's IBKR account was approved. This is the step-by-step to
take GRQ from the sim onto IBKR **paper** money. The scaffold is in place (IBeam service,
`IBKRBroker` behind the broker seam, env config); the live wiring happens with the gateway up.

**Account-opening (Phase A/B) lives in `docs/IBKR-SETUP.md`.** This doc starts the moment
the account is approved.

---

## ⚠️ Validated 2026-06-15 — what works, what's still blocked

A live bring-up session against both members' brand-new accounts established:

**Solved — the headless 2FA (the part everyone says is hard):**
- The gateway logs in with the member's **own username + the paper toggle**
  (`IBEAM_USE_PAPER_ACCOUNT=True`) — no separate API username is needed to get this far (a
  dedicated one is still nice for session isolation, Step 1).
- 2FA is **IB Key push**: IBeam submits → IBKR pushes to the **IB Key app** → the member taps
  **Approve** → `Logging in succeeded`, SSO session live. The app must be **activated**
  (downloading it isn't enough), a newly-added device can have an **activation hold**, and
  `IBEAM_OAUTH_TIMEOUT` must be high enough (we used 180s) to leave time to approve.

**The gotcha that cost us hours — never quote `env_file` values:**
- Legacy docker-compose v1 passes quote characters **literally** into the container. A
  single-quoted `IBEAM_PASSWORD='...'` made the gateway see `'...'` (quotes included) →
  `Invalid username password combination`. **Set `IBEAM_ACCOUNT`/`IBEAM_PASSWORD` UNQUOTED.**
  (Same trap that broke `FMP_API_KEY` — CLAUDE.md rule 5.) Verify with:
  `docker-compose run --rm --no-deps --entrypoint sh ibeam -c 'echo passlen=${#IBEAM_PASSWORD}'`
  — the length must match the raw password exactly.

**Still blocked — the brokerage (`iserver`) session won't connect:**
- After SSO login succeeds, the trading session stays `authenticated:false, connected:false`.
  Ruled out **2FA** (solved) and **competing sessions** (`competing:false`, all other IBKR
  logins closed, force-`reauthenticate` triggered). `/iserver/auth/ssodh/init` returned
  `invalid challenge, machine id` — consistent with a not-yet-provisioned trading session.
- On a **3-day-old account** this is almost always the account itself: **pending approval or
  unsigned agreements** (market-data, disclosures). **Next step (member, on
  interactivebrokers.com):** clear every pending task/agreement, confirm the account is
  fully **approved for trading**, then re-run.

**Operational reality:** IBKR expires the session ~midnight ET → a **daily IB Key approval**
keeps the gateway alive. Full automation would need a TOTP-secret 2FA handler, if the account
supports it. **Watch the gateway via the tickle** (`/v1/api/tickle`), NOT the IBeam logs —
stale "Logging in failed/succeeded" lines cause false reads.

---

## ✅ Built 2026-06-15 — the adapter is wired (flip-and-verify ready)

The `IBKRBroker` (`web/lib/broker/ibkr.ts`) is **code-complete and deployed, inert until
`BROKER=ibkr-paper`**. The seam is routed — the runner + validator place through `getBroker()`,
so the §6 gate still runs *above* the broker, unchanged. Built + typechecking clean:

- **Scoped TLS** — gateway calls use a `node:https` agent with `rejectUnauthorized:false`, scoped
  to `ibeam` only (never global `NODE_TLS_REJECT_UNAUTHORIZED`). No new dependency.
- **`conidFor`** — `/iserver/secdef/search`, prefers the Toronto (TSE/TSX) listing among hits.
- **`authStatus` / `keepAlive`** — health each tick; re-`reauthenticate`s a dropped session.
- **`placeOrder`** — submits to `/iserver/account/{id}/orders`, clears the reply/confirm cascade,
  polls the fill ~12s → records Order + Trade + TRADE journal entry (fill price & commission from
  IBKR) → reconciles. Working-but-unfilled → PENDING, finalised on the next tick.
- **`reconcile`** — mirrors IBKR positions + CAD cash into our DB each tick (**our DB becomes a
  mirror of broker truth, not the source**). Deterministic stop/take-profit place real IBKR market
  sells when triggered, so protection survives the broker swap.

**Deferred (after the first clean paper fills — not blockers):** native bracket orders (stop +
take-profit resting *at IBKR*); the Flex importer (historical trade/NAV reconciliation).

**VERIFY-LIVE (best-effort against the docs; shake out on the live gateway, marked in code):** the
conid pick across listings, the exact reply-cascade shape, and the fill/commission field names in
the order-status response.

### Tomorrow — flip & verify (during market hours, 9:30–16:00 ET)
1. **Gateway up + connected:** `docker-compose up -d ibeam`, approve the IB Key push, confirm
   `iserver` `authenticated:true` (the Step 3 tickle check). *This is the only real unknown left —
   it needs the brokerage session to bridge, which it won't do off-hours.*
2. **Paper account id into `.env`:** `IBKR_ACCOUNT_ID=DU…` (the paper account number).
3. **Flip the seam:** set `BROKER=ibkr-paper`, `docker-compose up -d agent`.
4. **One tiny test order** (agent path or a manual ticket) on a liquid TSX name — watch the log:
   submit → reply cleared → fill → Trade + journal written → `reconcile` mirrors the position.
   Cross-check the position/cash against Client Portal.
5. If the fill + reconcile match broker truth, **the IBKR-paper soak clock starts** (≥ 2 clean
   weeks). A misbehaving `VERIFY-LIVE` spot is a small field/selector tweak, not a rebuild.

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

`~/grq/.env` is chmod 600 and never committed. **Never quote `env_file` values** —
docker-compose v1 passes the quote characters literally into the container (the 2026-06-15
trap; CLAUDE.md rule 5). Add, UNQUOTED:

```
IBEAM_ACCOUNT=paper-or-login-username   # member's username; the paper toggle handles the rest
IBEAM_PASSWORD=...                       # UNQUOTED, even if it contains punctuation
IBEAM_USE_PAPER_ACCOUNT=True             # log into the simulated paper twin
IBEAM_OAUTH_TIMEOUT=180                  # seconds — leave time to approve the IB Key push
IBEAM_MAX_FAILED_AUTH=1                  # lockout-safe cap while testing (raise to ~5 steady-state)
IBKR_GATEWAY_URL=https://ibeam:5000
IBKR_ACCOUNT_ID=DU0000000               # the PAPER account id (starts with DU)
IBKR_FLEX_TOKEN=...                      # also UNQUOTED (env_file)
# leave BROKER=sim for now — do NOT flip until Step 4 verifies fills
```

Confirm the password survived the container boundary (length must match the raw password):

```bash
docker-compose run --rm --no-deps --entrypoint sh ibeam -c 'echo passlen=${#IBEAM_PASSWORD}'
```

## Step 3 — Bring up the gateway, verify auth

```bash
cd ~/grq
docker-compose up -d ibeam            # starts only the IBeam gateway
```

**2FA is an IB Key push** (validated 2026-06-15): within ~`OAUTH_TIMEOUT` seconds, IBKR pushes
to the member's **IB Key app** → tap **Approve** → `Logging in succeeded`. Then verify — poll
the **tickle**, not the logs (logs carry stale "Logging in failed/succeeded" lines that fool a
grep):

```bash
docker exec grq-ibeam sh -c 'curl -sk https://localhost:5000/v1/api/tickle'
# SSO session: {"session":"...","userId":...,"iserver":{"authStatus":{...}}}

docker exec grq-ibeam sh -c 'curl -sk https://localhost:5000/v1/api/iserver/auth/status'
# WANT: {"authenticated":true,"connected":true,"competing":false,...}
```

Two distinct sessions, in order: **SSO** (login + 2FA — solved) then the **brokerage
`iserver`** session (trading). If SSO succeeds but `iserver` stays `authenticated:false`,
force a re-auth: `curl -sk -X POST https://localhost:5000/v1/api/iserver/reauthenticate`.
If it's `competing:true`, close every other IBKR login (website / TWS / mobile-trading). If
neither clears it on a **fresh account**, the account isn't fully provisioned for trading yet
— see the **2026-06-15** block above. Once both sessions are green, proceed to wiring.

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
