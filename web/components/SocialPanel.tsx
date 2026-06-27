import { Card } from "@/components/ui";
import Term from "@/components/Term";
import PanelHeader from "@/components/PanelHeader";
import type { SocialDaily } from "@prisma/client";

// Tier 8 — social sentiment on the stock page. Horizontal/compact like OptionsPanel: the buzz
// regime sits on the LEFT, the metrics in one row on its RIGHT. Read as a CROWDING/risk gauge, not
// a buy signal — and honestly: noisy, gameable, US-centric. A SIGNAL only; the fund never trades on
// it. null = no retail chatter (off-radar name) — which is itself worth knowing.

function velText(v: number | null): { label: string; tone: "hot" | "warm" | "cool" | "flat" } {
  if (v == null) return { label: "—", tone: "flat" };
  if (v >= 1.5) return { label: `${v.toFixed(1)}× — spiking`, tone: "hot" };
  if (v >= 1.15) return { label: `${v.toFixed(1)}× — rising`, tone: "warm" };
  if (v <= 0.6) return { label: `${v.toFixed(1)}× — cooling`, tone: "cool" };
  return { label: `${v.toFixed(1)}× — steady`, tone: "flat" };
}

function Metric({ label, k, value, note }: { label: string; k?: string; value: string; note?: string }) {
  return (
    <div className="px-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-teal-200/40">{k ? <Term k={k}>{label}</Term> : label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-teal-100/90">{value}</div>
      {note ? <div className="text-[10px] text-teal-200/40">{note}</div> : null}
    </div>
  );
}

export default function SocialPanel({ s }: { s: SocialDaily | null }) {
  const vel = velText(s?.velocity ?? null);
  const hot = vel.tone === "hot" || vel.tone === "warm";
  const rankMove = s?.rank != null && s?.rankPrev ? s.rankPrev - s.rank : 0; // +ve = climbing the board

  return (
    <div className="flex h-full flex-col gap-2">
      <PanelHeader fresh="~6h" freshTitle="Reddit (ApeWisdom) + Stocktwits — re-pulled ~every 6h. A crowding/risk signal on probation; never traded.">
        <Term k="social-buzz">Social buzz</Term>{" "}
        <span className="normal-case text-teal-200/40">· Tier 8 · signal only</span>
      </PanelHeader>
      <Card className="flex-1 p-4">
      {!s ? (
        <p className="text-sm text-teal-200/40">
          No retail chatter — this name isn&apos;t being talked about on Reddit/Stocktwits right now. (US-centric feeds; CA and
          off-radar names go dark. For a name we hold, quiet is a <em>good</em> thing — no crowd to unwind.)
        </p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          {/* Buzz — the headline read, on the left */}
          <div className={`shrink-0 rounded-lg border p-3 sm:w-72 ${hot ? "border-amber-400/30 bg-amber-400/[0.05]" : "border-teal-400/25 bg-teal-400/[0.04]"}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className={`text-sm font-bold ${hot ? "text-amber-300" : "text-teal-200"}`}>
                <Term k="social-buzz">Buzz</Term> {s.buzz}/100
              </span>
              <span className={`shrink-0 text-[11px] tabular-nums ${hot ? "text-amber-200/70" : "text-teal-200/60"}`}>{vel.label}</span>
            </div>
            <p className="mt-1 text-xs text-teal-100/70">
              {hot
                ? "Retail attention is building — for a holding, read as crowding/euphoria risk, not a buy."
                : "Quiet-to-cooling retail attention — no crowd to unwind."}
            </p>
          </div>

          {/* The metrics — one evenly-spaced row on the right */}
          <div className="grid flex-1 grid-cols-2 items-center divide-teal-400/10 sm:grid-cols-3 sm:divide-x">
            <Metric
              label="Mentions"
              k="mention-velocity"
              value={`${s.mentions}`}
              note={
                s.upvotes != null
                  ? `${s.upvotes.toLocaleString()} upvotes${s.mentions > 0 && s.upvotes / s.mentions < 3 ? " · thin" : ""}`
                  : "Reddit, 24h"
              }
            />
            <Metric
              label="Sentiment"
              k="social-sentiment"
              value={s.bullPct != null ? `${Math.round(s.bullPct * 100)}% bull` : "—"}
              note={s.bullPct != null ? `n=${s.bullSample ?? 0} tagged` : "too few tags"}
            />
            <Metric
              label="Reddit rank"
              value={s.rank ? `#${s.rank}` : "—"}
              note={rankMove ? `${rankMove > 0 ? "▲" : "▼"}${Math.abs(rankMove)} vs 24h` : "of all tickers"}
            />
          </div>
        </div>
      )}
      </Card>
    </div>
  );
}
