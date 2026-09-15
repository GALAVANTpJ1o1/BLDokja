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

### The M2/OP drill reveals the setup, swap and undo, not just the setup

- **Choice:** what "reveal" shows for a target.
- **Picked:**
  - the setup, the swap alg and the undo written out;
  - the cube starting from the target's drill state and playing the shot once (autoplay; replay with R);
  - for a target with its own alg (M2 special cases), that alg.
- **Why:** your answer asked for recall, reveal and self-grade, with the animation playing once before stepping. Writing out all three parts is what you check yourself against. The undo is computed as the setup's inverse by the engine, never typed in.
- **Reversal:** easy.

### The illegal-setup mode explains each case from the dataset's own fields

- **Choice:** what to show for "why is this setup illegal?".
- **Picked:**
  - OP: every forbidden family's worked example, plus which pieces the family's turn moves (`disturbs`) and the verified legal setup for the same target;
  - M2: every tempting shortcut, plus the damage and the legal setup, or the special-case note when no setup exists.
- **Why:** each sentence is built from verified dataset fields, so nothing is asserted by hand. The wording is mine, and it's the part I'm least sure reads well.
- **Reversal:** easy.

### Sighted mode halves the animation tempo and doesn't autoplay

- **Choice:** what "sighted" means in the M2/OP trainer.
- **Picked:** the shot animates at half tempo, only when you press play or step, so you can follow it on a real cube. The attempt is logged with `detail.sighted: true`, so stats can separate it later.
- **Why:** BRIEF §7.2 asks for a sighted mode without defining it. This is the smallest version that's useful with a real cube in hand.
- **Reversal:** easy.

### M2/OP order: coverage by default; "Due for review" can run dry

- **Choice:** the default order, and what happens when nothing is due.
- **Picked:**
  - "Every case once" (coverage) by default;
  - "Due for review" uses the engine's spaced strategy over FSRS due dates, and says so plainly when nothing is due instead of drilling something that isn't.
- **Why:** coverage is the right start when every case is new (weakness with no history just ties). Pretending a case is due would teach the wrong schedule.
- **Reversal:** easy.

### M2/OP "case family" means the face the target is on

- **Choice:** what BRIEF §7.2's "drill by case family" groups by.
- **Picked:** the face of the target sticker (U, F, R, D, L, B), as a filter on the OP corner, OP edge and M2 edge drills. The special-case drill is already its own family.
- **Why:** it's the grouping a solver learns setups in, it needs no hand-made table, and it matches the site's rule that a colour always means its face. Grouping by setup length would be the other obvious choice.
- **Reversal:** easy.

### Full-scramble drill walks the engine's solver steps

- **Choice:** how "drill by full scramble" works.
- **Picked:**
  - two modes, OP/OP and M2 edges with OP corners;
  - a seeded random-move scramble, solved by the engine's `solveOpOp` or `solveM2Op` with the verified datasets;
  - each step drilled in order (recall, reveal on the cube from where the previous step left it, mark yourself): edges, parity when the edge memo is odd, then corners;
  - each step logged under the per-target drills' case id (`m2-special:UF:odd` and so on), so a full scramble feeds the same schedules; parity logs as `op-parity` or `m2op-parity`.
- **Why:** the solver already applies the odd/even rule and parity and is property-tested. The trainer only labels its steps. A test solves 80 scrambles through the drill and checks each step against the per-target cases.
- **Reversal:** easy.

### Words found in "find a word" are a new event type, `pairs.discovered`

- **Choice:** how to log discovery separately from drilling (AUDIT §6, Q4).
- **Picked:** a new event type in schema v1, `{ pairId, word, added }`. It is not a `drill.attempt`, so it never feeds FSRS, and it never changes an image's use count. A new image found this way starts at 0 uses.
- **Why:** the schema notes allow adding an event type without a version bump, since older data still parses. Squeezing an ungraded action into `drill.attempt` would need fake `correct` and `responseMs` values.
- **Reversal:** moderate. Once people have these events stored, removing the type needs a migration.

### The gap finder ranks by your traces, then by expected occurrence

- **Choice:** how to rank "pairs with no image yet" (BRIEF §7.4: by how often they appeared in your drills).
- **Picked:**
  1. Pairs seen in guided trace, rebuilt from each scramble's logged letters. Only complete pairs count, because the log doesn't say whether a scramble was finished.
  2. Then how often the cell occurs as a memo item for the OP buffers (UBL/UR), from `docs/reports/letter-pair-frequencies.json` (D-013), with lone letters counted as self-pairs.
  3. Then alphabetical.
- **Why:** a new user has no drill history, so a frequency tie-break makes the list useful from day one. The report is generated and checked by the engine. It uses the `separate` orientation policy, which is close enough for ranking.
- **Reversal:** easy. Buffers without a report example simply get no expected numbers.

### Drills weight pairs by weakness times occurrence

- **Choice:** the order of the letter-pair drills (D-013 consequence 2: weight every cell by how often it really occurs).
- **Picked:**
  - the engine's `weakness` weights over FSRS stats, multiplied by expected occurrence;
  - a floor of 1/20 of the mean occurrence, so a pair that can't occur for your buffers still comes up now and then;
  - the engine's recency window;
  - a seeded generator per session.
- **Why:** it follows D-013 and reuses the engine's M13 weights instead of inventing new ones.
- **Reversal:** easy.

### Image → pair accepts every pair that uses the word

- **Choice:** AUDIT §5 item 4. Your library has words shared between pairs.
- **Picked:** any pair whose real images include the word counts as right; the feedback lists the others that were also right. Shared words are also listed in library health.
- **Why:** marking you wrong for a correct association would teach the wrong thing. Health is where you decide whether a shared word is on purpose.
- **Reversal:** easy.

### "Did you mean" uses only your own words, not a dictionary

- **Choice:** AUDIT §6, "a dictionary and your own existing words".
- **Picked:**
  - suggestions come only from words already in your library;
  - they cover spacing variants, and words one character apart (4+ characters when adding a word, 5+ and less-used in the health view);
  - dismissals are remembered in this browser only.
- **Why:** a real dictionary is a multi-megabyte word list, and it would flag your deliberate non-words (`kokonut`, `ixigo`) on every visit. Your own spellings catch the typo classes the import actually found. **This is half of what you asked for.** Tell me if you want a dictionary added anyway.
- **Reversal:** easy to add a dictionary later. Moving dismissals into synced settings needs a settings field.

### "Main image decided only by alphabetical order" means never edited since import

- **Choice:** how the health view knows you've chosen a tied main image deliberately. The schema has no "confirmed" field.
- **Picked:** a pair is listed when its top two real images tie on uses and it has no `updatedAt`. Any save, including "Make main", a CSV import that touches it, or find and replace, counts as a decision.
- **Why:** it avoids a schema change, and legacy imports never have `updatedAt`.
- **Reversal:** easy, or moderate if a dedicated field is wanted.

### Renaming an image to a word the pair already has merges them

- **Choice:** what happens when an edit, a suggestion or find and replace makes two images in one pair identical.
- **Picked:** merge, as the import did: uses add up, and both legacy snapshots are kept on the surviving image. Removing an image is only ever explicit and needs two clicks. It does take that image's legacy snapshot with it; the full backup still has it.
- **Why:** duplicates within a pair would split use counts, and silently dropping one would lose data.
- **Reversal:** easy.

### CSV: one row per image, add-only import; JSON stays the full backup

- **Choice:** the CSV format and import rules, and what "JSON import-export" means for the library.
- **Picked:**
  - **Columns:** `pair, image, uses, notes, category, placeholder`.
  - **Formula guard:** cells starting with `= + - @` are written with a leading apostrophe, which import removes.
  - **Import:** adds images and fills empty notes and categories; it never deletes or overwrites. Bad lines are reported by number.
  - **JSON:** the library view links to the existing full backup in Settings instead of adding a second JSON format.
- **Why:** add-only is the safe default for "treat it as precious". The formula guard stops a spreadsheet from running your words as formulas.
- **Reversal:** easy.

### Every letter-pair drill mode feeds one FSRS schedule per pair

- **Choice:** whether review, pair → image, image → pair, rapid fire and listening share a schedule.
- **Picked:**
  - they share one, with trainer `pairs` and the mode recorded in `detail.mode`;
  - a pair joins the review queue after its first graded attempt;
  - a rapid-fire time-out counts as missed.
- **Why:** they all test the same association. The logged mode keeps them separable if the analytics phase wants direction-specific schedules.
- **Reversal:** moderate, but the history already carries what's needed.

### Rapid fire, listening, and memo sentences

- **Rapid fire:** 2, 3 or 5 seconds per pair (3 by default). When time runs out, the image is shown and the attempt counts as missed.
- **Listen:** the browser's speech synthesis reads the two letters in British English. Where speech isn't available, the mode says so.
- **Memo sentence:** a seeded random-move scramble traced with the OP buffers, split into pairs, with a lone letter as its self-pair (D-015). What you type is not saved, because nothing in the schema holds it and it's practice rather than data.
- **Reversal:** easy for all three.

### The 24 × 24 grid on small screens is a first-letter picker and a list

- **Choice:** how the overview works at 380px (AUDIT §6, Q4 conflict).
- **Picked:**
  - **From the `md` breakpoint up:** the full table, with the first letter down the side. Arrow keys move between cells (roving focus) and Enter opens a pair.
  - **On narrow screens:** 24 letter buttons, then the 24 pairs for the chosen letter.
  - **Mastery display:** DESIGN.md's lightness ramp as a strip on each cell, plus the ring, dot and square marks. Diagonal cells are shaded and explain what a self-pair is for.
- **Why:** 576 readable cells don't fit a phone. The list keeps what the overview shows (word, gap, mastery) and adds no horizontal scroll.
- **Reversal:** easy.

## Before Phase 5 (2026-09-16, second run)

### DESIGN-DIRECTION.md was already applied; two small gaps fixed

- **Finding:** the constellation layer landed in Phase 2 (34e0c92, d3aaf06):
  - the starfield canvas, with adaptive star count, parallax, and nothing drawn in the light theme;
  - the transmission-window dialog, which every dialog uses (settings, lesson voice picker, trainer keys, pair editor);
  - View Transitions page changes;
  - DESIGN.md describes the combined direction.
- **Gaps fixed:**
  - `LetterStar` used chalk on every ground, which fails contrast on the light theme's lilac mist. It now uses `--text`, with the glow only in the dark theme.
  - Two plain `next/link` links (home, lesson prerequisites) skipped the page transition. They now go through `TransitionLink`.
- **Not done:** DESIGN-DIRECTION §1's stretch goal, drawing a guided trace as a constellation. It remains a stretch goal.
- **Reversal:** easy.

### Phase 4's two open questions: no dictionary, one shared schedule

- **Choice:** the two items flagged in the Phase 4 checkpoint.
- **Picked:**
  - **No dictionary.** "Did you mean" keeps using only your own words.
  - **One FSRS schedule per pair** across all drill modes.
- **Why:** both are what's already built, as you asked. Keeping either needs no change to stored data: attempts already carry `detail.mode`, so per-mode schedules could be derived later without migrating anything.
- **Reversal:** easy for both. A per-mode schedule would be a change to `reviewsByCase` keys, not to stored data.
