import { promises as fs } from "fs";
import path from "path";

// The Opus 5.5 prompt-audit review, for the owners' "How GRQ works" page (Cam, 2026-10-15:
// "make this a page on the website so Graham can look at it too"). The living copy is a Claude
// Doc Cam edits (the Decision marks are his):
//   https://claude.ai/code/artifact/f2f7216e-f85a-482a-af4a-fc53ff266082
// docs/PROMPT-AUDIT-OPUS55.md is a markdown EXPORT of that doc, re-exported by Claude when the
// doc changes (Claude Docs connector → export, format markdown → that file). It is read here at
// request time from the same read-only docs mount the decision log uses (docker-compose.yaml),
// so a fresh export shows on the page with no rebuild. `asOf` = the file's mtime = the export.
export type PromptAudit = { md: string; asOf: Date };

export async function getPromptAudit(): Promise<PromptAudit | null> {
  const file = path.join(process.cwd(), "docs", "PROMPT-AUDIT-OPUS55.md");
  try {
    const [md, stat] = await Promise.all([fs.readFile(file, "utf8"), fs.stat(file)]);
    return { md, asOf: stat.mtime };
  } catch {
    return null; // not mounted (local dev without the volume) → the tab says so
  }
}

/** Pull one `## heading` section (that line through the line before the next `## `) out of a
 *  markdown document, so the page can render it apart from the rest. `null` when absent. Pure. */
export function splitSection(md: string, headingPrefix: string): { section: string | null; rest: string } {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.startsWith("## ") && l.slice(3).startsWith(headingPrefix));
  if (start < 0) return { section: null, rest: md };
  let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  if (end < 0) end = lines.length;
  return { section: lines.slice(start, end).join("\n").trim(), rest: [...lines.slice(0, start), ...lines.slice(end)].join("\n") };
}

/** The section's body without its own heading line (the page draws the heading its own way). */
export function sectionBody(section: string): string {
  return section.replace(/^## [^\n]*\n?/, "").trim();
}
