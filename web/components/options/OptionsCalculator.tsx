"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui";
import Term from "@/components/Term";
import PayoffChart from "./PayoffChart";
import PnlTable from "./PnlTable";
import GreeksChart from "./GreeksChart";
import {
  STRATEGIES,
  STRATEGY_LIST,
  isStrategyKey,
  optionTemplates,
  hasStock,
  seedLegs,
  buildStrategyLegs,
  type StrategyKey,
} from "@/lib/options/strategies";
import { payoffStats, reservedCashCents, type Leg } from "@/lib/options/payoff";
import { netGreeks, type GreekLeg } from "@/lib/options/greeks";
import { blackScholesCents } from "@/lib/options/price";

// The payoff calculator (docs/OPTIONS-PORTAL.md). Pick a strategy (single- or multi-leg), edit each
// leg (or load a real US chain), and read the payoff shape, stats, Greeks, and the P/L table. All
// MODELED + educational — never executable. Scenarios save to localStorage (per-browser).
type ChainContract = { expiry: string; dte: number; right: "CALL" | "PUT"; strikeCents: number; midCents: number; ivFrac: number | null; delta: number; oi: number };
type ChainResp = { symbol: string; spotCents: number | null; expiries: { expiry: string; dte: number }[]; contracts: ChainContract[]; note?: string };
type LegDollars = { strike: number; premium: number };
type Scenario = { name: string; strat: StrategyKey; ticker: string; spot: number; ivPct: number; dte: number; contracts: number; legs: LegDollars[] };
const LS_KEY = "grq.options.scenarios";

const fmt$ = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const fmtSigned$ = (cents: number) => (cents >= 0 ? "+" : "−") + fmt$(Math.abs(cents));
const round2 = (n: number) => Math.round(n * 100) / 100;

function seedDollars(strat: StrategyKey, spotCents: number, ivFrac: number, dte: number): LegDollars[] {
  return seedLegs(STRATEGIES[strat], spotCents, ivFrac, dte).map((v) => ({ strike: v.strikeCents / 100, premium: round2(Math.max(0.01, v.premiumCents / 100)) }));
}
function strikesFor(chain: ChainResp, expiry: string, right: "CALL" | "PUT"): number[] {
  return [...new Set(chain.contracts.filter((c) => c.expiry === expiry && c.right === right).map((c) => c.strikeCents))].sort((a, b) => a - b);
}
function pickFromChain(chain: ChainResp, expiry: string, right: "CALL" | "PUT", targetCents: number): ChainContract | null {
  const pool = chain.contracts.filter((c) => c.expiry === expiry && c.right === right);
  return pool.length ? pool.reduce((b, c) => (Math.abs(c.strikeCents - targetCents) < Math.abs(b.strikeCents - targetCents) ? c : b)) : null;
}

export default function OptionsCalculator({ initial }: { initial: { strat?: string; sym?: string; strike?: string; exp?: string } }) {
  const initStrat: StrategyKey = isStrategyKey(initial.strat) ? initial.strat : "long-call";
  const [strat, setStrat] = useState<StrategyKey>(initStrat);
  const [ticker, setTicker] = useState(initial.sym ?? "");
  const [chain, setChain] = useState<ChainResp | null>(null);
  const [chainExpiry, setChainExpiry] = useState("");
  const [loading, setLoading] = useState(false);
  const [chainErr, setChainErr] = useState<string | null>(null);

  const [spot, setSpot] = useState(100);
  const [ivPct, setIvPct] = useState(40);
  const [dte, setDte] = useState(45);
  const [contracts, setContracts] = useState(1);
  const [legVals, setLegVals] = useState<LegDollars[]>(() => {
    const seeded = seedDollars(initStrat, 10000, 0.4, 45);
    if (initial.strike && Number.isFinite(Number(initial.strike)) && seeded[0]) seeded[0] = { ...seeded[0], strike: Number(initial.strike) };
    return seeded;
  });
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  const spec = STRATEGIES[strat];
  const optTpls = optionTemplates(spec);
  const spotCents = Math.round(spot * 100);
  const ivFrac = ivPct / 100;

  const legs: Leg[] = useMemo(
    () => buildStrategyLegs(spec, { spotCents, ivFrac, dte, contracts, legs: legVals.map((v) => ({ strikeCents: Math.round(v.strike * 100), premiumCents: Math.round(v.premium * 100) })) }),
    [spec, spotCents, ivFrac, dte, contracts, legVals],
  );
  const stats = useMemo(() => payoffStats(legs, spotCents), [legs, spotCents]);
  const reserved = useMemo(() => reservedCashCents(legs), [legs]);
  const greeks = useMemo(() => {
    const gl: GreekLeg[] = legs.map((l) =>
      l.kind === "STOCK" ? { kind: "STOCK", action: l.action, qty: l.qty } : { kind: l.kind, action: l.action, qty: l.qty, strikeCents: l.strikeCents, multiplier: l.multiplier, ivFrac: l.ivFrac, daysLeft: dte },
    );
    return netGreeks(gl, spotCents);
  }, [legs, spotCents, dte]);

  useEffect(() => {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) setScenarios(JSON.parse(raw)); } catch {}
  }, []);

  const setLeg = (i: number, patch: Partial<LegDollars>) => setLegVals((prev) => prev.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));

  const switchStrategy = (key: StrategyKey) => {
    setStrat(key);
    if (!chain) { setLegVals(seedDollars(key, spotCents, ivFrac, dte)); return; }
    const s = chain.spotCents ?? spotCents;
    setLegVals(
      optionTemplates(STRATEGIES[key]).map((t) => {
        const picked = pickFromChain(chain, chainExpiry, t.kind, Math.round(s * (1 + t.strikeOffset)));
        return picked ? { strike: picked.strikeCents / 100, premium: round2(Math.max(0.01, picked.midCents / 100)) } : { strike: spot, premium: 1 };
      }),
    );
  };

  const fairPremium = (i: number) => {
    const t = optTpls[i];
    if (!t) return;
    const fair = blackScholesCents(t.kind, spotCents, Math.round((legVals[i]?.strike ?? spot) * 100), ivFrac, Math.max(0, dte) / 365) / 100;
    setLeg(i, { premium: round2(Math.max(0.01, fair)) });
  };

  // rebuild every option leg from a chain at a given expiry (leg 0 can honor a deep-linked strike)
  function applyChainToLegs(data: ChainResp, expiry: string, leg0StrikeCents?: number) {
    const s = data.spotCents ?? spotCents;
    let iv: number | null = null;
    const next = optTpls.map((t, i) => {
      const target = i === 0 && leg0StrikeCents ? leg0StrikeCents : Math.round(s * (1 + t.strikeOffset));
      const picked = pickFromChain(data, expiry, t.kind, target);
      if (picked) { if (iv == null && picked.ivFrac) iv = picked.ivFrac; return { strike: picked.strikeCents / 100, premium: round2(Math.max(0.01, picked.midCents / 100)) }; }
      return legVals[i] ?? { strike: spot, premium: 1 };
    });
    setLegVals(next);
    if (iv != null) setIvPct(Math.round(iv * 1000) / 10);
    const dteOf = data.expiries.find((e) => e.expiry === expiry)?.dte;
    if (dteOf != null) setDte(dteOf);
  }

  async function loadChain(target?: { exp?: string; strikeCents?: number }) {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setLoading(true); setChainErr(null);
    try {
      const res = await fetch(`/api/options/chain/${encodeURIComponent(t)}`);
      const data = (await res.json()) as ChainResp;
      if (!data.spotCents) { setChain(null); setChainErr(data.note ?? "No listed US options for that name."); return; }
      setChain(data);
      setSpot(data.spotCents / 100);
      const exp = target?.exp && data.expiries.some((e) => e.expiry === target.exp)
        ? data.expiries.find((e) => e.expiry === target.exp)!
        : data.expiries.reduce((b, e) => (Math.abs(e.dte - 45) < Math.abs(b.dte - 45) ? e : b), data.expiries[0]);
      setChainExpiry(exp.expiry);
      applyChainToLegs(data, exp.expiry, target?.strikeCents);
    } catch { setChainErr("Couldn't reach the chain feed."); }
    finally { setLoading(false); }
  }

  // Changing expiry keeps each leg's chosen STRIKE and re-prices it (+ updates DTE) at the new expiry.
  const onExpiry = (v: string) => {
    if (!chain) return;
    setChainExpiry(v);
    setLegVals(
      optTpls.map((t, i) => {
        const picked = pickFromChain(chain, v, t.kind, Math.round((legVals[i]?.strike ?? spot) * 100));
        return picked ? { strike: picked.strikeCents / 100, premium: round2(Math.max(0.01, picked.midCents / 100)) } : legVals[i] ?? { strike: spot, premium: 1 };
      }),
    );
    const dteOf = chain.expiries.find((e) => e.expiry === v)?.dte;
    if (dteOf != null) setDte(dteOf);
  };

  const pickLegStrike = (i: number, strikeCents: number) => {
    if (!chain) return;
    const picked = pickFromChain(chain, chainExpiry, optTpls[i].kind, strikeCents);
    if (picked) setLeg(i, { strike: picked.strikeCents / 100, premium: round2(Math.max(0.01, picked.midCents / 100)) });
  };

  useEffect(() => {
    if (initial.sym) loadChain({ exp: initial.exp, strikeCents: initial.strike ? Math.round(Number(initial.strike) * 100) : undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (list: Scenario[]) => { setScenarios(list); try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch {} };
  const saveScenario = () => {
    const name = window.prompt("Name this scenario:", `${spec.name}${ticker ? " · " + ticker.toUpperCase() : ""}`)?.trim();
    if (!name) return;
    persist([...scenarios.filter((s) => s.name !== name), { name, strat, ticker, spot, ivPct, dte, contracts, legs: legVals }]);
  };
  const loadScenario = (s: Scenario) => {
    setChain(null); setChainErr(null); setChainExpiry("");
    setStrat(s.strat); setTicker(s.ticker); setSpot(s.spot); setIvPct(s.ivPct); setDte(s.dte); setContracts(s.contracts); setLegVals(s.legs);
  };

  const NumField = ({ label, term, value, set, step = 1, min = 0, prefix }: { label: string; term?: string; value: number; set: (n: number) => void; step?: number; min?: number; prefix?: string }) => (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wider text-teal-200/50">{term ? <Term k={term}>{label}</Term> : label}</span>
      <div className="flex items-center rounded-lg border border-[color:var(--card-border)] bg-[var(--field-bg)] px-2">
        {prefix ? <span className="text-xs text-teal-200/40">{prefix}</span> : null}
        <input type="number" value={Number.isFinite(value) ? value : 0} step={step} min={min} onChange={(e) => set(Number(e.target.value))} className="w-full bg-transparent py-1.5 text-sm tabular-nums text-teal-50 outline-none" />
      </div>
    </label>
  );

  return (
    <div className="space-y-4">
      {/* strategy picker */}
      <div>
        <div className="flex flex-wrap gap-2">
          {STRATEGY_LIST.map((s) => {
            const active = s.key === strat;
            const tone = s.outlook === "bullish" ? "text-emerald-300" : s.outlook === "bearish" ? "text-red-300" : "text-amber-300";
            return (
              <button key={s.key} type="button" onClick={() => switchStrategy(s.key)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "border-teal-400/40 bg-teal-400/10 text-teal-100" : "border-teal-400/10 bg-teal-400/[0.03] text-teal-300/70 hover:bg-teal-400/10"}`}>
                {s.name}
                <span className={`ml-1.5 text-[9px] uppercase ${active ? tone : "text-teal-200/30"}`}>{s.outlook}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-teal-200/60">{spec.tagline}</p>
      </div>

      {/* saved scenarios */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={saveScenario} className="rounded-lg border border-[color:var(--card-border)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-teal-200/90 hover:bg-teal-400/10">
          ★ Save scenario
        </button>
        {scenarios.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1 rounded-full border border-teal-400/15 bg-teal-400/[0.04] py-0.5 pl-2.5 pr-1 text-[11px] text-teal-200/80">
            <button type="button" onClick={() => loadScenario(s)} className="hover:text-teal-100 hover:underline">{s.name}</button>
            <button type="button" onClick={() => persist(scenarios.filter((x) => x.name !== s.name))} aria-label={`Delete ${s.name}`} className="rounded px-1 text-teal-200/40 hover:text-red-300">×</button>
          </span>
        ))}
        {scenarios.length === 0 ? <span className="text-[11px] text-teal-200/30">Saved setups live in this browser.</span> : null}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {/* left rail: the strategy explainer sits ABOVE the inputs (Cam) */}
        <div className="space-y-4 lg:col-span-1">
          <Card className="space-y-3 p-4">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">{spec.name} — how it works</div>
            <p className="text-sm leading-relaxed text-teal-100/75">{spec.teach}</p>
            <div className="space-y-3">
              <Detail label="Your view">{spec.view}</Detail>
              <Detail label="Best for">{spec.bestFor}</Detail>
              <Detail label="You profit when" tone="up">{spec.profitWhen}</Detail>
              <Detail label="You lose when" tone="down">{spec.lossWhen}</Detail>
              <Detail label={<><Term k="time-decay">Time decay</Term></>}>{spec.decay}</Detail>
              <Detail label="Worked example">{spec.example}</Detail>
            </div>
            <div className="rounded-lg border border-amber-400/15 bg-amber-400/[0.04] p-2.5 text-xs leading-relaxed text-teal-100/75">
              <span className="font-semibold text-amber-300/80">Risk:</span> {spec.riskNote}
            </div>
          </Card>

          <Card className="p-4">
          <div className="space-y-3">
            <div>
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-teal-200/50">Load a real US name (optional)</span>
              <div className="flex gap-1.5">
                <input value={ticker} onChange={(e) => setTicker(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadChain()} placeholder="e.g. NVDA" className="w-full rounded-lg border border-[color:var(--card-border)] bg-[var(--field-bg)] px-2 py-1.5 text-sm uppercase text-teal-50 outline-none placeholder:text-teal-200/30 placeholder:normal-case" />
                <button type="button" onClick={() => loadChain()} disabled={loading} className="shrink-0 rounded-lg border border-teal-400/30 bg-teal-400/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-teal-200 hover:bg-teal-400/25 disabled:opacity-50">
                  {loading ? "…" : "Load"}
                </button>
              </div>
              {chainErr ? <p className="mt-1 text-[11px] text-amber-300/70">{chainErr}</p> : null}
              {chain ? <p className="mt-1 text-[11px] text-teal-200/40">Loaded {chain.symbol} · spot {fmt$(chain.spotCents ?? 0)} · CBOE delayed</p> : null}
            </div>

            {chain ? (
              <label className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wider text-teal-200/50"><Term k="expiry">Expiry</Term></span>
                <select value={chainExpiry} onChange={(e) => onExpiry(e.target.value)} className="w-full rounded-lg border border-[color:var(--card-border)] bg-[var(--field-bg)] px-2 py-1.5 text-sm text-teal-50 outline-none">
                  {chain.expiries.map((e) => (<option key={e.expiry} value={e.expiry}>{e.expiry} ({e.dte}d)</option>))}
                </select>
              </label>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <NumField label="Underlying" value={spot} set={setSpot} step={1} prefix="$" />
              <NumField label="Implied vol %" term="implied-volatility" value={ivPct} set={setIvPct} step={1} />
              {!chain ? <NumField label="Days to expiry" term="expiry" value={dte} set={setDte} step={1} /> : (
                <label className="block">
                  <span className="mb-1 block text-[10px] uppercase tracking-wider text-teal-200/50"><Term k="expiry">Days to expiry</Term></span>
                  <div className="flex items-center rounded-lg border border-[color:var(--card-border)] bg-[var(--field-bg)] px-2 py-1.5 text-sm tabular-nums text-teal-200/60">{dte}d</div>
                </label>
              )}
              <NumField label="Contracts" value={contracts} set={setContracts} step={1} min={1} />
            </div>

            <div className="space-y-2">
              {optTpls.map((t, i) => {
                const lv = legVals[i] ?? { strike: spot, premium: 1 };
                const strikes = chain ? strikesFor(chain, chainExpiry, t.kind) : [];
                return (
                  <div key={i} className="rounded-lg border border-teal-400/10 bg-teal-400/[0.02] p-2">
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-teal-200/50">
                      {t.label} <span className={t.action === "BUY" ? "text-emerald-300/70" : "text-red-300/70"}>· {t.action === "BUY" ? "long" : "short"} {t.kind.toLowerCase()}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {chain && strikes.length ? (
                        <label className="block">
                          <span className="mb-1 block text-[10px] uppercase tracking-wider text-teal-200/40"><Term k="strike">Strike</Term></span>
                          <select value={Math.round(lv.strike * 100)} onChange={(e) => pickLegStrike(i, Number(e.target.value))} className="w-full rounded-lg border border-[color:var(--card-border)] bg-[var(--field-bg)] px-2 py-1.5 text-sm tabular-nums text-teal-50 outline-none">
                            {strikes.map((s) => (<option key={s} value={s}>{fmt$(s)}</option>))}
                          </select>
                        </label>
                      ) : (
                        <NumField label="Strike" term="strike" value={lv.strike} set={(n) => setLeg(i, { strike: n })} step={1} prefix="$" />
                      )}
                      <div>
                        <NumField label="Premium /sh" term="premium" value={lv.premium} set={(n) => setLeg(i, { premium: n })} step={0.05} prefix="$" />
                        <button type="button" onClick={() => fairPremium(i)} className="mt-1 text-[10px] text-teal-300 hover:underline">↻ fair value</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {hasStock(spec) ? <p className="text-[11px] text-teal-200/40">Also holds {contracts * 100} shares (bought at the underlying price).</p> : null}
          </div>
          </Card>
        </div>

        {/* chart + results */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <PayoffChart legs={legs} spotCents={spotCents} dteNow={dte} breakevens={stats.breakevensCents} />
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={stats.netDebitCents >= 0 ? "Net debit" : "Net credit"} term="premium" value={fmt$(Math.abs(stats.netDebitCents))} note={stats.netDebitCents >= 0 ? "you pay" : "you collect"} />
            <Stat label="Max profit" value={stats.maxProfitCents == null ? "Unlimited" : fmtSigned$(stats.maxProfitCents)} good={stats.maxProfitCents == null || stats.maxProfitCents > 0} />
            <Stat label="Max loss" term="max-loss" value={stats.maxLossCents == null ? "Unlimited" : fmtSigned$(stats.maxLossCents)} bad />
            <Stat label="Break-even" term="break-even" value={stats.breakevensCents.length ? stats.breakevensCents.map((b) => fmt$(b)).join(" / ") : "—"} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Delta" term="delta" value={greeks.delta.toFixed(0)} note="share-equiv" />
            <Stat label="Gamma" term="gamma" value={greeks.gamma.toFixed(2)} note="Δ per $1" />
            <Stat label="Theta" term="theta" value={fmtSigned$(Math.round(greeks.theta * 100))} note="per day" />
            <Stat label="Vega" term="vega" value={fmtSigned$(Math.round(greeks.vega * 100))} note="per +1% IV" />
          </div>

          {reserved > 0 ? <p className="text-[11px] text-teal-200/40">Cash to set aside (cash-secured): {fmt$(reserved)}.</p> : null}

          <Card className="p-4">
            <GreeksChart legs={legs} spotCents={spotCents} dteNow={dte} />
          </Card>

          <Card className="p-4">
            <PnlTable legs={legs} spotCents={spotCents} dteNow={dte} ivFrac={ivFrac} />
          </Card>

          <p className="text-[11px] text-teal-200/40">
            Modeled &amp; educational — never executable. Premiums are CBOE delayed mid (or Black-Scholes from implied volatility); the “today” curve holds IV fixed. Multi-leg strikes share one IV (a simplification). Options are US-only.
          </p>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, children, tone }: { label: React.ReactNode; children: React.ReactNode; tone?: "up" | "down" }) {
  const head = tone === "up" ? "text-emerald-300/80" : tone === "down" ? "text-red-300/80" : "text-teal-300/70";
  return (
    <div>
      <div className={`text-[10px] font-bold uppercase tracking-[0.15em] ${head}`}>{label}</div>
      <div className="mt-0.5 text-xs leading-relaxed text-teal-100/70">{children}</div>
    </div>
  );
}

function Stat({ label, value, note, term, good, bad }: { label: string; value: string; note?: string; term?: string; good?: boolean; bad?: boolean }) {
  const tone = good ? "text-emerald-300" : bad ? "text-red-300" : "text-teal-50";
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wider text-teal-200/50">{term ? <Term k={term}>{label}</Term> : label}</div>
      <div className={`mt-1 text-base font-semibold tabular-nums ${tone}`}>{value}</div>
      {note ? <div className="mt-0.5 text-[10px] text-teal-200/40">{note}</div> : null}
    </Card>
  );
}
