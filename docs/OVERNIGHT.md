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

## Phase 5: 3-style trainer, comm sandbox, custom schemes, difficulty customiser

### The comm search wasn't exhaustive; fixed before building on it (D-031)

- **Finding:** while making 3-style datasets for other buffers, a symmetry image turned up a 9-move comm the search had missed. The search looked cases up under the wrong one of a 3-cycle's sticker cycles.
- **Picked:**
  - fix the engine, check it against an independent oracle, and regenerate the datasets: 24 corner cases are one move shorter, none longer; the OP, M2 and parity datasets are unchanged;
  - record it as D-031.
- **Why it matters beyond the datasets:** the buffer comparison used for Gate B showed U-layer buffers with shorter 3-style comms than D-layer ones. That difference was the bug. Every corner buffer is now identical, and so is every edge buffer. **Your UFR/UF choice stands, but if comm length weighed in it, it shouldn't have.**
- **Reversal:** not wanted. The old datasets were correct but sometimes longer than necessary.

### Lessons keep the standard buffers; trainers use yours

- **Choice:** BRIEF §7.6 says lessons read your buffers, and your 2026-09-15 answer said lesson examples use your scheme and buffers.
- **Picked:**
  - **Lettering:** lessons use your scheme, except the Speffz lesson, which always shows Speffz and says why.
  - **Buffers:** lessons always use the standard ones (OP UBL/UR, M2 DF), with a note when yours differ.
  - **Trainers:** they use your scheme and your buffers.
  - **Prose:** three sentences that promised examples would follow your buffers, or called letters "Speffz", were reworded.
- **Why:** the OP lessons teach one buffer's swap spot (RDF, UL) and its setup rule ("which D, R or F turns bring this sticker to RDF"). With another buffer the prose would be wrong while the cube showed something else. The worked trace scrambles are also checked to show a break or a twist for the standard buffers, and may not for others. **This goes against your earlier answer for buffers, so please check it.**
- **Reversal:** moderate. It's one context value per lesson, but the OP lessons' prose would need rewriting around `<Buffer>` components.

### Buffer choices are limited to what the engine can verify

- **Choice:** which buffers the settings offer.
- **Picked:**
  - **OP:** the 48 corner/edge pairs a cube symmetry maps (UBL, UR) onto (`opBufferPairs`).
  - **M2/OP:** the 8 pairs for (UBL, DF) that keep M2 an M move.
  - **3-style:** any corner and any edge, as the orientation-reference sticker of each piece.
  - **Datasets:** built and verified in memory for the chosen buffers. OP takes about 0.1 s and M2/OP about 2 s in Node, on the main thread behind a loading message. 3-style datasets are rotation images of the committed sets, verified in full (about 0.3 s each).
- **Why:** anything else would need a parity alg or special cases the engine hasn't searched. The site never offers a buffer it can't back with verified algs.
- **Reversal:** easy to widen once the engine can search parity for arbitrary pairs.

### Scheme, buffers, alg overrides, presets and scratchpad live in the settings record

- **Choice:** where Phase 5's user data is stored.
- **Picked:** optional fields on the existing settings record: `scheme`, `buffers`, `algOverrides`, `difficulty`, `difficultyPresets` and `scratchpad`. Storage validates their shape; the engine validates meaning (scheme gaps and duplicates, alg correctness) wherever they're used.
- **Why:** it needs no schema version bump or IndexedDB migration, it's exported with every backup, and none of these grow large.
- **Reversal:** moderate. Moving any of them to its own collection needs a v2 migration.

### M2/OP case ids include the buffer when it isn't the standard one

- **Choice:** how drill history separates across buffers.
- **Picked:** standard-buffer ids are unchanged (`op-corners:UBR`); other buffers add themselves (`op-corners@DBL:UBR`).
- **Why:** the same target from another buffer is a different setup, so it needs its own FSRS schedule. Keeping the standard ids as they were means none of your Phase 4 history is orphaned.
- **Reversal:** easy.

### A seeded random-move scramble provider in the engine

- **Choice:** how the difficulty customiser generates constrained scrambles in the browser.
- **Picked:** `seededMoveProvider`: seeded random face turns with the state computed by applying them. No solver is involved. It works with `generateConstrained`.
- **Why:** the random-state provider needs cubing.js's search worker, which still isn't checked under the static CSP (Phase 8). Trainers already used random-move scrambles.
- **Reversal:** easy. Swap the provider.

### 3-style trainer: recall attempts are logged, learn mode isn't

- **Choice:** what BRIEF §7.3's learning and recall modes record.
- **Picked:**
  - **Recall:** state the comm, reveal, mark yourself. The attempt is logged under trainer `3style` with case id `corners@UFR:UBR-UBL`; the buffer is always in the id, since there's no older history to keep.
  - **Learn:** the alg is shown and nothing is logged.
- **Why:** seeing the answer isn't evidence of recall. Logging it would inflate FSRS stability.
- **Reversal:** easy.

### Your 3-style algs are verified before they're saved, and again every time they're shown

- **Choice:** how "the alg dataset is user-editable" (BRIEF §7.3) stays inside the rule that nothing unverified ships.
- **Picked:**
  - An alg you type is run through `validateComm` for that case, and saved only if it solves it.
  - Saved algs are checked again whenever the case list is built. Any that fail are listed as rejected and never shown as an answer.
  - Import checks every alg in the file the same way, against the verified dataset for that file's buffer.
  - Your algs come first. Dataset algs with the same cancelled moves are hidden so nothing shows twice.
- **Why:** a typo in your own alg would otherwise teach a wrong comm.
- **Reversal:** easy.

### Lessons 16–23 aren't in any phase of BRIEF §14

- **Finding:** BRIEF §6 lists 23 lessons in the 3BLD track: M2, accuracy, memo time, commutators, 3-style, and building comms. §14 schedules only lessons 1–15 (Phase 3), and Phases 5–7 don't mention the rest.
- **Picked:**
  - I haven't written them. The 3-style trainer has no "Learn it in" link yet.
  - The M2/OP trainer's M2 modes still link to the OP lessons.
- **Why:** writing eight lessons in your voice system without being asked is exactly the kind of scope I shouldn't guess at. They'd also need the voice review lessons 1–3 had.
- **Reversal:** n/a. **Tell me which phase they belong to.**

### The difficulty customiser: what each trainer takes from it

- **Choice:** BRIEF §7.7 lists fields for "every trainer", but not every field means something everywhere.
- **Picked:**

  | Trainer | Uses |
  |---|---|
  | Guided trace | piece filter, scramble limits (targets, breaks, flips/twists, parity), time pressure per target, looking again at level 4, seed |
  | M2/OP | case subset, time pressure on recall, seed; scramble limits in the full-scramble modes |
  | 3-style | case subset (per piece type), time pressure on recall, seed |
  | Letter pairs | seed (rapid fire is already its own time pressure) |

- **Soft and hard time:** a soft target marks slow answers but keeps the grade. A hard cutoff counts them as wrong: guided trace judges it when you submit; M2/OP and 3-style reveal the answer when time runs out.
- **Case subsets:** chosen by first target. An empty subset, or one that matches none of the current cases (for example after changing buffers), means every case.
- **Parity:** one control sets it for both piece types. With the centres solved they always agree on 3x3.
- **Why:** each field lands where it has a meaning. Constrained scrambles go through the engine's generator, which retraces the accepted scramble, so a scramble can never be shown as matching limits it doesn't meet.
- **Reversal:** easy.

### Presets are shared in the URL fragment

- **Choice:** how "share a preset as a URL" works with no backend.
- **Picked:** `/practice/difficulty/#preset=<base64url JSON>`. Opening the link validates the preset against the stored-preset schema and offers "Use it now" or "Save it as a preset". Nothing is applied until you choose.
- **Why:** a fragment never reaches a server, and a preset holds nothing personal. Validation stops a hand-edited link from storing anything malformed.
- **Reversal:** easy.

## Phase 6: analytics

### Every view is recomputed from the event log; nothing derived is stored

- **Choice:** whether analytics keep their own tables or read the log.
- **Picked:** a pure package, `@bld/analytics`, of functions over graded `drill.attempt` events. The dashboard, Weak 20 and session reports call it on the events already in storage.
- **Why:**
  - an export carries every view with it;
  - an import or "delete all my data" can't leave stale numbers behind;
  - the functions test in bare Node like the engine.
  - At the volumes a person produces (thousands of attempts a year) it takes milliseconds.
- **Reversal:** easy. A cache could sit in front of the same functions if logs ever get large.

### The settings snapshot is added where events are written

- **Choice:** how BRIEF §8's "settings snapshot" reaches every attempt without editing each trainer.
- **Picked:** `useEvents().append` adds `settings: { difficulty, buffers, scheme }` to any `drill.attempt` that doesn't carry one.
  - `buffers` is `"standard"` when you haven't chosen any.
  - `scheme` is the scheme's id, not its 72 letters.
  - The snapshot is parsed with the event schema before it's written.
  - Attempts logged before Phase 6 keep no snapshot; the log is append-only.
- **Why:** one place to get right, and no trainer can forget it. The scheme id is enough to tell sessions apart, and the letters are in the settings backup.
- **Reversal:** easy for new events. Old events can't gain a snapshot after the fact.

### Legacy memo attempts aren't counted in analytics

- **Choice:** whether the 51 imported memo attempts from the old app feed the heatmap and trends.
- **Picked:** no. They stay in the log and in backups, untouched, but analytics read only `drill.attempt`.
- **Why:**
  - they have no per-target or per-pair timing;
  - their correctness is an LCS score over a whole memo string, which doesn't say which pair was missed;
  - counting them would put invented per-pair numbers on the heatmap.
- **Reversal:** moderate. It would need a per-pair alignment of expected and answered strings, and a decision on how much an inferred miss should weigh.

### Heatmap encoding: fill for speed, inset border for accuracy

- **Choice:** how "cell colour = recall speed, cell border = accuracy" meets DESIGN.md, which keeps the six sticker colours for the cube.
- **Picked:**
  - **Fill:** one ink (`--text`) at five opacities, the same ramp as the mastery grids. More ink means faster, in either theme.
  - **Speed steps:** fifths of your own cases in that view, not fixed seconds. Recalling a pair and recalling a comm take very different times.
  - **Border:** an inset ring for accuracy: none at 90% or more, 2px from 70% to 90%, 4px below 70%. A thicker ring means worse, so bad cells stand out even for readers who can't see fill differences.
  - **Undrilled cells:** a hairline outline only.
  - **Hover and focus:** each cell shows its attempts, accuracy and median.
  - **Keyboard:** the grid is one Tab stop and arrow keys move between cells, so a full 576-cell map doesn't take hundreds of Tab presses to get past.
  - **Table view:** every chart has one, and the heatmap's table lists drilled cells only.
- **Why:** a hue ramp would compete with sticker colours. Relative steps keep the map informative whether your pairs take 0.8 s or 3 s.
- **Reversal:** easy. It's two constants and a ranking function.

### "Not enough data yet" thresholds

- **Choice:** when a number is shown.
- **Picked:**
  - **Medians** (trace diagnostics) need 5 targets of a kind.
  - **Trends** need 3 practice days and 20 attempts in the period. Each point is the 7-day rolling value ending that day, over local calendar days.
  - **Weak 20** needs 2 attempts per case.
  - Below a threshold, the view says so and still offers its table.
- **Why:** BRIEF §8 asks for an honest empty state. Five samples is the least that gives a median you can compare with another kind's.
- **Reversal:** easy; they're parameters.

### Weak 20: how items are scored, and over what

- **Choice:** what "worst-performing" means across trainers that measure different things.
- **Picked:**
  - **Score** = 0.5 × error rate + 0.3 × slowness + 0.2 × forgetting.
    - Error rate is smoothed as (misses + 1) / (attempts + 2), so one lucky answer doesn't clear a case.
    - Slowness is the case's rank among its own trainer's medians, so trainers aren't compared on raw time.
    - Forgetting is 1 − FSRS recall probability.
  - **History:** all of it, everywhere the list appears: home, Progress, and the deck. Progress's period filter doesn't scope it, and its caption says so.
- **Why:** mistakes matter most, because they're the DNFs. Slowness and forgetting break ties between cases you get right. A list that changed with the filter wouldn't match the deck it links to. That mismatch was in the first build and is fixed in f8fdfb5.
- **Reversal:** easy. It's one function with the weights as constants.

### Weak 20 asks each item its own trainer's way, and logs it there

- **Choice:** how a mixed deck is drilled and recorded.
- **Picked:**
  - **Letter pair:** recall the image, then reveal and mark yourself.
  - **3-style case:** the cube shows the case with its three pieces lit; recall the comm.
  - **M2/OP case:** recall the setup.
  - **Guided trace target:** the sticker is lit on a net; type its letter. The trace case is a sticker.
  - **Logging:** each answer goes under the item's own trainer and case id, with strategy `weak20` and `detail.from: "weak20"`. It feeds that case's FSRS schedule.
  - **Unavailable items** are skipped with a note and nothing logged: a case for a buffer you've since changed, or a pair whose image you deleted.
  - **The deck is fixed** when the page opens.
- **Why:** a grade means the same thing wherever it was earned. Trace items carry no lookup `kind`, so they don't distort trace diagnostics or the trainer's explanation counts.
- **Reversal:** easy.

### Session reports: what counts as a session, and as a change

- **Choice:** BRIEF §8's "what improved, what regressed, what to do next".
- **Picked:**
  - **Session:** everything since the trainer was opened, rounded down to the second, because logged times are whole seconds.
  - **Comparison:** each case in the session against its history before the session, if it has at least 2 earlier attempts.
    - **Improved:** accuracy up 20 points, or accuracy held while the median dropped by a fifth.
    - **Regressed:** the mirror, with 25% slower as the time threshold.
  - **Next steps:** only concrete ones:
    - repeat the cases you missed;
    - in guided trace, practise a lookup kind at least 1.5× slower than normal targets;
    - speed up cases that got slower but not less accurate.
    - "Keep going" only when none apply.
  - **Where it appears:** every trainer shows it under its drill. 3-style shows it in recall mode only, because learn mode logs nothing.
- **Why:** "concrete, not motivational filler" rules out anything a report can't name a case for.
- **Reversal:** easy.

### Charts are hand-built, with no chart library

- **Choice:** a charting dependency or not.
- **Picked:** three small components (bar rows, a trend line, a heat grid) in HTML and SVG.
  - Each has a table toggle, hover and keyboard focus.
  - Each is drawn at its measured width, so axis text keeps its size on a phone.
- **Why:**
  - three chart shapes don't justify a library;
  - a library would bring its own colours, fonts and animation, to be overridden back to the token system;
  - the dataviz rules (single ink, 2px lines, hairline grid, table view) are easier to hold in about 300 lines than to configure.
- **Reversal:** easy; the views pass plain data to the components.

### Browser checks used synthetic history in the dev browser only

- **Choice:** how to check the dashboard with no real drilling history yet.
- **Picked:** about 580 generated attempts across four trainers and 21 days, imported through Settings into the dev browser's storage. Nothing generated is committed, and no dataset or fixture contains it.
- **Reversal:** n/a.

## Phase 7: 4BLD (stopped early, at a clean commit)

### Phase 7 stops after orientation references and x-centre tracing

- **Choice:** you said to stop inside Phase 7's engine work at a clean commit if it couldn't land today alongside Phases 5, 6 and 8 at Phase 1's standard. It can't, so I stopped.
- **Landed** (a72a112, D-032 and D-033):
  - 4x4 orientation references;
  - x-centre tracing by colour.
  - Both are checked against independent colour oracles, with hand-derived fixtures, replay properties and teeth tests.
- **Not started as committed code:**
  - r2 wings;
  - U2 x-centres;
  - 4x4 Old Pochmann corners and 4BLD parity;
  - a 4BLD solver;
  - the 4x4 trainers;
  - 4BLD lessons 1–10.
- **Why each remaining piece is bigger than it looks:**
  - **Setup search.** The net-regime setup search packs every protected sticker's slot into one number. r2 protects 11 pieces and U2 protects 15, so that overflows. Throwaway prototypes of an exhaustive depth-limited search (not committed) needed depth 6 and took 6 s for r2 and about 60 s for U2. That's too slow for verification in the fast suite without a better search; meet-in-the-middle looks right.
  - **Verification by colour.** Four x-centres of a colour are identical, so a parity alg or an OP corner swap on 4x4 only has to leave the right colours. The dataset verifiers compare exact sticker permutations, so they need a colour-equivalent mode for x-centres before 4x4 parity algs can be verified.
  - **Special cases** need comm catalogues for 4x4 wings and x-centres with inner-slice generators. Their size and search time haven't been measured.
  - **Downstream.** The lessons and trainers need all of the above: lessons 5–8 teach U2, r2, corners and parity, and every alg in them must be verified.
- **Reversal:** n/a. The next session starts from `phase-7/4bld`.

### What the prototypes showed (measured, not committed)

- **r2** (buffer DFr, swap `2R2`, which is r2 in literature notation; D-006):
  - **Setups with U D R L F B:** every wing except the side-effect wings UFr and DBr and the l-slice wings UFl, DBl and DFl, within 5 moves.
  - **Adding the l slice (`2L`):** the three l-slice wings are reached at 6 moves by an l-slice move and then BUl's setup. That matches the tutorial PDF's "set up to Bu using l moves".
- **U2** (buffer Ubr, which the U2 tutorial thread calls "Urb"; swap slot Ufl):
  - **Pool:** D, R, L, F, B and the six inner slices.
  - **Reached:** every x-centre except the side-effect slots Ubl and Ufr, within 6 moves. The D-face centres need 5–6 moves.
- **These are starting points, not results.** Nothing from them is in a dataset.

### The x-centre default: avoid the buffer's colour

- **Choice:** which slot to shoot to when several of the right colour need it.
- **Picked:** set aside slots holding the buffer's own colour, then take the lowest letter (D-033). On 8,000 sampled traces this averaged 19.3 targets against 20.1, with 0.12 breaks against 0.92, and was never longer.
- **Why:** it's one rule that's easy to say, and it saves most breaks. Trainers will accept any valid slot (`interchangeableChoices`), so the default only decides what the engine shows as its answer.
- **Reversal:** easy; it's one policy default.

### Sources for 4BLD conventions are thin

- **Finding:** of the pages read, only the Speedsolving wiki's r2 page and the tutorial PDF state conventions (the PDF is based on Xin Shi's 4BLD method).
  - **r2:** buffer DFr, r2 as the swap, special algs for r- and l-slice wings, and an odd/even rule for FUr/BDr.
  - **Silent:** the wiki's 4x4 BLD page and the U2 centres tutorial thread explain none of the mechanics. The thread only names the buffer "Urb" and says each target costs one U2.
  - **No source** states an orientation reference.
- **Picked:** the engine derives everything and cites only what a source actually says (D-032, D-033). Conventions no source states are yours to decide; they're listed in the Phase 7 checkpoint.
- **Reversal:** n/a.
