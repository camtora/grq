// Shared helpers across the three Hunt layouts (Heat Board / Top Pick / Scanner).

export const OBSCURITY_LABEL: Record<number, string> = {
  5: "🔍 deep cut",
  4: "under-the-radar",
  3: "lesser-known",
  2: "some coverage",
  1: "well-followed",
};

/** Strip markdown to a clean one-paragraph preview for clamped thesis text. */
export function previewText(body: string): string {
  return body
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/[#*_>`-]/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function wordCount(body: string): number {
  return body.trim().split(/\s+/).length;
}
