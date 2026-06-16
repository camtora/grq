import { STANCE_TONE_CLASSES } from "@/lib/stance";

// A compact rating slider on a red→amber→green track, driven by a 7-point label
// (Strong Sell → Strong Buy). Used for GRQ's CALL so the headline rating and its
// needle always agree (no signal/call contradiction). `note` tags the source
// (e.g. "GRQ's call" or "technical lean") so a fallback read is honest.
export default function RatingBar({
  label,
  tone,
  pos,
  note,
  title,
}: {
  label: string;
  tone: string;
  pos: number; // 0..1
  note?: string;
  title?: string;
}) {
  const left = Math.max(3, Math.min(97, pos * 100));
  const text = STANCE_TONE_CLASSES[tone]?.text ?? "text-teal-200/60";
  return (
    <div className="w-40" title={title}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-sm font-black ${text}`}>{label}</span>
        {note && <span className="text-[9px] uppercase tracking-wider text-teal-200/30">{note}</span>}
      </div>
      <div className="relative mt-1.5 h-2 rounded-full bg-gradient-to-r from-red-500/55 via-amber-400/45 to-emerald-500/55">
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#0a1413] shadow"
          style={{ left: `${left}%` }}
        />
      </div>
    </div>
  );
}
