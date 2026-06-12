import type { Quote } from "./types";

export interface QuoteSource {
  readonly kind: string;
  get(symbol: string): Quote | null;
  symbols(): string[];
}

type SymState = {
  base: number; // cents — anchor the walk decays toward
  mid: number; // cents
  volBps: number; // per-step volatility in basis points
  spreadBps: number;
  lastTick: number; // ms epoch
};

// Plausible-but-fake TSX universe for Phase 1. Prices are synthetic; Phase 2
// swaps this source for real delayed quotes and this list for a screened one.
const UNIVERSE: Record<string, { base: number; volBps: number; spreadBps: number }> = {
  "RY":   { base: 14500, volBps: 8,  spreadBps: 4 },
  "TD":   { base: 8800,  volBps: 9,  spreadBps: 4 },
  "BNS":  { base: 7500,  volBps: 9,  spreadBps: 5 },
  "ENB":  { base: 5200,  volBps: 8,  spreadBps: 5 },
  "SU":   { base: 5500,  volBps: 12, spreadBps: 6 },
  "CNR":  { base: 16000, volBps: 8,  spreadBps: 5 },
  "BCE":  { base: 3500,  volBps: 9,  spreadBps: 6 },
  "T":    { base: 2300,  volBps: 9,  spreadBps: 8 },
  "SHOP": { base: 13000, volBps: 22, spreadBps: 8 },
  "XIC":  { base: 4200,  volBps: 6,  spreadBps: 3 },
};

function gauss(): number {
  // Box–Muller
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export class SyntheticQuoteSource implements QuoteSource {
  readonly kind = "synthetic";
  private state = new Map<string, SymState>();

  constructor() {
    for (const [sym, cfg] of Object.entries(UNIVERSE)) {
      this.state.set(sym, { ...cfg, mid: cfg.base, lastTick: Date.now() });
    }
  }

  symbols(): string[] {
    return [...this.state.keys()];
  }

  get(symbol: string): Quote | null {
    const s = this.state.get(symbol.toUpperCase());
    if (!s) return null;

    // Advance the walk one step per ~5s elapsed, mean-reverting gently to base
    // so synthetic prices stay plausible across long uptimes.
    const now = Date.now();
    const steps = Math.min(500, Math.floor((now - s.lastTick) / 5000));
    for (let i = 0; i < steps; i++) {
      const shock = gauss() * (s.volBps / 10_000);
      const pull = (s.base - s.mid) / s.base * 0.002;
      s.mid = Math.max(100, Math.round(s.mid * (1 + shock + pull)));
    }
    if (steps > 0) s.lastTick = now;

    const half = Math.max(1, Math.round((s.mid * s.spreadBps) / 10_000 / 2));
    return {
      symbol: symbol.toUpperCase(),
      midCents: s.mid,
      bidCents: s.mid - half,
      askCents: s.mid + half,
      at: new Date(),
    };
  }
}

const globalForQuotes = globalThis as unknown as { grqQuotes?: SyntheticQuoteSource };

export function getQuoteSource(): SyntheticQuoteSource {
  if (!globalForQuotes.grqQuotes) globalForQuotes.grqQuotes = new SyntheticQuoteSource();
  return globalForQuotes.grqQuotes;
}
