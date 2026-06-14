import { getCloses } from "../lib/bars";

// Signals v1 (Graham's layer, 2.5d): deterministic technicals computed from
// daily bars. Signals ADVISE — the agent decides, the gate disposes (D11).
// Each family is a "source" in the scoreboard: retros grade its hit-rate.

export type SignalFamily = {
  family: "trend" | "rsi" | "macd" | "volatility";
  signal: "BUY" | "SELL" | "HOLD";
  confidence: number; // 0–100
  rationale: string;
};

export type Signals = {
  symbol: string;
  asOf: string; // last bar date YYYY-MM-DD
  lastCloseCents: number;
  families: SignalFamily[];
};

function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  let s = 0;
  for (let i = values.length - n; i < values.length; i++) s += values[i];
  return s / n;
}

function emaSeries(values: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rsi14(values: number[]): number | null {
  const n = 14;
  if (values.length < n + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= n;
  avgLoss /= n;
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgGain = (avgGain * (n - 1) + Math.max(0, d)) / n;
    avgLoss = (avgLoss * (n - 1) + Math.max(0, -d)) / n;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export async function computeSignals(symbol: string): Promise<Signals | null> {
  const bars = await getCloses(symbol, 260);
  if (bars.length < 30) return null;
  const closes = bars.map((b) => b.closeCents);
  const price = closes[closes.length - 1];
  const families: SignalFamily[] = [];

  // Trend — SMA stack
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  if (s50 !== null) {
    const above50 = price > s50;
    const stack = s200 !== null ? (s50 > s200 ? "50>200 (uptrend)" : "50<200 (downtrend)") : "no 200d yet";
    let signal: SignalFamily["signal"] = "HOLD";
    if (above50 && (s200 === null || s50 > s200)) signal = "BUY";
    if (!above50 && s200 !== null && s50 < s200) signal = "SELL";
    const spreadPct = Math.abs((price - s50) / s50) * 100;
    families.push({
      family: "trend",
      signal,
      confidence: Math.min(90, Math.round(30 + spreadPct * 10)),
      rationale: `price ${above50 ? "above" : "below"} SMA50 (${(s50 / 100).toFixed(2)}), SMA ${stack}${s20 !== null ? `, SMA20 ${(s20 / 100).toFixed(2)}` : ""}`,
    });
  }

  // RSI(14)
  const r = rsi14(closes);
  if (r !== null) {
    const signal = r < 30 ? "BUY" : r > 70 ? "SELL" : "HOLD";
    families.push({
      family: "rsi",
      signal,
      confidence: Math.min(90, Math.round(Math.abs(r - 50) * 1.8)),
      rationale: `RSI(14) = ${r.toFixed(0)} (${r < 30 ? "oversold" : r > 70 ? "overbought" : "neutral"})`,
    });
  }

  // MACD(12,26,9)
  if (closes.length >= 35) {
    const e12 = emaSeries(closes, 12);
    const e26 = emaSeries(closes, 26);
    const macdLine = e12.map((v, i) => v - e26[i]);
    const signalLine = emaSeries(macdLine, 9);
    const hist = macdLine[macdLine.length - 1] - signalLine[signalLine.length - 1];
    const histPrev = macdLine[macdLine.length - 2] - signalLine[signalLine.length - 2];
    const signal = hist > 0 && hist > histPrev ? "BUY" : hist < 0 && hist < histPrev ? "SELL" : "HOLD";
    families.push({
      family: "macd",
      signal,
      confidence: Math.min(85, Math.round(35 + Math.abs((hist / price) * 10_000))),
      rationale: `histogram ${(hist / 100).toFixed(2)} and ${hist > histPrev ? "rising" : "falling"}`,
    });
  }

  // Realized volatility (20d, annualized) — regime info, not directional
  if (closes.length >= 22) {
    const rets: number[] = [];
    for (let i = closes.length - 21; i < closes.length; i++) {
      rets.push(Math.log(closes[i] / closes[i - 1]));
    }
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1));
    const annPct = sd * Math.sqrt(252) * 100;
    families.push({
      family: "volatility",
      signal: "HOLD",
      confidence: 50,
      rationale: `20d realized vol ≈ ${annPct.toFixed(0)}%/yr (${annPct < 15 ? "calm" : annPct < 30 ? "normal" : "spicy"})`,
    });
  }

  return {
    symbol: symbol.toUpperCase(),
    asOf: bars[bars.length - 1].date.toISOString().slice(0, 10),
    lastCloseCents: price,
    families,
  };
}

/** One-line summary for context blocks. */
export function signalsOneLine(s: Signals): string {
  return s.families.map((f) => `${f.family} ${f.signal}${f.family === "volatility" ? ` (${f.rationale.split("≈ ")[1] ?? ""})` : ""}`).join(" · ");
}

export type Recommendation = {
  signal: "BUY" | "SELL" | "HOLD"; // coarse call (kept for coloring / back-compat)
  label: string; // Strong Buy · Buy · Weak Buy · Hold · Weak Sell · Sell · Strong Sell
  score: number; // 0–10 dial position (5 = neutral)
  ratio: number; // signed conviction, −1..+1
  confidence: number; // |ratio| × 100
  rationale: string;
};

const DIRECTIONAL: SignalFamily["family"][] = ["trend", "rsi", "macd"];

/** Graded label from the signed conviction ratio (−1..+1). */
function gradeLabel(ratio: number): string {
  if (ratio >= 0.55) return "Strong Buy";
  if (ratio >= 0.25) return "Buy";
  if (ratio >= 0.1) return "Weak Buy";
  if (ratio > -0.1) return "Hold";
  if (ratio > -0.25) return "Weak Sell";
  if (ratio > -0.55) return "Sell";
  return "Strong Sell";
}

/** Deterministic technical consensus across the directional families
 *  (volatility is regime, not direction, so it's excluded). Confidence-weighted
 *  vote → BUY/SELL/HOLD with a HOLD dead-zone. ADVISORY ONLY: signals advise,
 *  the agent decides, the gate disposes (D11) — this is not the agent's call. */
export function overallSignal(s: Signals): Recommendation {
  const fams = s.families.filter((f) => DIRECTIONAL.includes(f.family));
  if (fams.length === 0)
    return { signal: "HOLD", label: "Hold", score: 5, ratio: 0, confidence: 0, rationale: "no directional signals" };
  let acc = 0;
  let weight = 0;
  for (const f of fams) {
    const sign = f.signal === "BUY" ? 1 : f.signal === "SELL" ? -1 : 0;
    acc += sign * f.confidence;
    weight += f.confidence;
  }
  let ratio = weight > 0 ? acc / weight : 0; // -1..+1
  const tally = (sig: string) => fams.filter((f) => f.signal === sig).map((f) => f.family);
  const buys = tally("BUY");
  const sells = tally("SELL");

  // Honesty cap: a "Strong" call requires no active dissent. If a directional
  // signal points the other way (e.g. RSI SELL under a BUY), it's at most a
  // plain Buy/Sell — never "Strong" — and we pull the dial out of the extreme
  // band so the needle and the label agree. A split read is not a strong read.
  let label = gradeLabel(ratio);
  let split = false;
  if (label === "Strong Buy" && sells.length > 0) {
    label = "Buy";
    ratio = Math.min(ratio, 0.54);
    split = true;
  } else if (label === "Strong Sell" && buys.length > 0) {
    label = "Sell";
    ratio = Math.max(ratio, -0.54);
    split = true;
  }

  const signal: Recommendation["signal"] = ratio >= 0.25 ? "BUY" : ratio <= -0.25 ? "SELL" : "HOLD";
  const parts = (["BUY", "SELL", "HOLD"] as const)
    .map((sig) => (tally(sig).length ? `${sig}: ${tally(sig).join(", ")}` : null))
    .filter(Boolean);
  return {
    signal,
    label,
    score: Math.round(((ratio + 1) / 2) * 10),
    ratio,
    confidence: Math.round(Math.abs(ratio) * 100),
    rationale: parts.join(" · ") + (split ? " · split read (not Strong)" : ""),
  };
}
