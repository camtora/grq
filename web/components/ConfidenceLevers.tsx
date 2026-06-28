import { Card } from "./ui";
import Term from "./Term";
import type { ConfidenceLever, LeverDirection, LeverMagnitude } from "@/lib/confidence-levers";

// "What would change our mind" — the confidence levers the agent files on a
// dossier (lib/confidence-levers.ts) plus the structural data gaps read straight
// off the coverage map. Pure display; nothing here touches the order gate.

const DIR: Record<LeverDirection, { icon: string; cls: string; title: string }> = {
  up: { icon: "↑", cls: "text-emerald-400", title: "Base case would lift the call toward Buy" },
  down: { icon: "↓", cls: "text-red-400", title: "Base case would push the call toward Sell" },
  tighten: { icon: "↔", cls: "text-amber-300", title: "Two-sided — resolving it narrows the read either way" },
};

const MAG: Record<LeverMagnitude, { label: string; cls: string }> = {
  large: { label: "big swing", cls: "text-teal-100" },
  moderate: { label: "moderate", cls: "text-teal-200/80" },
  small: { label: "minor", cls: "text-teal-200/55" },
};

export default function ConfidenceLevers({
  levers,
  structuralGaps,
  embedded = false,
}: {
  levers: ConfidenceLever[];
  structuralGaps: { name: string; detail: string }[];
  // embedded = render bare (no Card chrome) so it can sit half-width beside the
  // "Why" inside the bottom-line card. Standalone = its own card below.
  embedded?: boolean;
}) {
  if (levers.length === 0 && structuralGaps.length === 0) return null;

  const body = (
    <>
      {levers.length > 0 ? (
        <ul className="divide-y divide-teal-400/10">
          {levers.map((l, i) => (
            <li key={i} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
              <span
                title={DIR[l.direction].title}
                className={`mt-0.5 shrink-0 text-base font-black leading-none ${DIR[l.direction].cls}`}
              >
                {DIR[l.direction].icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-teal-100/85">{l.gap}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                  <span className={`font-semibold uppercase tracking-wider ${MAG[l.magnitude].cls}`}>
                    {MAG[l.magnitude].label}
                  </span>
                  <span className="text-teal-200/35">·</span>
                  {l.kind === "catalyst" ? (
                    <span className="text-teal-200/55">
                      <span className="font-semibold text-amber-200/70">catalyst</span>
                      {l.trigger ? <> — {l.trigger}</> : null}
                    </span>
                  ) : (
                    <span className="text-teal-200/55">
                      <span className="font-semibold text-teal-200/70">{l.retrievable ? "we can pull this" : "data gap"}</span>
                      {l.trigger ? <> — {l.trigger}</> : null}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-teal-200/45">
          GRQ hasn&apos;t filed specific levers for this name yet — they appear once the agent re-researches it. For now,
          the biggest unknowns are simply the data we don&apos;t have on this name (below).
        </p>
      )}

      {structuralGaps.length > 0 && (
        <div className="mt-4 border-t border-teal-400/10 pt-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-teal-200/40">Data we don&apos;t have on this name</div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {structuralGaps.map((g) => (
              <li key={g.name} className="text-[11px] text-teal-200/50">
                <span className="font-semibold text-teal-200/70">{g.name}</span> — {g.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="lg:border-l lg:border-teal-400/10 lg:pl-6">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-teal-200/50">
          <Term k="confidence-levers">What would change our mind</Term>
        </div>
        <p className="mb-3 text-[11px] text-teal-200/45">
          What would reframe this call — a gap we could close, or a catalyst still to land.
        </p>
        {body}
      </div>
    );
  }

  return (
    <Card className="mb-6 border-teal-400/20 p-5">
      <div className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-teal-300/70">
        <Term k="confidence-levers">What would change our mind</Term>
      </div>
      <p className="mb-4 text-[11px] text-teal-200/45">
        The specific things that would reframe this call — a gap we could close, or a catalyst still to land.
      </p>
      {body}
    </Card>
  );
}
