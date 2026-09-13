# Project memory

The full specification is in `BRIEF.md`. Read it before any non-trivial work. This file holds the operating rules; `BRIEF.md` holds the what.

## Where things are

- `BRIEF.md` — the specification. The source of truth for scope and priorities.
- `docs/AUDIT.md` — what the old Python project did.
- `docs/MIGRATION.md` — how the old letter-pair database maps to the new schema.
- `docs/DECISIONS.md` — short ADR entries. Append to this whenever you make a choice that would be expensive to reverse.
- `docs/ENGINE.md` — how the cube engine works, for future contributors.
- `docs/DESIGN.md` — design tokens and the reasoning behind them.
- `legacy/` — read-only, hash-pinned copy of the old Python app's source. The live letter-pair database is **not** in this repo: it's at `../LetterPairTrainer/letterpairs.db`. Never open it for writing.

## Current phase

**Phase 0 — audit only.** Do not write application code.

Update this line when I confirm a phase is done. Never advance a phase on your own.

## How to work

- Use plan mode for anything touching more than two files. Show me the plan before executing.
- Stop at the phase checkpoints in `BRIEF.md` §14 and wait for my review.
- Small, logical commits with real messages. Never one giant commit at the end.
- If a requirement in `BRIEF.md` turns out to be wrong, impractical, or in conflict with another requirement, say so and propose an alternative. Do not silently reinterpret it.
- If you're unsure which of two approaches I want, ask. One question is cheaper than a wrong afternoon.
- Install dependencies freely, but record any non-obvious choice in `docs/DECISIONS.md`.

## Correctness rules (these are the ones that matter)

- **Never write a cube algorithm from memory.** Every algorithm, buffer convention, setup-move table, and special-case list must be verified computationally: apply it in the engine and assert the resulting state. An unverified algorithm does not ship.
- When reference sources disagree, resolve it in the engine and record the finding in `docs/DECISIONS.md`.
- The tracing engine gets tests before any UI consumes it. Golden fixtures with hand-verified expected output, plus a property test that applying the generated solution solves the cube.
- Never assume a letter-pair, target order, or parity rule is "obviously" right. This domain is full of off-by-one traps.

## Code conventions

- TypeScript strict. No `any`, no non-null assertions to silence the compiler.
- `cube-engine` is pure: no React, no DOM, no browser globals. It must run in a bare Node test.
- All persistence goes through the `StorageAdapter` interface. Nothing imports Dexie directly outside its adapter.
- Zod-validate everything crossing a boundary: imported JSON, MDX frontmatter, stored records read back from IndexedDB.
- No user-facing string is hardcoded in a component. Copy lives in the i18n dictionary; lesson content lives in `/content`.
- No `dangerouslySetInnerHTML` on anything a user typed. Letter-pair images are user input.
- Local data schema is versioned with forward migrations. Never drop user data silently.

## Design guardrails

Before building UI, produce and review `docs/DESIGN.md` per `BRIEF.md` §9.

Avoid these — they are the standard generated-design tells and will make the site look like everything else:

- Near-black background with one bright acid accent
- Cream background, high-contrast serif, terracotta accent
- Identical rounded cards with the same soft grey shadow everywhere
- Tracked-out ALL-CAPS eyebrow labels above headings
- `01 / 02 / 03` markers on content that isn't a sequence
- One word in a headline coloured or italicised for emphasis
- `→` appended to button labels
- Fade-and-slide-up entrances on every section

Motion only in response to user action, and only when it shows what changed.

Every lesson needs at least one interactive cube. A lesson that is only prose is not finished.

## Quality floor

Built in from the start, not retrofitted: mobile-responsive (cube usable at 380px), colourblind sticker palettes, full keyboard operation with visible focus, screen-reader text representation of every cube state, `prefers-reduced-motion` respected, offline-capable.

## Commands

```
pnpm dev            # dev server
pnpm test           # vitest, run before every commit
pnpm test:engine    # engine suite only — the one that must never go red
pnpm typecheck
pnpm lint
pnpm build
```

(Create these scripts in Phase 1 if they don't exist yet.)

## Don't

- Don't add accounts, auth, or a backend. v1 is local-only.
- Don't build 5BLD. Don't write anything that would make adding it a refactor.
- Don't copy text, images, or algorithm sheets from the reference sites in `BRIEF.md` §11. Verify facts there; write everything yourself.
- Don't add third-party analytics or telemetry.
- Don't commit secrets or `.env` files.
