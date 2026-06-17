// Multi-currency valuation (D33) — the fund holds CAD + USD, mirroring the IBKR
// paper account. One conversion primitive so NAV, NAV snapshots and the §6 sizing
// gate all agree on the rate. CAD passes through untouched, so a CAD-only account
// is byte-identical to before this existed.
import { getMacro } from "./macro";

/** The live USD→CAD rate (BoC, via the macro feed). Null only if BoC is unreachable. */
export async function usdCadRate(): Promise<number | null> {
  return (await getMacro().catch(() => null))?.usdcad ?? null;
}

/** Value `cents` (denominated in `currency`) in CAD cents. CAD is the identity;
 *  USD is multiplied by the rate. If the rate is missing we fall back to 1:1 and
 *  warn — only reachable if BoC is down AND we hold USD (no USD positions exist
 *  until US trading is switched on), so it never bites the CAD-only path. */
export function toCadCents(cents: number, currency: string | null | undefined, fxUsdCad: number | null): number {
  if ((currency ?? "CAD").toUpperCase() !== "USD") return cents;
  if (fxUsdCad == null) {
    console.warn("[fx] USD value with no USD/CAD rate — valuing 1:1 (BoC unreachable?)");
    return cents;
  }
  return Math.round(cents * fxUsdCad);
}
