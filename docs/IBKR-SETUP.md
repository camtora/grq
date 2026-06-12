# IBKR Account Setup — Step-by-Step

Written 2026-06-12 so the instructions are forwardable (Cam → Graham). These steps open the
brokerage account that GRQ's Phase 3 (paper) and Phase 4 (real money) plug into.

> **Whose name goes on the account matters.** The plan (PROJECT_PLAN §10.2) treats the fund
> as **Cam's money in Cam's account** — Graham has equal app access and the kill switch, but
> the brokerage account, the taxes, and the linked bank are Cam's. The application asks for
> the holder's SIN and ID, so **Cam must be the one completing it** (Graham can drive the
> keyboard, but with Cam's documents and answers). If Graham ever wants his own money in
> play, he opens his *own* account the same way — we don't pool (tax attribution +
> someone-else's-money problems).

## Phase A — Apply now (~20 min + 1–3 business days approval)

1. Go to **interactivebrokers.ca** (the `.ca` matters — IBKR *Canada*) → **Open Account**.
2. Account type: **Individual**.
3. Registration type: **Non-registered (cash/margin) account** — explicitly NOT a TFSA or
   RRSP (a trading robot in a TFSA invites a CRA business-income audit; see docs/DECISIONS D3).
4. Account capability: choose **Margin**. We will never borrow (the code forbids it) — margin
   is for settlement flexibility and to keep the future shorting toggle possible. If the
   margin questionnaire becomes a blocker, **Cash** is an acceptable fallback; tell Claude so
   the docs get updated.
5. Base currency: **CAD**.
6. Have ready: government photo ID, **SIN**, address history, employer info, and honest
   answers for the financial-profile questions (income, net worth, investment experience).
   The experience questions gate trading permissions — answer truthfully; "stocks: some
   years, dozens of trades" is typically enough for plain equities + margin.
7. Trading permissions: **Stocks — Canada** (and **United States** if offered, harmless to
   have for Phase 5). Do NOT request options, futures, forex, or crypto — we don't trade
   them, and extra permissions just add questionnaire friction.
8. Funding during application: you can skip or defer funding — there's no minimum. The
   $5,000 goes in at Phase 4 go-live, not before.
9. Market data subscriptions: **skip everything** for now (free delayed data is all that
   paper trading needs; the ~CAD 16.50/mo TSX Level 1 sub happens at go-live).
10. Submit. Approval is typically 1–3 business days; watch email for follow-up document
    requests.

## Phase B — The day it's approved (~10 min, unblocks GRQ Phase 3)

1. Log in to **Client Portal** → Settings → Account Settings → **Paper Trading Account** →
   enable. This creates the simulated twin account (instant, free) that GRQ soaks on.
2. Settings → Users & Access Rights → **Add a second username** dedicated to the API, so the
   bot's gateway session and your interactive logins don't kick each other out.
3. Tell Claude it's done and hand over the **paper** credentials — they go in `~/grq/.env`
   (never in git). That's the moment Phase 3 starts and the IBKR-paper soak clock begins.

## Phase C — Before real money (Phase 4 go-live, after the soak passes)

1. Client Portal → Transfer & Pay → **Link a bank account** (EFT, micro-deposit
   verification, ~2 business days).
2. Deposit the **$5,000 CAD** (EFT takes 1–3 business days; new deposits have a short hold
   before withdrawal, trading unlocks sooner).
3. Subscribe to **TSX Level 1 streaming** market data (~CAD 16.50/mo non-pro, billed to the
   account, cancellable monthly).
4. Generate a **Flex Web Service token** (Performance & Reports → Flex Queries) — GRQ uses
   it for statements/history without the gateway.
5. The dashboard's go-live ceremony does the rest (flip `BROKER=ibkr-live`, Cautious dial
   for week 1).

## FAQ

- **"Lite or Pro?"** — IBKR Lite doesn't exist in Canada; Canadian accounts are Pro-style
  pricing (~$1 min/order — already modeled in the sim).
- **"It's asking about day trading"** — we are explicitly a swing fund; no day-trading
  pattern intended (the code prohibits same-day round trips).
- **"Can I do this on my phone?"** — the application works in mobile browsers, but the
  Phase B steps (second username) are much saner on desktop.
