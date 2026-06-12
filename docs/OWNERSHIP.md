# Account Ownership — Options & Design

Written 2026-06-12. **Current decision state: the real-money account will be single-owner —
either all Cam's money or all Graham's money. Which of the two is OPEN**, and only needs
deciding before the IBKR application goes in (it gates Phase 3, nothing earlier).

## Design principle: ownership is data, not code

The app is **ownership-agnostic by construction**. Nothing in GRQ's behaviour — guardrails,
kill switch, agent, soak gate, reports — depends on whose name is on the brokerage account:

| Ownership touches | Where it lives |
|---|---|
| Broker credentials | `.env` (swap freely) |
| Who contributed what | `Contribution.contributor` ("Cam" / "Graham") — drives any future per-person tax allocation |
| Who the account holder is | `PROJECT_PLAN.md` §10.2 + this doc (paperwork, not code) |
| App access / kill switch | `web/lib/users.ts` — **always both, equal admin**, regardless of ownership |

Supporting any of the four options below is a config/paperwork change, not a build.

## The four options

| | 1. All Cam | 2. All Graham | 3. Joint account | 4. Two accounts (later) |
|---|---|---|---|---|
| Application | Cam's ID/SIN/bank | Graham's ID/SIN/bank | Both (two sets of ID/SIN) | Both, separately |
| Taxes | 100% Cam | 100% Graham | **By contribution proportion** (CRA — not 50/50 by default) | Each their own |
| Funding | Cam's bank | Graham's bank | Either/both link their own banks | Each their own |
| Withdrawals go to | Cam | Graham | Either holder's linked bank | Each their own |
| Unwind difficulty | trivial | trivial | annoying (negotiate the split) | trivial |
| Ops cost | 1× | 1× | 1× | **2×** (two gateways, two data subs at live) |
| GRQ changes needed | none (current default) | swap names + creds | contributor-split tax view (small) | multi-account support (Phase 5 backlog) |

### Notes that matter

- **Option 2 funding caveat:** if *Cam's* cash funds *Graham's* account, that's legally a
  gift — fine in Canada between adult friends (no gift tax, no income attribution; that trap
  is spousal/minor-child only), but it's genuinely Graham's money afterwards: his taxes, his
  bank, his 10x if the robot gets lucky. Only do that deliberately. Clean version: the
  account holder funds it with their own money.
- **Option 3 tax rule most people miss:** CRA allocates joint-account gains by **who
  contributed what**, not by the names on the title. Equal partnership = contribute equally
  ($2,500 each) and reporting is a clean 50/50. GRQ's contribution ledger
  (`Contribution.contributor`) tracks exactly the proportions an accountant would ask for.
- **Option 4** is the fun one eventually — same agent, two accounts, a literal leaderboard.
  The `BrokerAdapter` seam doesn't preclude it; the cost is doubled ops. Phase 5 material.
- **What never changes:** both members keep equal app access and the kill switch. Account
  ownership decides whose money and whose taxes — never who can halt the robot.

## Recommendation

For the current plan (single owner): pick whoever (a) wants the gains/losses on their tax
return, and (b) is willing to do the IBKR paperwork with their own documents and bank. There
is no app-side difference whatsoever. If you ever drift back toward "both of us in," prefer
the joint account with equal contributions over any gift arrangement.

Standard caveat: mechanics above are solid, but once real gains exist, one email to an
accountant is cheap insurance. This doc is not tax advice; it's a map.

## Decision log

| Date | Decision |
|---|---|
| 2026-06-11 | Initial: Cam's money, Cam's account (§10.2) |
| 2026-06-12 | Revised: **single-owner, Cam OR Graham, TBD before the IBKR application.** App made formally ownership-agnostic (`Contribution.contributor` added). Joint + two-account options documented and supported by design |
| _pending_ | Final owner named → update §10.2, `docs/IBKR-SETUP.md` greeting, and the seed contributor |
