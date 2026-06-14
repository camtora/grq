# Financial Literacy — a product through-line

Stated as a first-class pillar by Cam, 2026-06-13.

GRQ is a learning project, not just a fund dashboard. **Financial literacy is a product
pillar:** the app should teach the market as you use it, never assume fluency. The fund's
whole premise — "get rich quick, slowly, with receipts" — only works if the receipts are
*legible* to the people reading them.

## The principle

**Every number, acronym, and concept on screen should be explainable — inline where it's
cheap, by the agent where it needs reasoning.** "I should be able to click NAV / ACB / ADV
and have it explained." A figure the app displays but cannot explain is a bug.

**Exhibit A (2026-06-13):** the `/stocks` Recommendation column showed `49%` and the chat
agent couldn't explain it — the consensus formula (`overallSignal`) was UI-only and never
exposed to the agent, so it honestly refused to guess. Fixed by surfacing the recommendation
*and its formula* through the `get_signals` tool. That exact gap — a visible number the app
couldn't explain — is what this pillar exists to prevent.

## Mechanisms

1. **Glossary / clickable terms** *(planned)* — a `<Term>` component underlines jargon and
   pops a plain-English definition. Seed a static dictionary for the app's own vocabulary
   (NAV, ACB, ADV, RSI, MACD, superficial-loss, drawdown, kill switch, round-trip, …) and
   render terms clickable everywhere they appear.
2. **Agent explainers** *(planned)* — an "explain this" affordance asks the agent for a
   3-sentence plain-language box on a concept surfaced in research/news (e.g. *"why would
   someone use a shell company?"*), **cached in the DB** so the second reader pays $0 and
   gets it instantly. Reuses the read-only chat infrastructure (Max token, no order tools).
3. **Honest framing** *(live)* — expected returns are shown as the agent's *hypothesis*
   beside its hit-rate, never as a promise; luck is flagged as luck; "vs just buying XIC"
   stays on screen. Teaching that a price target is a bet, not a fact, is itself literacy.
4. **The Daily** *(`docs/NEWSPAPER.md`)* — the daily paper is where a newcomer absorbs the
   rhythm of a market; its quotes and jokes teach and disarm.

## Product, not single-user app

Reframed 2026-06-13 (Cam): GRQ is being designed as a **product**, not just a two-person
tool. The literacy and newspaper layers are precisely what generalize to a wider audience,
so they're worth building well. But multi-tenancy / accounts / billing stay **deferred** —
the soak and the single fund are the priority, and these content layers serve Cam & Graham
today regardless of who else ever sees them. It's not either/or.
