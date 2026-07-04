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

export type LearnLesson = {
  slug: string;
  title: string;
  body: string;
  tryIt?: { href: string; label: string }[];
  widget?: 'order-book' | 'compounding';
  receipt?: string;
};
export type LearnCourse = {
  slug: string;
  n: number;
  title: string;
  tagline: string;
  status: 'live' | 'soon';
  external?: { href: string };
  lessons: LearnLesson[];
};
export type LearnLab = { href: string; title: string; teaches: string };
export type GlossaryEntry = { term: string; def: string; example?: string; related?: string[] };

export const COURSES: LearnCourse[] = RAW.courses;
export const LABS: LearnLab[] = RAW.labs;
export const GLOSSARY: Record<string, GlossaryEntry> = RAW.glossary ?? {};

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
