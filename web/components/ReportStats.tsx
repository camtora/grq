// Shared report stats helpers — the EOD/Weekly stat strip + its JSON parser.
// Used by the Reports hub (app/reports) and the per-day report page
// (app/reports/day/[date]). Kept tiny + server-safe.

export function parseStats(json: string | null): Record<string, string | number> | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Record<string, string | number>;
  } catch {
    return null;
  }
}

export function Stats({ stats }: { stats: Record<string, string | number> | null }) {
  if (!stats) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-teal-200/60">
      {Object.entries(stats).map(([k, v]) => (
        <span key={k}>
          <span className="uppercase tracking-wider text-teal-200/40">{k.replace(/_/g, " ")}</span>{" "}
          <span className="tabular-nums text-teal-50">{String(v)}</span>
        </span>
      ))}
    </div>
  );
}
