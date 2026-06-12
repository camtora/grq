import Md from "./Md";

/** Long journal bodies (dossiers, game plans) collapse to a headline +
 *  one-line preview; click to expand. Native <details> — no JS needed. */
export default function CollapsibleMd({
  text,
  threshold = 500,
}: {
  text: string;
  threshold?: number;
}) {
  if (text.length <= threshold) return <Md text={text} />;

  const preview = text
    .replace(/[#*`_]/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 160);
  const words = text.split(/\s+/).length;

  return (
    <details className="group">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="text-sm leading-relaxed text-teal-100/70 group-open:hidden">
          {preview}…{" "}
        </span>
        <span className="whitespace-nowrap text-xs font-semibold text-teal-300 hover:underline group-open:hidden">
          ▸ read all ({words.toLocaleString()} words)
        </span>
        <span className="hidden whitespace-nowrap text-xs font-semibold text-teal-300 hover:underline group-open:inline">
          ▾ collapse
        </span>
      </summary>
      <div className="mt-3">
        <Md text={text} />
      </div>
    </details>
  );
}
