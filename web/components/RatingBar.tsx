import { STANCE_TONE_CLASSES } from "@/lib/stance";

// A compact rating slider on a red→amber→green track, driven by a 7-point label
// (Strong Sell → Strong Buy). Used for GRQ's CALL so the headline rating and its
// needle always agree (no signal/call contradiction). `note` tags the source
// (e.g. "GRQ's call" or "technical lean") so a fallback read is honest.
//
// `size="lg"` blows up the label + track for the hero placement on the stock page;
// `mascots` flanks the track with the bear (sell end) and bull (buy end) — each
// animal's energy points toward its end of the scale. Both default off so the
// small in-table bars (StockTable) stay exactly as they were.
export default function RatingBar({
  label,
  tone,
  pos,
  note,
  title,
  size = "sm",
  mascots = false,
  hideLabel = false,
  className,
}: {
  label: string;
  tone: string;
  pos: number; // 0..1
  note?: string;
  title?: string;
  size?: "sm" | "lg";
  mascots?: boolean;
  hideLabel?: boolean; // drop the big verdict word (e.g. stock page — it's in the bottom line)
  className?: string; // override the root width (e.g. "w-full" to fill a wider wrapper)
}) {
  const left = Math.max(3, Math.min(97, pos * 100));
  const text = STANCE_TONE_CLASSES[tone]?.text ?? "text-teal-200/60";
  const lg = size === "lg";
  return (
    <div className={className ?? (lg ? "w-full max-w-md" : "w-40")} title={title}>
      {(!hideLabel || note) && (
        <div className={`flex items-baseline gap-2 ${hideLabel ? "justify-end" : "justify-between"}`}>
          {!hideLabel && <span className={`font-black leading-none ${lg ? "text-3xl" : "text-sm"} ${text}`}>{label}</span>}
          {note && (
            <span className={`uppercase tracking-wider text-teal-200/30 ${lg ? "text-[11px]" : "text-[9px]"}`}>{note}</span>
          )}
        </div>
      )}
      <div className={`flex items-center ${lg ? "mt-3 gap-2" : `mt-1.5 ${mascots ? "gap-2.5" : ""}`}`}>
        {mascots && (
          // Bear guards the "sell" end — walking grizzly, chart plunging down (bearish).
          <img src="/bear-splash.png" alt="" aria-hidden className="h-5 w-auto shrink-0 select-none" />
        )}
        <div
          className={`relative flex-1 rounded-full bg-gradient-to-r from-red-500/55 via-amber-400/45 to-emerald-500/55 ${lg ? "h-3" : "h-2"}`}
        >
          <span
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#0a1413] shadow ${lg ? "h-5 w-5" : "h-3.5 w-3.5"}`}
            style={{ left: `${left}%` }}
          />
        </div>
        {mascots && (
          // Bull guards the "buy" end — charging up-and-to-the-right (bullish).
          <img src="/bull-splash.png" alt="" aria-hidden className="h-6 w-auto shrink-0 select-none" />
        )}
      </div>
    </div>
  );
}
