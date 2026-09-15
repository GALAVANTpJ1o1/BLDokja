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
