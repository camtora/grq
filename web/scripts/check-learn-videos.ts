// Link-rot check for the Learn portal's curated video blocks (docs/LEARN-FRAMEWORK.md
// D111 §5.3). Hits YouTube's keyless oEmbed endpoint for every `video` block and reports
// title/author drift or dead ids. A dead video never breaks a lesson (LiteYouTube renders
// its graceful fallback) — this script is how it gets NOTICED and re-curated.
//
//   cd web && npx tsx scripts/check-learn-videos.ts     # run weekly-ish, or before a content pass
//
// Exit code 1 if anything is dead, so it can gate a CI step later if we want.
import { COURSES, type LearnBlock } from "../lib/learn/content";

type Vid = Extract<LearnBlock, { kind: "video" }> & { where: string };

const vids: Vid[] = [];
for (const c of COURSES)
  for (const l of c.lessons)
    for (const b of l.blocks)
      if (b.kind === "video") vids.push({ ...b, where: `${c.slug}/${l.slug}` });

async function main() {
  let dead = 0;
  for (const v of vids) {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${v.yt}&format=json`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as { title: string; author_name: string };
      // Prefix-match the title: TED-Ed style appends "- Author" to its titles; the
      // content keeps the clean prefix for display. Author must match exactly.
      const drift = !d.title.startsWith(v.title) || d.author_name !== v.author;
      console.log(`${drift ? "≈ DRIFT" : "✓ alive"}  ${v.where}  ${v.yt}  "${d.title}" — ${d.author_name}${drift ? `  (content says: "${v.title}" — ${v.author})` : ""}`);
    } catch (e) {
      dead++;
      console.log(`✗ DEAD   ${v.where}  ${v.yt}  (${e instanceof Error ? e.message : e}) — re-curate this block`);
    }
  }
  console.log(`\n${vids.length} curated videos · ${dead} dead`);
  if (dead > 0) process.exit(1);
}
void main();
