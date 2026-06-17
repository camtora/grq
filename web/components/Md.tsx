import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import Term from "./Term";

// Full markdown rendering (react-markdown + GFM), themed teal. Replaced the
// hand-rolled mini-renderer (D15) once agent game plans and reports started
// using headers, lists, and links for real.

// Auto-link known glossary jargon the FIRST time it appears in agent prose, so
// the literacy layer doesn't depend on the agent remembering to wrap each term.
// Only unambiguous jargon (low false-positive risk); each maps to a glossary
// slug → the `a` override renders it as a <Term>. Runs on hast text nodes only,
// skipping code/links/headings, once per term per document.
const GLOSSARY_TRIGGERS: [RegExp, string][] = [
  [/\bnet asset value\b/i, "nav"],
  [/\bNAV\b/, "nav"],
  [/\badjusted cost base\b/i, "acb"],
  [/\bACB\b/, "acb"],
  [/\bfree cash flow\b/i, "free-cash-flow"],
  [/\bmarket cap(?:italization|italisation)?\b/i, "market-cap"],
  [/\bshort interest\b/i, "short-interest"],
  [/\bshort squeeze\b/i, "short-interest"],
  [/\bdividend yield\b/i, "dividend-yield"],
  [/\bdilution\b/i, "dilution"],
  [/\bdrawdown\b/i, "drawdown"],
  [/\beconomic moat\b/i, "moat"],
  [/\bmoat\b/i, "moat"],
  [/\bstop[- ]?loss\b/i, "stop-loss"],
  [/\btake[- ]?profit\b/i, "take-profit"],
  [/\bswing trade\b/i, "swing-trade"],
  [/\bsuperficial[- ]loss\b/i, "superficial-loss"],
  [/\bRSI\b/, "rsi"],
  [/\bMACD\b/, "macd"],
  [/\bP\/E\b/, "pe"],
  [/\bETF\b/, "etf"],
];
const SKIP_TAGS = new Set(["a", "code", "pre", "h1", "h2", "h3", "h4", "h5", "h6"]);

function linkifyText(value: string, used: Set<string>): unknown[] {
  let best: { index: number; len: number; slug: string; text: string } | null = null;
  for (const [re, slug] of GLOSSARY_TRIGGERS) {
    if (used.has(slug)) continue;
    const m = re.exec(value);
    if (m && (best === null || m.index < best.index)) best = { index: m.index, len: m[0].length, slug, text: m[0] };
  }
  if (!best) return [{ type: "text", value }];
  used.add(best.slug);
  const before = value.slice(0, best.index);
  const after = value.slice(best.index + best.len);
  const out: unknown[] = [];
  if (before) out.push({ type: "text", value: before });
  out.push({ type: "element", tagName: "a", properties: { href: `#explain:${best.slug}` }, children: [{ type: "text", value: best.text }] });
  out.push(...linkifyText(after, used));
  return out;
}

function autoGlossary() {
  return (tree: unknown) => {
    try {
      const used = new Set<string>();
      const walk = (node: { children?: unknown[] }, skip: boolean) => {
        if (!Array.isArray(node.children)) return;
        const out: unknown[] = [];
        for (const child of node.children as Array<{ type?: string; tagName?: string; value?: string; children?: unknown[] }>) {
          if (child.type === "text" && !skip) {
            out.push(...linkifyText(child.value ?? "", used));
          } else {
            if (child.type === "element") walk(child, skip || SKIP_TAGS.has(child.tagName ?? ""));
            out.push(child);
          }
        }
        node.children = out;
      };
      walk(tree as { children?: unknown[] }, false);
    } catch {
      /* on any parsing surprise, leave the prose exactly as written */
    }
  };
}

const components: Components = {
  h1: ({ node: _n, ...props }) => <h3 className="mt-4 text-base font-bold text-teal-50 first:mt-0" {...props} />,
  h2: ({ node: _n, ...props }) => <h3 className="mt-4 text-base font-bold text-teal-50 first:mt-0" {...props} />,
  h3: ({ node: _n, ...props }) => <h4 className="mt-3 text-sm font-bold text-teal-50 first:mt-0" {...props} />,
  h4: ({ node: _n, ...props }) => <h4 className="mt-3 text-sm font-semibold text-teal-50 first:mt-0" {...props} />,
  ul: ({ node: _n, ...props }) => <ul className="list-disc space-y-1 pl-5" {...props} />,
  ol: ({ node: _n, ...props }) => <ol className="list-decimal space-y-1 pl-5" {...props} />,
  strong: ({ node: _n, ...props }) => <strong className="font-semibold text-teal-50" {...props} />,
  a: ({ node: _n, href, children, ...props }) =>
    href && href.startsWith("#explain:") ? (
      <Term k={decodeURIComponent(href.slice(9)).toLowerCase()}>{children}</Term>
    ) : (
      <a className="text-teal-300 underline hover:text-teal-200" target="_blank" rel="noreferrer" href={href} {...props} />
    ),
  code: ({ node: _n, ...props }) => (
    <code className="rounded bg-teal-400/10 px-1 py-0.5 text-[0.85em] text-teal-200" {...props} />
  ),
  blockquote: ({ node: _n, ...props }) => (
    <blockquote className="border-l-2 border-teal-400/30 pl-3 italic text-teal-200/60" {...props} />
  ),
  hr: () => <hr className="my-3 border-teal-400/15" />,
  table: ({ node: _n, ...props }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" {...props} />
    </div>
  ),
  th: ({ node: _n, ...props }) => (
    <th className="border-b border-teal-400/20 px-2 py-1 text-left font-semibold text-teal-50" {...props} />
  ),
  td: ({ node: _n, ...props }) => <td className="border-b border-teal-400/10 px-2 py-1 align-top" {...props} />,
};

export default function Md({ text, className = "" }: { text: string; className?: string }) {
  // Turn the agent's [[jargon]] markers into tap-to-explain links (rendered by
  // the `a` override → <Term>). Plain prose is left untouched.
  const processed = text.replace(/\[\[([^\][]{1,80})\]\]/g, (_m, t) => `[${t}](#explain:${encodeURIComponent(t.trim())})`);
  return (
    <div className={`space-y-3 text-sm leading-relaxed text-teal-100/80 ${className}`}>
      {/* singleTilde:false — the agent writes ~ for "approximately" (~$870); without
          this, GFM reads a pair of ~ on a line as strikethrough and crosses out the
          text between them. Only ~~double~~ strikes through now. */}
      <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]} rehypePlugins={[autoGlossary]} components={components}>
        {processed}
      </ReactMarkdown>
    </div>
  );
}
