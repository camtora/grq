import { promises as fs } from "fs";
import path from "path";

export type Decision = { n: number; title: string; meta: string; body: string };

// Parse the LIVE decision log (docs/DECISIONS.md, bind-mounted read-only into the web
// container at /app/docs). Each entry is a "### D<n> — <title> (<who>, <date>)" heading
// followed by its body until the next "### D" / "## " section / EOF. Returns newest-first.
//
// This is the single source of truth: we already write every decision into DECISIONS.md,
// and the mount is live, so new decisions appear here with no rebuild and nothing to keep
// in sync by hand.
export async function getDecisions(): Promise<Decision[]> {
  let raw: string;
  try {
    raw = await fs.readFile(path.join(process.cwd(), "docs", "DECISIONS.md"), "utf8");
  } catch {
    return []; // not mounted (e.g. local dev without the volume) → tab shows a graceful note
  }

  const out: Decision[] = [];
  let cur: Decision | null = null;
  const flush = () => {
    if (cur) {
      cur.body = cur.body.trim();
      out.push(cur);
      cur = null;
    }
  };

  for (const line of raw.split("\n")) {
    const m = /^###\s+D(\d+)\s+[—-]\s+(.*)$/.exec(line);
    if (m) {
      flush();
      const rest = m[2].trim();
      const meta = /\(([^()]*)\)\s*$/.exec(rest); // trailing "(who, date)"
      cur = {
        n: Number(m[1]),
        title: meta ? rest.slice(0, meta.index).trim() : rest,
        meta: meta ? meta[1].trim() : "",
        body: "",
      };
    } else if (cur) {
      if (/^##\s+/.test(line) && !/^###/.test(line)) flush(); // a non-decision section ends the body
      else cur.body += line + "\n";
    }
  }
  flush();

  out.sort((a, b) => b.n - a.n);
  return out;
}
