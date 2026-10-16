import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitSection, sectionBody } from "@/lib/prompt-audit";

// The "For Graham" card on /how-it-works → Opus 5.5 plan is lifted out of the exported review doc
// by heading. Nothing may be lost or duplicated in the lift, and a doc without the section must
// render whole.
const DOC = `# Title

Lede line.

## For Graham: what you need to know (as of Oct 15)

**One.** First paragraph.

- a bullet

## Status

| a | b |
| --- | --- |
| 1 | 2 |

## Later

Tail.`;

describe("splitSection", () => {
  it("lifts exactly the headed section and leaves the rest intact, in order", () => {
    const { section, rest } = splitSection(DOC, "For Graham");
    assert.ok(section?.startsWith("## For Graham: what you need to know"));
    assert.match(section!, /\*\*One\.\*\* First paragraph\./);
    assert.match(section!, /- a bullet/);
    assert.doesNotMatch(section!, /## Status/);
    assert.doesNotMatch(rest, /For Graham|First paragraph|a bullet/);
    assert.match(rest, /# Title[\s\S]*Lede line\.[\s\S]*## Status[\s\S]*## Later[\s\S]*Tail\./);
  });
  it("a section that runs to the end of the doc is lifted whole", () => {
    const { section, rest } = splitSection(DOC, "Later");
    assert.equal(section, "## Later\n\nTail.");
    assert.doesNotMatch(rest, /Tail\./);
  });
  it("no such section → nothing lifted, the doc untouched", () => {
    const { section, rest } = splitSection(DOC, "For Dave");
    assert.equal(section, null);
    assert.equal(rest, DOC);
  });
  it("sectionBody drops the heading line only", () => {
    assert.equal(sectionBody("## For Graham: x\n\nbody **here**\n"), "body **here**");
  });
});
