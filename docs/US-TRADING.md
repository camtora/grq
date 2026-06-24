# US Trading & FX — How It Works (and where GRQ stands)

> Reference doc for the "should the fund trade US stocks, and how does the
> currency side work" question. Written 2026-06-23. Pairs with `docs/DECISIONS.md`
> D23/D24/D34 and `PROJECT_PLAN.md` §6 (guardrails). Financial-literacy first —
> every number on the dashboard should be explainable, and so should this.

---

## TL;DR

- A US stock **settles in US dollars** — to buy NVDA, the account must produce
  real USD. There's no "pay in CAD for a USD stock" that isn't, underneath,
  one of the two options below.
- **Two ways to get the USD:** (1) **hold USD cash** (convert CAD→USD first), or
  (2) hold only CAD and let the USD balance go negative — which is a **margin
  loan** (IBKR auto-borrows USD and charges interest). **Option 2 is margin
  borrowing, forbidden by guardrail #3.**
- So we **hold USD specifically to avoid borrowing it.**
- **Yes, there's an exchange fee** — but on IBKR it's tiny (~USD $2 min per
  conversion at the real interbank rate). Most retail brokers instead bake a
  ~1–2% spread into the rate on every conversion.
- **"Just account for the FX" works for valuation, not for settlement.** We
  already value USD holdings back into CAD (D34, BoC rate) — that's math, no
  money moves. But math doesn't produce the dollars the seller needs.
- The catch: holding USD means the fund takes on **currency risk** — CAD-measured
  NAV moves with the USD/CAD rate even when the stock doesn't. That makes "how
  much USD to hold" a human portfolio-allocation call, not a stock-picking one.

---

## Why a stock needs its own currency

When you buy NVDA on the Nasdaq, the exchange and the seller expect **US dollars**.
The price is quoted in USD and, on settlement, the broker hands real USD to whoever
sold the shares. A TSX listing (TD) settles in CAD the same way. So to buy a US
name, *something* has to produce USD — the stock will not quietly accept loonies.

That leaves exactly two ways for the account to come up with the USD:

1. **You already hold USD cash** → the purchase spends it. Clean, no borrowing.
2. **You hold only CAD** → IBKR lets your USD balance go **negative**. You now
   *owe* USD: a **margin loan**, auto-borrowed against your CAD as collateral,
   accruing **interest** until you square it.

Option 2 is the hidden answer to "can't we just take the FX into account and pay
in CAD?" — under the hood, paying CAD for a USD stock **is** option 2. The broker
fronts you the USD; you're borrowing it. **That is the margin borrowing guardrail
#3 forbids.** Not free, and not allowed here.

> **We hold USD precisely to avoid borrowing it.**

## "Can't we just account for the conversion?"

Two different things hide in that question:

- **Valuation / accounting — yes, already done.** D34 wired `web/lib/fx.ts` so the
  dashboard values any USD holdings back into CAD at the Bank of Canada rate. NAV,
  position sizing, the cash floor — all computed in CAD. Pure math; no money moves.
- **Settling the trade — no.** Valuing things in CAD doesn't conjure USD for the
  seller. You still need real dollars: either hold them (converted in advance) or
  borrow them (margin). A number on a screen is not a dollar in the account.

## Is there an exchange fee?

Yes — and this is where IBKR is unusually good.

- **IBKR (IDEALPRO):** conversions go through IBKR's FX venue at essentially the
  **real interbank spot rate** (razor-thin spread), commission ~**USD $2 minimum**
  per conversion (≈0.2 basis points → ~$2 on up to roughly $100k). A discrete
  event, not a per-trade tax.
- **Typical retail broker (Questrade, the banks):** no visible commission, but a
  **~1–2% spread baked into the rate** on *every* conversion. This is why
  converting a chunk and holding it is cheap on IBKR and expensive elsewhere.

## Hold a USD pool vs. convert on every trade

This was the **D34** call ("hold USD, mirroring IBKR — *not* FX-at-execution"):

| Approach | What happens | Cost |
|---|---|---|
| **Hold USD** (chosen) | Convert a chunk of CAD→USD once; make many US buys/sells from that USD pool; convert back only occasionally | One ~$2 fee per chunk; you cross the spread rarely |
| **Convert per trade** | Every US buy converts exactly enough CAD→USD; every sell converts back | A conversion riding alongside *every* trade; you cross the spread constantly |

Holding a pool = fewer conversions, fewer fees, no whipsaw from the exchange rate
on every trade. It also mirrors how the IBKR account natively works: it keeps
**separate CAD and USD cash balances** (`Account.cashCents` / `Account.usdCashCents`).

## The catch: currency risk

The moment you hold USD, the fund takes on **FX risk** — CAD-measured NAV moves
with the USD/CAD rate even when the stock doesn't budge. Hold $5k USD and the
loonie strengthens 3% → you're down ~$150 CAD on the cash alone, NVDA
notwithstanding. "How much of the fund is exposed to the US dollar" is a
portfolio-allocation decision, distinct from "is NVDA a buy."

---

## Where GRQ actually stands today (2026-06-23)

- **US trading is enabled** (D34, 2026-06-17): the promotion gate `isTradeable()`
  passes CAD **and** USD; valuation converts USD→CAD at the BoC rate.
- **The agent already hunts + promotes US names.** Universe snapshot: `GOOG`,
  `NVDA`, `TSM` are **ACTIVE** (promoted, tradeable) USD names; ~20 US tickers sit
  as USD **CANDIDATEs** from the hunt (AAPL.US, AMD.US, ASML, CMG, MRVL, …).
- **But zero US stocks have ever been traded.** All 8 live positions and all 12
  fills are Canadian (CAD): XIC, SLF, IFC, AC, TD, ATD, MRU, LNR. The only US
  order attempts ever (NFLX, AAPL on 2026-06-16) were rejected — the day *before*
  D34 turned US trading on.
- **The fund holds `usdCashCents = 0`.** No USD buying power, and **there is no
  FX-conversion path anywhere in the code** (grepped the broker/agent tree). So
  promoted US names sit eligible-but-unbuyable.
- **Latent risk to fix regardless:** the validator's cash-floor check
  (`web/agent/validator.ts:200`) uses *combined CAD-equivalent* cash, so a USD buy
  with $0 USD would **pass the gate and settle on USD margin** at the broker —
  silently violating guardrail #3. Must be plugged the moment US trading is real.

## The plan (fixed parts, regardless of the open decision)

1. **`convertCurrency()` broker method** — IBKR places an IDEALPRO `USD.CAD` cash
   order (VERIFY-LIVE on paper with a tiny amount first); `reconcile()` mirrors the
   new CAD/USD balances. Sim converts at the BoC rate instantly.
2. **Plug the margin hole** — the validator requires a USD buy be funded by actual
   `usdCashCents`, never combined CAD-equiv cash. Refuse with a clear "needs USD
   funding" message if short. No more silent USD margin.
3. **Hard FX cap** in `web/agent/policy.ts`; kill switch respected; every
   conversion journaled.
4. **Docs** — a D-record in `docs/DECISIONS.md`, a §6 guardrail line, CLAUDE.md note.

## The decision (RESOLVED — D62, 2026-06-23): agent requests → member approves

Cam chose **Model B — the FX-approval guardrail.** The agent can **request** a
CAD→USD conversion (treat a US name like a Canadian one — ask for whatever the
thesis needs), but a **member approves each one** before money moves. Limits are
**member-set dials**, not hard-coded constants (since every conversion already needs
human approval, the human is the real gate): **max per request · max per rolling
week · max % of NAV in USD** — defaults open (no per-request/week limit, USD cap
100% so all-USD is allowed), tighten anytime in Settings.

What shipped (see D62 in `docs/DECISIONS.md`):

1. **`convertCurrency()` broker method** — IBKR places a MKT order on the **USD.CAD
   IDEALPRO** pair, reconciles, and reports the realized rate/fee from the ledger
   delta (⚠️ **VERIFY-LIVE** — prove with a tiny ~US$20 conversion first); sim
   converts at the BoC rate minus a ~$2 fee.
2. **Margin-hole plug** — the validator requires a USD buy be covered by actual
   `usdCashCents`; short → refused with a "use request_fx" hint. No silent USD margin.
3. **`FxRequest` table + `lib/fx-requests.ts`** — create/approve/reject/manual-convert;
   the cap dials bite at approval; the only caller of `convertCurrency`.
4. **Agent tool `request_fx`** (+ a persona line) — the agent asks; it can't convert.
5. **`POST /api/fx`** (members-only) + the **Settings → Currency & FX panel** (balances,
   USD %, pending approvals, manual convert, the dials; viewers read-only).
6. **Always-on `fx` push category** so an approval request always reaches both members.

> **Soak note:** the first real FX + US fills materially change the soaked system —
> per D34 the clean-soak clock **may restart**. Cam's call.
