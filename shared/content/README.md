# GRQ Shared Content

The single, language-neutral source of truth for **everything GRQ says** — the
words, definitions, quotes, and UI copy that both the web app (Next.js / TypeScript)
and the iOS app (SwiftUI) render. This is the "no separation" rule applied to
content: a phrase or a definition is written **once, here**, and both platforms read
it. Change it once → it changes on both screens.

> **Status (2026-06-15):** Seeded faithfully from the live web copy in
> `web/lib/{glossary,dailyquote,funfacts,greetings}.ts`. These JSON files are the
> **canonical source going forward**. Wiring `web/` to import from here (replacing the
> inline `.ts`) is a pending migration that edits existing files — deferred until
> cleared, because an agent is actively working that tree. Until then: add new content
> **here first**, and treat the web `.ts` as the live mirror to reconcile.

## Files

| File | What | Web mirror (today) |
|---|---|---|
| `glossary.json` | Plain-English definitions for on-screen jargon (the literacy pillar) | `web/lib/glossary.ts` |
| `daily.json` | Daily quotes/jokes, fun facts, wealth-aware greeting lines | `dailyquote.ts` · `funfacts.ts` · `greetings.ts` |
| `strings.json` | UI copy: splash, auth, tab blurbs, empty states, guardrail messages | inline in components/routes |
| `voice.md` | The GRQ voice & tone guide (for humans and the agent) | `CLAUDE.md` (the rules) |

## The determinism contract (must match across platforms)

`daily.json` content is chosen **deterministically per day**, so the quote, fun fact,
and greeting are stable through the day and **identical on web and iOS**. Both
platforms MUST implement the same selection, or the "one paper, two screens" promise
breaks.

**Day key:** the local date in **America/Toronto**, formatted `YYYY-MM-DD`
(TS: `toLocaleDateString("en-CA", { timeZone: "America/Toronto" })`).

**Hash** (32-bit, matches `web/lib`):

```
hash(s):
  h = 0
  for each character c in s:  h = (h * 31 + codePoint(c)) mod 2^32
  return h
```

Swift: accumulate in a `UInt32` using wrapping operators (`&*`, `&+`) over
`s.unicodeScalars`, so overflow matches JS's `>>> 0`.

**Selection:**

- **Daily quote** — `quotes[ hash(dayKey) % quotes.count ]`
- **Fun fact** — `funFacts[ dayOfYear % funFacts.count ]` (dayOfYear = day index in the year)
- **Greeting** — pick band from P&L %, then `bands[band][ hash(dayKey + name) % count ]`,
  and replace `{name}`.

**Greeting bands** (total P&L as a % of contributions):
`soaring ≥ 5` · `up ≥ 1` · `flat > -1` · `down > -5` · else `rough`.

The splash welcome (see `strings.json → splash`) is exactly this greeting. The app
needs `name`, `totalPnlCents`, and `contributionsCents` to pick the right band — serve
them from `/api/auth/me` so the first paint is correct.

## Adding content

Add it to the JSON here, in the voice defined by `voice.md`. On web, mirror into the
`.ts` until the migration lands; on iOS it's read directly. New glossary terms become
tappable on both platforms once each keys off this file.
