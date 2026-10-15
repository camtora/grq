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
