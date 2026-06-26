import Avatar from "@/components/Avatar";

// The "who's watching" stack (D-watch): overlapping circular member avatars, each
// with a background-coloured ring so the faces read against one another. Server-safe
// (plain Avatar/<img>). Caps at `max` and shows the overflow as "+N". Renders nothing
// for an empty list, so callers can drop it in unconditionally.
export default function AvatarStack({
  people,
  size = "h-6 w-6",
  max = 4,
  className = "",
}: {
  people: { name: string; photo: string | null }[];
  size?: string;
  max?: number;
  className?: string;
}) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const title = `Watching: ${people.map((p) => p.name).join(", ")}`;
  return (
    <span className={`inline-flex items-center ${className}`} title={title}>
      <span className="flex -space-x-2">
        {shown.map((p, i) => (
          <Avatar key={i} src={p.photo} name={p.name} size={size} className="ring-2 ring-[color:var(--card-bg)]" />
        ))}
      </span>
      {extra > 0 && <span className="ml-1 text-[10px] font-semibold tabular-nums text-teal-200/50">+{extra}</span>}
    </span>
  );
}
