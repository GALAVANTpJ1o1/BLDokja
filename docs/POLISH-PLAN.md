# BLDokja first major polishing pass: the single plan

Source: `BLDokja — First Major Polishing Pas.txt` (96 numbered sections, cited below as §n). One planning pass, one execution pass.
Owner instructions for this pass: no phase gates, no per-phase check-ins; do everything in the spec, verify by machine, and report what is left.

## 0. What the audit found

| Area | State today | Consequence |
| --- | --- | --- |
| Cube engine (`packages/cube-engine`) | cubing.js kpuzzle + a sticker geometry. `data/last-layer.ts` already enumerates last-layer classes from first principles (57 OLL, 21 PLL, 3 EO, 7 CO, corner-perm, 4 edge-perm) and `last-layer-match.ts` recognises a state with AUFs. | Reuse the enumeration as the independent check on the curated data. |
| CFOP algorithm data | `content/algs/cfop/*.json` are **cubing.js solver output** (17-move PLLs, `pll-19`). | Replace with curated data (§8, §72, §91). The solver files stop being shipped to the client. |
| CFOP lessons | 9 plain-voice MDX lessons, 2 KB each, yellow cross on D, "white on U" (the BLD frame). MCQ checkpoints. | Rebuild the F2L and last-layer lessons; new interactive components. |
| Orientation | One global frame: white U, green F. | Add orientation profiles (§4-7): CFOP/OH show yellow up, white cross down. |
| Trainer code | Per-page one-offs (`progressive-trainer`, `three-style-trainer`, ...). Attempts are `drill.attempt` events with a free-form `detail` record. | Build one generic trainer engine and log through the same event type (§40, §51). |
| Progress | Event log in `@bld/storage` (Dexie), Zod-validated, synced. `drill.attempt.detail` is `Record<string, json>`. | New per-case stats are *derived from events*: no schema migration, no second progress system, saved progress untouched (§80). |
| Voice picker | Modal shows BLD samples on every lesson, even ones with one voice (§63). | Only offer it where the lesson has several voices, with samples from that lesson's topic. |
| Site guide | Being finished in the working tree (`components/guide`, `i18n/guides.ts`, `e2e/page-guides.spec.ts`). | Update its steps last (§88). |

## 1. Architecture decisions (recorded as D-080 onward in `docs/DECISIONS.md`)

1. **Case state, display orientation and algorithm are three separate things** (§3). In the engine (`packages/cube-engine/src/cfop/`):
   - `CaseState`: an engine `KPattern` built from a validated constructor or from legal moves. Never sticker-by-sticker.
   - `DisplayOrientation`: a whole-cube view: `{ profile, yTurns }`. Profiles: `BLD` (white U, green F, unchanged), `CFOP` and `OH` (yellow U, white D, green F: the standard scheme turned by z2), `FREE` (as chosen in Settings).
   - `AlgorithmDefinition`: `{ moves, holding, startingOrientation, endingOrientation, fingerNotes }`, one per execution style (`2H`, `OH`).
   The cube stays in a single engine frame (last layer on U). A profile changes only which *colour* each face shows, so no algorithm is ever rewritten to suit a viewing angle (§6).
2. **One canonical dataset**, `content/algs/cfop/curated/*.json` (F2L, 2-look OLL, OLL, 2-look PLL, PLL), parsed with Zod in one loader. Lessons, references, trainers, search and statistics all read it (§9).
3. **Case identity comes from the cube state** (§55). A case is recognised by *trying* every curated algorithm with every AUF against the actual state and asking the engine whether the stage goal is met. No filename, index or label is consulted. The same call gives the AUFs to show.
4. **Correctness is a predicate on the state** (§42): `stageSatisfied(state, stage)` plus "first two layers intact". Exact-sequence matching appears nowhere.
5. **Curated data is verified by the engine** (§56): every alg is applied to its own case (derived from the alg's inverse), with both execution styles, and must meet its stage goal with F2L intact; the case set must be exactly the 57 / 21 / 3 / 7 / 2 / 4 independent classes; notation is parsed and round-tripped; the shape and name of every case is checked against the enumerated class.
6. **Trainer engine** (§40-41): a pure reducer `TrainerSession` over `TrainerStage` objects (state, render mode, expected target, success predicate, next-stage generator, hints), with response types `name`, `moves`, `sticker`, `piece`. F2L practice, last-layer recognition and later BLD drills use it. Stage chains apply the executed algorithm to the *same* cube.
7. **Render modes** (§53): a pure function `stickerVisibility(mode, cell)` returns `normal | highlight | dim | hidden` per sticker; both the 3D player and the flat net consume it. Lightweight SVG recognition diagrams are used in grids; the 3D scene is created only on demand (§79).
8. **Statistics** (§50) are folded from `drill.attempt` events (`trainer: "ll-recognition" | "f2l-practice"`, `caseId`, `responseMs`, `detail.wrong`, `detail.stage`). Learning status is *inferred* from those stats, with one explicit manual override stored in settings, and a documented rule for which wins.
9. **F2L numbering.** No algorithm reference for F2L was supplied. The 41 cases are enumerated from first principles (24 both-in-U, 6 corner-in-U/edge-in-slot, 6 corner-in-slot/edge-in-U, 5 both-in-slot). Reference solutions are standard, widely published F2L sequences, each engine-verified against its case; any case without one is marked and shown with a labelled verified reference, never silently filled.

## 2. Work packages and where each spec section lands

**WP1 Engine and data** (§3-10, 40-42, 53-58, 78-80, 82)
- `cfop/orientation.ts`: profiles, colour rotation, hold text derivation.
- `cfop/curated.ts`: schema, loader, `verifyCurated`, `classifyState`, `solveState`.
- `cfop/f2l.ts`: enumeration of the 41 cases from a validated constructor, classification, practice-state generator (levels 1-4), stage predicates.
- `cfop/trainer.ts`: stage graph for the seven last-layer modes and the F2L stages (pure).
- Data: 2-look OLL (3+7), 2-look PLL (2+4), OLL 57, PLL 21, each with a 2H alg, and an OH alg where supplied; transcribed from the supplied screenshots, then verified.
- Tests: `test/cfop/*.test.ts` (dataset verification, F2L generation round-trip, chained stages, alias normalisation, AUF invariance, physically valid states).

**WP2 Web components** (§10-11, 37, 53, 67-68, 79)
- `CaseCard` (one component, config per set), `RecognitionDiagram` (SVG: OLL top-down with side stickers, EO-only, PLL ring, F2L via the cube), `CaseReference` (category → card → card, search/filters, 2H/OH toggle, learning state), motion tokens in `design/motion.ts`.

**WP3 Lessons** (§14-20, 27-36, 59, 84)
- Beginner F2L rebuilt from fundamentals to transformation, with three guided interactive exercises (`F2LExercise` component, real move buttons, staged hints, state-based success).
- Advanced F2L: concept teaching plus the 41-case reference.
- 2-look OLL (EO → CO), 2-look PLL (CP → EP), full OLL (57), full PLL (21) rebuilt as Learn pages linking to the reference and to practice.
- OH lessons audited and given dedicated-variant content.

**WP4 Practice** (§21-25, 43-50, 86-87)
- F2L Practice (levels 1-4, allowed moves U/R/L/F family only, no whole-cube rotations at beginner levels, metrics).
- Last-Layer Recognition: seven modes, timer separate from animation, aliases, teaching feedback, per-case stats, filters, session review with "practice weak cases".

**WP5 Site-level polish** (§12-13, 51, 59-63, 69-70, 81, 88-89)
- Homepage paths (Blindfolded / CFOP / One-Handed / Practice), Learn hub grouped by track with prerequisites, Practice hub grouped by skill, progress view for the new modes, voice picker fixed, terminology sweep, accessibility and responsive pass, site guide updated. Figma file for CaseCard, lessons, trainers, hubs.

**WP6 Verification** (§56-57, 75-77, 94, 96)
- `pnpm test` (engine + web), typecheck, lint, build; Playwright specs for every flow in §75; desktop and phone screenshots; final checklist against all 96 sections in `docs/POLISH-REPORT.md` with anything unfinished named.

## 3. Order of execution

1. Transcribe the supplied algorithm tables into curated JSON; verify against the engine; fix transcription errors by re-reading the images.
2. Engine: profiles, curated loader, classifier, F2L, trainer stage graph, with tests.
3. Web foundation: render modes, recognition diagrams, CaseCard, reference page, motion tokens.
4. Pages: reference, F2L practice, LL recognition, hubs.
5. Lessons and OH audit.
6. Site-level polish, guide update, docs.
7. Full test, browser, screenshot and audit pass.

## 4. Risks and how each is handled

- **Transcription errors** in screenshots: every algorithm is checked by the engine against its stage; the derived case pattern is rendered next to the screenshot for a visual diff; group labels (Dot, Fish, ...) are cross-checked against the derived shape.
- **Algorithms containing rotations** (`x`, `y`, `z`) or wide moves: stage checks normalise the centre frame; the ending rotation is stored and applied automatically when chaining.
- **OH data gaps** (OH OLL 43 was absent from the first supplied set): handled as missing with a visible note; the owner later supplied the row, so nothing is missing now (D-080).
- **Existing progress**: nothing in storage changes shape; old solver-dataset ids (`oll-13`, `pll-05`) only ever appeared as case ids in attempt events, which the progress view keeps reading as legacy entries.
- **Performance**: grids render SVG only; the 3D player builds when a card is opened.
