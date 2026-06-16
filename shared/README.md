# GRQ `shared/` — the "no separation" layer

Everything that must stay identical across web (Next.js) and iOS (SwiftUI) lives here,
written once and read by both. Change it here → it changes on both platforms. This is
how "talk to the agent, it lands on web *and* iOS" actually holds.

| Path | What | Consumed by |
|---|---|---|
| `contract.ts` | API request/response shapes (zod) — the type source of truth | web routes (import) · iOS structs (generated) |
| `tokens.json` | Design tokens — brand palette, the two member themes, type/space | web (`globals.css` / Tailwind) · iOS (SwiftUI Color sets) |
| `content/` | Words — glossary, daily quotes, UI strings, voice guide | both (see `content/README.md`) |

## The rule

A user-facing change touches the contract and/or content **first**, then both platforms
render it in the same change. Per-feature parity checklist: `docs/IOS-CONTENT.md`.

## Status (2026-06-15)

`content/` and `tokens.json` are seeded **faithfully from the live web app** (no invented
values). `contract.ts` is **v0** for endpoints that don't exist yet — the web reads
Prisma directly in server components, so several read APIs are new work (`docs/IOS-PLAN.md`).
Wiring web to import from here replaces inline `web/lib/*.ts` and is a **pending edit to
existing files**, deferred while an agent is working that tree.
