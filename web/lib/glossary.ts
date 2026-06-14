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
};
