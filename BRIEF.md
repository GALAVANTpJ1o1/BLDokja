# Project Brief — Blindfolded Cubing Learning Platform

> **How to use this file:** save it into the root of your project folder as `BRIEF.md`, open Claude Code in that folder, and paste the "Kickoff message" at the bottom. Claude Code will read this file for the full spec.

---

## 0. Mission

Rebuild an existing personal blindfolded-cubing trainer into a **public, production-quality learning platform** that can take someone from "I can solve a 3x3 with a beginner method and nothing else" all the way to "I can solve 3BLD and 4BLD reliably, and I know how to get faster."

It must serve three audiences at once, without the beginner path feeling patronising or the advanced path feeling bolted on:

1. **Novice** — knows 3x3 notation and can solve a cube sighted. Knows nothing about BLD.
2. **Intermediate** — solves 3BLD with OP corners / M2 edges, wants to cut memo time and start 3-style.
3. **Advanced** — wants high-volume, customisable, analytics-backed drilling.

The bar is: *someone should be able to learn 3BLD using only this site, and enjoy it.* Not a book with a cube picture at the top. A guided, visual, interactive system.

---

## 1. First actions — do these before writing any feature code

1. **Inventory the existing project.** It's in this folder, written in Python. Read every file. Produce `docs/AUDIT.md` covering:
   - What it currently does (pages, trainers, logic)
   - Where the letter-pair library lives — **it is a database**. Find it, dump its schema, dump a sample of rows, and document the exact shape.
   - Any tracing / lettering / scramble logic worth porting semantically (not literally)
   - Anything that is subtly wrong or fragile (say so plainly)
2. **Write the migration plan** in `docs/MIGRATION.md`: how the existing DB becomes the new versioned JSON/IndexedDB schema, with a one-time importer script. **Nothing in that library may be lost.** Write a round-trip test: import → export → compare.
3. **Ask me the open questions** listed in §13 before starting Phase 1.
4. Only then start building.

Install whatever tooling and dependencies you need without asking. Git and VS Code are already set up. Commit in small, logical increments with clear messages.

---

## 2. Non-negotiables

- **Correctness beats features.** If the tracing engine produces a wrong letter pair, the whole site is worthless. The engine gets tests before the UI gets pixels.
- **The cube is the hero.** Nearly every concept is taught with an interactive 3D cube, not a paragraph. If you're writing three paragraphs to explain something spatial, you've made a mistake — render it instead.
- **No accounts, no backend, no Supabase in v1.** Everything is local. But every piece of user data goes through a storage port so a backend is a drop-in later.
- **Content is data, not code.** Lessons live in MDX/JSON. Adding a lesson must never mean editing a React component.
- **5BLD is not built, but nothing may block it.** Every abstraction is parameterised by puzzle + piece-type. Adding 5BLD later should be content + a piece-type definition, not a refactor.
- **Never copy text, images, or algorithm sheets from the reference sites.** Use them to get the *facts* right, then write every word and build every visual yourself.

---

## 3. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15, App Router, TypeScript strict mode |
| Styling | Tailwind CSS + CSS custom properties for theming |
| Components | shadcn/ui as a base, heavily restyled — it must not look like stock shadcn |
| **Cube rendering** | **cubing.js** (`@cubing/twisty` `<twisty-player>`) |
| Cube state / tracing | `@cubing/kpuzzle`, `@cubing/alg` |
| Scrambles | `@cubing/scramble` — `randomScrambleForEvent("333bf" \| "444bf")` |
| Content | MDX with a typed frontmatter schema |
| Local storage | IndexedDB via Dexie, behind a `StorageAdapter` interface |
| Validation | Zod at every boundary (imports, MDX frontmatter, stored records) |
| Spaced repetition | FSRS (`ts-fsrs`) |
| Charts | Build them in SVG/D3 primitives, or a light lib — but they must match the design system, not look like default Recharts |
| Tests | Vitest (unit, mandatory for engine), Playwright (a handful of critical flows) |
| Deploy | Vercel, static where possible |

**Why cubing.js matters:** `<twisty-player>` supports **stickering masks**. This is the single most important capability in the project — it lets you render a cube where every piece is dimmed except the buffer and the two targets of a commutator. That is how 3-style, M2 special cases, setup moves, and tracing get taught. Learn the stickering API properly before building any lesson UI.

Do **not** hand-roll a cube renderer in three.js.

---

## 4. Repository structure

```
/app                    Next.js routes
/content                MDX lessons + JSON data — the entire curriculum
  /lessons/3bld/...
  /lessons/4bld/...
  /algs/                3-style sets, OP/M2 alg data, setup-move tables
/packages (or /src/lib)
  /cube-engine          Pure TS. No React, no DOM. The heart of the project.
    /lettering          Speffz + custom scheme definitions
    /pieces             Piece-type definitions per puzzle
    /trace              Scramble -> targets
    /methods            OP, M2, r2, U2-centers, 3-style solvers/validators
    /commutator         Parse, expand, validate, find affected pieces
    /scramble           Generation + constrained generation
    /random             Seeded PRNG + selection strategies
  /storage              StorageAdapter port + IndexedDB adapter + migrations
  /srs                  FSRS wrapper, deck construction, scheduling
  /analytics            Event log, aggregation, derived stats
/components             UI, grouped by domain not by "atoms/molecules"
/docs                   AUDIT.md, MIGRATION.md, ENGINE.md, DECISIONS.md
```

`cube-engine` must be importable in a plain Node test with zero browser globals.

---

## 5. The cube engine (spec this carefully — everything depends on it)

### 5.1 Lettering

- Speffz as default: A–X per face, applied independently to each sticker.
- Scheme is **data**, not hardcoded. A scheme is a map from sticker coordinate → letter, per piece type.
- Support user-defined schemes and user-defined buffers. Ship Speffz + a couple of common alternatives; let the user edit any of them.

### 5.2 Piece types

Define each as a data structure: sticker coordinates, orientation cycle length, buffer default.

- 3x3: corners (8 pieces / 24 stickers, twist order 3), edges (12 / 24, flip order 2)
- 4x4: corners (as 3x3), wings (24 / 24, no orientation), x-centers (24 / 24, no orientation)
- Leave the shape open for 5BLD: midges, +centers, t-centers

### 5.3 Tracing

Pure function. Given a scramble and a config `{ puzzle, pieceType, buffer, scheme }`, return:

```ts
type TraceResult = {
  targets: string[];          // letters in solve order
  pairs: [string, string?][]; // grouped, trailing single preserved
  cycleBreaks: number[];      // indices where a new cycle starts
  flipped: string[];          // edges/midges in place, wrong orientation
  twisted: string[];          // corners in place, wrong orientation
  solvedPieces: string[];
  parity: boolean;            // odd permutation
  targetCount: number;
}
```

Rules to implement and test explicitly:
- Follow the cycle from the buffer; close it; break into the next unsolved piece.
- A piece that is already solved is skipped as a break target.
- Buffer-in-buffer-wrong-orientation is a flip/twist, not a target.
- Trailing odd letter carries into the next cycle rather than being memorised alone.
- Parity is derived from target count parity for the relevant piece type — verify against the actual permutation, don't just count.

**Testing is mandatory here.** Build a golden fixture set of at least 50 scrambles with hand-verified expected output, including: zero cycle breaks, multiple breaks, flipped edges only, twisted corners only, both, parity, solved buffer, fully solved piece type. Cross-check by applying the generated solution and asserting the cube is solved.

### 5.4 Method solvers

For each method, given a `TraceResult`, produce an executable solution and the per-target teaching data:

- **OP corners** — buffer, swap algorithm, setup moves per target, which setup moves are forbidden and why.
- **M2 edges** — buffer DF, `M2` as the swap, **all special cases handled explicitly** (self-target stickers, M-slice targets, and the D-layer/parity interaction). This is where most sites get vague; be exhaustive and be right.
- **OP edges** — for the beginner path, before M2.
- **r2 wings** (4BLD) — document where it differs from M2 rather than restating it.
- **U2 / 3-cycle x-centers** (4BLD).
- **3-style** — lookup from the alg dataset, with intuitive derivation available as a fallback.
- **Parity** handling per method, with an explanation of *why* parity occurs (odd permutation), not just "do this alg."

**Verify every method's exact conventions against the reference sources in §11 and against the existing project's database.** Do not trust your own memory for algorithms, buffers, or special-case lists. Every algorithm in the content must be verified by applying it in the engine and asserting the resulting state. Write that as an automated test over the whole alg dataset — no unverified algorithm ships.

### 5.5 Commutators

- Parse `[A, B]`, `[A: [B, C]]`, `[A, B: C]`, nested conjugates.
- Expand to a move sequence, with and without cancellations.
- Given an expanded alg, report exactly which pieces move (this drives the stickering mask).
- Validate that a given comm solves a given 3-cycle.
- Optional stretch: a search that finds comms for a target 3-cycle within a move-generator set and depth.

### 5.6 Scramble generation and randomisation

Two separate concerns — keep them separate.

**Scramble generation**
- Standard: `randomScrambleForEvent`.
- **Constrained**: caller passes a predicate over `TraceResult` (e.g. "exactly 2 cycle breaks", "has parity", "≤ 8 edge targets", "at least one twisted corner"). Implement as rejection sampling with a generation budget and a clear failure mode — never hang, never silently return something that doesn't match.
- **Drill scrambles**: for single-case practice, don't scramble a whole cube. Apply the inverse of the case. Faster and exact.

**Randomisation strategy** — this is a first-class module, not `Math.random()`:
- Seeded PRNG so a drill session is reproducible and shareable via a seed string.
- Selection strategies, pluggable:
  - `uniform`
  - `coverage` — round-robin so every case in the set is seen before any repeats
  - `weakness` — weighted by FSRS retrievability and historical error rate
  - `adversarial` — heavily biased to worst-performing cases
  - `spaced` — pure FSRS due-queue
- Recency guard: no case repeats within N items regardless of strategy.
- Every strategy must be unit-testable with a fixed seed.

---

## 6. Curriculum

Lessons are MDX with typed frontmatter: `id`, `title`, `track`, `prerequisites`, `estimatedMinutes`, `objectives`, `checkpoints`. The learning path is generated from that graph — never hardcoded in a component.

**Every lesson must contain at least one interactive cube.** A lesson with only prose fails review.

### 3BLD track

1. What blindfolded solving actually is — the shape of the whole process, no detail yet
2. Pieces, stickers, and why we talk about stickers not pieces
3. Notation refresher, including slice and wide moves (interactive — click a move, see it)
4. The Speffz lettering scheme — **interactive sticker-clicking trainer, not a diagram**
5. Buffers and the idea of shooting
6. Tracing a cycle — guided, one target at a time
7. Cycle breaks
8. Flipped edges and twisted corners
9. Memorisation 1: letter pairs and images
10. Memorisation 2: memory palaces / loci
11. Memorisation 3: ordering, review, and what to memorise first vs. solve first
12. OP corners — setup moves, why some moves are forbidden, the swap alg
13. OP edges
14. Parity — what it is, why it happens, how each method handles it
15. Your first full solve — a guided, un-timed, step-by-step walkthrough
16. M2 edges — concept
17. M2 edges — every special case, one at a time, each drillable
18. Accuracy: the common DNF causes and how to diagnose your own
19. Cutting memo time
20. Intro to commutators — interchange, insertion, the `[A, B]` shape
21. 3-style corners
22. 3-style edges
23. Building your own comms and choosing between them

### 4BLD track

Assumes 3BLD. Focus on **the differences**, not a re-teach.

1. What changes on 4x4: wings, x-centers, no fixed centres, orientation isn't given
2. Fixing orientation / choosing your reference
3. Lettering wings and x-centers
4. Solve order and why
5. Centers: U2 method, then 3-cycle comms
6. Wings: r2, and how it differs from M2
7. Corners on 4x4
8. 4BLD parity, all of it
9. Memo load: what a 4BLD memo actually looks like
10. First 4BLD success walkthrough

Every lesson ends with a **checkpoint** — a small drill that must be passed to mark it complete. Completion is stored locally and drives the roadmap.

---

## 7. Trainers

All trainers share one shell: settings panel, drill surface, session summary, and a link back to the lesson that teaches the thing. Build the shell once.

### 7.1 Guided trace mode *(priority)*

The centrepiece teaching tool.

- Random scramble, rendered in `twisty-player`.
- Mask: everything dim except the buffer and the current target. The user sees *exactly* what they should be looking at.
- User types the letter; immediate feedback; cube advances to the next target.
- Difficulty ramps: (a) full highlighting, (b) buffer only highlighted, (c) no highlighting, (d) no cube at all after an initial look.
- Handles cycle breaks and flips/twists with their own explanatory prompts the first few times, then stops explaining.
- Per-target timing is recorded — this feeds analytics and is the main diagnostic for slow memo.

### 7.2 M2 / OP trainer *(priority)*

- Drill by target letter, by case family, or by full scramble.
- For a given target: show the setup moves, the swap alg, and the undo — animated, with only the relevant pieces stickered.
- Dedicated **M2 special-case drill** — the special cases are the hard part and deserve their own focused mode with per-case mastery tracking.
- "Why is this setup illegal?" mode: show a wrong setup move and let the cube demonstrate the damage. Teaching by counterexample works far better than a warning box.
- Sighted execution mode: apply the setup on a real cube alongside the animation.

### 7.3 3-style trainer *(priority)*

- Case = ordered pair of targets relative to a buffer.
- Grid view of all cases with mastery colour-coding; click any case to drill it.
- Each case shows: the comm in bracket notation, the expanded alg, an animation with only the three pieces stickered, and the inverse.
- Learning mode (see the alg) vs. recall mode (state the alg, then reveal).
- Alg dataset is user-editable — solvers have personal alg preferences and the site must respect that. Ship a verified default set; let users override per case; export/import their set.
- Buffer-agnostic: user picks their buffer and the case set regenerates.

### 7.4 Letter-pair library + SRS *(priority)*

- Import from the existing database (see §1.2). This is existing user data — treat it as precious.
- Full 24×24 grid, editable, with per-pair: image/word, optional notes, optional category.
- FSRS scheduling; a daily review queue.
- Drill modes: pair → image, image → pair, timed rapid-fire, audio (TTS reads the pair).
- Bulk edit, find-and-replace, and CSV/JSON import-export.
- **Gap finder**: show which pairs have no image yet, prioritised by how often they've actually appeared in the user's drills.

### 7.5 Commutator sandbox

- Type bracket notation, see it expand, animate, and auto-stickered to the affected pieces.
- Reverse direction: pick three stickers on an interactive cube, get candidate comms.
- Move-count and cancellation analysis.
- Scratchpad that saves locally.

### 7.6 Custom schemes and buffers

- Scheme editor: click a sticker, type a letter. Live validation for duplicates and gaps.
- Buffer selection per piece type.
- Everything downstream — trainers, alg sets, lessons — reads from this. A user on a non-Speffz scheme must have a fully working site.

### 7.7 Difficulty customiser

A shared settings object available to every trainer:
- Target count range
- Piece type filter
- Force / forbid: parity, cycle breaks (count), flipped edges, twisted corners
- Case subset selection
- Time pressure: soft target, hard cutoff, or none
- Re-look allowed / forbidden
- Seed field (paste a seed to replay a session exactly)
- Save and name presets; share a preset as a URL

---

## 8. Progress analytics *(priority — this replaces the timer)*

No solve timer. Instead, measure the things that actually diagnose slowness.

**Event log** — append-only, local, every drill interaction: case id, strategy, correctness, response time, timestamp, settings snapshot.

**Derived views:**
- **Letter-pair heatmap** — 24×24 grid, cell colour = recall speed, cell border = accuracy. One glance tells you where your memo dies.
- **3-style mastery grid** — same idea over comm cases.
- **Trace diagnostics** — median time per target, broken out by: normal target, cycle break, flip/twist, first target of a cycle. This is the single most useful chart on the site for an intermediate solver, because it shows *which kind* of lookup is slow, not just that memo is slow.
- **Trend over time** — per metric, with a sensible smoothing window and an honest "not enough data yet" state.
- **Weak 20** — auto-generated deck of the twenty worst-performing items across all trainers, one click to drill.
- **Session summary** after every drill: what improved, what regressed, what to do next. Concrete, not motivational filler.

All data exportable as JSON. Include a visible, working "delete all my data" action.

---

## 9. Design direction

Run a real design pass before writing UI code: produce a token system (4–6 named colours, type scale with roles, layout concept, three guiding principles) in `docs/DESIGN.md`, review it against this brief, revise anything generic, then build.

**Ground the design in the subject matter.** Two things are specific to blindfolded cubing and nothing else:

1. **The six sticker colours are already a semantic language.** Use them as the site's palette system — piece types, tracks, and states mapped consistently to face colours across the entire information architecture. The cube's colours should be the loudest thing on any screen; the interface around it stays quiet so the cube reads instantly.
2. **Single letters carry spatial meaning.** A–X isn't decoration here, it's the entire notation. Type treatment of individual letters can be an active design element — section markers, target displays, the lettering trainer — which argues for a typeface with genuinely distinctive uppercase letterforms.

Base ground: something that reads as a dim room rather than a UI dark mode — a desaturated deep blue-violet, not near-black. Warm off-white for text. Light theme as a properly designed alternative, not an inversion.

**Avoid these — they're the standard AI-generated tells:**
- Near-black background with one bright acid accent
- Cream background + high-contrast serif + terracotta accent
- Everything chopped into identical rounded cards with the same soft grey shadow
- Tracked-out ALL-CAPS eyebrow labels above every heading
- `01 / 02 / 03` numbered markers on content that isn't a sequence
- One word in a headline coloured or italicised for emphasis
- `→` appended to every button label
- Fade-and-slide-up entrance animations on every section

Motion: only in response to user action, and only when it shows what changed. The cube animating a commutator is motion that carries information. Everything else should hold still.

---

## 10. Quality floor

Build these in from the start; retrofitting is miserable.

- **Responsive to mobile.** Cube rendering on a 380px viewport must be usable, not just non-broken.
- **Colourblind sticker palettes** — configurable, with at least one high-contrast and one deuteranopia-safe preset. This is a cube site; sticker colour is load-bearing information.
- **Full keyboard operation** with visible focus. Trainers should be fully drillable without touching a mouse — serious users will want this.
- **Screen reader support and a text-only mode.** Blind and low-vision people solve BLD. Every cube state must have a meaningful text representation, and every trainer must have a non-visual path with TTS.
- **`prefers-reduced-motion` respected.**
- **PWA / offline** — lessons and all trainers work with no network.
- Lighthouse: performance and accessibility both ≥ 95 on the main routes.

---

## 11. Reference sources

Use these to verify facts, conventions, algorithms, and terminology. **Write all prose and build all visuals yourself — never copy text, images, or alg sheets.**

- J Perm — the primary reference for beginner-friendly BLD pedagogy:
  - https://jperm.net/bld
  - https://www.jperm.net/bld/faster
  - https://jperm.net/ (notation, 3x3 fundamentals)
  - J Perm's BLD video playlist for how concepts are sequenced
- Speedsolving Wiki — https://www.speedsolving.com/wiki/ — particularly the Old Pochmann, M2, M2/R2, 3-Style, Speffz, Commutator, and 4BLD pages
- Speedsolving forums, Blindsolving section — where the 4BLD and freestyle-centers discussion actually lives
- cubing.js docs and examples — https://js.cubing.net/cubing/
- `three-style` comm finder — https://github.com/luckasRanarison/three-style — useful as a reference implementation for comm search
- Published 3-style alg sheets (e.g. OllieFrost's TSV set on GitHub) — for **verification** of your generated set, not for wholesale import without checking

If any source conflicts with another, verify computationally in the engine and record the decision in `docs/DECISIONS.md`.

---

## 12. Built for a public launch

This becomes an official site later. Build accordingly, without building the backend now.

- **Storage port**: all reads/writes go through `StorageAdapter`. The IndexedDB adapter is one implementation. A future `RemoteAdapter` must require zero changes elsewhere.
- **Versioned local schema** with forward migrations. Bump the version, write the migration, test it. Never silently drop user data.
- **Zod-validate all imported data.** Imported JSON is untrusted input. Reject with a useful error rather than corrupting the store.
- **No `dangerouslySetInnerHTML` on anything user-supplied.** Letter-pair images are user text and will end up in the DOM.
- **Strict CSP**, no inline scripts, no third-party analytics in v1.
- **Feature flags module** so half-built things can ship dark.
- **i18n-ready**: all user-facing copy through a dictionary, even with only `en` present. Retrofitting i18n across a content-heavy site is brutal.
- **Content authoring guide** in `docs/` so lessons can be contributed without touching app code.
- `docs/DECISIONS.md` — short ADR entries for every significant architectural choice.

---

## 13. Ask me these before Phase 1

1. What's in the existing database, and does anything in it surprise you or look wrong?
2. Which buffers do I currently use for corners and edges?
3. Should the default 3-style alg set be generated by your comm search, sourced from a published set, or left empty for me to fill?
4. Anything in the current site I should keep exactly as-is?

---

## 14. Build phases

Don't run ahead. Stop at each checkpoint and show me.

| Phase | Deliverable | Checkpoint |
|---|---|---|
| 0 | `docs/AUDIT.md`, `docs/MIGRATION.md`, questions answered | I review the audit |
| 1 | `cube-engine` complete with full test suite, no UI | All golden fixtures pass; alg dataset verified |
| 2 | Design tokens, app shell, cube component wrapper, storage layer + DB import | I review the visual direction |
| 3 | 3BLD lesson content, lessons 1–15 | I read through the beginner path |
| 4 | Guided trace + M2/OP trainer + letter-pair library | I drill for a week |
| 5 | 3-style trainer, comm sandbox, custom schemes, difficulty customiser | — |
| 6 | Analytics | — |
| 7 | 4BLD track: lessons + trainers | — |
| 8 | A11y audit, PWA, performance, deploy | Launch |

---

## 15. Kickoff message

> Read `BRIEF.md` in this folder — it's the full spec for what we're building.
>
> Start with Phase 0 only: audit the existing Python project in this directory, find and document the letter-pair database, write `docs/AUDIT.md` and `docs/MIGRATION.md`, and ask me the questions in §13. Don't write any application code yet.
>
> Install whatever you need. Commit as you go.
