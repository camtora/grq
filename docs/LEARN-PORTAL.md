# The Learn Portal — how the market actually works (D110)

**Status:** Phase 1 shipped 2026-07-04. A top-level **`/learn`** destination beside Reports —
the front door for the financial-literacy pillar (`docs/LITERACY.md`). It teaches Cam & Graham
**how the market works** — not which stocks to buy: what a stock is, how a price forms, what
owning one actually means. The Options portal, the labs, and the glossary are gathered under it
instead of being scattered across dropdowns and desk buttons.

> Education-only. Touches none of the §6 order gate, the broker, or the fund. Distinct from
> `/how-it-works` (the owner-only *operating manual* — live dials, decision log, build diary),
> which stays where it is; the portal's future "How GRQ works" course teaches the same facts
> *as market education*, viewer-readable.

---

## 1. Goal & shape

Everything educational GRQ had built lived in five scattered places: the Options portal
(`/options`, D100), the labs' education cards (Day/Short), the `<Term>`/glossary spine,
`/how-it-works`, and a one-row mobile Learning section. The portal is the missing hub plus the
missing content — the **market-mechanics curriculum**.

```
Header: … Learn · Reports · Experiments ▾

/learn                    Hub — course grid + labs rail + glossary teaser + Ask Alfred
/learn/[course]           One course: lessons stacked as panels, markdown via Md, tryIt links
/learn/glossary           The full glossary, searchable, related-terms cross-linked
/options?tab=…            UNCHANGED — listed as Course 6 (deep links everywhere stay valid);
                          gained a "← learn" back-nav
/day-lab, /short-lab, …   UNCHANGED — surfaced on the hub's labs rail, framed by what each teaches
```

Decisions locked (Cam, 2026-07-04):
- **Name:** plain **Learn** in the nav (`SECONDARY`, beside Reports). Masthead carries the voice.
- **"How GRQ works": yes, as Course 8** — the fund as a worked example (guardrails as risk
  management, NAV as accounting, the soak as verification) — written for a learner. NOT by
  relocating `/how-it-works`.
- **Don't move `/options`.** Alfred, the desk page, ShortEducation, and mobile all deep-link
  `/options?tab=…`; the hub links in and the portal back-links to `/learn`.

## 2. The curriculum

Eight courses, ordered as a path. Live courses have 4–6 short lessons in GRQ's voice; every
term is tap-to-explain; each lesson can carry `tryIt` links into the live app ("see the fund
measured against XIC in Reports").

1. **The machine** *(live)* — what a stock is · what an exchange does · tickers & look-alikes
   (CDRs, the D105 lesson) · market hours & gaps (D102's split holidays) · indices & "the market was up".
2. **How a price happens** *(live)* — bid/ask/spread · order types · market makers & liquidity
   (why the universe has a screen) · what actually moves a price · why quotes disagree (delayed data, honestly).
3. **Owning a piece** *(live)* — dividends (ex-date honesty) · splits & buybacks · ACB + unrealized
   vs realized (+ superficial loss) · stocks vs ETFs (MER, the couch-potato bar) · two currencies (D62 FX).
4. **Reading the game** *(soon)* — earnings, analyst ratings, 13F/insiders, technicals honestly framed —
   each maps to a stock-page panel.
5. **Risk** *(soon)* — volatility, drawdown, sizing, leverage, shorting, day trading → exits to the labs.
6. **Options** *(live, external)* — the D100 portal, unchanged.
7. **The long game** *(soon)* — compounding, benchmarks, fee gravity, TFSA/taxes, behavioural traps.
8. **How GRQ works** *(soon)* — the fund as a worked example, per above.

"Soon" courses render as dimmed hub cards (honest — no vaporware) and an EmptyState if visited.

## 3. Content architecture

**Source of truth: `web/lib/learn/content.ts`** — typed `LearnCourse[]`/`LearnLesson[]`, lesson
bodies as **markdown rendered by `components/Md.tsx`**, which already turns `[[slug]]` /
`[text](#explain:slug)` into `<Term>` popovers and auto-links known jargon. The literacy layer
comes free with zero per-lesson wiring — this replaces the hardcoded-JSX lesson pattern
(`OptionsLearn`, `DayEducation`) for new content.

**Why not author in `shared/`:** the web Docker build context is `./web` — web cannot import the
repo-root `shared/` dir. So web owns the content and **`web/scripts/export-learn-content.ts`**
mirrors it to **`shared/content/learn.json`** for GRQ Go (same lockstep pattern as
`shared/contract.ts` ↔ `lib/feed.ts`). Run it after any content change; commit the JSON.

**Rules for lesson bodies** (enforced by `web/test/learn-content.test.ts`):
- every `[[term]]` / `#explain:` slug must exist in `lib/glossary.ts` — no dead popovers;
- no navigation links inside markdown (Md opens links in a new tab) — use `tryIt` instead;
- glossary `related` slugs must all resolve (the test caught two pre-existing dead links on day one).

## 4. What shipped in Phase 1 (2026-07-04)

- `/learn` hub: course grid (live/soon/external states), labs rail (each lab framed by what it
  teaches), glossary teaser with live term count, Ask Alfred card (`AskLearn` — the same
  `grq:chat` CustomEvent pattern as `AskOptions`, market-mechanics starter prompts).
- `/learn/[course]`: lessons as `PanelHeader` + `Card` + `Md`, tryIt links, next-course nav,
  redirect for the external Options course, EmptyState for `soon`.
- `/learn/glossary` + `GlossaryBrowser`: client-side search over every entry, examples, related
  chips that clear the filter and scroll.
- **Courses 1–3 written** (15 lessons) + **16 new glossary terms** (ticker, ipo, index,
  market/limit-order, market-maker, liquidity, volume, dividend, stock-split, buyback,
  total-return, mer, cdr, currency-risk, long-call).
- Nav: `Learn` added to `SECONDARY` beside Reports; `/options` gained `← learn`.
- Tests: `web/test/learn-content.test.ts` (117/117 suite green), tsc clean, all routes smoke-tested.

## 5. Roadmap

- **Phase 2 — the rest of the curriculum + flagship widget.** Courses 4, 5, 7; the **toy order
  book** (pure client, integer cents — the spread/order-type lessons' interactive centrepiece);
  a compounding/DCA visualizer for Course 7.
- **Phase 3 — receipts + How GRQ works.** Live-fund example blocks inside lessons (a real fill vs
  its quote, the fund's actual drawdown, the real vs-XIC line — the `how-it-works` pattern of
  pulling live numbers so prose can't drift), and Course 8.
- **Phase 4 — mobile parity + glossary unification.** GRQ Go renders `shared/content/learn.json`
  in its More ▸ Learning section (one small `[[term]]`→tap-alert renderer); promote the shared
  glossary JSON to full fidelity and end the web/shared/mobile triplication. Optional per-member
  lesson checkmarks (`LessonRead`) if momentum wants them.
- Opportunistic: a paragraph in the chat persona so Alfred deep-links lessons the way it already
  deep-links the calculator (needs a `chat` rebuild — batch with the next agent deploy).

## 6. Honesty & guardrails

Same rules as everything GRQ teaches: the benchmark stays on screen ("most professionals fail to
beat the index" is in the ETF lesson), delayed data is called delayed, dividends aren't free
money, and nothing in the portal is a trading path. Viewer-readable throughout; only Ask (chat)
is members-only. Money rules never funny.

Logged as **D110** in `docs/DECISIONS.md`. Owner: Cam. Greenlit 2026-07-04.
