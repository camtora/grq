// Bank of Canada Valet API (free, no key) — structured Tier 9 macro for a TSX
// fund. Best-effort per series; the agent + dashboard degrade gracefully. Cached
// in-process (macro moves daily; the agent context builds far more often).
const VALET = "https://www.bankofcanada.ca/valet/observations";

async function valetLatest(series: string): Promise<{ date: string; value: number } | null> {
  try {
    const r = await fetch(`${VALET}/${series}/json?recent=1`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const d = (await r.json()) as { observations?: Array<Record<string, unknown>> };
    const obs = d.observations?.[0];
    const cell = obs?.[series] as { v?: string } | undefined;
    if (!obs || cell?.v == null) return null;
    const value = parseFloat(cell.v);
    return isFinite(value) ? { date: String(obs.d ?? ""), value } : null;
  } catch {
    return null;
  }
}

// CPI year-over-year from the all-items index (Valet gives the level; we annualize).
async function cpiYoY(): Promise<number | null> {
  const series = "V41690973";
  try {
    const r = await fetch(`${VALET}/${series}/json?recent=13`, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const d = (await r.json()) as { observations?: Array<Record<string, unknown>> };
    const obs = d.observations ?? [];
    if (obs.length < 13) return null;
    const val = (o: Record<string, unknown>) => parseFloat((o[series] as { v?: string })?.v ?? "");
    const latest = val(obs[obs.length - 1]);
    const yearAgo = val(obs[0]);
    if (!isFinite(latest) || !isFinite(yearAgo) || yearAgo === 0) return null;
    return ((latest - yearAgo) / yearAgo) * 100;
  } catch {
    return null;
  }
}

export type MacroSnapshot = {
  usdcad: number | null;
  overnightRate: number | null;
  goc5yr: number | null;
  cpiYoY: number | null;
  asOf: string;
};

let cache: { at: number; snap: MacroSnapshot } | null = null;
const TTL_MS = 30 * 60_000;

export async function getMacro(): Promise<MacroSnapshot> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.snap;
  const [usdcad, rate, goc5, cpi] = await Promise.all([
    valetLatest("FXUSDCAD"),
    valetLatest("V39079"),
    valetLatest("BD.CDN.5YR.DQ.YLD"),
    cpiYoY(),
  ]);
  const snap: MacroSnapshot = {
    usdcad: usdcad?.value ?? null,
    overnightRate: rate?.value ?? null,
    goc5yr: goc5?.value ?? null,
    cpiYoY: cpi,
    asOf: usdcad?.date || rate?.date || new Date().toISOString().slice(0, 10),
  };
  cache = { at: Date.now(), snap };
  return snap;
}

/** One-line macro summary for the agent context / a dashboard strip. */
export function macroLine(m: MacroSnapshot): string {
  const parts: string[] = [];
  if (m.overnightRate != null) parts.push(`BoC overnight ${m.overnightRate.toFixed(2)}%`);
  if (m.goc5yr != null) parts.push(`5y GoC ${m.goc5yr.toFixed(2)}%`);
  if (m.cpiYoY != null) parts.push(`CPI ${m.cpiYoY.toFixed(1)}% YoY`);
  if (m.usdcad != null) parts.push(`USD/CAD ${m.usdcad.toFixed(4)}`);
  return parts.length ? parts.join(" · ") : "(macro unavailable)";
}
