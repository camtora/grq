// The Learn portal's curriculum (docs/LEARN-PORTAL.md D110 + docs/LEARN-FRAMEWORK.md D111).
// Source of truth for course + lesson content on web AND mobile: web renders it directly
// (`app/learn`), and `scripts/export-learn-content.ts` mirrors it to `shared/content/learn.json`
// for GRQ Go (the web Docker build context is ./web, so the repo-root shared/ dir can't be
// imported here — same manual-lockstep pattern as shared/contract.ts).
//
// D111 framework: a lesson is a typed sequence of BLOCKS (prose · callout · figure · widget ·
// receipt · living example · video · check · tryIt), not one markdown string. Prose/callout
// markdown is rendered by `components/Md.tsx`:
//   - [[slug]] and [display text](#explain:slug) become <Term> tap-to-explain popovers
//   - known jargon (NAV, ETF, drawdown…) is auto-linked by Md's glossary triggers
//   - keep hrefs OUT of markdown (Md opens links in a new tab) — use tryIt/video blocks instead
// Inline `check` questions are FORMATIVE: client-graded, instant feedback, never scored —
// answer keys here ship to the browser on purpose. The graded course exams live separately in
// `lib/learn/exams.ts` and their keys NEVER reach a client. `web/test/learn-content.test.ts`
// enforces the authoring rules (terms resolve, no nav links, valid keys, ≥1 check per lesson).

/** Interactive widgets a lesson can embed (components/learn/, registered in BlockRenderer). */
export type LearnWidgetKey = "order-book" | "compounding";

/** Live-fund "receipts" blocks (components/learn/Receipts.tsx) — the fund's own numbers,
 *  queried live so a lesson's claims can't drift. Web-only (mobile ignores). */
export type LearnReceiptKey = "real-fills" | "drawdown" | "vs-xic" | "fees" | "guardrails" | "soak";

/** One question — used by inline lesson checks (keys client-side, formative) and by the
 *  course exams in exams.ts (keys server-only, summative). Prompt/explain are markdown. */
export type LearnQuestion = {
  id: string;
  prompt: string;
  /** Shown after answering — the teach-back. */
  explain: string;
  /** Lesson slug (within the same course) to reread on an exam miss. */
  reviewLesson?: string;
} & (
  | { kind: "choice"; options: { id: string; md: string }[]; correct: string[]; multi?: boolean }
  | {
      kind: "numeric";
      /** cents = money (entered as dollars, parsed to integer cents — no floats);
       *  the rest are plain integers. */
      unit: "cents" | "shares" | "pct" | "bps" | "years";
      answer: number;
      tolerance?: number;
      placeholder?: string;
    }
);

/** Hand-built theme-aware SVG diagrams (components/learn/diagrams.tsx — L3 + pass two). */
export type LearnDiagramKey =
  | "order-path"
  | "market-map"
  | "book-ladder"
  | "acb-timeline"
  | "drawdown-ladder"
  | "margin-spiral"
  | "fee-gravity"
  | "grq-pipeline"
  | "two-listings"
  | "ex-date-step"
  | "pizza-split"
  | "target-chase"
  | "one-bet-ten-times"
  | "short-asymmetry"
  | "quote-paths"
  | "thesis-price-2x2"
  | "proposes-disposes"
  | "rsi-gauge";

/** Living examples (lib/learn/examples.ts — L4): market illustrations refreshed nightly
 *  from data GRQ already stores. A lesson's `example` block renders the LearnExample row
 *  when one exists, else its authored fallback — stamped honestly either way. */
export type LearnExampleKey =
  | "biggest-gap"
  | "volume-mover"
  | "spread-pair"
  | "calm-vs-bumpy"
  | "insider-cluster"
  | "buzz-leader"
  | "fx-drift";

/** A real-data chart (components/learn/LearnChart.tsx — L3): daily closes from the Bar
 *  cache, self-warming; "biggest-gap" pins the largest overnight move in the window. */
export type LearnChartSpec = {
  symbol: string;
  days: number;
  label: string;
  annotate?: "biggest-gap";
};

/** One lesson block. */
export type LearnBlock =
  | { kind: "prose"; md: string }
  | { kind: "callout"; tone: "note" | "trap" | "rule"; md: string }
  | { kind: "figure"; src: string; alt: string; caption?: string; credit?: string }
  | { kind: "diagram"; id: LearnDiagramKey }
  | { kind: "chart"; spec: LearnChartSpec }
  | { kind: "widget"; id: LearnWidgetKey }
  | { kind: "receipt"; id: LearnReceiptKey }
  | { kind: "example"; key: LearnExampleKey; fallbackMd: string }
  | { kind: "video"; yt: string; title: string; author: string; minutes: number; why: string }
  | { kind: "check"; q: LearnQuestion }
  | { kind: "tryIt"; links: { href: string; label: string }[] };

export type LearnLesson = {
  slug: string;
  title: string;
  blocks: LearnBlock[];
};

export type LearnCourse = {
  slug: string;
  n: number;
  title: string;
  /** One-liner for the hub card. */
  tagline: string;
  /** "After this course you can…" — three bullets on the syllabus page. */
  overview?: string[];
  status: "live" | "soon";
  /** A course taught on its own page (the Options portal). Overrides the course route. */
  external?: { href: string; note: string };
  lessons: LearnLesson[];
};

const prose = (md: string): LearnBlock => ({ kind: "prose", md });
const check = (q: LearnQuestion): LearnBlock => ({ kind: "check", q });

export const COURSES: LearnCourse[] = [
  {
    slug: "the-machine",
    n: 1,
    title: "Market structure",
    tagline: "What a stock actually is, what an exchange actually does, and why the same ticker can be two different things.",
    overview: [
      "Say what a share actually entitles you to — and the one thing it never does",
      "Trace where your money really goes when you buy (hint: not to the company)",
      "Read tickers, CDRs, market hours, and index headlines without being fooled",
    ],
    status: "live",
    lessons: [
      {
        slug: "what-a-stock-is",
        title: "What a stock actually is",
        blocks: [
          prose(`A share is a real slice of a real company. Own one share of a company with a million [shares outstanding](#explain:market-cap) and you own one-millionth of the business — one-millionth of its profits, its buildings, its brand, and its problems.

Companies sell shares to raise money without borrowing it. The one time your purchase actually funds the company is the [[ipo]] — after that, shares just change hands between investors, and the company isn't part of the trade at all.

What do you get for holding it? Three things: a claim on the profits (paid out as a [[dividend]] or reinvested to grow the business), a vote at the annual meeting, and the right to sell your slice to someone else at whatever they'll pay. That last one is the part everyone watches.

And one thing you *don't* get: unlimited downside. A share can go to zero, but never below it — the most you can lose is what you paid. That sounds obvious, but it's the property that separates owning stocks from [short selling](#explain:short-selling) and other bets where the losses have no floor.`),
          { kind: "diagram", id: "market-map" },
          check({
            id: "what-a-stock-is-c1",
            kind: "choice",
            prompt: "You buy 100 shares of a bank on the TSX. Where does your money actually go?",
            options: [
              { id: "a", md: "To the bank — it's raising capital" },
              { id: "b", md: "To whoever sold you the shares — another investor" },
              { id: "c", md: "To the TSX, which holds it in escrow" },
            ],
            correct: ["b"],
            explain: "Unless you bought at the IPO, the company isn't part of the trade — shares change hands between investors on the secondary market.",
          }),
          check({
            id: "what-a-stock-is-c2",
            kind: "choice",
            prompt: "You pay $40 for a share. What's the most you can ever lose on it?",
            options: [
              { id: "a", md: "$40 — a share can hit zero but never less" },
              { id: "b", md: "There's no limit if it falls far enough" },
              { id: "c", md: "$40 plus whatever the company owes its lenders" },
            ],
            correct: ["a"],
            explain: "Ownership has a floor at zero. That bounded downside is exactly what short selling and leverage give up.",
          }),
          {
            kind: "video",
            yt: "p7HKvqRI_Bo",
            title: "How does the stock market work?",
            author: "TED-Ed",
            minutes: 5,
            why: "the Dutch East India Company inventing the share — and why a stock's price moves all day without the company touching the trade.",
          },
        ],
      },
      {
        slug: "what-an-exchange-does",
        title: "What an exchange actually does",
        blocks: [
          prose(`An exchange is not a store. The TSX doesn't own any shares, doesn't sell you anything, and doesn't set a single price. It does exactly two jobs: it decides which companies are allowed to list (audited books, minimum size, ongoing disclosure — the bouncer at the door), and it runs the matching engine that pairs every buyer with a seller.

That second job is the whole game. When you buy a share, your money goes to *whoever sold it to you* — another investor, a pension fund, an algorithm — not to the company. This is called the secondary market, and it's where essentially all trading happens.

Canada's main venue is the **TSX** (Toronto). The US has two giants: the **NYSE** and the **Nasdaq**. Same machinery, different bouncers, different currencies — which is why GRQ's fund runs a CAD sleeve and a USD sleeve rather than pretending the border isn't there.`),
          { kind: "diagram", id: "order-path" },
          check({
            id: "what-an-exchange-does-c1",
            kind: "choice",
            prompt: "Which of these does an exchange actually do?",
            options: [
              { id: "a", md: "Sets each stock's daily price" },
              { id: "b", md: "Buys shares from sellers and resells them to buyers" },
              { id: "c", md: "Vets who may list, and matches buyers with sellers" },
            ],
            correct: ["c"],
            explain: "Two jobs: the bouncer at the door (listing standards) and the matching engine. Prices come from the orders people place, never from the venue.",
          }),
        ],
      },
      {
        slug: "tickers-and-look-alikes",
        title: "Tickers, listings, and look-alikes",
        blocks: [
          prose(`A [[ticker]] is an address, not a name. SHOP, XIC, AAPL — short codes a stock trades under *on a specific exchange*. That last part matters more than it looks.

The same company can list in two places at once (Shopify trades in Toronto in CAD and in New York in USD — same company, two addresses). But the reverse is also true: the **same letters** can point at completely different companies on different exchanges. Alfred once charted a forty-cent Canadian look-alike instead of the real Visa because it trusted the letters and not the exchange. We fixed the bug; the lesson is permanent — always check *where* a ticker lives.

Then there are [CDRs](#explain:cdr): TSX-listed, CAD-hedged certificates that *track* a big US name without being the actual share. SPCX on the TSX is a Canadian certificate about SpaceX at around $36 — it is not a SpaceX share, and its FX hedge makes it behave differently from the real thing. Useful tools, but only if you know what you're actually holding.`),
          { kind: "diagram", id: "two-listings" },
          check({
            id: "tickers-and-look-alikes-c1",
            kind: "choice",
            prompt: "SPCX on the TSX is…",
            options: [
              { id: "a", md: "SpaceX shares, listed in Canada" },
              { id: "b", md: "A CAD-hedged certificate that *tracks* SpaceX — not the share itself" },
              { id: "c", md: "An ETF of space companies" },
            ],
            correct: ["b"],
            explain: "It's a CDR: a TSX-listed, currency-hedged wrapper. Same story, different instrument — and the hedge makes it behave differently from the real thing.",
          }),
        ],
      },
      {
        slug: "market-hours",
        title: "Market hours, and why prices jump overnight",
        blocks: [
          prose(`The TSX and NYSE both trade **9:30am to 4:00pm Eastern**, Monday to Friday. That's it — six and a half hours. There's a thin "pre-market" and "after-hours" session in the US, but it's a back alley: few participants, wide [spreads](#explain:bid-ask-spread), and prices that can be badly unrepresentative.

News, meanwhile, doesn't keep market hours. Earnings land after the close, wars start on weekends, and central banks speak whenever they like. All of that piles up while the market sleeps — and the **opening price gaps** to wherever buyers and sellers now agree the stock belongs. Nobody "traded it down" overnight; the first trade of the day simply reprices everything at once. If you only remember one thing: a stock can open far from where it closed, and no [stop-loss](#explain:stop-loss) can save you from a gap.

One more wrinkle for a two-country fund: **holidays don't line up**. On Canada Day the TSX sleeps while New York trades; on July 4th it's the reverse. GRQ's calendar knows the difference — on a TSX-only holiday the fund can still trade its US sleeve.`),
          {
            kind: "callout",
            tone: "trap",
            md: `A stock can open **far** from where it closed — and no [stop-loss](#explain:stop-loss) can save you from a gap. The stop fires *at* the market, wherever the market reopens.`,
          },
          {
            kind: "example",
            key: "biggest-gap",
            fallbackMd: `Illustration: a company reports after Tuesday's close; Wednesday's first trade prints 8% below Tuesday's last. Nobody "sold it down overnight" — the open simply agreed on a new number, and a stop-loss set at −3% filled at −8%.`,
          },
          check({
            id: "market-hours-c1",
            kind: "choice",
            prompt: "A stock closes at $50 and opens the next morning at $44. Who traded it down overnight?",
            options: [
              { id: "a", md: "After-hours sellers, gradually" },
              { id: "b", md: "Nobody — the first trade of the day repriced it all at once" },
              { id: "c", md: "The exchange, adjusting for news" },
            ],
            correct: ["b"],
            explain: "News piled up while the market slept; the open simply gaps to where buyers and sellers now agree. It's also why a stop-loss can fill far below its level.",
          }),
        ],
      },
      {
        slug: "indices",
        title: "Indices, and what “the market was up” means",
        blocks: [
          prose(`"The market rose 1% today" — which market? Every headline like that is quoting an [[index]]: a formula-weighted basket of stocks used as a thermometer. The **S&P 500** is the 500 biggest US companies; the **TSX Composite** is the Canadian equivalent.

Most indices are weighted by market cap, which means the giants dominate the reading. When the S&P 500 moves, that's mostly its ten biggest names talking — hundreds of smaller members could have a terrible day and barely dent the number. "The market was up" really means "big companies were up, on average."

You can't buy an index directly — it's just math. But an [[etf]] can track one for you: XIC holds essentially the whole TSX in a single ticker. That's why GRQ measures itself against [XIC](#explain:vs-xic) — if Alfred's stock-picking can't beat the thing you could buy in one click and never think about again, the honest conclusion is that the fund shouldn't exist. That bar stays on screen at all times, on purpose.`),
          { kind: "chart", spec: { symbol: "XIC", days: 180, label: "XIC — the whole TSX in one line" } },
          check({
            id: "indices-c1",
            kind: "choice",
            prompt: "“The S&P 500 rose 1% today.” What does that most reliably tell you?",
            options: [
              { id: "a", md: "Most stocks went up today" },
              { id: "b", md: "The biggest US companies were up, on average" },
              { id: "c", md: "The US economy grew" },
            ],
            correct: ["b"],
            explain: "Cap-weighting means the giants dominate the reading — hundreds of smaller members can have a bad day without denting the number.",
          }),
          { kind: "tryIt", links: [{ href: "/reports", label: "see the fund measured against XIC in Reports" }] },
        ],
      },
    ],
  },
  {
    slug: "how-a-price-happens",
    n: 2,
    title: "How prices work",
    tagline: "There is no “the price” — the bid, the ask, order types, market makers, and what actually moves a stock.",
    overview: [
      "Read a quote as two prices (bid and ask) and know which one you'll actually get",
      "Choose between market and limit orders knowing exactly what each one trades away",
      "Explain what actually moves a price — and why liquidity is the screen that matters",
    ],
    status: "live",
    lessons: [
      {
        slug: "the-spread",
        title: "There is no “the price”",
        blocks: [
          prose(`Every quote you've ever seen — the big number on a stock page — is just the *last trade*. History. At any live moment a stock actually has **two** prices: the **bid** (the most any buyer will currently pay) and the **ask** (the least any seller will currently take). The gap between them is the [[bid-ask-spread]].

Here's the part that stings: you buy at the ask and sell at the bid. Buy a share and sell it one second later and you've lost the spread — guaranteed, before the stock moves at all. Every position you'll ever open starts underwater by that much.

On a giant like Apple the spread is a penny — a rounding error. On an obscure small-cap it can be several percent, which means the stock has to rise several percent *just to get you back to zero*. The spread is both a toll and a warning light: wide spreads are the market telling you few people trade this thing, and getting out may cost as much as getting in.`),
          { kind: "diagram", id: "book-ladder" },
          check({
            id: "the-spread-c1",
            kind: "numeric",
            unit: "cents",
            prompt: "A stock quotes **bid $19.90 / ask $20.10**. You buy one share and sell it a second later. How much did the round trip cost you (ignore commissions)? Answer in dollars.",
            answer: 20,
            placeholder: "0.00",
            explain: "You bought at the ask ($20.10) and sold at the bid ($19.90) — the 20¢ spread is a toll you pay before the stock moves at all.",
          }),
          check({
            id: "the-spread-c2",
            kind: "choice",
            prompt: "A stock's spread is 4% wide. What is the market telling you?",
            options: [
              { id: "a", md: "The stock is about to move 4%" },
              { id: "b", md: "Few people trade it — and exiting may cost as much as entering" },
              { id: "c", md: "Nothing; spreads are random" },
            ],
            correct: ["b"],
            explain: "A wide spread is a warning light about liquidity: the toll applies in both directions, so the stock must rise 4% just to get you back to zero.",
          }),
          { kind: "receipt", id: "real-fills" },
          { kind: "tryIt", links: [{ href: "/day-lab", label: "watch the spread tax the Day-Trading Lab's trader arm" }] },
        ],
      },
      {
        slug: "order-types",
        title: "Order types — what you're trading away",
        blocks: [
          prose(`Every order is a trade-off between two certainties, and you only get to keep one.

A [[market-order]] says *"fill me now, at whatever the market's asking."* You're guaranteed the fill, not the price — it crosses the spread and takes what's there. In a liquid name that's fine; in a thin one, "whatever's asking" can be an unpleasant surprise (that surprise has a name: [[slippage]]).

A [[limit-order]] says *"fill me at this price or better — or not at all."* You're guaranteed the price, not the fill. The market is under no obligation to come to you; plenty of limit orders die lonely at expiry, watching the stock run away without them.

A [stop-loss](#explain:stop-loss) is a *trigger*, not a standing order: when the price touches your level, it fires a market order to get you out. It caps damage in normal conditions — but because it fires *at* the market, an overnight gap can blow straight through the level and fill you far below it. GRQ uses stops on every position and still treats them as seatbelts, not force fields.

The toy exchange below runs a real (cartoon) order book. Place both order types, flip it to a thin stock, and watch what each certainty costs you.`),
          { kind: "widget", id: "order-book" },
          check({
            id: "order-types-c1",
            kind: "choice",
            prompt: "A limit order guarantees you…",
            options: [
              { id: "a", md: "The price, but not the fill" },
              { id: "b", md: "The fill, but not the price" },
              { id: "c", md: "Both, if you're patient" },
            ],
            correct: ["a"],
            explain: "You'll never pay more than your limit — but the market owes you nothing, and plenty of limit orders expire unfilled while the stock runs away.",
          }),
        ],
      },
      {
        slug: "market-makers-and-liquidity",
        title: "Who's on the other side",
        blocks: [
          prose(`When you buy at 10:47am, who sold? Sometimes another investor. But often it's a [[market-maker]] — a firm whose entire job is quoting both a bid and an ask all day, every day, in thousands of names. They're not betting on the stock; they're earning the spread over and over, in exchange for making sure there's always *someone* to trade with.

That "always someone" quality is [[liquidity]]: how much you can buy or sell without moving the price against yourself. A liquid stock absorbs your order like the ocean absorbs a pebble. An illiquid one moves *because you showed up* — your own buying pushes the ask higher, and later your own selling pushes the bid lower. Illiquidity punishes you in both directions.

This is why GRQ's universe has a hard liquidity screen (built on average daily [[volume]]) that runs *before* a name is even eligible to buy. A position you can't exit cleanly isn't a position — it's a trap with a ticker symbol.`),
          {
            kind: "example",
            key: "spread-pair",
            fallbackMd: `Illustration: a mega-cap quotes $99.99 / $100.00 — a one-cent toll. A thin small-cap quotes $4.80 / $5.05 — five percent of open water. The same $1,000 order starts about $0.10 underwater in one and ~$50 in the other.`,
          },
          check({
            id: "market-makers-and-liquidity-c1",
            kind: "choice",
            prompt: "Why does an illiquid stock punish you in *both* directions?",
            options: [
              { id: "a", md: "Your own buying pushes the price up, and your own selling pushes it down" },
              { id: "b", md: "The exchange charges extra fees on thin names" },
              { id: "c", md: "Market makers refuse to quote it" },
            ],
            correct: ["a"],
            explain: "In a thin book, you ARE the market pressure. That's why GRQ's liquidity screen runs before a name is even eligible — an unexitable position is a trap with a ticker.",
          }),
          { kind: "tryIt", links: [{ href: "/universe", label: "the Universe — every name here already passed the liquidity screen" }] },
        ],
      },
      {
        slug: "what-moves-a-price",
        title: "What actually moves a price",
        blocks: [
          prose(`"More buyers than sellers" is the classic explanation, and it's technically nonsense — every single trade has exactly one buyer and one seller. What moves a price is **eagerness**, not headcount.

Mechanically: there's a queue of standing orders at every price level. When buyers get impatient enough to take everything offered at the current ask, the ask moves up to the next level. When sellers get anxious enough to hit every bid, the bid steps down. Price is just the front line between impatient buyers and anxious sellers, and it moves when one side's urgency exhausts the other side's orders.

News moves prices *without needing trades at all*. When a company reports terrible earnings, nobody has to sell a single share for the quotes to collapse — everyone simply updates what they're willing to pay, and the bid and ask re-form lower. The price is a live opinion poll, not a measurement of some underlying "true" number.

[[volume]] tells you how much conviction is behind a move. A 5% jump on heavy volume means real money changed its mind; the same jump on a trickle is a shrug that can reverse by lunch.`),
          {
            kind: "example",
            key: "volume-mover",
            fallbackMd: `Illustration: two stocks both close +4%. One did it on three times its usual volume — real money repriced it. The other did it on a trickle, and gave it all back by Thursday.`,
          },
          check({
            id: "what-moves-a-price-c1",
            kind: "choice",
            prompt: "Why is “more buyers than sellers” technically nonsense?",
            options: [
              { id: "a", md: "Sellers always outnumber buyers in a falling market" },
              { id: "b", md: "Every trade has exactly one buyer and one seller — what moves price is eagerness" },
              { id: "c", md: "Exchanges balance the counts automatically" },
            ],
            correct: ["b"],
            explain: "Headcount is always equal, trade by trade. Price moves when one side's urgency exhausts the other side's standing orders — and news can move quotes with no trades at all.",
          }),
        ],
      },
      {
        slug: "whose-quote-is-right",
        title: "Why your quote disagrees with mine",
        blocks: [
          prose(`Pull up the same stock on two apps and you'll often see two different prices. Neither is lying — they're answering slightly different questions.

Most free quotes are **delayed 15 minutes** (real-time data is licensed, and exchanges charge for it — it's a real revenue line for them). Some apps show the last trade, others the midpoint of the bid and ask. US stocks trade on a dozen venues at once, and feeds consolidate them at different speeds. Fifteen minutes plus a different venue plus last-vs-mid equals two honest numbers that disagree.

GRQ's own pages are built on this honesty: some figures are near-real-time, others are delayed, and the app says which. For a [swing-trading](#explain:swing-trade) fund holding positions for weeks, a 15-minute-old price is noise — the thesis doesn't care. For a day trader scalping pennies, it's fatal — which is one more quiet reason the day-trading game is harder than it looks.`),
          { kind: "diagram", id: "quote-paths" },
          check({
            id: "whose-quote-is-right-c1",
            kind: "choice",
            prompt: "Two apps show different prices for the same stock at the same moment. The most likely reason?",
            options: [
              { id: "a", md: "One app is wrong or manipulated" },
              { id: "b", md: "Delayed feeds, different venues, last-trade vs midpoint — two honest answers to slightly different questions" },
              { id: "c", md: "The stock trades at different prices for different people" },
            ],
            correct: ["b"],
            explain: "Most free quotes run 15 minutes late, and apps measure different things. It's noise for a weeks-long thesis — and fatal for scalping pennies.",
          }),
          { kind: "tryIt", links: [{ href: "/day-lab", label: "the Day-Trading Lab — where stale prices and spreads actually bite" }] },
        ],
      },
    ],
  },
  {
    slug: "owning-a-piece",
    n: 3,
    title: "Owning stocks",
    tagline: "Dividends, splits, what you actually paid, stocks vs ETFs, and holding two currencies at once.",
    overview: [
      "Treat dividends, splits, and buybacks as what they are — accounting, not free money",
      "Compute your ACB and know when a gain is real (and when the CRA cares)",
      "Weigh a single stock against an ETF, and see the FX bet hiding in US names",
    ],
    status: "live",
    lessons: [
      {
        slug: "dividends",
        title: "Dividends — getting paid to hold",
        blocks: [
          prose(`A [[dividend]] is the company mailing you your share of the profits — so many cents per share, usually every quarter. The [dividend yield](#explain:dividend-yield) is that annual payout as a percent of the price: a $2 dividend on a $50 stock yields 4%.

Now the catch everyone learns the hard way: **a dividend is not free money.** On the ex-dividend date, the stock's price drops by roughly the dividend amount — the cash didn't appear from nowhere, it left the company and the market marks the company down accordingly. It's your own money arriving by mail. (Buying a stock the day before its dividend to "grab the payout" achieves precisely nothing, minus commissions.)

So why care? Because over years, reinvested dividends are a huge share of the market's [total return](#explain:total-return) — and because a company that pays one is making a statement: it generates real cash and doesn't need every dollar to survive. The flip side: fast growers usually pay nothing, because reinvesting in the business beats mailing the cash out. Neither choice is virtue — it's strategy.`),
          { kind: "diagram", id: "ex-date-step" },
          check({
            id: "dividends-c1",
            kind: "choice",
            prompt: "You buy a stock the day before its ex-dividend date to “grab the payout.” Net effect?",
            options: [
              { id: "a", md: "Free money — you collect the dividend" },
              { id: "b", md: "Roughly nothing — the price drops by about the dividend on the ex-date" },
              { id: "c", md: "A guaranteed loss equal to the dividend" },
            ],
            correct: ["b"],
            explain: "The cash left the company, so the market marks it down accordingly. It's your own money arriving by mail — minus commissions.",
          }),
        ],
      },
      {
        slug: "splits-and-buybacks",
        title: "Splits and buybacks — slicing the pizza",
        blocks: [
          prose(`A [stock split](#explain:stock-split) cuts the pizza into more slices. A 2-for-1 split gives you twice the shares at half the price — you own exactly what you owned yesterday. Companies split mostly for psychology and convenience (a $40 stock *feels* more buyable than an $800 one), and markets sometimes celebrate splits anyway, which tells you more about markets than about pizza.

A [[buyback]] is the interesting one: the company uses its cash to buy its own shares on the open market and cancel them. Fewer slices exist, so each remaining slice owns a bigger fraction of the business — it's [[dilution]] running in reverse, and a quieter cousin of the dividend (returning cash without mailing anyone a cheque).

The discipline for both: neither changes what the business is *worth* by itself. A split is pure arithmetic. A buyback only helps if the company bought its shares cheap — a company overpaying for its own stock is just a bad investor with insider enthusiasm.`),
          { kind: "diagram", id: "pizza-split" },
          check({
            id: "splits-and-buybacks-c1",
            kind: "numeric",
            unit: "cents",
            prompt: "You hold 10 shares at $80. The company does a 2-for-1 split. What is your position worth right after (in dollars)?",
            answer: 80000,
            placeholder: "0.00",
            explain: "20 shares at $40 = the same $800. A split is pure arithmetic — more slices, same pizza.",
          }),
        ],
      },
      {
        slug: "acb-and-paper-gains",
        title: "What you actually paid — and gains that aren't real yet",
        blocks: [
          prose(`Buy a stock three times at three prices and "what did I pay?" stops having an obvious answer. The answer that matters is your [[acb]] — your average cost per share, *commissions included*. Ten shares at $20 plus a $5 commission makes your ACB $20.50, and every gain or loss you'll ever book is measured from there.

While you still hold the shares, any profit is [unrealized](#explain:unrealized-pnl) — a paper gain. It moves every day, it feels real, and it isn't: it only becomes real (and taxable) the moment you sell. Markets are littered with people who watched a +40% paper gain round-trip to zero because selling felt like quitting.

The CRA only cares when you realize. Sell for more than your ACB and you've got a [capital gain](#explain:capital-gains); sell for less and the loss can offset other gains — **unless** you buy the same name back within 30 days, in which case the [superficial-loss rule](#explain:superficial-loss) throws your loss out entirely. GRQ's agent is code-barred from tripping that rule, which is the correct amount of trust to place in enthusiasm near tax season.`),
          { kind: "diagram", id: "acb-timeline" },
          check({
            id: "acb-and-paper-gains-c1",
            kind: "numeric",
            unit: "cents",
            prompt: "You buy 5 shares at $10, then 5 more at $14, paying $10 in total commissions along the way. What's your ACB per share (in dollars)?",
            answer: 1300,
            placeholder: "0.00",
            explain: "($50 + $70 + $10) ÷ 10 shares = $13.00. Commissions are part of what you paid — the ACB remembers them even when you'd rather not.",
          }),
          check({
            id: "acb-and-paper-gains-c2",
            kind: "choice",
            prompt: "You sell at a loss, then buy the same stock back 12 days later. What does the CRA say?",
            options: [
              { id: "a", md: "The loss still offsets your gains" },
              { id: "b", md: "The superficial-loss rule throws the loss out" },
              { id: "c", md: "You pay double tax as a penalty" },
            ],
            correct: ["b"],
            explain: "Rebuying within 30 days voids the loss for tax purposes. GRQ's agent is code-barred from tripping this rule.",
          }),
        ],
      },
      {
        slug: "stocks-vs-etfs",
        title: "Stocks vs ETFs — one ticker, whole markets",
        blocks: [
          prose(`An [[etf]] is a basket of stocks wearing a single ticker. One share of XIC buys you a slice of essentially every big company in Canada at once — instant diversification for the price of one commission. You give up the dream of picking the one stock that goes up 10× and in exchange you stop being exposed to the one that goes to zero.

ETFs charge for the service via the [MER](#explain:mer) — a yearly fee quietly deducted from the fund's value. For a plain index ETF it's tiny (XIC charges about 0.06%); for actively-managed funds it can run 2%, which compounds into a shocking amount of your return over decades. Fee gravity is real and it never sleeps.

Here's the uncomfortable, load-bearing fact: **most professional stock-pickers fail to beat the index ETF over long periods**, after fees. That's not a slogan, it's decades of scorekeeping. It's exactly why GRQ keeps [XIC on screen as the benchmark](#explain:vs-xic) — the couch-potato option is the opponent, and pretending otherwise would be marketing.`),
          check({
            id: "stocks-vs-etfs-c1",
            kind: "choice",
            prompt: "Over long periods, after fees, most professional stock-pickers…",
            options: [
              { id: "a", md: "Beat the index — that's the job" },
              { id: "b", md: "Fail to beat a plain index ETF" },
              { id: "c", md: "Match the index exactly" },
            ],
            correct: ["b"],
            explain: "Decades of scorekeeping, not a slogan. It's why the couch-potato option (XIC) stays on GRQ's screen as the opponent to beat.",
          }),
          {
            kind: "video",
            yt: "AecvTErBQY8",
            title: "Why Most Stock Pickers Lose to the Market",
            author: "Ben Felix",
            minutes: 11,
            why: "the skewness argument — a handful of giant winners carry the whole index, so missing them is the norm, not bad luck. A Canadian portfolio manager, arguing from the academic receipts.",
          },
          { kind: "tryIt", links: [{ href: "/reports", label: "Reports — the fund vs the couch potato, updated live" }] },
        ],
      },
      {
        slug: "two-currencies",
        title: "Two currencies, one portfolio",
        blocks: [
          prose(`Buy a US stock from Canada and you're making two bets whether you meant to or not: one on the company, one on the [exchange rate](#explain:currency-risk). A US name can rise 5% while the US dollar slips 5% against the loonie — and your gain, measured in CAD, evaporates. It works in reverse too; currency is a silent passenger on every cross-border position.

Converting money isn't free either. FX conversion has its own spread (banks are enthusiastic about this one), so bouncing cash between currencies on every trade quietly bleeds a portfolio. The sane pattern is to convert deliberately, in chunks, and then trade within each currency sleeve.

That's exactly how GRQ runs it: a CAD sleeve and a USD sleeve, and a US buy needs USD cash to already be there — no automatic conversion, no borrowing. When Alfred wants more USD, it must *ask*, and a human approves the conversion. For hedged exposure without holding USD at all, that's what CAD-hedged [CDRs](#explain:cdr) are for — with the caveat from Course 1 that a hedged certificate never behaves quite like the real share.`),
          {
            kind: "example",
            key: "fx-drift",
            fallbackMd: `Illustration: USD/CAD drifts 2% in a month. A US stock that went exactly nowhere still moved your CAD statement by 2% — the silent passenger rides every cross-border position, in both directions.`,
          },
          check({
            id: "two-currencies-c1",
            kind: "choice",
            prompt: "Your US stock rises 5%, but the US dollar falls 5% against the loonie. Your gain in CAD is roughly…",
            options: [
              { id: "a", md: "5% — the stock is what matters" },
              { id: "b", md: "10% — the moves add up" },
              { id: "c", md: "Zero — the currency ate it" },
            ],
            correct: ["c"],
            explain: "Every cross-border position is two bets: the company AND the exchange rate. The silent passenger works in your favour some years and against you in others.",
          }),
        ],
      },
    ],
  },
  {
    slug: "reading-the-game",
    n: 4,
    title: "Reading the data",
    tagline: "Earnings, analyst ratings, insider filings, and technical signals — what each one can and can't tell you.",
    overview: [
      "Grade an earnings report the way the market does — against expectations and guidance",
      "Read analyst ratings, 13Fs, insider buys, and congress trades for what they can't tell you",
      "Use technicals and crowd sentiment as weather gauges, never as prophecy",
    ],
    status: "live",
    lessons: [
      {
        slug: "earnings-season",
        title: "Earnings season — the quarterly exam",
        blocks: [
          prose(`Four times a year, every public company hands in a report card: revenue, profit, and [[eps]] for the last three months. Analysts publish estimates beforehand, so every [earnings report](#explain:earnings) is graded on a curve — a **beat** or a **miss** versus what the market expected.

That's the part newcomers find maddening: a company can grow profits 20% and the stock *falls*, because everyone had priced in 25%. The reaction isn't to the result — it's to the **gap between the result and the expectation**. The quarter itself is already history; expectations were the live price.

Usually the biggest mover isn't even the quarter — it's [[guidance]], management's own forecast for what comes next. A beat with a cut to next year's outlook reads as bad news, and the market treats it that way within seconds. The market prices the future; guidance *is* the future, straight from the people running the place.

Reports land before the open (BMO) or after the close (AMC) — which, per Course 1, is why earnings day so often means an opening gap rather than a slow drift. It's the single biggest *scheduled* risk event a stock has, and it's on the calendar months in advance.`),
          {
            kind: "chart",
            spec: { symbol: "NVDA", days: 150, label: "NVDA — the last six months of daily closes", annotate: "biggest-gap" },
          },
          check({
            id: "earnings-season-c1",
            kind: "choice",
            prompt: "A company grows profits 20% and the stock falls on the news. The most likely reason?",
            options: [
              { id: "a", md: "The market had priced in more than 20%" },
              { id: "b", md: "Profits don't affect stock prices" },
              { id: "c", md: "Short sellers attacked it" },
            ],
            correct: ["a"],
            explain: "Earnings are graded against expectations, not zero. The reaction is to the gap between result and expectation — and to guidance, which is the future straight from management.",
          }),
          { kind: "tryIt", links: [{ href: "/", label: "Today's earnings panel — who just reported, who's up next" }] },
        ],
      },
      {
        slug: "analyst-ratings",
        title: "Analyst ratings — the street's opinion",
        blocks: [
          prose(`Investment-bank analysts cover stocks for a living: they build models, grill management, and publish three things — a rating (buy/hold/sell), a 12-month [price target](#explain:analyst-target), and the estimates that earnings get graded against.

Read the ratings with subtitles on. The scale is inflated: "buy" is everywhere, and a "hold" often functions as a polite "sell" (analysts need access to the companies they cover, and companies dislike sell ratings). The **changes** carry more information than the levels — an upgrade, a downgrade, or a price-target cut moves stocks; the standing rating mostly doesn't.

Price targets have their own tell: they chase the price. A stock runs 30% and the targets drift up behind it — that's herding, not fresh analysis. Which is why the useful move is comparing the consensus target against an *independent* view. When the street's average and Alfred's call sharply disagree, someone is wrong — and finding out **why** is worth more than either number. GRQ puts the analyst band next to its own call on every stock page for exactly that reason.`),
          { kind: "diagram", id: "target-chase" },
          check({
            id: "analyst-ratings-c1",
            kind: "choice",
            prompt: "Which of these carries the most information?",
            options: [
              { id: "a", md: "A standing “buy” rating" },
              { id: "b", md: "A downgrade or a price-target cut — the *change*" },
              { id: "c", md: "The number of analysts covering the stock" },
            ],
            correct: ["b"],
            explain: "The scale is inflated (“hold” is often a polite “sell”), so levels say little. Changes move stocks; that's where the fresh information lives.",
          }),
        ],
      },
      {
        slug: "big-money",
        title: "Following the big money",
        blocks: [
          prose(`Three paper trails let you watch what informed money does — as long as you respect what each one *can't* tell you.

**[13F filings](#explain:13f):** every big fund must disclose its US stock holdings quarterly — but up to ~45 days late, and showing only longs and options, never shorts. So Buffett's May filing shows March's book. It's colour on conviction, useless for timing.

**[Insider trades](#explain:form-4):** executives and directors file within two days of trading their own stock. The one pattern worth attention is an **open-market buy with their own cash** — nobody spends their own money on a stock they think is going down. Option exercises and grants are compensation plumbing; ignore them. Several insiders buying the same week ([cluster buying](#explain:cluster-buying)) is the strong version.

**[Congressional disclosures](#explain:congress-trade):** trades reported only as dollar ranges, up to 45 days late. Colour on the well-connected, not a strategy.

GRQ ingests all three daily on the Smart Money page and feeds them to the agent — as **leads to investigate, never reasons to trade**. That distinction is the whole discipline: big-money signals generate questions; the answers still have to come from the research.`),
          {
            kind: "example",
            key: "insider-cluster",
            fallbackMd: `Illustration: three executives at the same company each buy six figures of their own stock on the open market in the same week. That's the strong version of the signal — a lead worth researching, never a reason to trade by itself.`,
          },
          check({
            id: "big-money-c1",
            kind: "choice",
            prompt: "Which insider activity is actually worth your attention?",
            options: [
              { id: "a", md: "An executive exercising stock options" },
              { id: "b", md: "Several insiders buying on the open market with their own cash, the same week" },
              { id: "c", md: "A director receiving a share grant" },
            ],
            correct: ["b"],
            explain: "Exercises and grants are compensation plumbing. Open-market cluster buys are the strong signal — nobody spends their own money on a stock they think is going down. Still a lead, never a reason to trade.",
          }),
          { kind: "tryIt", links: [{ href: "/market/smart-money", label: "Smart Money — the tracked filers, leaderboards, and cluster buys" }] },
        ],
      },
      {
        slug: "technical-signals",
        title: "Technical signals — weather, not prophecy",
        blocks: [
          prose(`Technical signals are statistics computed from price and volume alone — no balance sheets, no news, just the tape. The three GRQ shows: [[rsi]] (a 0–100 momentum gauge — stretched high or low), [[macd]] (whether short-term momentum is pulling ahead of the longer trend), and the [SMA trend stack](#explain:trend) (price above its 50-day average, above its 200-day = the textbook uptrend).

What they honestly are: **descriptions of the ride so far**. RSI at 24 says "this fell hard and fast" — it does not say "it will bounce". Cheap-and-falling is still falling. The signals earn a strange half-life of usefulness because everyone watches the same lines, so they occasionally self-fulfil — support "holds" partly because thousands of buyers agreed in advance to buy there.

GRQ rolls its signals into a confidence-weighted [[recommendation]] — and treats it as exactly one input among many. The technicals answer *"how has it been trading, and is now a tense moment?"* They never answer *"is this a good business?"* — that's what the dossier is for. When the chart and the thesis disagree, the thesis gets re-examined, not obeyed.`),
          { kind: "diagram", id: "rsi-gauge" },
          check({
            id: "technical-signals-c1",
            kind: "choice",
            prompt: "RSI on a stock reads 24. What does that honestly tell you?",
            options: [
              { id: "a", md: "It fell hard and fast — a description of the ride so far" },
              { id: "b", md: "It will bounce soon" },
              { id: "c", md: "The business is in trouble" },
            ],
            correct: ["a"],
            explain: "Technicals describe the tape, not the future or the business. Cheap-and-falling is still falling — the thesis question belongs to the dossier.",
          }),
        ],
      },
      {
        slug: "news-and-the-crowd",
        title: "News and the crowd",
        blocks: [
          prose(`Course 2's lesson applies with teeth here: news reprices a stock in seconds, without waiting for you. By the time a headline reaches your phone, the market has read it, argued about it, and moved. So the amateur question — *"is this good news?"* — is the wrong one. The working question is: **is this better or worse than what was already priced in?** A "great quarter" that everyone saw coming moves nothing.

Then there's the crowd itself. GRQ tracks [social buzz](#explain:social-buzz) (how loudly Reddit is talking about a name, versus its own usual volume) and [crowd mood](#explain:social-sentiment) (self-tagged bull/bear posts). Read those as a **crowding gauge, not a tip sheet**: by the time retail chatter goes vertical, the easy money is usually gone, and euphoria reverses hard. It's noisy, it's gameable, and GRQ keeps it on probation — a risk flag on names we hold, never a reason to buy.

Everything in this course lives on one screen: open any stock page and you'll find the earnings history, the analyst band, the 13F holders, the signals, the news — each with an honest coverage map of what we can and can't see for that name. The course was really a user's manual for that page.`),
          {
            kind: "example",
            key: "buzz-leader",
            fallbackMd: `Illustration: a name's Reddit mentions run six times their usual pace — after the price already ran 40% in a month. The gauge reads "crowded", not "buy". Euphoria reverses hard.`,
          },
          check({
            id: "news-and-the-crowd-c1",
            kind: "choice",
            prompt: "A headline breaks about a stock you're watching. The working question is…",
            options: [
              { id: "a", md: "Is this good news or bad news?" },
              { id: "b", md: "Is this better or worse than what was already priced in?" },
              { id: "c", md: "How fast can I trade on it?" },
            ],
            correct: ["b"],
            explain: "The market read it before you did. A “great quarter” everyone saw coming moves nothing — the gap versus expectations is the whole game.",
          }),
          { kind: "tryIt", links: [{ href: "/market/watchlist", label: "open any watched name — every panel from this course is on its page" }] },
        ],
      },
    ],
  },
  {
    slug: "risk",
    n: 5,
    title: "Risk",
    tagline: "Volatility, drawdowns, position sizing, leverage, shorting, and day trading — how portfolios actually die.",
    overview: [
      "Size positions so volatility can't eject you at the bottom",
      "Do drawdown arithmetic in your head — and see why avoiding craters beats catching spikes",
      "Explain exactly how leverage, shorting, and day trading kill portfolios",
    ],
    status: "live",
    lessons: [
      {
        slug: "volatility",
        title: "Volatility — the price of admission",
        blocks: [
          prose(`[[volatility]] is the size of the swings — how bumpy the ride is, usually annualized from recent daily moves. A utility drifts a fraction of a percent a day; a small biotech can swing 6%. Same market, different weather systems.

Here's the nuance worth keeping: volatility is not, by itself, the risk of losing money — a stock can be wildly bumpy on its way to tripling. The real danger is what volatility does to *you*: bumpy rides eject their passengers at the bottom. A −30% month you can't stomach converts a temporary swing into a permanent loss, because you sold it.

So the practical rule inverts the amateur instinct. The answer to "this stock is really volatile" isn't "avoid it" — it's **"own less of it."** Size the position so the worst plausible week is boring to you personally. (The options market publishes its own forecast of future swings — [implied volatility](#explain:implied-volatility), covered in Course 6. When it spikes, the market is bracing.)`),
          {
            kind: "example",
            key: "calm-vs-bumpy",
            fallbackMd: `Illustration: a utility drifts ±0.4% a day while a small biotech swings ±5%. Over a month that's the difference between weather and a storm system — and why the same dollar amount can be a safe position in one and an oversized bet in the other.`,
          },
          check({
            id: "volatility-c1",
            kind: "choice",
            prompt: "You love a stock but it's wildly volatile. The practical answer is…",
            options: [
              { id: "a", md: "Avoid it — volatility is risk" },
              { id: "b", md: "Own less of it — size it so the worst week is boring to you" },
              { id: "c", md: "Buy more to average out the swings" },
            ],
            correct: ["b"],
            explain: "Volatility's real danger is ejecting you at the bottom. Sizing — not avoidance — is how the pros stay on the ride.",
          }),
        ],
      },
      {
        slug: "drawdown",
        title: "Drawdown — the arithmetic that kills",
        blocks: [
          prose(`[[drawdown]] is the fall from your portfolio's peak. It comes with the cruelest arithmetic in investing: **losses need bigger gains to undo**. Down 10% needs +11% back. Down 25% needs +33%. Down 50% needs a *double*. The hole deepens faster than the ladder grows.

That asymmetry is why professionals obsess more about avoiding catastrophic losses than catching spectacular wins. A portfolio that grinds out modest gains but never craters beats a flashy one that halves itself every few years — compounding (Course 7) does the rest.

It's also why GRQ's defenses are **pre-committed and automatic**: a [stop-loss](#explain:stop-loss) on every position, and a system-level tripwire — if the whole fund draws down past its limit, the [kill switch](#explain:kill-switch) halts trading without asking anyone's opinion. The design assumption is that in the moment, at the bottom, with everything red, *nobody* — human or AI — reliably makes the calm decision. So the calm decision was made in advance, in code.`),
          { kind: "diagram", id: "drawdown-ladder" },
          check({
            id: "drawdown-c1",
            kind: "numeric",
            unit: "pct",
            prompt: "Your portfolio falls 50%. What percentage gain do you now need just to get back to even?",
            answer: 100,
            explain: "Half of the money must double. The hole deepens faster than the ladder grows — which is why avoiding craters beats chasing spikes.",
          }),
          { kind: "receipt", id: "drawdown" },
        ],
      },
      {
        slug: "sizing-and-diversification",
        title: "Position sizing and diversification",
        blocks: [
          prose(`The most underrated question in investing isn't *what* to buy — it's **how much**. A brilliant pick sized at 80% of your portfolio is a coin flip on your future; a mediocre one at 3% is a rounding error. Sizing is where risk is actually controlled.

GRQ enforces this with a [[weight]] cap — no single name may grow big enough to sink the boat — and a [cash floor](#explain:cash-floor) that keeps dry powder the gate won't let it spend. Both limits are set by the risk dial and enforced in code, because "just this once" is how concentration happens.

Diversification is the other half, and it's subtler than "own many things." Ten Canadian banks is one bet, held ten times. What diversification actually requires is low [[correlation]] — holdings that fail for *different reasons*: different sectors, countries, currencies. Spread across those and the wobbles partially cancel; it's the closest thing markets offer to a free lunch. The fine print: in a real panic, correlations rush toward 1 and everything falls together. Diversification softens ordinary weather. Nothing diversifies away a hurricane — that's what the cash floor and the kill switch are for.`),
          { kind: "diagram", id: "one-bet-ten-times" },
          check({
            id: "sizing-and-diversification-c1",
            kind: "choice",
            prompt: "A portfolio of ten Canadian banks is…",
            options: [
              { id: "a", md: "Well diversified — ten different companies" },
              { id: "b", md: "One bet, held ten times" },
              { id: "c", md: "Risk-free — banks are safe" },
            ],
            correct: ["b"],
            explain: "Diversification requires low correlation — holdings that fail for *different* reasons. Same sector, same country, same currency = the same storm sinks all ten.",
          }),
        ],
      },
      {
        slug: "leverage",
        title: "Leverage and margin — borrowed conviction",
        blocks: [
          prose(`[[leverage]] means investing with borrowed money. Put up $10,000, borrow $10,000, buy $20,000 of stock: every move is now doubled. A +25% year becomes +50% — this is why leverage is seductive. A −25% dip becomes −50% *of your money* — this is why it kills.

The mechanism that does the killing is the [margin call](#explain:margin-call). The loan is secured by your holdings; when they fall far enough, the broker doesn't send a sympathetic note — it **sells your positions, at the bottom, without asking**. Leverage converts a temporary drawdown into a permanent, realized loss at the worst possible price. You can be right about the stock eventually and still be dead first: markets can stay irrational longer than a levered account can stay solvent.

GRQ bans margin borrowing outright — it's one of the fund's hard rules, alongside no shorting and no options, and only humans can change it. Not because leverage never works, but because it removes the one advantage a patient investor has: **the ability to wait**. An unlevered portfolio can ride out any storm it's diversified for. A levered one can be forced to surrender mid-storm.`),
          { kind: "diagram", id: "margin-spiral" },
          check({
            id: "leverage-c1",
            kind: "numeric",
            unit: "pct",
            prompt: "You put up $10,000 and borrow $10,000 to buy $20,000 of stock. The portfolio falls 25%. What's the loss on *your* money, in percent?",
            answer: 50,
            explain: "The $5,000 hit lands entirely on your $10,000 — leverage doubles every move, in both directions. And a margin call can realize it at the bottom, without asking.",
          }),
        ],
      },
      {
        slug: "the-bets-we-wont-make",
        title: "The bets the fund won't make",
        blocks: [
          prose(`Two more of GRQ's hard rules ban whole categories of trade. Both bans are worth understanding, because both bets are worth understanding.

**[Short selling](#explain:short-selling):** borrow shares, sell them, hope to buy back cheaper. The asymmetry is the problem — a stock you own can only fall to zero (−100%), but a short has **no ceiling on its loss**, and you pay [rent](#explain:cost-to-borrow) while you wait. Crowded shorts add the [squeeze](#explain:short-squeeze): a rising price *forces* shorts to buy, which pushes the price higher, which forces more buying. Being right too early looks exactly like being wrong.

**[Day trading](#explain:day-trading):** buying and selling within the day to catch small moves. The quiet killer is cost × frequency: every round trip pays the [spread](#explain:bid-ask-spread), commissions, and [[slippage]] — a small toll that compounds viciously across hundreds of trades, against opponents measured in microseconds.

Neither ban is superstition — both are live experiments here. The Short Lab runs modeled shorts (with real borrow math and margin calls) and shadow-shorts every real sell the fund makes; the Day-Trading Lab races a churning trader against a buy-and-holder with real costs. Understanding a bet and making it are different things: the labs buy the understanding without paying the tuition.`),
          { kind: "diagram", id: "short-asymmetry" },
          {
            kind: "callout",
            tone: "rule",
            md: `No [[leverage]]. No [short selling](#explain:short-selling). No options. Hard rules, enforced in code on every order — and only humans can change them.`,
          },
          check({
            id: "the-bets-we-wont-make-c1",
            kind: "choice",
            prompt: "What makes a short sale categorically riskier than owning the same stock?",
            options: [
              { id: "a", md: "Shorts pay higher commissions" },
              { id: "b", md: "The loss has no ceiling — a rising stock can cost more than you put in, plus borrow rent" },
              { id: "c", md: "Shorting is illegal in Canada" },
            ],
            correct: ["b"],
            explain: "Ownership bottoms at −100%; a short's loss is unbounded, you pay rent while waiting, and a squeeze can force you out precisely because you're right too early.",
          }),
          {
            kind: "tryIt",
            links: [
              { href: "/short-lab", label: "the Short Lab — shorts with real borrow math and margin calls" },
              { href: "/day-lab", label: "the Day-Trading Lab — watch the costs do the arguing" },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "options",
    n: 6,
    title: "Options",
    tagline: "Calls, puts, the Greeks, and a live payoff calculator — taught in its own portal.",
    overview: [
      "Read a call or put like a contract: right, obligation, premium, breakeven",
      "Use the payoff calculator to see a strategy's whole future in one chart",
      "Know why the fund itself is code-barred from trading any of it",
    ],
    status: "live",
    external: {
      href: "/options",
      note: "Lessons, the payoff calculator, the desk experiment's live fake contracts, and options-aware chat.",
    },
    lessons: [],
  },
  {
    slug: "the-long-game",
    n: 7,
    title: "Long-term investing",
    tagline: "Compounding, benchmarks, fee gravity, TFSAs, and the behavioural traps that outkill every bear market.",
    overview: [
      "Let the rule of 72 do compounding arithmetic in your head",
      "Keep the benchmark and the fee bill on screen — the two numbers that decide everything",
      "Name the behavioural traps, and beat them the only proven way: rules written in advance",
    ],
    status: "live",
    lessons: [
      {
        slug: "compounding",
        title: "Compounding — the whole trick",
        blocks: [
          prose(`[[compounding]] is growth earning growth on itself. Year one's gains earn gains in year two, and the curve that looks flat for a decade quietly goes vertical in the third. The rule of 72 gives you the feel of it: 72 ÷ your annual return ≈ years to double. At 7%, money doubles roughly every decade — so 30 years is three doublings, which is 8×.

Two consequences run the whole game. First, **time matters more than brilliance**: a decent return sustained for decades beats a spectacular one that starts late or gets interrupted (see: drawdowns, Course 5). Second, **small differences in rate become enormous differences in outcome** — one percentage point a year, compounded over 30 years, is the difference between 8× and 10×. Hold that thought for the fees lesson; it's the entire punchline.

This is GRQ's tagline decoded: *"get rich quick, slowly."* No single trade makes the fund; the rate, protected and repeated, makes the fund. Play with the machine below — drag the return and the years and watch which slider does the heavy lifting.`),
          { kind: "widget", id: "compounding" },
          check({
            id: "compounding-c1",
            kind: "numeric",
            unit: "years",
            prompt: "Rule of 72: at a 9% annual return, roughly how many years does money take to double?",
            answer: 8,
            explain: "72 ÷ 9 = 8 years. It's an approximation, but it makes compounding arithmetic you can do at the dinner table.",
          }),
        ],
      },
      {
        slug: "the-benchmark",
        title: "The benchmark — your opponent is a couch",
        blocks: [
          prose(`Every active investor has a silent opponent: the do-nothing alternative. Buy an index [[etf]] in one click, never think again, collect the market's return. Any effort beyond that — research, agents, dashboards, this entire app — is only justified by the margin *above* what the couch would have earned.

That's what a benchmark is for. GRQ's is [XIC](#explain:vs-xic), the whole TSX in one ticker, and the comparison sits on screen permanently: not "did we make money?" but **"did we beat just buying XIC?"** In a year the market rises 10%, a fund that made 8% *lost the game* — it did worse than nothing, with extra steps.

Two honest corollaries. Most professionals lose this game over long periods, after fees — competition is brutal, costs compound, and the market is mostly-right most days. And short-term wins prove little: a hot quarter is luck until years of scorekeeping say otherwise, which is why the fund keeps score in public and grades its own calls after the fact. Beating the couch is *hard*. The dashboard exists to find out — with receipts — whether it's happening, not to assume it.`),
          check({
            id: "the-benchmark-c1",
            kind: "choice",
            prompt: "The market rises 10% this year. Your actively-managed fund makes 8%. Verdict?",
            options: [
              { id: "a", md: "A win — 8% is a solid return" },
              { id: "b", md: "A loss — it did worse than doing nothing, with extra steps" },
              { id: "c", md: "A tie — both made money" },
            ],
            correct: ["b"],
            explain: "The couch (one click of XIC, zero thought) earned 10%. Every hour of effort is only justified by the margin *above* that.",
          }),
          { kind: "receipt", id: "vs-xic" },
          { kind: "tryIt", links: [{ href: "/reports", label: "Reports — the scoreboard vs XIC, updated live" }] },
        ],
      },
      {
        slug: "fee-gravity-and-tax-drag",
        title: "Fee gravity and tax drag",
        blocks: [
          prose(`Compounding has an evil twin: costs compound too, in reverse, every single year. A 2% [MER](#explain:mer) sounds like nothing next to a 10% return — but it's a fifth of your growth, taken annually, forever. Over 30 years it can consume a third of the final pot. Nothing about your portfolio works as relentlessly as its fees.

The retail-scale version is death by a thousand cuts: [commissions](#explain:commission), the [spread](#explain:bid-ask-spread), FX conversion, all × how often you trade. GRQ has two code-level defenses — a trade must be worth at least 3× its [round-trip](#explain:round-trip) commissions, and a monthly [fee budget](#explain:fee-budget) the gate simply won't let the fund exceed. Small accounts don't usually die of bad picks; they bleed out in costs.

Then taxes, the other drag — and Canada hands you shelters, in order: a [[tfsa]] (gains never taxed, with the fine print that CRA can reclassify a *day-trading* TFSA as a business — cadence matters), an [[rrsp]] (tax deferred to retirement), and only then non-registered accounts, where half your [capital gains](#explain:capital-gains) are taxable and the [superficial-loss rule](#explain:superficial-loss) polices your loss-harvesting. Shelter first is worth more than most stock picks.`),
          { kind: "diagram", id: "fee-gravity" },
          check({
            id: "fee-gravity-and-tax-drag-c1",
            kind: "choice",
            prompt: "For a Canadian investor, the sane order of accounts to fill is…",
            options: [
              { id: "a", md: "Non-registered first — maximum flexibility" },
              { id: "b", md: "TFSA, then RRSP, then non-registered" },
              { id: "c", md: "RRSP only — the refund is free money" },
            ],
            correct: ["b"],
            explain: "Shelter first: TFSA gains are never taxed (mind the day-trading fine print), RRSP defers, and only then the taxable account. Worth more than most stock picks.",
          }),
          { kind: "receipt", id: "fees" },
        ],
      },
      {
        slug: "behavioural-traps",
        title: "The enemy in the mirror",
        blocks: [
          prose(`Markets have a century of data on how portfolios actually die, and the leading cause isn't crashes — it's **what investors do during them**. The average fund *investor* earns meaningfully less than the average *fund*, purely from the timing of their own entrances and exits: piling in after a run, bailing out at the bottom.

The traps have names. **Panic selling** converts temporary drawdowns into permanent losses. **FOMO buying** arrives precisely when the easy money has been made (Course 4's crowding gauge exists for this). **Loss aversion** makes losses hurt about twice as much as gains feel good — so people hold losers ("it'll come back, I just don't want to *realize* it") and sell winners early, the exact backwards of cutting losses and letting winners run. **Overconfidence** after a lucky streak breeds oversized bets. **Overtrading** scratches the itch to *do something* — and pays fee gravity for the privilege.

The only defense with a track record is **deciding in advance**: written rules, made calm, enforced when you're not. That's the deep design of GRQ — stops, caps, floors, a fee budget, a kill switch, all in code that the heat of the moment can't renegotiate. The gate binds Alfred exactly the way a written plan binds a human, and for the same reason: nobody is at their best at the bottom.`),
          check({
            id: "behavioural-traps-c1",
            kind: "choice",
            prompt: "Loss aversion typically makes investors…",
            options: [
              { id: "a", md: "Hold losers too long and sell winners too early" },
              { id: "b", md: "Sell losers instantly and let winners run" },
              { id: "c", md: "Stop checking their portfolio" },
            ],
            correct: ["a"],
            explain: "Losses hurt ~2× as much as gains feel good, so people refuse to *realize* them — the exact backwards of the discipline. The fix with a track record: rules written in advance.",
          }),
          {
            kind: "video",
            yt: "V2EMuoM5IX4",
            title: "The psychology behind irrational decisions",
            author: "TED-Ed",
            minutes: 5,
            why: "loss aversion and the heuristics zoo, in four minutes — the exact machinery GRQ's written-in-advance rules exist to disarm.",
          },
        ],
      },
      {
        slug: "when-to-sell",
        title: "When to sell — the hardest question",
        blocks: [
          prose(`Buying gets all the attention, but selling is where returns are made real — and it's harder, because every exit argues with an emotion: selling a winner feels like quitting, selling a loser feels like admitting it.

The discipline that cuts through: **sell on the thesis, not the price.** You bought for a reason. If the price falls but the reason still stands, the stock got cheaper — falling price alone isn't a sell signal. If the reason has *broken* — the moat cracked, the growth stalled, the story you bought didn't happen — sell regardless of whether you're up or down. What you paid is a sunk cost; the market doesn't know your entry price and doesn't care.

Because that judgment is hardest exactly when it's needed, pre-commitment does the heavy lifting: a [stop-loss](#explain:stop-loss) caps the damage when you're wrong, a [take-profit](#explain:take-profit) banks the win before it round-trips, and a [price target](#explain:price-target) with a horizon makes "the thesis played out" a testable claim instead of a vibe. (Selling at a loss in a taxable account? Mind the [30-day rebuy rule](#explain:superficial-loss).)

Nobody sells the top — that's not the goal. The goal is a **written reason for every exit**, graded later. GRQ logs its reason on every trade and scores its own calls after the fact; that's the "receipts" in the tagline. An exit you can defend in writing is a good exit, whatever the next candle does.`),
          { kind: "diagram", id: "thesis-price-2x2" },
          check({
            id: "when-to-sell-c1",
            kind: "choice",
            prompt: "Your stock falls 20%, but the reason you bought it is fully intact. The discipline says…",
            options: [
              { id: "a", md: "Sell — the market knows something you don't" },
              { id: "b", md: "Falling price alone isn't a sell signal; the stock just got cheaper" },
              { id: "c", md: "Double your position immediately" },
            ],
            correct: ["b"],
            explain: "Sell on the thesis, not the price. If the reason broke, sell up or down; if it stands, the entry price is a sunk cost the market doesn't know or care about.",
          }),
        ],
      },
    ],
  },
  {
    slug: "how-grq-works",
    n: 8,
    title: "How GRQ works",
    tagline: "The fund as a worked example — guardrails as risk management, NAV as accounting, the soak as proof.",
    overview: [
      "Explain the separation of powers: the agent proposes, the code gate disposes, humans hold the rules",
      "Map every guardrail back to the risk it manages — with the live dials as receipts",
      "Say precisely what has to be true before a single real dollar trades",
    ],
    status: "live",
    lessons: [
      {
        slug: "proposes-disposes",
        title: "The agent proposes, the gate disposes",
        blocks: [
          prose(`GRQ is a real brokerage account run day-to-day by an AI agent — Alfred, a large language model ([Claude Opus](#explain:opus)) on a fixed rhythm: a 9:00 morning plan, decision check-ins every half hour through the trading day, a close-of-day brief. It reads the same dashboards you do, files research, and proposes trades.

The load-bearing design fact: **Alfred doesn't hold the keys.** Every order it proposes must pass a deterministic code gate — a checklist of hard rules (next lesson) applied with zero judgment and zero appreciation for eloquence. An order that breaks a rule is rejected no matter how good the reasoning sounded. The agent proposes; the gate disposes.

Humans sit above both, holding exactly two powers that matter. The [kill switch](#explain:kill-switch): either member can halt all trading instantly, and nothing trades while it's engaged. And the rules themselves: **only humans can change the guardrails** — Alfred cannot edit its own limits, not because it hasn't asked nicely, but because no code path exists for it to do so.

Why build it this way? Course 7's behavioural lesson, applied to a machine. An AI doesn't get greedy or scared, but it has its own failure modes — overconfidence, a persuasive bad idea, a misread number. Separation of powers means a bad idea has to get past something that *cannot be talked into it*. That principle is older than markets, and it's the whole architecture.`),
          { kind: "diagram", id: "proposes-disposes" },
          check({
            id: "proposes-disposes-c1",
            kind: "choice",
            prompt: "Alfred writes a brilliant, persuasive case for an order that breaks one hard rule. What happens?",
            options: [
              { id: "a", md: "The gate rejects it — eloquence doesn't parse" },
              { id: "b", md: "It goes through with a warning" },
              { id: "c", md: "A member votes on it" },
            ],
            correct: ["a"],
            explain: "The gate is deterministic code with zero appreciation for reasoning. A bad idea has to get past something that cannot be talked into it — that's the whole architecture.",
          }),
        ],
      },
      {
        slug: "guardrails-as-risk",
        title: "The guardrails — Course 5, enforced in code",
        blocks: [
          prose(`Everything the Risk course taught, GRQ enforces mechanically. This lesson is just the mapping.

**Sizing** (Course 5, lesson 3): a max-position cap — no single name past a set share of NAV — and a [cash floor](#explain:cash-floor) held *per currency*, so the fund is never all-in. **Drawdown** (lesson 2): two tripwires — a bad enough day pauses all new buying until tomorrow, and a deep enough fall from the high-water mark trips the kill switch automatically. **Fee gravity** (Course 7): order-rate caps, a monthly fee budget the gate enforces, and the 3× rule — no trade whose thesis doesn't clear three times its round-trip commissions.

**Behaviour**: no new entries in the first or last 15 minutes of the session (the tape is at its most emotional at the open and close), and no buy below a [conviction](#explain:confidence) bar — Alfred must put a number on how sure it is, and the gate holds it to that number. **The banned bets** (lesson 5): no [[leverage]], no [short selling](#explain:short-selling), and no options — the options ban is literally a toggle in the database that ships OFF, and the broker seam rejects option orders while it stays off.

The dials below are the live values — not a screenshot, the same constants the gate is checking right now. Members pick the risk dial (Cautious / Balanced / Aggressive presets); every trade, whatever the dial, clears every rule above.`),
          check({
            id: "guardrails-as-risk-c1",
            kind: "choice",
            prompt: "Who can change the fund's guardrails?",
            options: [
              { id: "a", md: "Alfred, if its track record earns it" },
              { id: "b", md: "Humans only — no code path exists for the agent to edit its own limits" },
              { id: "c", md: "They adjust automatically with market conditions" },
            ],
            correct: ["b"],
            explain: "The rules and the gate are humans-only by construction. The risk dial picks presets; every trade still clears every rule.",
          }),
          { kind: "receipt", id: "guardrails" },
        ],
      },
      {
        slug: "the-scoreboard",
        title: "The scoreboard — NAV, the couch, and the real hurdle",
        blocks: [
          prose(`The fund keeps score the way Courses 1 and 7 said an honest investor must. [Contributions](#explain:contributions) — every dollar Cam and Graham ever put in — are the baseline. [[nav]] is what it's all worth right now. The difference is [total P&L](#explain:total-pnl), and beside it, always, sits the couch: what those same contributions would be worth had they gone [straight into XIC](#explain:vs-xic) on the day they arrived.

There's a second hurdle most funds don't print: **operating costs**. GRQ runs on paid subscriptions — the AI and the market data together cost real money every month. A small fund can beat XIC and *still* be underwater once its own running costs are counted, and GRQ's reporting is required to say so rather than celebrate. The honest exit from that trap is scale and patient compounding — never bigger risk. The gate doesn't loosen because the fund is impatient.

One more honesty rule baked into the scoreboard: it's measured from the current soak's inception, not from whatever flattering date a marketer would pick. When the paper account was reset mid-soak, the clock restarted and said so. Track records are only worth what their starting line is.`),
          check({
            id: "the-scoreboard-c1",
            kind: "choice",
            prompt: "The fund beats XIC this year. Is that the whole test?",
            options: [
              { id: "a", md: "Yes — beating the benchmark is the game" },
              { id: "b", md: "No — it also has to clear its own operating costs (the AI + data subscriptions)" },
              { id: "c", md: "No — it has to beat the S&P 500 too" },
            ],
            correct: ["b"],
            explain: "A small fund can beat the couch and still be underwater after its own running costs. The honest exit is scale and patience — never bigger risk.",
          }),
          { kind: "receipt", id: "vs-xic" },
        ],
      },
      {
        slug: "receipts-before-trades",
        title: "Receipts before trades — the research pipeline",
        blocks: [
          prose(`No name gets bought on a hunch. The pipeline runs one direction:

A name enters as a **candidate** — a member watches it, or Alfred's hunt surfaces it as a lead. Research produces a [[dossier]]: the business, the catalysts, the bear case, a verdict with a [confidence](#explain:confidence) number and [price targets](#explain:price-target) with horizons. Only a genuine Buy call at or above the conviction bar can be **promoted** into the tradeable [universe](#explain:universe) — and promotion itself passes a deterministic [[liquidity]] screen first (Course 2: a position you can't exit isn't a position). And after *all* of that, every actual order still clears the full gate from the last lesson.

Then the part that gives this course its name: **everything is written down and graded.** Every decision lands in a journal with its reasoning. Price targets get scored when they resolve. A panel of rival AI models (Second Opinions) logs what *they* would have done at every check-in, so Alfred's judgment is benchmarked against alternatives. The Report Card tallies whether the calls were right, wrong, or lucky.

The point of all this isn't infallibility — the fund is wrong plenty. The point is **auditability**: for any position, any exit, any miss, you can always pull the receipt and find out *why*. An investment process you can't audit isn't a process; it's a mood with a brokerage account.`),
          { kind: "diagram", id: "grq-pipeline" },
          check({
            id: "receipts-before-trades-c1",
            kind: "choice",
            prompt: "Put the pipeline in order:",
            options: [
              { id: "a", md: "candidate → dossier → promotion (liquidity screen) → the order gate" },
              { id: "b", md: "order gate → dossier → candidate → promotion" },
              { id: "c", md: "dossier → order → candidate → journal" },
            ],
            correct: ["a"],
            explain: "One direction, no shortcuts — and even a promoted name's every order still clears the full gate. Then it's all written down and graded later.",
          }),
          {
            kind: "tryIt",
            links: [
              { href: "/race", label: "Second Opinions — rival models grade the fund's real calls" },
              { href: "/report-card", label: "the Report Card — the tally, wins and misses alike" },
            ],
          },
        ],
      },
      {
        slug: "the-soak",
        title: "The soak — proving it before real money",
        blocks: [
          prose(`The last rule is the one everything else waits on: **real dollars trade only after the [soak](#explain:soak)** — at least four clean weeks of live trading on simulated and paper accounts, at least two of them on the broker's paper system, the same one the real account would use. "Clean" is defined, not vibed: no blown guardrails, no phantom P&L, and the fund's books reconciled against the broker's every single day.

Why so slow? The same reason pilots log simulator hours: in a simulator, failure is free *and informative*. The soak has already paid for itself — it caught a broker-side account reset that looked exactly like a portfolio crash, tripped the defenses, and got diagnosed with receipts instead of panic. Every bug found on paper is a bug that never touches money.

This is also the honest answer to "why isn't it trading real money yet?" Because the burden of proof sits with the system, not with enthusiasm. The block below is the live state of that proof — the broker, the clock, and whether the kill switch is resting or engaged. When the gate finally opens, it will open because the receipts said so.`),
          check({
            id: "the-soak-c1",
            kind: "choice",
            prompt: "What has to be true before real money trades?",
            options: [
              { id: "a", md: "A profitable month on the simulator" },
              { id: "b", md: "At least 4 clean weeks on sim/paper, of which at least 2 on the broker's own paper system" },
              { id: "c", md: "Both members feeling confident" },
            ],
            correct: ["b"],
            explain: "And “clean” is defined, not vibed: no blown guardrails, no phantom P&L, books reconciled daily. The burden of proof sits with the system.",
          }),
          { kind: "receipt", id: "soak" },
        ],
      },
    ],
  },
];

export function courseBySlug(slug: string): LearnCourse | undefined {
  return COURSES.find((c) => c.slug === slug);
}

export function lessonBySlug(course: LearnCourse, lessonSlug: string): LearnLesson | undefined {
  return course.lessons.find((l) => l.slug === lessonSlug);
}

/** A lesson's inline checks, in order. */
export function lessonChecks(l: LearnLesson): LearnQuestion[] {
  return l.blocks.filter((b): b is Extract<LearnBlock, { kind: "check" }> => b.kind === "check").map((b) => b.q);
}

/** Rough read time: prose words + a minute per interactive element. Shown on the syllabus. */
export function readMinutes(l: LearnLesson): number {
  let words = 0;
  let interactive = 0;
  for (const b of l.blocks) {
    if (b.kind === "prose" || b.kind === "callout") words += b.md.split(/\s+/).length;
    else if (b.kind === "check") interactive += 1;
    else if (b.kind === "widget") interactive += 2;
    else if (b.kind === "video") interactive += Math.min(b.minutes, 8);
    else if (b.kind === "receipt" || b.kind === "example") interactive += 1;
  }
  return Math.max(2, Math.ceil(words / 220) + interactive);
}

/** The magazine lede (Cam 2026-07-04): bold + capitalize a lesson's first two words so
 *  the eye knows where to land. Term links survive the treatment — [[volatility]] becomes
 *  **[[VOLATILITY]]** (both renderers lowercase the key before the glossary lookup).
 *  Mirrored in mobile lib/learn.ts — keep in lockstep. */
export function ledeMd(md: string): string {
  const token = /\[\[[^\]]+\]\]|\[[^\]]+\]\(#explain:[^)\s]+\)|[A-Za-z0-9$%"'""''’‑–-]+/y;
  const caps = (t: string): string => {
    if (t.startsWith("[[")) return `[[${t.slice(2, -2).toUpperCase()}]]`;
    const link = /^\[([^\]]+)\](\(#explain:[^)\s]+\))$/.exec(t);
    if (link) return `[${link[1].toUpperCase()}]${link[2]}`;
    return t.toUpperCase();
  };
  token.lastIndex = 0;
  const first = token.exec(md);
  if (!first) return md;
  const gap = /\s+/y;
  gap.lastIndex = token.lastIndex;
  const sp = gap.exec(md);
  if (!sp) return md;
  token.lastIndex = gap.lastIndex;
  const second = token.exec(md);
  if (!second) return md;
  return `**${caps(first[0])}${sp[0]}${caps(second[0])}**${md.slice(token.lastIndex)}`;
}

/** Flatten a lesson's written content to one markdown string — the mobile/legacy `body`
 *  shape (export-learn-content.ts) and anything that wants the lesson as plain text. */
export function lessonBodyMd(l: LearnLesson): string {
  return l.blocks
    .filter((b): b is Extract<LearnBlock, { kind: "prose" | "callout" }> => b.kind === "prose" || b.kind === "callout")
    .map((b) => b.md)
    .join("\n\n");
}

/** The labs rail on the hub — each sandbox framed by what it teaches. */
export const LABS: { href: string; title: string; teaches: string }[] = [
  { href: "/options-desk", title: "Options Desk", teaches: "Does adding defined-risk options actually beat stock-only? Two Opus arms, same market, live scoreboard." },
  { href: "/short-lab", title: "Short Lab", teaches: "Short selling — the unbounded-loss bet the fund can't make — with modeled borrows, margin calls, and shadow-shorts of our real sells." },
  { href: "/day-lab", title: "Day-Trading Lab", teaches: "Day trading vs buy-and-hold with real spreads and commissions. Watch the costs do the arguing." },
  { href: "/bulls", title: "Bull Race", teaches: "Eight AI models, each running its own $50k paper book. Different brains, same market." },
  { href: "/race", title: "Second Opinions", teaches: "Shadow judges score the fund's real calls after the fact — was Alfred right, or just lucky?" },
];
