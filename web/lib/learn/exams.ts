// The course exams (docs/LEARN-FRAMEWORK.md D111 §7.3) — SERVER-ONLY. Answer keys live
// here and nowhere else: the exam API strips them before anything reaches a client, and
// scripts/export-learn-content.ts deliberately does NOT export this file. Never import
// this module from a client component or from content.ts.
//
// Rules (Cam, 2026-07-04): members only (viewers are read-only — no exams), pass ≥ 80%,
// unlimited retakes, BEST score stands, attempt count published beside it. All questions
// grade deterministically in code (choice / integer numeric) — the `open` Alfred-graded
// kind waits on direct-API plumbing in web (framework §7 parking note).
//
// Each exam includes at least one "field trip" — a question answered by finding the live
// value in the app itself. Keys here must track the app when those live values move
// (e.g. the conviction bar, policy.ts SELF_INVEST — changed 75→70 in D95).
import type { LearnQuestion } from "./content";
import { choiceCorrect, numericCorrect, formatNumeric } from "./answers";

export type LearnExam = {
  courseSlug: string;
  /** Bump on any question edit — attempts record the version they sat. */
  version: number;
  /** Integer percent needed to pass. */
  passPct: number;
  questions: LearnQuestion[];
};

export const EXAMS: LearnExam[] = [
  {
    courseSlug: "the-machine",
    version: 1,
    passPct: 80,
    questions: [
      {
        id: "the-machine-q1",
        kind: "choice",
        prompt: "You buy 50 shares of Shopify on the TSX. Who receives your money?",
        options: [
          { id: "a", md: "Shopify — it issued the shares" },
          { id: "b", md: "Whoever sold you the shares — another investor" },
          { id: "c", md: "The TSX, which forwards it to Shopify monthly" },
        ],
        correct: ["b"],
        explain: "Essentially all trading is the secondary market: shares change hands between investors, and the company isn't part of the trade.",
        reviewLesson: "what-an-exchange-does",
      },
      {
        id: "the-machine-q2",
        kind: "choice",
        prompt: "When is the ONE time your share purchase actually funds the company?",
        options: [
          { id: "a", md: "Every time — that's what buying stock is" },
          { id: "b", md: "At the IPO, when the company first sells the shares" },
          { id: "c", md: "Only when you buy directly from the CEO" },
        ],
        correct: ["b"],
        explain: "After the IPO, shares just change hands between investors. The company already got its money.",
        reviewLesson: "what-a-stock-is",
      },
      {
        id: "the-machine-q3",
        kind: "choice",
        prompt: "Alfred once charted a forty-cent Canadian stock instead of the real Visa. What's the permanent lesson?",
        options: [
          { id: "a", md: "A ticker is only an address on a SPECIFIC exchange — always check where it lives" },
          { id: "b", md: "Canadian stocks are unreliable" },
          { id: "c", md: "Never trust a stock under a dollar" },
        ],
        correct: ["a"],
        explain: "The same letters can point at completely different companies on different exchanges. Ticker + exchange, always.",
        reviewLesson: "tickers-and-look-alikes",
      },
      {
        id: "the-machine-q4",
        kind: "choice",
        prompt: "Which TWO things are true of a CDR like SPCX on the TSX? (pick both)",
        options: [
          { id: "a", md: "It *tracks* the US name without being the actual share" },
          { id: "b", md: "It's hedged into CAD, so it behaves differently from the real thing" },
          { id: "c", md: "It's the real share, just listed in Toronto" },
        ],
        correct: ["a", "b"],
        multi: true,
        explain: "A CDR is a TSX-listed, CAD-hedged certificate ABOUT the name — useful, but only if you know what you're actually holding.",
        reviewLesson: "tickers-and-look-alikes",
      },
      {
        id: "the-machine-q5",
        kind: "choice",
        prompt: "A stock closes at $80 and opens at $70 after bad overnight news. Which statement is honest?",
        options: [
          { id: "a", md: "Sellers dumped it all night until it hit $70" },
          { id: "b", md: "The first trade of the day repriced it at once — and no stop-loss could have saved you from the gap" },
          { id: "c", md: "The exchange moved the price to match the news" },
        ],
        correct: ["b"],
        explain: "News piles up while the market sleeps; the open gaps to the new agreement. Stops fire AT the market, so a gap blows straight through the level.",
        reviewLesson: "market-hours",
      },
      {
        id: "the-machine-q6",
        kind: "choice",
        prompt: "It's Canada Day: the TSX is closed, New York is open. What can GRQ's fund do?",
        options: [
          { id: "a", md: "Nothing — the fund's home market is closed" },
          { id: "b", md: "Trade its US sleeve — the calendars don't line up, and the fund's calendar knows it" },
          { id: "c", md: "Trade TSX names at yesterday's prices" },
        ],
        correct: ["b"],
        explain: "Holidays don't line up across the border. On a TSX-only holiday the US sleeve still trades (and vice versa on July 4th).",
        reviewLesson: "market-hours",
      },
      {
        id: "the-machine-q7",
        kind: "choice",
        prompt: "Why can “the S&P 500 was up 1%” hide a terrible day for most of its members?",
        options: [
          { id: "a", md: "The index only counts winners" },
          { id: "b", md: "It's cap-weighted — the ten biggest names dominate the reading" },
          { id: "c", md: "It's updated only once a week" },
        ],
        correct: ["b"],
        explain: "Cap-weighting means the giants do the talking. Hundreds of smaller members can fall without denting the number.",
        reviewLesson: "indices",
      },
      {
        id: "the-machine-q8",
        kind: "choice",
        prompt: "**Field trip:** open Reports and check — which ticker does GRQ measure itself against, and why that one?",
        options: [
          { id: "a", md: "XIC — the whole TSX in one ticker: the do-nothing alternative the fund must beat" },
          { id: "b", md: "SPY — the S&P 500, the world's benchmark" },
          { id: "c", md: "AAPL — the biggest stock" },
        ],
        correct: ["a"],
        explain: "The couch-potato option is the opponent. If stock-picking can't beat one click of XIC, the fund shouldn't exist — that bar stays on screen on purpose.",
        reviewLesson: "indices",
      },
    ],
  },
  {
    courseSlug: "how-a-price-happens",
    version: 1,
    passPct: 80,
    questions: [
      {
        id: "how-a-price-happens-q1",
        kind: "choice",
        prompt: "The big price on a stock page is…",
        options: [
          { id: "a", md: "The last trade — history. Live, there are always TWO prices: the bid and the ask" },
          { id: "b", md: "The current price everyone can trade at" },
          { id: "c", md: "The average of today's trades" },
        ],
        correct: ["a"],
        explain: "There is no “the price.” You buy at the ask and sell at the bid — the gap is the spread, and you pay it.",
        reviewLesson: "the-spread",
      },
      {
        id: "how-a-price-happens-q2",
        kind: "numeric",
        unit: "cents",
        prompt: "A stock quotes **bid $24.80 / ask $25.20**. You buy 10 shares and immediately sell them. Ignoring commissions, what did the round trip cost (in dollars)?",
        answer: 400,
        placeholder: "4.00",
        explain: "The 40¢ spread × 10 shares = $4.00, paid before the stock moved at all. Every position opens underwater by the spread.",
        reviewLesson: "the-spread",
      },
      {
        id: "how-a-price-happens-q3",
        kind: "choice",
        prompt: "In a thinly-traded stock, a market order's risk is…",
        options: [
          { id: "a", md: "It might not fill" },
          { id: "b", md: "Slippage — “whatever's asking” can be far from the last print" },
          { id: "c", md: "The exchange may reject it" },
        ],
        correct: ["b"],
        explain: "A market order guarantees the fill, never the price. In a thin book it takes what's there, and what's there can be ugly.",
        reviewLesson: "order-types",
      },
      {
        id: "how-a-price-happens-q4",
        kind: "choice",
        prompt: "Why does GRQ treat stop-losses as “seatbelts, not force fields”?",
        options: [
          { id: "a", md: "A stop fires a MARKET order — an overnight gap can fill it far below the stop level" },
          { id: "b", md: "Stops expire after a week" },
          { id: "c", md: "Brokers charge extra for stops" },
        ],
        correct: ["a"],
        explain: "A stop is a trigger. It caps damage in normal conditions, but a gap blows straight through the level — the fill happens wherever the market reopens.",
        reviewLesson: "order-types",
      },
      {
        id: "how-a-price-happens-q5",
        kind: "choice",
        prompt: "A market maker's business is…",
        options: [
          { id: "a", md: "Betting on which stocks rise" },
          { id: "b", md: "Quoting both sides all day and earning the spread — so there's always someone to trade with" },
          { id: "c", md: "Executing orders for the exchange" },
        ],
        correct: ["b"],
        explain: "They're not betting on direction; they're selling the “always someone” quality — liquidity — and collecting the spread for it.",
        reviewLesson: "market-makers-and-liquidity",
      },
      {
        id: "how-a-price-happens-q6",
        kind: "choice",
        prompt: "Why does GRQ's liquidity screen run BEFORE a name is even eligible to buy?",
        options: [
          { id: "a", md: "A position you can't exit cleanly isn't a position — it's a trap with a ticker symbol" },
          { id: "b", md: "Illiquid stocks are always bad businesses" },
          { id: "c", md: "The broker charges more for illiquid names" },
        ],
        correct: ["a"],
        explain: "Illiquidity punishes in both directions — your own buying lifts the ask, your own selling drops the bid. The screen keeps traps out of the universe entirely.",
        reviewLesson: "market-makers-and-liquidity",
      },
      {
        id: "how-a-price-happens-q7",
        kind: "choice",
        prompt: "A stock jumps 5% on a trickle of volume. The honest read?",
        options: [
          { id: "a", md: "Real money changed its mind — follow it" },
          { id: "b", md: "A shrug that can reverse by lunch — volume is the conviction gauge" },
          { id: "c", md: "A short squeeze is underway" },
        ],
        correct: ["b"],
        explain: "The same move on heavy volume means real money repriced it. On a trickle, it's noise until proven otherwise.",
        reviewLesson: "what-moves-a-price",
      },
      {
        id: "how-a-price-happens-q8",
        kind: "choice",
        prompt: "A 15-minute-delayed quote is fatal for whom — and noise for whom?",
        options: [
          { id: "a", md: "Fatal for a day trader scalping pennies; noise for a weeks-long swing thesis" },
          { id: "b", md: "Fatal for everyone equally" },
          { id: "c", md: "Noise for everyone — prices barely move in 15 minutes" },
        ],
        correct: ["a"],
        explain: "GRQ holds for weeks, so delayed data doesn't touch the thesis. Scalping against microsecond opponents on stale prices is a funeral.",
        reviewLesson: "whose-quote-is-right",
      },
    ],
  },
  {
    courseSlug: "owning-a-piece",
    version: 1,
    passPct: 80,
    questions: [
      {
        id: "owning-a-piece-q1",
        kind: "numeric",
        unit: "pct",
        prompt: "A stock at $50 pays a $2 annual dividend. What's the dividend yield, in percent?",
        answer: 4,
        placeholder: "4",
        explain: "$2 ÷ $50 = 4%. The annual payout as a percent of the price.",
        reviewLesson: "dividends",
      },
      {
        id: "owning-a-piece-q2",
        kind: "choice",
        prompt: "On the ex-dividend date, the stock's price typically…",
        options: [
          { id: "a", md: "Rises by the dividend — income attracts buyers" },
          { id: "b", md: "Drops by roughly the dividend — the cash left the company" },
          { id: "c", md: "Doesn't react; dividends are separate from price" },
        ],
        correct: ["b"],
        explain: "A dividend is your own money arriving by mail. The market marks the company down by what it paid out — “grabbing the payout” achieves nothing.",
        reviewLesson: "dividends",
      },
      {
        id: "owning-a-piece-q3",
        kind: "choice",
        prompt: "When does a buyback actually help remaining shareholders?",
        options: [
          { id: "a", md: "Always — fewer shares is always better" },
          { id: "b", md: "When the company bought its shares CHEAP — overpaying makes it a bad investor with insider enthusiasm" },
          { id: "c", md: "Never — buybacks are accounting tricks" },
        ],
        correct: ["b"],
        explain: "A buyback is reverse dilution: each slice owns more. But the company is making an investment — and the price it pays decides whether it was a good one.",
        reviewLesson: "splits-and-buybacks",
      },
      {
        id: "owning-a-piece-q4",
        kind: "numeric",
        unit: "cents",
        prompt: "You buy 10 shares at $20 and pay a $5 commission. What's your ACB per share (in dollars)?",
        answer: 2050,
        placeholder: "20.50",
        explain: "($200 + $5) ÷ 10 = $20.50 — commissions included. Every gain or loss you ever book is measured from here.",
        reviewLesson: "acb-and-paper-gains",
      },
      {
        id: "owning-a-piece-q5",
        kind: "choice",
        prompt: "A +40% unrealized gain becomes real money…",
        options: [
          { id: "a", md: "At the end of each tax year" },
          { id: "b", md: "The moment you sell — until then it's paper, and it can round-trip to zero" },
          { id: "c", md: "Once it's older than 30 days" },
        ],
        correct: ["b"],
        explain: "Unrealized P&L moves daily and feels real; it isn't. Realizing is what makes it money — and what makes it taxable.",
        reviewLesson: "acb-and-paper-gains",
      },
      {
        id: "owning-a-piece-q6",
        kind: "choice",
        prompt: "You sell at a loss and rebuy the same stock 20 days later. The CRA…",
        options: [
          { id: "a", md: "Throws the loss out — the superficial-loss rule needs 30 clear days" },
          { id: "b", md: "Halves the loss" },
          { id: "c", md: "Allows it if the rebuy was smaller" },
        ],
        correct: ["a"],
        explain: "Rebuying within 30 days voids the loss entirely. GRQ's agent is code-barred from tripping the rule.",
        reviewLesson: "acb-and-paper-gains",
      },
      {
        id: "owning-a-piece-q7",
        kind: "choice",
        prompt: "What do you GIVE UP by buying an index ETF instead of single stocks?",
        options: [
          { id: "a", md: "Diversification" },
          { id: "b", md: "The dream of the one 10× pick — in exchange for immunity to the one that goes to zero" },
          { id: "c", md: "Dividends — ETFs don't pay them" },
        ],
        correct: ["b"],
        explain: "One ticker buys the whole market: no lottery ticket, no landmine. Most professionals fail to beat that trade after fees.",
        reviewLesson: "stocks-vs-etfs",
      },
      {
        id: "owning-a-piece-q8",
        kind: "choice",
        prompt: "Alfred wants to buy a US stock but the fund's USD cash is short. What happens?",
        options: [
          { id: "a", md: "The broker converts CAD automatically at the market rate" },
          { id: "b", md: "Nothing, until Alfred REQUESTS an FX conversion and a human approves it — no auto-FX, no borrowing" },
          { id: "c", md: "The order goes through on margin" },
        ],
        correct: ["b"],
        explain: "Two sleeves, converted deliberately in chunks. A US buy needs the USD already there; the conversion itself needs a member's OK.",
        reviewLesson: "two-currencies",
      },
    ],
  },
  {
    courseSlug: "reading-the-game",
    version: 1,
    passPct: 80,
    questions: [
      {
        id: "reading-the-game-q1",
        kind: "choice",
        prompt: "A company BEATS the quarter but cuts next year's guidance. The market usually…",
        options: [
          { id: "a", md: "Rallies — a beat is a beat" },
          { id: "b", md: "Sells it — the market prices the future, and guidance IS the future" },
          { id: "c", md: "Waits for analysts to decide" },
        ],
        correct: ["b"],
        explain: "The quarter is history the moment it prints. Management's own forecast is the live information, and it lands within seconds.",
        reviewLesson: "earnings-season",
      },
      {
        id: "reading-the-game-q2",
        kind: "choice",
        prompt: "Why does earnings day so often mean an opening GAP rather than a slow drift?",
        options: [
          { id: "a", md: "Reports land before the open or after the close — the reaction reprices at the next open" },
          { id: "b", md: "Exchanges halt the stock all day" },
          { id: "c", md: "Analysts trade first" },
        ],
        correct: ["a"],
        explain: "BMO/AMC timing + Course 1's gap mechanics. It's the single biggest SCHEDULED risk event a stock has — on the calendar months ahead.",
        reviewLesson: "earnings-season",
      },
      {
        id: "reading-the-game-q3",
        kind: "choice",
        prompt: "Why does a “hold” rating often function as a polite “sell”?",
        options: [
          { id: "a", md: "Analysts need access to the companies they cover — and companies dislike sell ratings" },
          { id: "b", md: "Regulators discourage sell ratings" },
          { id: "c", md: "It doesn't; hold means hold" },
        ],
        correct: ["a"],
        explain: "The scale is inflated, so read it with subtitles on. The CHANGES (upgrades, downgrades, target cuts) carry the information.",
        reviewLesson: "analyst-ratings",
      },
      {
        id: "reading-the-game-q4",
        kind: "choice",
        prompt: "A stock runs +30% and analyst price targets drift up right behind it. That's…",
        options: [
          { id: "a", md: "Confirmation the rally is justified" },
          { id: "b", md: "Herding — targets chase the price; compare against an INDEPENDENT view instead" },
          { id: "c", md: "Insider information leaking" },
        ],
        correct: ["b"],
        explain: "Targets chasing price is a tell, not analysis. The useful move is finding out WHY the street and an independent call disagree.",
        reviewLesson: "analyst-ratings",
      },
      {
        id: "reading-the-game-q5",
        kind: "choice",
        prompt: "Which TWO limits make a 13F useless for timing? (pick both)",
        options: [
          { id: "a", md: "It can be ~45 days stale by the time it's filed" },
          { id: "b", md: "It shows only longs (and options) — never shorts" },
          { id: "c", md: "It only covers Canadian stocks" },
        ],
        correct: ["a", "b"],
        multi: true,
        explain: "Buffett's May filing shows March's book, longs-only. Colour on conviction; useless for timing.",
        reviewLesson: "big-money",
      },
      {
        id: "reading-the-game-q6",
        kind: "choice",
        prompt: "How does GRQ treat smart-money signals (13F, insiders, congress)?",
        options: [
          { id: "a", md: "As leads to investigate — never reasons to trade" },
          { id: "b", md: "As auto-buy triggers above a threshold" },
          { id: "c", md: "It ignores them entirely" },
        ],
        correct: ["a"],
        explain: "Big-money signals generate questions; the answers still have to come from the research. That distinction is the whole discipline.",
        reviewLesson: "big-money",
      },
      {
        id: "reading-the-game-q7",
        kind: "choice",
        prompt: "Why do technical levels sometimes “work” at all?",
        options: [
          { id: "a", md: "They measure the business's true value" },
          { id: "b", md: "Everyone watches the same lines, so they occasionally self-fulfil" },
          { id: "c", md: "Exchanges enforce support levels" },
        ],
        correct: ["b"],
        explain: "Support “holds” partly because thousands of buyers agreed in advance to buy there. A description of the crowd, not prophecy.",
        reviewLesson: "technical-signals",
      },
      {
        id: "reading-the-game-q8",
        kind: "choice",
        prompt: "Reddit chatter on a name you hold goes vertical. GRQ reads that as…",
        options: [
          { id: "a", md: "A buy signal — momentum is building" },
          { id: "b", md: "A crowding/RISK flag — by the time retail chatter spikes, the easy money is usually gone" },
          { id: "c", md: "Meaningless noise, always" },
        ],
        correct: ["b"],
        explain: "The crowd gauge is noisy, gameable, and on probation — a risk flag on names we hold, never a reason to buy.",
        reviewLesson: "news-and-the-crowd",
      },
    ],
  },
  {
    courseSlug: "risk",
    version: 1,
    passPct: 80,
    questions: [
      {
        id: "risk-q1",
        kind: "choice",
        prompt: "Volatility's REAL danger to your portfolio is…",
        options: [
          { id: "a", md: "Bumpy rides eject their passengers at the bottom — a swing you can't stomach becomes a loss you realized" },
          { id: "b", md: "Volatile stocks always lose money eventually" },
          { id: "c", md: "It increases commissions" },
        ],
        correct: ["a"],
        explain: "A stock can be wildly bumpy on its way to tripling. The risk is what the bumps do to YOU — which is why the answer is “own less,” not “avoid.”",
        reviewLesson: "volatility",
      },
      {
        id: "risk-q2",
        kind: "numeric",
        unit: "pct",
        prompt: "Your portfolio falls 25% from its peak. What gain (in percent) do you need to get back to even?",
        answer: 33,
        tolerance: 1,
        placeholder: "33",
        explain: "75 needs to grow by a third to reach 100 again — about +33%. The hole deepens faster than the ladder grows.",
        reviewLesson: "drawdown",
      },
      {
        id: "risk-q3",
        kind: "choice",
        prompt: "Why do professionals obsess more over avoiding craters than catching spikes?",
        options: [
          { id: "a", md: "Loss-recovery arithmetic is asymmetric — a portfolio that never craters lets compounding do the rest" },
          { id: "b", md: "Regulators require it" },
          { id: "c", md: "Craters are more common than rallies" },
        ],
        correct: ["a"],
        explain: "Down 50% needs a double just to break even. Grinding modest gains without catastrophe beats flashy years that halve themselves.",
        reviewLesson: "drawdown",
      },
      {
        id: "risk-q4",
        kind: "choice",
        prompt: "What does diversification actually require — and what's its fine print?",
        options: [
          { id: "a", md: "Owning many things; no fine print" },
          { id: "b", md: "LOW CORRELATION — holdings that fail for different reasons; but in a real panic, correlations rush toward 1" },
          { id: "c", md: "At least 30 stocks in one sector you know well" },
        ],
        correct: ["b"],
        explain: "Ten Canadian banks is one bet held ten times. And nothing diversifies away a hurricane — that's what the cash floor and kill switch are for.",
        reviewLesson: "sizing-and-diversification",
      },
      {
        id: "risk-q5",
        kind: "numeric",
        unit: "pct",
        prompt: "You invest $10,000 plus $10,000 borrowed. The holdings fall 25%. What's the loss on YOUR money, in percent?",
        answer: 50,
        placeholder: "50",
        explain: "The $5,000 hit lands entirely on your $10,000. Leverage doubles both directions — and the margin call realizes it at the worst price.",
        reviewLesson: "leverage",
      },
      {
        id: "risk-q6",
        kind: "choice",
        prompt: "The one advantage a patient, UNLEVERED investor has that leverage removes:",
        options: [
          { id: "a", md: "The ability to WAIT — riding out a storm instead of being forced to surrender mid-storm" },
          { id: "b", md: "Lower taxes" },
          { id: "c", md: "Better market data" },
        ],
        correct: ["a"],
        explain: "Markets can stay irrational longer than a levered account can stay solvent. The margin call sells your positions at the bottom, without asking.",
        reviewLesson: "leverage",
      },
      {
        id: "risk-q7",
        kind: "choice",
        prompt: "In a short squeeze, what FORCES the price higher?",
        options: [
          { id: "a", md: "Shorts must BUY to close as the price rises — and their buying pushes it higher, forcing more buying" },
          { id: "b", md: "The exchange raises the price to punish shorts" },
          { id: "c", md: "The company buys back shares" },
        ],
        correct: ["a"],
        explain: "A rising price is a rising bill for every short. Being right too early looks exactly like being wrong.",
        reviewLesson: "the-bets-we-wont-make",
      },
      {
        id: "risk-q8",
        kind: "choice",
        prompt: "The quiet killer in day trading is…",
        options: [
          { id: "a", md: "Cost × frequency — spread, commissions, and slippage on every round trip, hundreds of times, against microsecond opponents" },
          { id: "b", md: "Picking the wrong stocks" },
          { id: "c", md: "Not watching the screen closely enough" },
        ],
        correct: ["a"],
        explain: "A small toll compounds viciously across hundreds of trades. The Day-Trading Lab exists to watch the costs do the arguing.",
        reviewLesson: "the-bets-we-wont-make",
      },
    ],
  },
  {
    courseSlug: "options",
    version: 1,
    passPct: 80,
    questions: [
      {
        id: "options-q1",
        kind: "choice",
        prompt: "A call option gives its buyer…",
        options: [
          { id: "a", md: "The RIGHT (never the obligation) to BUY at the strike price until expiry" },
          { id: "b", md: "The obligation to buy at the strike" },
          { id: "c", md: "The right to sell at the strike" },
        ],
        correct: ["a"],
        explain: "Right, not obligation — that asymmetry is what the premium pays for. (The Options portal's Learn tab walks the whole contract.)",
      },
      {
        id: "options-q2",
        kind: "choice",
        prompt: "You're bearish on a stock you don't own. Which instrument expresses that with DEFINED risk?",
        options: [
          { id: "a", md: "A long put — it gains as the stock falls, and the premium is the most you can lose" },
          { id: "b", md: "A short sale — cheaper and simpler" },
          { id: "c", md: "A call option" },
        ],
        correct: ["a"],
        explain: "A put is the bearish bet with a floor under the damage — unlike a short, whose loss has no ceiling. It's the bet the fund itself can't make.",
      },
      {
        id: "options-q3",
        kind: "choice",
        prompt: "The MOST an option buyer can ever lose is…",
        options: [
          { id: "a", md: "The premium paid" },
          { id: "b", md: "The strike price" },
          { id: "c", md: "Unlimited" },
        ],
        correct: ["a"],
        explain: "Buying options is defined-risk by construction: worst case, the contract expires worthless and the premium is gone.",
      },
      {
        id: "options-q4",
        kind: "numeric",
        unit: "cents",
        prompt: "You buy a $50-strike call for a $3 premium. At what stock price (in dollars) do you break even at expiry?",
        answer: 5300,
        placeholder: "53.00",
        explain: "Strike + premium: $50 + $3 = $53. Below that at expiry, the trade lost money even if the option finished in the money.",
      },
      {
        id: "options-q5",
        kind: "choice",
        prompt: "A covered call (own 100 shares, sell a call against them) trades away…",
        options: [
          { id: "a", md: "The upside above the strike — in exchange for premium income now" },
          { id: "b", md: "The dividend" },
          { id: "c", md: "Nothing; it's free income" },
        ],
        correct: ["a"],
        explain: "Income today, capped upside tomorrow. If the stock rips past the strike, the shares get called away at the strike.",
      },
      {
        id: "options-q6",
        kind: "choice",
        prompt: "Selling a cash-secured put means…",
        options: [
          { id: "a", md: "You're paid a premium NOW for the obligation to buy at the strike if assigned" },
          { id: "b", md: "You can't lose money — the cash secures it" },
          { id: "c", md: "You're betting the stock rises fast" },
        ],
        correct: ["a"],
        explain: "It's getting paid to wait for a price you already wanted — with the obligation attached if the market gets there.",
      },
      {
        id: "options-q7",
        kind: "choice",
        prompt: "Implied volatility (IV) is…",
        options: [
          { id: "a", md: "The market's own forecast of future swings, read out of option prices — when it spikes, the market is bracing" },
          { id: "b", md: "How much the stock moved last year" },
          { id: "c", md: "A measure of trading volume" },
        ],
        correct: ["a"],
        explain: "Historical volatility describes the past; IV is the priced-in forecast. Course 5's sizing lesson called it the market's weather report.",
      },
      {
        id: "options-q8",
        kind: "choice",
        prompt: "Can GRQ's real fund trade any of this?",
        options: [
          { id: "a", md: "No — the options ban is a toggle that ships OFF, and the broker seam rejects option orders while it stays off" },
          { id: "b", md: "Yes, up to 5% of NAV" },
          { id: "c", md: "Yes, but only covered calls" },
        ],
        correct: ["a"],
        explain: "The desk and the portal are sandboxes — modeled, never the fund. The ban is one of the hard rules only humans can change.",
      },
    ],
  },
  {
    courseSlug: "the-long-game",
    version: 1,
    passPct: 80,
    questions: [
      {
        id: "the-long-game-q1",
        kind: "numeric",
        unit: "years",
        prompt: "Rule of 72: at a 7% annual return, roughly how many years to double your money?",
        answer: 10,
        tolerance: 1,
        placeholder: "10",
        explain: "72 ÷ 7 ≈ 10 years. Thirty years is three doublings — 8×. Time does the heavy lifting.",
        reviewLesson: "compounding",
      },
      {
        id: "the-long-game-q2",
        kind: "choice",
        prompt: "One percentage point of annual return, compounded over 30 years, is…",
        options: [
          { id: "a", md: "Roughly the difference between 8× and 10× your money — small rate gaps become enormous outcome gaps" },
          { id: "b", md: "About 1% more money" },
          { id: "c", md: "Impossible to estimate" },
        ],
        correct: ["a"],
        explain: "That's the entire punchline of the fees lesson: anything that shaves your RATE — fees, taxes, churn — compounds against you forever.",
        reviewLesson: "compounding",
      },
      {
        id: "the-long-game-q3",
        kind: "choice",
        prompt: "“Did we make money?” is the wrong question. The right one is…",
        options: [
          { id: "a", md: "“Did we beat just buying XIC?” — the do-nothing alternative is the opponent" },
          { id: "b", md: "“Did we beat inflation?”" },
          { id: "c", md: "“Did we beat last year?”" },
        ],
        correct: ["a"],
        explain: "In a +10% year, a fund that made 8% lost the game — worse than nothing, with extra steps. The couch stays on screen.",
        reviewLesson: "the-benchmark",
      },
      {
        id: "the-long-game-q4",
        kind: "choice",
        prompt: "The fund posts a hot quarter, well ahead of XIC. What does that prove?",
        options: [
          { id: "a", md: "Little — a hot quarter is luck until YEARS of scorekeeping say otherwise" },
          { id: "b", md: "The strategy works" },
          { id: "c", md: "It's time to increase position sizes" },
        ],
        correct: ["a"],
        explain: "Which is why the fund keeps score in public and grades its own calls after the fact. Beating the couch is hard; assuming it is marketing.",
        reviewLesson: "the-benchmark",
      },
      {
        id: "the-long-game-q5",
        kind: "choice",
        prompt: "A 2% MER against a 10% annual return is really…",
        options: [
          { id: "a", md: "A fifth of your growth, taken every year, forever — over 30 years it can eat a third of the pot" },
          { id: "b", md: "Trivial — 2% is a small number" },
          { id: "c", md: "A one-time setup cost" },
        ],
        correct: ["a"],
        explain: "Costs compound in reverse. Nothing about your portfolio works as relentlessly as its fees.",
        reviewLesson: "fee-gravity-and-tax-drag",
      },
      {
        id: "the-long-game-q6",
        kind: "choice",
        prompt: "The TFSA's fine print that GRQ's cadence has to respect:",
        options: [
          { id: "a", md: "CRA can reclassify a DAY-TRADING TFSA as a business — gains taxed after all" },
          { id: "b", md: "TFSAs can't hold US stocks" },
          { id: "c", md: "Gains over $10k are taxed" },
        ],
        correct: ["a"],
        explain: "Tax-free has a tempo limit: trade a TFSA like a business and it gets taxed like one. Shelter first, but mind the cadence.",
        reviewLesson: "fee-gravity-and-tax-drag",
      },
      {
        id: "the-long-game-q7",
        kind: "choice",
        prompt: "Why does the average fund INVESTOR earn less than the average FUND?",
        options: [
          { id: "a", md: "Their own timing — piling in after runs, bailing at bottoms" },
          { id: "b", md: "Management fees" },
          { id: "c", md: "Taxes" },
        ],
        correct: ["a"],
        explain: "The leading cause of portfolio death isn't crashes — it's what investors DO during them. The only proven defense: rules written in advance.",
        reviewLesson: "behavioural-traps",
      },
      {
        id: "the-long-game-q8",
        kind: "choice",
        prompt: "You're down 15% on a stock whose thesis has BROKEN. You're also emotionally attached. The discipline says…",
        options: [
          { id: "a", md: "Sell — a broken thesis is a sell whether you're up or down; your entry price is a sunk cost" },
          { id: "b", md: "Hold until you're back to even, then sell" },
          { id: "c", md: "Average down — it's cheaper now" },
        ],
        correct: ["a"],
        explain: "“I just don't want to realize it” is loss aversion talking. The market doesn't know your entry price and doesn't care.",
        reviewLesson: "when-to-sell",
      },
    ],
  },
  {
    courseSlug: "how-grq-works",
    version: 1,
    passPct: 80,
    questions: [
      {
        id: "how-grq-works-q1",
        kind: "choice",
        prompt: "Why route every order through a deterministic gate instead of trusting a well-aligned AI?",
        options: [
          { id: "a", md: "A bad idea has to get past something that CANNOT be talked into it — separation of powers, in code" },
          { id: "b", md: "Regulations require it" },
          { id: "c", md: "The gate trades faster than the AI" },
        ],
        correct: ["a"],
        explain: "An AI's failure modes (overconfidence, a persuasive bad idea, a misread number) are exactly what a rule that doesn't parse eloquence defends against.",
        reviewLesson: "proposes-disposes",
      },
      {
        id: "how-grq-works-q2",
        kind: "choice",
        prompt: "The kill switch: who holds it, and what does it do?",
        options: [
          { id: "a", md: "Either member can flip it, instantly — and NOTHING trades while it's engaged" },
          { id: "b", md: "Only Cam; it pauses buys but allows sells" },
          { id: "c", md: "Alfred, when it detects danger" },
        ],
        correct: ["a"],
        explain: "Checked before every order, inside the order path itself. Both members hold it; no order path bypasses it.",
        reviewLesson: "proposes-disposes",
      },
      {
        id: "how-grq-works-q3",
        kind: "numeric",
        unit: "pct",
        prompt: "**Field trip:** Alfred can't buy below a conviction bar — a minimum confidence score. Find the live value on this course's guardrails dials (or How it works). What is it?",
        answer: 70,
        placeholder: "70",
        explain: "The bar is 70 (lowered from 75 in D95 — a documented, human-made change). Alfred must put a number on its sureness, and the gate holds it to that number.",
        reviewLesson: "guardrails-as-risk",
      },
      {
        id: "how-grq-works-q4",
        kind: "numeric",
        unit: "cents",
        prompt: "The 3× rule: a trade's round-trip commissions are $2. What's the minimum the thesis must be worth (in dollars) for the gate to let it through?",
        answer: 600,
        placeholder: "6.00",
        explain: "3 × $2.00 = $6.00. Small accounts don't die of bad picks; they bleed out in costs — so the gate does the arithmetic first.",
        reviewLesson: "guardrails-as-risk",
      },
      {
        id: "how-grq-works-q5",
        kind: "choice",
        prompt: "Why does the gate refuse NEW entries in the first and last 15 minutes of the session?",
        options: [
          { id: "a", md: "The tape is at its most emotional at the open and close" },
          { id: "b", md: "The exchange charges more then" },
          { id: "c", md: "Quotes are delayed then" },
        ],
        correct: ["a"],
        explain: "A behavioural rule, enforced mechanically — Course 7's “decide in advance,” applied to the clock.",
        reviewLesson: "guardrails-as-risk",
      },
      {
        id: "how-grq-works-q6",
        kind: "choice",
        prompt: "Beyond XIC, what's the second hurdle GRQ's scoreboard is required to print?",
        options: [
          { id: "a", md: "The fund's own OPERATING COSTS — the AI and data subscriptions it must out-earn" },
          { id: "b", md: "The S&P 500" },
          { id: "c", md: "Inflation" },
        ],
        correct: ["a"],
        explain: "A small fund can beat the couch and still be underwater after its own running costs. The honest exit is scale and patience — never bigger risk.",
        reviewLesson: "the-scoreboard",
      },
      {
        id: "how-grq-works-q7",
        kind: "choice",
        prompt: "A name just got PROMOTED into the tradeable universe. Can Alfred now buy it freely?",
        options: [
          { id: "a", md: "No — promotion only makes it ELIGIBLE; every order still clears the full gate" },
          { id: "b", md: "Yes — promotion is the approval" },
          { id: "c", md: "Yes, but only small sizes" },
        ],
        correct: ["a"],
        explain: "Promotion needs a genuine Buy at/above the conviction bar plus the liquidity screen — and it still only buys a ticket to stand in front of the gate.",
        reviewLesson: "receipts-before-trades",
      },
      {
        id: "how-grq-works-q8",
        kind: "choice",
        prompt: "What does “clean” mean in the soak's “4 clean weeks”?",
        options: [
          { id: "a", md: "Defined, not vibed: no blown guardrails, no phantom P&L, books reconciled against the broker daily" },
          { id: "b", md: "No losing days" },
          { id: "c", md: "No code changes" },
        ],
        correct: ["a"],
        explain: "Profitability isn't the bar — correctness is. Every bug found on paper is a bug that never touches money.",
        reviewLesson: "the-soak",
      },
    ],
  },
];

export function examForCourse(courseSlug: string): LearnExam | undefined {
  return EXAMS.find((e) => e.courseSlug === courseSlug);
}

export type GradedQuestion = {
  id: string;
  ok: boolean;
  /** The correct answer, human-readable — revealed post-submit (formative spirit). */
  expected: string;
  explain: string;
  reviewLesson?: string;
};

export type GradedExam = {
  scorePct: number; // integer 0–100
  passed: boolean;
  results: GradedQuestion[];
};

/** Grade a full submission server-side. Unanswered questions grade as wrong. */
export function gradeExam(exam: LearnExam, answers: Record<string, string | string[] | undefined>): GradedExam {
  const results: GradedQuestion[] = exam.questions.map((q) => {
    const raw = answers[q.id];
    let ok = false;
    let expected: string;
    if (q.kind === "choice") {
      const given = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" && raw ? [raw] : [];
      ok = choiceCorrect(q, given);
      expected = q.correct
        .map((id) => q.options.find((o) => o.id === id)?.md ?? id)
        .join(" · ");
    } else {
      ok = typeof raw === "string" ? numericCorrect(q, raw) : false;
      expected = formatNumeric(q.unit, q.answer);
      if (q.tolerance) expected += ` (±${q.tolerance})`;
    }
    return { id: q.id, ok, expected, explain: q.explain, reviewLesson: q.reviewLesson };
  });
  const points = results.filter((r) => r.ok).length;
  const scorePct = Math.round((points * 100) / exam.questions.length);
  return { scorePct, passed: scorePct >= exam.passPct, results };
}
