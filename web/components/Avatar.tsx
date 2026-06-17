// A circular member avatar — photo if we have one, initial chip if not.
// Server-safe (plain <img> over /public). Used by the watchlist "watched by"
// column and the Reports about-us badges.
export default function Avatar({
  src,
  name,
  size = "h-7 w-7",
  className = "",
}: {
  src: string | null;
  name: string;
  size?: string;
  className?: string;
}) {
  const ring = "ring-1 ring-teal-400/25";
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} title={name} className={`${size} shrink-0 rounded-full object-cover ${ring} ${className}`} />;
  }
  return (
    <span
      title={name}
      className={`${size} inline-flex shrink-0 items-center justify-center rounded-full bg-teal-400/20 text-xs font-bold uppercase text-teal-200 ${ring} ${className}`}
    >
      {name?.trim()?.charAt(0) ?? "?"}
    </span>
  );
}
