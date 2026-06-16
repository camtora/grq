// Plain-English definitions for the jargon GRQ puts on screen. The financial-
// literacy pillar (docs/LITERACY.md): every term should be explainable on the
// spot. Keys are lowercase slugs the <Term> component looks up. Static seed for
// the app's own vocabulary; agent-generated explainers for novel concepts come later.

export type GlossaryEntry = { term: string; def: string };

export const GLOSSARY: Record<string, GlossaryEntry> = {
  nav: {
    term: "NAV — Net Asset Value",
    def: "The fund's total worth right now: cash plus the market value of everything it holds.",
  },
  acb: {
    term: "ACB — Adjusted Cost Base",
    def: "Your average cost per share, commissions included. The CRA uses it to figure your capital gain when you sell.",
  },
  "day-pnl": {
    term: "Day P&L",
    def: "How much the fund's value moved today — in dollars and percent — versus where it opened this morning.",
  },
  "total-pnl": {
    term: "Total P&L",
    def: "Profit or loss since day one: current NAV minus every dollar ever contributed.",
  },
  "vs-xic": {
    term: "vs XIC — the benchmark",
    def: "What your contributions would be worth if you'd just bought XIC, an ETF holding the whole TSX. Beating it is the bar GRQ has to clear to justify existing.",
  },
  drawdown: {
    term: "Drawdown",
    def: "How far NAV has fallen from its highest point. Hit −15% and the kill switch trips automatically.",
  },
  "kill-switch": {
    term: "Kill switch",
    def: "A hard stop, enforced in code, that halts all trading instantly. Either member can flip it; nothing trades while it's engaged.",
  },
  "cash-floor": {
    term: "Cash floor",
    def: "The minimum share of NAV that must stay in cash, so the fund is never fully committed. Set by the risk dial.",
  },
  "superficial-loss": {
    term: "Superficial-loss rule",
    def: "A CRA rule: sell at a loss and rebuy the same name within 30 days and the loss is denied. The agent is barred from tripping it.",
  },
  "round-trip": {
    term: "Round-trip cost",
    def: "Commission to buy plus commission to sell. A trade has to be worth at least 3× this to be allowed — fees are the enemy of a small account.",
  },
  rsi: {
    term: "RSI — Relative Strength Index",
    def: "A 0–100 momentum gauge. Below 30 is 'oversold' (maybe due for a bounce), above 70 'overbought'. An input, not a verdict.",
  },
  macd: {
    term: "MACD",
    def: "Moving Average Convergence Divergence — tracks whether short-term momentum is pulling ahead of, or falling behind, the longer trend.",
  },
  sma: {
    term: "SMA — Simple Moving Average",
    def: "The average closing price over the last N days (SMA50 ≈ 10 weeks). Smooths out daily noise to show the underlying trend.",
  },
  trend: {
    term: "Trend (SMA stack)",
    def: "Up- or down-trend read from the moving averages: price above its 50-day average, and the 50-day above the 200-day, is the classic 'uptrend' stack.",
  },
  volatility: {
    term: "Volatility (realized)",
    def: "How much the price swings, annualized from the last ~20 days — a regime gauge (calm / normal / spicy), not a buy/sell signal. It tells you how bumpy the ride is.",
  },
  recommendation: {
    term: "Recommendation",
    def: "A confidence-weighted consensus of the directional signals (trend, rsi, macd). The % is the share of signal-confidence behind the call — advisory, not the agent's decision.",
  },
  dossier: {
    term: "Dossier",
    def: "A deep research write-up the agent files on one stock: the business, recent news, signals, bull and bear case, and a verdict.",
  },
  soak: {
    term: "Soak",
    def: "The trial run: the fund must trade clean for 4+ weeks (2 of them on real broker paper) before a single real dollar is at risk.",
  },
  contributions: {
    term: "Contributions",
    def: "Every dollar Cam and Graham have put into the fund. Total P&L and the benchmark are both measured against this — it's the money that had to be beaten.",
  },
  "fee-budget": {
    term: "Fee budget",
    def: "A hard monthly ceiling on commissions. The order gate rejects any trade that would push this month's fees over the line — fees quietly kill small accounts.",
  },
  "market-value": {
    term: "Market value",
    def: "What a holding is worth right now: shares held × the latest price. Add them all up, plus cash, and you get NAV.",
  },
  "unrealized-pnl": {
    term: "Unrealized P&L",
    def: "Paper profit or loss on a holding you still own — what you'd lock in if you sold at the current price. It isn't real until you sell.",
  },
  weight: {
    term: "Weight",
    def: "How much of the fund one position is, as a share of NAV. The risk dial caps it so no single name can sink the whole boat.",
  },
  position: {
    term: "Position",
    def: "A holding: the shares of one stock the fund currently owns, with an average cost and a current value.",
  },
  "market-cap": {
    term: "Market cap",
    def: "A company's total stock-market value: share price × shares outstanding. Roughly what it would cost to buy the whole company.",
  },
  "free-cash-flow": {
    term: "Free cash flow",
    def: "The cash a business actually generates after running costs and reinvestment — money it's free to return to owners or stockpile. Harder to fake than reported earnings.",
  },
  "dividend-yield": {
    term: "Dividend yield",
    def: "The annual dividend as a percent of the share price. A $2 dividend on a $50 stock yields 4%.",
  },
  "short-interest": {
    term: "Short interest",
    def: "The share of a stock that traders have borrowed and sold, betting it falls. High short interest signals bearishness — and can fuel a sharp 'short squeeze' if the price rises instead.",
  },
  dilution: {
    term: "Dilution",
    def: "When a company issues new shares, each existing share owns a smaller slice. Common with cash-hungry small-caps — it can quietly erode your stake even as the business grows.",
  },
  "stop-loss": {
    term: "Stop-loss",
    def: "A pre-set exit: if a holding falls to this price, the agent sells to cap the damage. The level is set by the risk dial (e.g. −8% on Balanced).",
  },
  "take-profit": {
    term: "Take-profit",
    def: "The mirror of a stop: a pre-set level where the agent banks a winner so a paper gain doesn't evaporate. Also set by the risk dial.",
  },
  "expected-return": {
    term: "Expected return",
    def: "The upside the agent's price target implies from today's price — a hypothesis with a horizon, not a promise. The track record builds as targets resolve.",
  },
  "price-target": {
    term: "Price target",
    def: "Where the agent thinks a stock could trade — a near-term swing target and a 12-month view. The basis for expected return, judged honestly when it plays out.",
  },
  commission: {
    term: "Commission",
    def: "The broker's fee per trade. Small but relentless: GRQ won't take a trade unless it's worth at least 3× the round-trip commissions.",
  },
  moat: {
    term: "Economic moat",
    def: "A durable advantage that protects a company's profits from competitors — brand, network effects, low costs, switching costs. Wide moats compound for years.",
  },
  pe: {
    term: "P/E — Price-to-Earnings",
    def: "Share price divided by annual earnings per share — how many years of current profit you're paying for. High P/E = the market expects growth; low = skepticism or value.",
  },
  etf: {
    term: "ETF — Exchange-Traded Fund",
    def: "A basket of stocks bought as one ticker. XIC, for instance, holds the whole TSX — instant diversification in a single trade.",
  },
  "swing-trade": {
    term: "Swing trade",
    def: "Holding for days to a few weeks to catch a price 'swing' — longer than day-trading, shorter than buy-and-hold. GRQ's core style.",
  },
  confidence: {
    term: "Confidence",
    def: "How sure the agent (or a signal) is about a call, 0–100. A self-assessment, not a probability — and the agent needs ≥75% conviction before the gate will let it buy.",
  },
  "the-tape": {
    term: "The Tape",
    def: "The fund's value through the trading day, open to now — the intraday line of NAV. (Old trading-floor slang: the ticker 'tape' that printed live prices.)",
  },
  "agent-call": {
    term: "The agent's call",
    def: "The agent's own judgment on a name — buy, accumulate, hold, watch, trim, avoid, or sell — weighing the business, the news, and the price. Distinct from the signal consensus (a technicals formula); when the two disagree, the 'why' below explains it.",
  },
  universe: {
    term: "The universe",
    def: "The list of stocks the agent is allowed to buy. A name joins by being promoted from the watchlist — which takes both members plus an automated liquidity screen. The agent can propose; only humans change the universe.",
  },
  watchlist: {
    term: "Watchlist",
    def: "Names you're tracking but not yet investing in. The agent researches every watchlist name (a dossier, signals, its call), but it can't trade one until you both promote it into the universe.",
  },
  "analyst-target": {
    term: "Analyst consensus target",
    def: "The average 12-month price target from the Wall Street analysts who cover the stock. A useful outside check on the agent's call — when the agent and the street sharply disagree, it's worth asking who's right.",
  },
  "capital-gains": {
    term: "Capital gains tax",
    def: "Tax on the profit when you sell for more than you paid. In Canada (non-registered accounts), half the gain is taxable at your marginal rate — so a 10% gain is worth less after tax. Inside a TFSA, gains are tax-free.",
  },
  tfsa: {
    term: "TFSA — Tax-Free Savings Account",
    def: "A registered account where investment gains are tax-free. The catch: trade too actively and the CRA can reclassify it as a business and tax everything — so a swing-trade cadence (not day-trading) matters.",
  },
  rrsp: {
    term: "RRSP — Registered Retirement Savings Plan",
    def: "A registered account: contributions reduce this year's taxable income and growth is tax-deferred — you pay tax as income when you withdraw in retirement.",
  },
};
