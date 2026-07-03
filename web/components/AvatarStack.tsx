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
  agent = false,
}: {
  people: { name: string; photo: string | null }[];
  size?: string;
  max?: number;
  className?: string;
  /** Prepend Alfred's (the agent's) face — the fund tracks/researches this name (it's in the
   *  universe). Rendered as the bull, object-contain so it isn't cropped like a headshot. */
  agent?: boolean;
}) {
  if (people.length === 0 && !agent) return null;
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const names = [...(agent ? ["Alfred"] : []), ...people.map((p) => p.name)];
  const title = `Watching: ${names.join(", ")}`;
  return (
    <span className={`inline-flex items-center ${className}`} title={title}>
      <span className="flex -space-x-2">
        {agent && (
          <span
            title="Alfred — the fund tracks this name"
            className={`${size} inline-flex shrink-0 items-center justify-center rounded-full bg-teal-400/15 ring-2 ring-[color:var(--card-bg)]`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/bull-splash.png" alt="Alfred" className="h-[80%] w-[80%] object-contain" />
          </span>
        )}
        {shown.map((p, i) => (
          <Avatar key={i} src={p.photo} name={p.name} size={size} className="ring-2 ring-[color:var(--card-bg)]" />
        ))}
      </span>
      {extra > 0 && <span className="ml-1 text-[10px] font-semibold tabular-nums text-teal-200/50">+{extra}</span>}
    </span>
  );
}
