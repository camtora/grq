import Link from "next/link";
import { etDateStr, startOfEtDay } from "@/agent/calendar";

// The standard ET date navigator (the bordered-pill style from the Today header):
//   ← prev · today · next →
// `mode` picks the URL shape: "query" → `${basePath}?d=YYYY-MM-DD` (Today, /tokens),
// "path" → `${basePath}/YYYY-MM-DD` (the race). `next` only appears on a past day; the
// "today" pill only appears when you're not already on today.
export default function DateNav({
  date,
  basePath,
  mode,
}: {
  date: string; // the viewed day, "YYYY-MM-DD"
  basePath: string;
  mode: "query" | "path";
}) {
  const todayStr = etDateStr();
  const isToday = date === todayStr;
  const start = startOfEtDay(new Date(`${date}T12:00:00Z`));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const prev = etDateStr(new Date(start.getTime() - 12 * 60 * 60 * 1000));
  const next = etDateStr(new Date(end.getTime() + 12 * 60 * 60 * 1000));

  const cls = "rounded-lg border border-teal-400/20 px-3 py-1.5 text-teal-300 hover:bg-teal-400/10";
  const hrefFor = (d: string) => (mode === "path" ? `${basePath}/${d}` : `${basePath}?d=${d}`);
  const todayHref = mode === "path" ? `${basePath}/${todayStr}` : basePath;

  return (
    <div className="flex shrink-0 items-center gap-2 text-sm">
      <Link href={hrefFor(prev)} className={cls}>
        ← {prev}
      </Link>
      {!isToday && (
        <Link href={todayHref} className={cls}>
          today
        </Link>
      )}
      {date < todayStr && (
        <Link href={hrefFor(next)} className={cls}>
          {next} →
        </Link>
      )}
    </div>
  );
}
