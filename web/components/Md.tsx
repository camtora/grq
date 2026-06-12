import React from "react";

// Tiny renderer for our own generated markdown (bold, code, line breaks,
// paragraphs). The journal/report bodies are agent-written and simple — no
// need for a full remark pipeline.
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-teal-50">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-teal-400/10 px-1 py-0.5 text-[0.85em] text-teal-200">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

export default function Md({ text, className = "" }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className={`space-y-3 text-sm leading-relaxed text-teal-100/80 ${className}`}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const italic = block.startsWith("_") && block.endsWith("_");
        const content = italic ? block.slice(1, -1) : block;
        return (
          <p key={bi} className={italic ? "italic text-teal-200/50" : undefined}>
            {(italic ? [content] : lines).map((line, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {inline(line)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
