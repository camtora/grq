import Avatar from "@/components/Avatar";
import { personByName } from "@/lib/people";

// Surfaces WHO is watching a hunt find — the member who put it on the watchlist
// (the universe candidate's `addedBy`, the same field the Watchlist "Added by"
// column uses). Informational only: watch / un-watch still lives on the watchlist
// and the stock page. Callers hide this once a name is in the universe (a promoted
// name isn't "being watched" anymore — Cam 2026-06-24).
export default function WatchedBy({ name, compact = false }: { name: string | null; compact?: boolean }) {
  const p = personByName(name);
  const who = p?.name ?? "A member";
  const title = `${who} is watching this find`;

  // Dense grid/scanner layouts: just the face, with the name in the tooltip.
  if (compact) {
    return (
      <span title={title} className="flex h-[34px] w-[34px] shrink-0 items-center justify-center">
        <Avatar src={p?.photo ?? null} name={who} size="h-7 w-7" />
      </span>
    );
  }

  return (
    <span
      title={title}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-teal-400/25 bg-teal-400/10 px-2 py-1 text-[11px] font-semibold text-teal-200/90"
    >
      <Avatar src={p?.photo ?? null} name={who} size="h-5 w-5" />
      <span className="truncate">{p ? p.name : "watching"}</span>
    </span>
  );
}
