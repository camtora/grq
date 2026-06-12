import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Full markdown rendering (react-markdown + GFM), themed teal. Replaced the
// hand-rolled mini-renderer (D15) once agent game plans and reports started
// using headers, lists, and links for real.

const components: Components = {
  h1: ({ node: _n, ...props }) => <h3 className="mt-4 text-base font-bold text-teal-50 first:mt-0" {...props} />,
  h2: ({ node: _n, ...props }) => <h3 className="mt-4 text-base font-bold text-teal-50 first:mt-0" {...props} />,
  h3: ({ node: _n, ...props }) => <h4 className="mt-3 text-sm font-bold text-teal-50 first:mt-0" {...props} />,
  h4: ({ node: _n, ...props }) => <h4 className="mt-3 text-sm font-semibold text-teal-50 first:mt-0" {...props} />,
  ul: ({ node: _n, ...props }) => <ul className="list-disc space-y-1 pl-5" {...props} />,
  ol: ({ node: _n, ...props }) => <ol className="list-decimal space-y-1 pl-5" {...props} />,
  strong: ({ node: _n, ...props }) => <strong className="font-semibold text-teal-50" {...props} />,
  a: ({ node: _n, ...props }) => (
    <a className="text-teal-300 underline hover:text-teal-200" target="_blank" rel="noreferrer" {...props} />
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
  return (
    <div className={`space-y-3 text-sm leading-relaxed text-teal-100/80 ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
