# The Learn framework — courses that earn the name

**Status: GREENLIT (Cam, 2026-07-04) — D111. Phases L1+L2 SHIPPED same day** (block model,
per-lesson routes, retitles, 38 inline checks, 8 exams, grading API, progress + standings, `learn`
push category). Cam's decisions on §13: **viewers stay non-write** (no exams/progress — lessons,
checks and standings remain viewer-readable), retitles as proposed, pass ≥80% / unlimited retakes /
best-stands-with-attempt-count, push on passes as a normal toggleable category, **YouTube embeds
in**, **per-lesson URLs in** (course page = syllabus). Remaining: L3 media depth → L4 living
examples → L5 mobile (§12).

Cam's original brief: *"calling them 'courses' and 'lessons' is a little ridiculous — they're just
paragraphs."* This doc is the redesign of what a course **is**: structure, media, live examples,
exams, grading, and published scores. It supersedes the content model in `docs/LEARN-PORTAL.md` §3
(the portal's shell — hub, glossary, labs rail, Ask — stands).

> Same non-negotiables as D110: education-only (touches no §6 gate, no broker, no fund), $0/mo in
> new feeds, viewer-readable reads, money rules never funny, no vaporware.

---

## 1. The diagnosis

Today a lesson is `{ title, markdown body, tryIt?, widget?, receipt? }` rendered as a stack of
paragraph cards. The prose is good; the *frame* oversells it. Three gaps make "course" ring hollow:

1. **No structure inside a lesson.** One markdown string. No place for a diagram, a real chart, a
   worked example, or a question — the two widgets and six receipts are bolted on as one-off keys.
2. **Nothing asks anything of the learner.** No checks, no exam, no progress, no score. Reading a
   card and mastering bid/ask are indistinguishable to the app.
3. **Titles are decorative.** "The machine", "Reading the game", "The long game" — you can't tell
   what a course covers without opening it. Wayfinding should be matter-of-fact; the voice belongs
   in taglines and prose.

The fix is not more paragraphs. It's a **content framework**: lessons become typed sequences of
blocks (prose · diagram · live chart · video · living example · receipt · check), every course ends
in a graded exam, and the hub publishes who's passed what.

## 2. Principles (the GRQ roots, kept load-bearing)

1. **Receipts beat stock photos.** The fund's own fills, drawdowns, and dials are the best teaching
   material any finance course has ever had. Every abstract claim gets grounded in something live:
   a receipt, a real chart, or a refreshed market example.
2. **The market is the textbook.** Examples refresh themselves from data we already ingest — the
   gap lesson cites *yesterday's* actual gap. A reader in October sees a different (still true)
   lesson than a reader in July.
3. **Honest assessment.** Scores published with attempt counts. Open answers graded by Alfred are
   labeled as such. The benchmark logic applies to learners too: no grade inflation.
4. **Matter-of-fact titles, voiced prose.** Titles say what a thing is; taglines and lessons carry
   the personality. (The money-rules-are-never-funny rule already draws this line.)
5. **Content is code.** The curriculum stays typed, reviewed, tested, and versioned in
   `web/lib/learn/` — no CMS. The database holds only the *living* layer: refreshed examples,
   attempts, progress.
6. **Cheap to run.** Haiku-only, batched, cached. No Opus. No agent sessions. No new paid feeds.

## 3. The shape

```
Course
├─ overview        (what you'll be able to do after — 3 bullets, on the syllabus page)
├─ Lesson × 4–7    (each 3–6 min: blocks + 1–3 inline checks)
└─ Exam            (8–12 questions, graded, best-score-stands, published)
```

**Lesson anatomy** — the convention that kills "just a paragraph" (and the lint that enforces it):

| Beat | What | Block kinds |
|---|---|---|
| Hook | Why this matters, in two sentences | prose |
| Mechanism | How it actually works | prose + **diagram / chart / widget** |
| Reality | The claim, grounded live | **receipt / example / chart / tryIt** |
| Check | 1–3 questions, instant feedback | **check** |

A live lesson must contain ≥1 non-prose block and ≥1 check (test-enforced after the content
migration; warn-level during it).

**Routing:** lessons get their own pages — `/learn/[course]/[lesson]` with prev/next — and
`/learn/[course]` becomes the **syllabus**: overview, lesson list with per-user checkmarks and
minutes, the exam card, and the class's scores for that course. Richer lessons stacked five-deep on
one page would be a scroll wall; per-lesson pages also give progress a natural unit and Ask Alfred
a natural context.

### 3.1 Retitles (matter-of-fact)

| # | Today | Proposed | Covers |
|---|---|---|---|
| 1 | The machine | **Market structure** | stocks, exchanges, tickers/CDRs, hours, indices |
| 2 | How a price happens | **How prices work** | bid/ask, order types, liquidity, what moves price, quotes |
| 3 | Owning a piece | **Owning stocks** | dividends, splits/buybacks, ACB & taxes, ETFs, FX |
| 4 | Reading the game | **Reading the data** | earnings, analysts, 13F/insider, technicals, news/crowd |
| 5 | Risk | **Risk** *(keep)* | volatility, drawdown, sizing, leverage, banned bets |
| 6 | Options | **Options** *(keep)* | the D100 portal |
| 7 | The long game | **Long-term investing** | compounding, benchmark, fees/tax, behaviour, selling |
| 8 | How GRQ works | **How GRQ works** *(keep)* | the fund as the worked example |

Slugs keep their current values (links in the chat persona, mobile export, and tryIts stay valid);
only display titles change.

## 4. The block model

`LearnLesson.body: string` becomes `LearnLesson.blocks: LearnBlock[]`. Existing bodies migrate
mechanically (one prose block; `widget`/`receipt`/`tryIt` keys become blocks in place).

```ts
type LearnBlock =
  | { kind: "prose";   md: string }                                       // Md — [[term]] spine as today
  | { kind: "callout"; tone: "note" | "trap" | "rule"; md: string }       // rule = hard-guardrail framing
  | { kind: "diagram"; id: LearnDiagramKey; caption?: string }            // themed SVG registry (§5.1)
  | { kind: "chart";   spec: LearnChartSpec; caption?: string }           // real or authored data (§5.2)
  | { kind: "figure";  src: string; alt: string; caption?: string; credit?: string } // /public/learn/*
  | { kind: "widget";  id: LearnWidgetKey }                               // order-book, compounding, +future
  | { kind: "receipt"; id: LearnReceiptKey }                              // the six live-fund blocks, as-is
  | { kind: "example"; key: string; fallbackMd: string }                  // living market example (§6)
  | { kind: "video";   yt: string; title: string; author: string; minutes: number; why: string } // §5.3
  | { kind: "check";   q: LearnQuestion }                                 // inline knowledge check (§7)
  | { kind: "tryIt";   links: { href: string; label: string }[] }         // field trips into the live app
```

Rendering: `components/learn/BlockRenderer.tsx` maps kind → component inside the (still
server-rendered) lesson page; `check` and `widget` are the client islands. The current hardcoded
`WIDGETS` map in the course page becomes the registry pattern for widgets *and* diagrams.

Authoring rules (test-enforced, extending `learn-content.test.ts`):
- every `[[term]]` / `#explain:` slug exists in the glossary; no nav links inside prose (unchanged);
- every `diagram`/`widget`/`receipt`/`example` id is registered; `video.yt` matches `^[\w-]{11}$`;
- every check/exam question has a resolvable answer key (choice `correct ⊆ options`, numeric
  tolerance defined, open rubric non-empty);
- media are blocks, never markdown `![]()` — captions, credits, and theming stay typed.

## 5. Media

### 5.1 Diagrams — built, not borrowed
Hand-built theme-aware SVG components (light+dark via tokens, like the widgets), registered like
widgets. Finance-course diagrams beat any stock image and never rot. Proposed v1 set of eight:

| id | Shows | Course |
|---|---|---|
| `order-path` | you → broker → exchange matching engine → clearing | 1 |
| `market-map` | primary (IPO) vs secondary market — where your money actually goes | 1 |
| `book-ladder` | bids/asks stacked around the spread (static sibling of the sim) | 2 |
| `acb-timeline` | three buys → ACB → a sell → realized vs unrealized | 3 |
| `drawdown-ladder` | −10/−25/−50% and the gain each needs back | 5 |
| `margin-spiral` | leverage → fall → margin call → forced sell at the bottom | 5 |
| `fee-gravity` | two 30-year curves, 0.06% vs 2% MER, diverging | 7 |
| `grq-pipeline` | candidate → dossier → promote (screen) → §6 gate → order → journal | 8 |

### 5.2 Charts — real data, annotated
A `chart` block renders our own chart kit (the `CompoundingSim`/`PayoffChart`/sparkline lineage —
no new chart dependency) from either:

```ts
type LearnChartSpec =
  | { kind: "series"; symbol: string; days: number; annotations?: { date: string; label: string }[] }
  | { kind: "frozen"; title: string; series: { label: string; points: [string, number][] }[] };
```

`series` pulls closes from the quote cache we already maintain (the stock-page `closes` path) —
e.g. the market-hours lesson shows a real recent earnings gap with the gap annotated. `frozen` is
authored teaching data for stylized shapes. Both stamp their honesty: `live · as of Jul 3` vs
`illustration`.

### 5.3 Video — curated, not embedded-by-vibes
YouTube is where the best free explainers live; the framework uses it without outsourcing the
voice:

- **Render:** lite-embed — thumbnail + title + author + minutes + a one-line `why` ("watch for how
  the specialist quotes both sides"), click loads the `youtube-nocookie` iframe. No tracking or
  layout shift before the click. Mobile opens externally.
- **Curation rubric** (every video block passes all five): explains a *mechanism*, not a stock
  pick; durable source (exchange/regulator/long-running educator); ≤15 min preferred; zero
  get-rich content; the `why` line is written by us.
- **Pipeline:** `scripts/curate-lesson-media.ts <course>` — a research pass (web search across
  candidate explainers) that emits a proposals file; Cam reviews; survivors get committed as
  blocks. Curation is agent-assisted, but a human commits — same as all content.
- **Rot defense:** a weekly script hits YouTube oEmbed (keyless) for every `yt` id; dead ones get
  flagged in the report and the block renders its graceful fallback (title/author, "video
  unavailable — flagged for re-curation") — a lesson never breaks on a deleted video.

### 5.4 Figures
`/public/learn/` self-hosted only, with alt + credit required. Expected to be rare — diagrams and
charts cover almost everything better. No hotlinking.

## 6. Living examples — the textbook that updates itself

The `example` block is the framework's signature move: a market example that **refreshes from data
GRQ already ingests**, so lessons cite this week's market instead of a 2019 anecdote.

- **Engine:** `runLearnExamplesRefresh()` in the runner's nightly window. Each registered example
  is a *code* generator that queries what we already store (movers, quotes, earnings calendar,
  analyst actions, insider clusters, social buzz, FX, our own trades) into compact facts, then one
  **Haiku** call writes 2–4 sentences in GRQ voice. Result upserted into `LearnExample`; skipped if
  fresh. ~10–15 examples/day ≈ noise next to a single check-in.
- **Render:** the block shows the text + a mini fact row, stamped `live example · as of <date>`,
  linking the names it cites to their stock pages. On any failure it renders the authored
  `fallbackMd` — the receipts rule: a lesson never falls over on its live parts.
- **v1 set (~10):** yesterday's biggest gap (market hours) · a tight-vs-wide live spread pair
  (spread) · a heavy-volume vs thin-volume mover (what moves price) · this week's ex-dividend name
  (dividends) · this week's reporters + last week's biggest surprise (earnings) · the analyst
  action of the week (ratings) · the freshest insider cluster buy (big money) · calmest vs
  bumpiest universe name over 30 days (volatility) · the loudest social-buzz name (crowd) · the
  month's CAD/USD drift (two currencies).

## 7. Checks & exams

### 7.1 Question model (shared by inline checks and exams)

```ts
type LearnQuestion = {
  id: string;
  prompt: string;                    // md
  attach?: LearnBlock;               // a diagram/frozen chart/fact table the question reads from
  explain: string;                   // shown after answering — the teach-back, md
  reviewLesson?: string;             // lesson slug to reread on a miss
} & (
  | { kind: "choice";  options: { id: string; md: string }[]; correct: string[]; multi?: boolean }
  | { kind: "numeric"; unit: "cents" | "shares" | "pct" | "bps"; answer: number; tolerance?: number }
  | { kind: "open";    rubric: string[]; maxWords?: number }
);
```

Integer answers only (`cents`/`bps` where money — the house rule extends to homework).

### 7.2 Inline checks (formative)
1–3 per lesson, `choice`/`numeric` only. Client-graded — keys may ship to the browser because the
stakes are zero: instant feedback + the `explain` teach-back, recorded only as lesson-completion
signal, never scored. Brilliant-style: the lesson asks something of you before it lets you coast.

### 7.3 Course exams (summative)
- 8–12 questions per course; at most one `open`. Options (Course 6) gets its exam **inside Learn**
  even though its lessons live in the portal — one exam system, eight courses.
- **Server-graded.** `GET /api/learn/exam/[course]` serves questions with keys/rubrics stripped and
  order shuffled per attempt; `POST` grades in code, stores the attempt, returns per-question
  results with `explain` + a *review this lesson* link per miss.
- **`open` grading:** one Haiku call against the rubric → integer score + two sentences of
  feedback, labeled *graded by Alfred*. Deterministic kinds never touch a model.
- **Attempts:** unlimited; **best score stands; attempt count published** ("92% · 2nd attempt" —
  honest the GRQ way). Pass ≥ 80% → the course badge. `version` on every exam; attempts record the
  version they took.
- **Field-trip questions:** each exam includes one question whose answer must be *found in the
  live app* ("What is the fund's cash floor right now? — Settings → the dials"). The app is the
  lab bench; keys for these live server-side against the same live values.
- Answer keys exist only in `web/lib/learn/exams.ts` and are stripped from every client payload
  **and** from `shared/content/learn.json` (test-asserted) — mobile takes exams through the API.

## 8. Progress, standings, publication

```prisma
model LearnLessonDone {              // a lesson's checks answered (or explicit "mark done")
  id String @id @default(cuid())
  email      String
  courseSlug String
  lessonSlug String
  at         DateTime @default(now())
  @@unique([email, courseSlug, lessonSlug])
}
model LearnExamAttempt {
  id String @id @default(cuid())
  email      String
  courseSlug String
  version    Int
  startedAt  DateTime @default(now())
  submittedAt DateTime?
  scorePct   Int?                    // integer percent — no floats, even here
  passed     Boolean  @default(false)
  answers    Json?
  feedback   Json?                   // per-question results incl. Alfred's open-answer notes
  @@index([courseSlug, email])
}
model LearnExample {
  key        String @id              // e.g. "biggest-gap"
  courseSlug String
  lessonSlug String
  asOf       DateTime
  md         String
  dataJson   Json?
}
```

- **Hub:** course cards gain a per-user progress ring (lessons done) + the exam badge/score.
- **The class (standings):** a hub panel — avatar (the D78 people layer), courses passed, best
  score per course with attempt count, last activity. Viewer-visible (it's a read). Copy in GRQ
  voice; scores are facts, not celebrations (D71 applies to homework too).
- **Push:** a toggleable `learn` category (default ON like its peers): "Graham passed Risk — 88%,
  first attempt." Rare by nature; the other member will want to know.
- **Syllabus page:** per-lesson checkmarks, exam card with your best + the class's.

## 9. Alfred as TA

- Lesson pages get lesson-scoped Ask ("ask about *this* lesson") — the existing `grq:chat`
  CustomEvent with the lesson title/slug as context; starter prompts per lesson.
- Exam results offer *"Ask Alfred why"* per missed question — prefills chat with the question +
  your answer (never the key).
- The chat persona's Learn paragraph grows one line: when a member's recent misses exist, Alfred
  may suggest the `reviewLesson`. (Parking lot: attempt-aware tutoring.)

## 10. Mobile (GRQ Go) — designed for, not built yet

Blocks are JSON-serializable by construction; the export keeps mirroring to
`shared/content/learn.json` (keys stripped). The RN renderer maps kinds it knows and renders a
graceful "interactive on web" card for `widget`/`receipt` (as today's plan); `video` renders
thumbnail → external open; exams and progress go through the same API with the GRQ-JWT. Ships when
D110 Phase 4 unblocks (explicitly ON HOLD per Cam) — nothing in this framework depends on it.

## 11. Cost & ops guardrails

- **Models:** Haiku only — nightly examples (~10–15 calls) + open-question grading (per
  submission). No Opus, no agent sessions, no new subscriptions. Token burn shows in
  `/admin/usage` like everything else.
- **No new deps:** charts use our SVG kit; video embeds are plain iframes-on-click; grading is
  code + one Haiku call.
- **Failure posture:** every live block (chart/example/receipt/video) has an authored fallback —
  a lesson renders fully with the network unplugged.

## 12. Build phases

| Phase | Ships | Notes |
|---|---|---|
| **L1 — skeleton** | Block model + `BlockRenderer`, per-lesson routes, syllabus pages, retitles, mechanical migration of all 35 lessons, zod content tests, export update | No content rewritten; visual delta = titles + routing |
| **L2 — assessment** | Inline checks for every live lesson (~2 each), 7 exams (+ Options' = 8), grading routes, progress + attempts models, standings panel, `learn` push category | The headline. Plumbing is small; **authoring ~70 checks + ~80 exam questions is the real work** |
| **L3 — depth** | The 8 diagrams, chart blocks with annotated real data, callouts, video curation pass (script → review → commit), structure lint enforced | Course-by-course content upgrade — this is where "just paragraphs" actually dies |
| **L4 — living examples** | `LearnExample` engine + runner job + ~10 example blocks | Small build, big character |
| **L5 — mobile** | RN block renderer + exams via API | Gated on D110 Phase 4 unblocking |

Sequencing rationale: structure first (everything hangs off blocks), assessment second (Cam's
explicit ask; makes progress real), then depth and the living layer. Each phase is independently
shippable and leaves the portal better than it found it.

## 13. Decisions needed (Cam / Graham)

1. **Viewers in the class?** Exams/progress are the app's first would-be *viewer* write path
   (today viewers 403 on all writes; `explain` is the only open POST). Recommend **yes** — it's an
   education surface with no money adjacency, and "participants" reads as more than two people —
   but it deliberately widens the write model, so it's your call. Members-only is a one-line guard
   either way.
2. **Retitles** — sign off §3.1 (slugs unchanged either way).
3. **Grading rules** — pass ≥80%, unlimited retakes, best-stands-with-attempt-count-shown?
4. **Push on passes** — `learn` as a normal toggleable category?
5. **YouTube embeds** — comfortable with click-to-load `youtube-nocookie` iframes on the portal?
6. **Per-lesson URLs** — `/learn/[course]/[lesson]` with the course page as syllabus?

## 14. Parking lot (good, not now)

- **Capstone:** after Course 8, write a five-question mini-dossier on a real name; Alfred grades it
  against the fund's actual dossier; a badge on the standings. The best idea here that isn't v1.
- Attempt-aware tutoring (Alfred sees your miss history), spaced-repetition review prompts,
  glossary self-quiz mode, certificates page, parameterized numeric variants per attempt,
  screenshot-figures of the app's own panels (rot risk — receipts do it better live).
