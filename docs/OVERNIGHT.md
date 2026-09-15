# Overnight log, 2026-09-15 → 16

Decisions made while you were asleep that you weren't asked about. Each entry says what I picked, why, and how hard it would be to reverse. Lesson notes (Phase 3) flag anything I'm unsure reads well.

## Decisions

### Order step 2: "Gate B: record my buffer choices, regenerate milestone 8's datasets"

- **Choice:** what step 2 needed, given that Gate B was already recorded (D-022, 2026-09-14) and datasets for it were committed in milestones 8–11.
- **Picked:** no new decision entry. I ran `pnpm engine:generate`, which wrote no changes, and `--check` confirmed every committed file equals a fresh generation. You kept D-022 as it is on 2026-09-15.
- **Why:** re-recording would duplicate D-022, and regenerating produced byte-identical files.
- **Reversal:** nothing to reverse.

### Branches

- **Choice:** where Phase 2–4 work lives.
- **Picked:**
  - `phase-2/app-shell` branches off `phase-1/cube-engine`;
  - `phase-3/lessons` branches off Phase 2;
  - `phase-4/trainers` branches off Phase 3;
  - each is pushed as it goes, with no PRs and nothing merged to master.
- **Why:** each phase gets reviewed separately and stacks on the one before it.
- **Reversal:** easy; the branches can be merged or rebased in any order you like.

### Storage: additions to MIGRATION.md's illustrative schema

- **Choice:** what schema v1 holds beyond MIGRATION.md §3.
- **Picked:**
  - an optional `settings` block in the export (theme, palette, voice, last backup, persistent-storage status);
  - `drill.attempt` and `lesson.*` event types in v1;
  - a strict import-report schema.
- **Why:** Phases 3–4 need to log lesson progress and drill attempts, and a backup should restore preferences. Adding them now avoids a v2 migration before any real data exists.
- **Reversal:** easy until your real import happens. Afterwards, removing a field would need a v2 migration.

### Storage: Dexie transactions buffer writes (D-029)

- **Choice:** how IndexedDB transactions work.
- **Picked:** each transaction reads through to IndexedDB, buffers its writes, and commits them in one IndexedDB transaction at the end.
- **Why:** Dexie's ambient transactions committed early in tests (`PrematureCommitError`) when a nested operation followed a plain await.
- **Reversal:** moderate. It's contained in `dexie-backend.ts`, and the storage tests pin the behaviour.

### Legacy DB dry run (authorized: read-only)

- **Choice:** none. This is a record of what ran.
- **Ran:** `pnpm import:legacy --db ../LetterPairTrainer/letterpairs.db --dry-run` and the `LEGACY_DB_PATH` test.
  - Both read the file's bytes only. No files were written.
  - The SHA-256 was `4622dd92…51d5` before and after, the same as the audit.
  - Every golden number matched (D-029).
- **Reversal:** nothing to reverse. The real import into the app is still yours to run and confirm.

### Web: packages consumed as built `dist/`, not TypeScript source

- **Choice:** how `apps/web` imports the engine and storage packages.
- **Picked:** their compiled `dist/` output; `pnpm dev` builds them first.
- **Why:** Turbopack doesn't resolve the packages' `.js` import specifiers to `.ts` files, so importing source fails the build.
- **Reversal:** easy. Switching to source imports would need a bundler extension alias, or rewriting imports without extensions.

### Web: the 3D cube uses PG3D, with its colours from the palette tokens

- **Choice:** how colourblind palettes reach the 3D cube.
- **Picked:** cubing.js's PG3D renderer, whose 3x3 geometry loader is wrapped so its sticker colours come from the `--face-*` tokens.
- **Why:** cubing.js has no sticker-colour option, and the palette must recolour the cube too (DESIGN.md).
- **Checked:** in the browser, with both the standard and deuteranopia palettes.
- **Reversal:** moderate. It relies on a cubing.js internal shape (`pg().get3d()`); the wrapper falls back to default colours if that changes.

### Web: masks grey out everything else by default

- **Choice:** what "everything dim except the buffer and target" means on the 3D cube.
- **Picked:** cubing.js's `ignored` (grey) by default, with `dim="soft"` available.
- **Why:** cubing.js's `dim` measured about 73% brightness in the browser, too close to full colour.
- **Reversal:** one default in `cube.tsx`.

### Web: `/lab` is hidden in production unless `NEXT_PUBLIC_FLAGS=lab`

- **Choice:** how you reach the design review page.
- **Picked:** it's on in `pnpm dev`; for a production build, set `NEXT_PUBLIC_FLAGS=lab`.
- **Why:** your answer said "behind a feature flag so it ships dark".
- **Reversal:** trivial.

### Web: the static-export segment 404 fix

- **Choice:** what to do about Next 16's prefetch 404s on static hosting.
- **Picked:** a post-build copy of each segment payload to the flat file name the client requests.
- **Why:** it keeps client-side navigation working on any static host.
- **Reversal:** delete `scripts/segments.mjs` once Next fixes this.

### Web: the lab page's demo text is written inline

- **Choice:** whether `/lab`'s sample strings go through the dictionary.
- **Picked:** they're inline. It's a development page behind a flag, and its samples are design fixtures, not site copy.
- **Reversal:** easy.

## Constellation direction (your DESIGN-DIRECTION.md message)

### Reconciling DESIGN-DIRECTION.md with the existing system

- **Choice:** where the two documents disagree (see DESIGN.md, "Reconciling the constellation direction").
- **Picked:**
  - stars and glows are **chalk**, not an accent colour, because colour still means a face;
  - DESIGN-DIRECTION.md §4's "sticker colours for piece types, tracks, states" gives way to your face-only answer;
  - parallax and page travel run only in response to scrolling or navigating, never on a timer;
  - the transmission window is the one square-cornered surface;
  - no starfield in the light theme.
- **Why:** DESIGN-DIRECTION.md §6 says to keep what's already decided. CLAUDE.md allows motion only in response to user action.
- **Tension to flag:** CLAUDE.md also says motion should happen "only when it shows what changed". Parallax is atmosphere and doesn't show a change. I implemented it because you asked for it explicitly, kept it small (0.1–0.3× scroll), and made reduced motion remove it entirely.
- **Reversal:** easy. Chalk values and motion durations are tokens and CSS; turning parallax off is one flag in `starfield-model.ts` (`LAYER_SPEEDS`).

### Reduced motion: "static" still allows a cross-fade between pages

- **Choice:** what "collapse everything to static" means for page transitions.
- **Picked:** nothing moves. No parallax, no scaling, no streaking, no dialog entrance. Page changes are a 160ms opacity cross-fade.
- **Why:** DESIGN-DIRECTION.md §3 asks for "a plain cross-fade — never a hard cut" under reduced motion, and opacity isn't spatial motion.
- **Reversal:** one CSS rule. Replace the `fade` keyframes with `animation: none` for an instant change.

### Transmission window replaces the inline settings confirmations

- **Choice:** where the new dialog shell is used now.
- **Picked:** the import review and "Delete all my data" confirmation in Settings. The Phase 3 voice picker will use it too.
- **Reversal:** easy.

### Committed on `phase-2/app-shell`, then `phase-3/lessons` rebased onto it

- **Choice:** where this work lives.
- **Picked:** the Phase 2 branch, in its own commits, as you asked; the Phase 3 branch then continues from it.
- **Reversal:** none needed.

## Phase 3: lessons

### Lesson pipeline

- **Choice:** how lessons are stored, rendered and checked.
- **Picked:**
  - **Files:** `content/lessons/3bld/NN-slug/lesson.mdx` holds the frontmatter and the plain voice; `tsundere.mdx`, `casual.mdx` and `roast.mdx` sit alongside it.
  - **Rendering:** each lesson is compiled at build time with `next-mdx-remote/rsc`, with JavaScript in lesson files blocked (`blockJS`). Components take string props only.
  - **Voice:** only the chosen voice mounts.
  - **Checks:** `lessons.test.ts` verifies frontmatter, prerequisites, 5–8 minutes, a recap, a known interactive component, no JavaScript, identical components and props in every voice, checkpoint ids, British spelling, every alg and sticker against the engine, and every TraceWalk scramble's advertised feature.
- **Why:** BRIEF §6 says content is data. Your answers say a voice changes the delivery, never the facts, and blocking JavaScript keeps lesson files data.
- **Reversal:** moderate. The component names are the contract.

### Checkpoints are generated by the engine, not written

- **Choice:** what checkpoint items are.
- **Picked:** `letters`, `trace`, `parity` and `setup` items are generated from a seed (lesson, checkpoint, attempt), with answers computed by the engine. `quiz` wraps written multiple-choice questions.
  - **Setup answers:** graded by what they do (`demonstrateSetup`), so any legal setup counts, not only the table's.
  - **Pass rule:** 80% by default, set per lesson in frontmatter.
- **Why:** it follows your checkpoint answer and the "nothing unverified" rule.
- **Reversal:** easy.

### Lesson notes (one line each: what I'm unsure reads well)

- **Lesson 1:** the Tsundere and Roast voices lean on the second person hard ("idiot", "your last solve"). It's within your limits, but check that the Tsundere voice's "idiot" count doesn't feel mean rather than affectionate in the pilot.
- **Lesson 2:** "Face turns never move the centres, so on a 3x3 the centres tell you which face is which" is true but skips why slices and rotations are still fine. That comes in lesson 3; check whether the forward reference is needed.
- **Lesson 3:** I'm unsure whether three MoveExplorers in one lesson is too many buttons on a phone. They wrap, but the page gets long at 380px.
- **Lesson 4:** rule 3 ("top-left" on U and D means the far and near corners on the left, the way they sit in a net) is the part of Speffz people get wrong most. I'm unsure one sentence is enough without an animated net walk.
- **Lesson 5:** introduces the swap spot and the side effect before tracing. It might be too much this early; they're mentioned so lesson 12's rules don't come from nowhere.
- **Lesson 6:** the "read what's physically in the place you just named" instruction is the crux. The guided cube lights it, but I'd like you to try it on a real cube and see whether the wording lands.
- **Lesson 7:** the Note explaining why breaking into any sticker works may be more theory than a beginner wants. It's optional reading, but it's there.
- **Lesson 8:** "the cube can't have just one corner twisted" is stated without proof. It's true, and lesson 14 gives the matching parity argument, but a curious reader might want one more sentence.
- **Lesson 9:** the example images (an intelligence test, a lecture hall) are deliberately bland so they aren't anyone's personal library. They may read as flat.
- **Lesson 10:** the route example (front door, doormat, coat hooks) assumes a house. Some readers won't have that; the text says any familiar route works.
- **Lesson 11:** **genuinely unsure.** "Memorise corners first, edges last, solve edges first" is presented as a default with its reason (freshness), not as the one right way. Sources and solvers disagree, and I didn't find a computational way to settle it. Please check it against your own experience before learners see it.
- **Lesson 12:** the setup for DFR (`D' F'`) is shown straight from the dataset. The lesson says "at most two moves", which matches the verified table.
- **Lesson 13:** "you may recognise it as the T permutation" is the one algorithm name stated in prose (D-024 records the swap as the T perm). The alg itself is from the dataset.
- **Lesson 14:** the "why parity happens" explanation (a quarter turn is a four-cycle, which takes three swaps) is correct, but compressed. It's the paragraph most likely to lose people.
- **Lesson 15:** the walkthrough scramble has parity on purpose so the step is seen. A first solve with parity may feel harder than it needs to; an easier no-parity scramble could come first.

## Phase 4: trainers

### SRS state is rebuilt from the event log, not stored

- **Choice:** where FSRS card state lives.
- **Picked:** nowhere. `packages/srs` replays a case's graded `drill.attempt` events through ts-fsrs, with fuzz off so the result is deterministic. A right answer is rated Good, a wrong one Again.
- **Why:** there's no schema v2 migration, the log stays the one source of truth, and backups carry scheduling with them automatically. It's cheap at this scale.
- **Reversal:** moderate. A cached card collection could be added later as a pure optimisation.

### Guided trace uses 25-move random scrambles, not random-state

- **Choice:** how guided trace scrambles are made.
- **Picked:** seeded 25-move random face turns (`sessionScramble`). The engine's random-state provider (D-027) needs cubing.js's solver, which runs in a web worker.
- **Why:** it keeps the trainer free of the worker, which I haven't tested under the static CSP. For tracing practice, a random-move scramble is equally useful.
- **Reversal:** easy. Swap `sessionScramble` for `seededStateProvider3x3` once the worker is checked in Phase 8.

### Trainer preferences (help level, pieces) are kept in localStorage

- **Choice:** where per-viewer trainer preferences live.
- **Picked:** localStorage, read through a guarded helper.
- **Why:** these are conveniences, not data worth backing up, and the settings schema stays unchanged.
- **Reversal:** easy.

### Trainers render only in the browser

- **Choice:** static prerendering or client-only rendering for trainer pages.
- **Picked:** client-only, via `next/dynamic` with `ssr: false`.
- **Why:** they read the URL seed and local preferences as they start, and prerendering them would only produce a flash of the wrong state.
- **Reversal:** easy.
