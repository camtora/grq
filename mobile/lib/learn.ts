/** The Learn portal's content + helpers (web lib/learn/content.ts + lib/glossary,
 * delivered via the shared export — scripts/export-learn-content.ts writes
 * shared/content/learn.json and the @shared alias bundles it, so the lesson text
 * literally cannot drift between web and app). */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RAW = require('@shared/content/learn.json') as {
  courses: LearnCourse[];
  labs: LearnLab[];
  glossary: Record<string, GlossaryEntry>;
};

/** One question — inline lesson checks carry their keys (formative, client-graded,
 * zero stakes — same call as web). Exam keys stay server-side; the exam API grades. */
export type LearnQuestion = {
  id: string;
  prompt: string;
  explain: string;
  reviewLesson?: string;
} & (
  | { kind: 'choice'; options: { id: string; md: string }[]; correct: string[]; multi?: boolean }
  | { kind: 'numeric'; unit: 'cents' | 'shares' | 'pct' | 'bps' | 'years'; answer: number; tolerance?: number; placeholder?: string }
);

/** The D111 block model (web lib/learn/content.ts — learn.json carries it verbatim). */
export type LearnBlock =
  | { kind: 'prose'; md: string }
  | { kind: 'callout'; tone: 'note' | 'trap' | 'rule'; md: string }
  | { kind: 'figure'; src: string; alt: string; caption?: string; credit?: string }
  | { kind: 'diagram'; id: string }
  | { kind: 'chart'; spec: { symbol: string; days: number; label: string; annotate?: 'biggest-gap' } }
  | { kind: 'widget'; id: 'order-book' | 'compounding' }
  | { kind: 'receipt'; id: string }
  | { kind: 'example'; key: string; fallbackMd: string }
  | { kind: 'video'; yt: string; title: string; author: string; minutes: number; why: string }
  | { kind: 'check'; q: LearnQuestion }
  | { kind: 'tryIt'; links: { href: string; label: string }[] };

export type LearnLesson = {
  slug: string;
  title: string;
  /** Legacy flattened prose (kept for wire-compat); `blocks` is the real lesson. */
  body: string;
  tryIt?: { href: string; label: string }[];
  widget?: 'order-book' | 'compounding';
  receipt?: string;
  blocks: LearnBlock[];
};
export type LearnCourse = {
  slug: string;
  n: number;
  title: string;
  tagline: string;
  overview?: string[];
  status: 'live' | 'soon';
  external?: { href: string };
  lessons: LearnLesson[];
};
export type LearnLab = { href: string; title: string; teaches: string };
export type GlossaryEntry = { term: string; def: string; example?: string; related?: string[] };

export const COURSES: LearnCourse[] = RAW.courses;
export const LABS: LearnLab[] = RAW.labs;
export const GLOSSARY: Record<string, GlossaryEntry> = RAW.glossary ?? {};

/** A lesson's inline checks, in order. */
export const lessonChecks = (l: LearnLesson): LearnQuestion[] =>
  l.blocks.filter((b): b is Extract<LearnBlock, { kind: 'check' }> => b.kind === 'check').map((b) => b.q);

/** Rough read time — same arithmetic as web content.ts readMinutes. */
export function readMinutes(l: LearnLesson): number {
  let words = 0;
  let interactive = 0;
  for (const b of l.blocks) {
    if (b.kind === 'prose' || b.kind === 'callout') words += b.md.split(/\s+/).length;
    else if (b.kind === 'check') interactive += 1;
    else if (b.kind === 'widget') interactive += 2;
    else if (b.kind === 'video') interactive += Math.min(b.minutes, 8);
    else if (b.kind === 'receipt' || b.kind === 'example') interactive += 1;
  }
  return Math.max(2, Math.ceil(words / 220) + interactive);
}

/* ── check grading (mirror of web lib/learn/answers.ts — keep in lockstep) ───── */

/** Money ("cents") is entered as dollars and parsed with STRING math — the no-floats
 * rule applies to homework too. Returns null on anything unparseable. */
export function parseNumericAnswer(unit: 'cents' | 'shares' | 'pct' | 'bps' | 'years', raw: string): number | null {
  const s = raw.trim().replace(/[$,%\s]/g, '');
  if (!s) return null;
  if (unit === 'cents') {
    const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
    if (!m) return null;
    const sign = m[1] === '-' ? -1 : 1;
    return sign * (parseInt(m[2], 10) * 100 + (m[3] ? parseInt(m[3].padEnd(2, '0'), 10) : 0));
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
  return Math.round(parseFloat(s));
}

export function numericCorrect(q: Extract<LearnQuestion, { kind: 'numeric' }>, raw: string): boolean {
  const v = parseNumericAnswer(q.unit, raw);
  return v !== null && Math.abs(v - q.answer) <= (q.tolerance ?? 0);
}

export function choiceCorrect(q: Extract<LearnQuestion, { kind: 'choice' }>, given: string[]): boolean {
  if (given.length !== q.correct.length) return false;
  const want = new Set(q.correct);
  return given.every((id) => want.has(id));
}

/** The magazine lede (web lib/learn/content.ts ledeMd — keep in lockstep): bold +
 * capitalize a lesson's first two words; term links survive ([[x]] → **[[X]]**). */
export function ledeMd(md: string): string {
  const token = /\[\[[^\]]+\]\]|\[[^\]]+\]\(#explain:[^)\s]+\)|[A-Za-z0-9$%"'""''’‑–-]+/y;
  const caps = (t: string): string => {
    if (t.startsWith('[[')) return `[[${t.slice(2, -2).toUpperCase()}]]`;
    const link = /^\[([^\]]+)\](\(#explain:[^)\s]+\))$/.exec(t);
    if (link) return `[${link[1].toUpperCase()}]${link[2]}`;
    return t.toUpperCase();
  };
  token.lastIndex = 0;
  const first = token.exec(md);
  if (!first) return md;
  const gap = /\s+/y;
  gap.lastIndex = token.lastIndex;
  const sp = gap.exec(md);
  if (!sp) return md;
  token.lastIndex = gap.lastIndex;
  const second = token.exec(md);
  if (!second) return md;
  return `**${caps(first[0])}${sp[0]}${caps(second[0])}**${md.slice(token.lastIndex)}`;
}

export const unitHint = (unit: 'cents' | 'shares' | 'pct' | 'bps' | 'years'): string =>
  unit === 'cents' ? '$' : unit === 'pct' ? '%' : unit === 'bps' ? 'bps' : unit === 'years' ? 'years' : 'shares';

export const courseBySlug = (slug: string): LearnCourse | undefined => COURSES.find((c) => c.slug === slug);

/** Web href → the app route (tryIt links + the labs rail). Unknown hrefs return
 * null and the caller hides the link — honest, never a dead tap. */
export function appHref(webHref: string): string | null {
  const path = webHref.split(/[?#]/)[0];
  const MAP: Record<string, string> = {
    '/': '/',
    '/reports': '/more/reports',
    '/race': '/more/race',
    '/bulls': '/more/bulls',
    '/options-desk': '/more/desk',
    '/options': '/more/options',
    '/short-lab': '/more/short-lab',
    '/day-lab': '/more/day-lab',
    '/report-card': '/more/report-card',
    '/market/smart-money': '/more/smart-money',
    '/market/watchlist': '/watchlist',
    '/market/browse': '/more/browse',
    '/market': '/more/hunt',
    '/learn/glossary': '/more/learn-glossary',
    '/learn': '/more/learn',
    '/how-it-works': '/more/about-grq',
    '/chess': '/more/chess',
  };
  if (MAP[path]) return MAP[path];
  if (path.startsWith('/stocks/')) return `/stock/${path.slice('/stocks/'.length)}`;
  if (path.startsWith('/learn/')) {
    const slug = path.slice('/learn/'.length);
    return courseBySlug(slug) ? `/more/learn-course/${slug}` : null;
  }
  return null;
}

/** Resolve a [[term]] marker to a glossary entry. Markers usually carry the key
 * ("bid-ask-spread") but the agent also writes loose ones ("NAV") — normalize,
 * then fall back to a term-text match. */
export function glossaryLookup(raw: string): { key: string; entry: GlossaryEntry } | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, '-');
  if (GLOSSARY[key]) return { key, entry: GLOSSARY[key] };
  const needle = raw.trim().toLowerCase();
  for (const [k, e] of Object.entries(GLOSSARY)) {
    if (e.term.toLowerCase() === needle || e.term.toLowerCase().startsWith(needle + ' ')) return { key: k, entry: e };
  }
  for (const [k, e] of Object.entries(GLOSSARY)) {
    if (e.term.toLowerCase().includes(needle)) return { key: k, entry: e };
  }
  return null;
}
