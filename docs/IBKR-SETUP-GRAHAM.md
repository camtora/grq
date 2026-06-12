# Graham: Your IBKR Account Setup Guide

*Get rich quick, slowly, with receipts.* 🤝

Hey Graham — this is your walkthrough for opening the brokerage account that GRQ trades
through. It's written to be read standalone; ~20 minutes of forms, then a few days of
waiting on IBKR.

## What you're signing up for (read this part properly)

- The account is in **your name**: your ID, your SIN, **your money, your taxes**. Gains and
  losses land on *your* return (non-registered account → capital gains treatment).
- The initial stake is **$5,000 CAD of your own money** (funded later, not during signup).
  Keeping the owner and the funder the same person is what keeps taxes and the friendship
  simple.
- Cam keeps exactly what you keep: equal dashboard access and the **kill switch**. Ownership
  decides whose money — never who can halt the robot.
- What the robot can and can't do to your account: it can only **trade inside it**, within
  hard code-enforced limits (no shorting, no margin borrowing, no options, position caps,
  monthly fee budget, stop-losses). **Withdrawals can only go to your own verified bank
  account**, and adding a new destination requires your interactive 2FA — so the worst case
  for a haywire robot is bad trades within its limits, never money leaving sideways.
- Real money doesn't trade until the simulation + paper-trading soak passes (≥4 clean weeks
  total, ≥2 on IBKR paper). The sim is already running.

## Phase A — The application (~20 min now, 1–3 business days approval)

1. Go to **interactivebrokers.ca** — make sure it's the `.ca` site (IBKR *Canada*).
2. **Open Account** → account type: **Individual**.
3. Registration type: **non-registered** (a regular cash/margin account). **NOT a TFSA, NOT
   an RRSP** — an actively-trading robot inside a TFSA is CRA-audit bait.
4. Account capability: choose **Margin**. We never borrow (the code forbids it) — margin is
   for settlement flexibility. If the margin questionnaire blocks you, **Cash** is an
   acceptable fallback; just tell Cam so the docs get updated.
5. Base currency: **CAD**.
6. Have ready: government photo ID, your **SIN**, address history, employer info, and honest
   answers to the financial-profile questions (income, net worth, investing experience —
   "stocks, a few years, some trades a year" is typically enough for equities + margin).
7. Trading permissions: **Stocks — Canada**, and **Stocks — United States** if offered
   (harmless, future-proofs us). Do **NOT** request options, futures, forex, or crypto —
   GRQ doesn't touch them and extra permissions just add questionnaire friction.
8. Funding step: **skip it / fund $0** — there's no minimum, and the $5,000 goes in at
   go-live, weeks from now.
9. Market data subscriptions: **skip all of them** — free delayed data covers everything
   until real money trades (then it's one ~$16.50/mo TSX subscription).
10. Submit, then watch your email — IBKR sometimes asks for a document re-upload.

## Phase B — The day you're approved (~10 min, this unblocks the robot's next phase)

1. Log in to **Client Portal** → Settings → Account Settings → **Paper Trading Account** →
   enable. (Free, instant — a fake-money twin of your account that the robot soaks on.)
2. Settings → **Users & Access Rights** → add a **second username** dedicated to the API —
   this keeps the robot's session from kicking you out of the app and vice versa. Do this on
   a desktop browser; it's miserable on a phone.
3. Get the **paper-account credentials** to Cam **securely**: password manager share, or
   Signal/iMessage — *not* email, and definitely not the Discord channel the robot posts in.

That's it — everything else (bank linking, the $5,000 deposit, the real-time data
subscription, the Flex reporting token) happens weeks later, after the soak passes, and
there's a guide for it when the time comes.

## FAQ

- **"Lite or Pro?"** — IBKR Lite doesn't exist in Canada; you'll get Pro-style pricing
  (~$1 minimum per order — already modeled in the sim, with a $20/month fee cap).
- **"It's asking about day trading."** — You are not a day trader and neither is the robot:
  GRQ is a swing fund and same-day round trips are prohibited *in code*.
- **"Why do they need my employer/net worth?"** — Standard Canadian KYC/suitability rules;
  every broker asks. Answer honestly.
- **"What do I actually get out of this?"** — Half the kill switch, full dashboards at
  grq.camerontora.ca, the Discord feed of every trade with its reasoning, and a robot that
  has to explain itself to you every evening at 4:15.

## Checklist

- [ ] Application submitted (individual · non-registered · margin · CAD)
- [ ] Approved (email from IBKR)
- [ ] Paper trading account enabled
- [ ] Second username created for the API
- [ ] Paper credentials handed to Cam, securely
- [ ] (Much later, after the soak) bank linked + $5,000 deposited
