# Polishing pass: final audit (brief §96)

Source: `BLDokja — First Major Polishing Pas.txt` (96 sections). Plan: `docs/POLISH-PLAN.md`. Decisions: `docs/DECISIONS.md` D-080 to D-085.
Nothing is committed; the work sits in the working tree of branch `v2/accounts-sync`, next to the owner's earlier uncommitted site-guide work.

## Verdict

The pass is **substantially complete but not fully complete**. Everything in the brief that can be built and checked in code is built and checked. Two things are not done, listed first because they matter most (the other two rows are resolved).

### What is not done, and why

| # | What remains | Why | Files | Correct next step |
|---|---|---|---|---|
| 1 | **Figma design work (§12, §13) is not done.** A file was created ("BLDokja CFOP polish", https://www.figma.com/design/mPZvV9yjYQdCZUbaX4LPCY) but it is empty. | The first write hit the Starter plan's MCP tool-call limit. I cannot lift that limit, and buying a plan is not mine to do. | none in the repo (`docs/DESIGN.md` carries the design record instead) | Once the limit resets or the plan changes, build the token board, CaseCard variants, lesson, trainer, hubs and a motion page from `apps/web/src/styles/workbench-tokens.css` and `components/cfop/case-card.tsx`. |
| 2 | ~~Two guide e2e failures~~ **Fixed.** (a) Focus now returns to the Page guide button after Escape: the button passes itself with the open event, since Safari does not focus a button on click and the dialog is already unmounted when it closes. (b) On a phone, a target fixed to the bottom of the screen (the tab bar) now docks the guide sheet at the top instead of underneath it. | `page-guide.tsx`, `guide-button.tsx`, `guide-layout.ts`, `guide.css`, `e2e/page-guides.spec.ts` | - | Nothing left. |
| 3 | **F2L algorithms are engine-searched, not a curated table (§28, §77).** | No table was supplied and CLAUDE.md forbids writing algorithms from memory. Each of the 41 is verified and short, but is the search's pick, not "the" preferred algorithm. | `content/algs/cfop/curated/f2l.json`, `packages/cube-engine/scripts/build-f2l-curated.ts` | Replace `f2l.json` with an owner-supplied table (same schema; the verifier and pages need no change). |
| 4 | ~~OLL 43 has no one-handed algorithm~~ **Fixed.** The owner's row for OLL 43 (P shape, `F' U' L' U L F`) is used for both styles; the builder proves it solves the case. No OLL or PLL case is missing an algorithm now. | `cfop-source.ts`, `curated/oll.json` | - | Nothing left. |

Smaller limits, stated plainly:

- Weak-case filtering in later stages of a chained mode only steers which case is chosen (it cannot force one, since the chain is built backwards). The first stage honours it exactly.
- The solver-generated CFOP JSON in `content/algs/cfop/*.json` is kept as engine test fixtures and is no longer shown anywhere.
- There is no Settings control for the execution style (2H or OH). The setting is stored and every page reads it; it is switched with the 2H/OH buttons on the reference pages and in the trainer.
- Real devices were not used: mobile checks are Playwright's iPhone 13 emulation and 380 px viewports.
- Memory practice (§52) was audited, not rebuilt: the existing BLD trainers already test the thing being remembered (lettering, trace, commutator, memo). The new trainers add recognition → algorithm and relationship → solution. No generic multiple-choice was added.

## Verification, run in this session

| Check | Result |
|---|---|
| `pnpm build` (all packages, static export, 84 pages) | passes |
| `pnpm typecheck` | passes |
| `pnpm lint` | passes |
| Unit tests: engine 585, web 314, storage 40 (1 skipped), srs 5, analytics 24 | all pass |
| Algorithm data: 57 OLL, 21 PLL, 3 EO, 7 CO, 2 CP, 4 EP checked in the engine; 2H and OH tables agree per case | pass |
| e2e `cfop-polish`, `cfop-lessons`, `cfop-oh-library`, chromium and mobile | all pass (F2L lesson-exercise test 8/8 across both projects after the fix below) |
| e2e `page-guides`, chromium and mobile | every route's guide passes, including the new pages and both fixes in table row 2 |

A test problem found and fixed: the F2L lesson test left the page before the pass was written to storage, so progress was lost on mobile. It now waits for the app's own `bld:progress` signal. The same loss is possible for a learner who leaves within about a second of the last solve on a slow phone; the write is not made to survive navigation. That is worth a follow-up.

Not run: firefox and webkit projects, and the full e2e suite outside the CFOP and guide specs.

## Section checklist

Done = built and covered by a test or a checked screenshot. Part = built with a limit above.

| § | Topic | Status | Where |
|---|---|---|---|
| 0 | Audit before changing | Done | `docs/POLISH-PLAN.md` |
| 1-2 | Educational philosophy; keep the strong BLD teaching | Done. BLD lessons untouched except shared components. | lessons `cfop/*`, `oh/*` |
| 3 | Separate case state, orientation, algorithm | Done | `cube-engine/src/cfop/{curated,orientation,schema}.ts` |
| 4-7 | Orientation profiles: BLD white top; CFOP and OH yellow top, white cross; OH execution | Done. CSS relabel, server-rendered from first paint, screen-reader text agrees. | `profile-scope.tsx`, `orientation.ts`, D-082 |
| 8-9 | One algorithm source of truth and data model | Done. Owner's tables transcribed, 2H and OH per case, verified. | `curated/*.json`, D-080 |
| 10-11 | Reusable CaseCard and its visual direction | Done | `components/cfop/case-card.tsx`, `diagrams.tsx` |
| 12-13 | Figma design and Figma motion | **Not done** (table row 1) | - |
| 14-17 | Rebuild beginner F2L: transformation, cube as the teacher | Done. Lesson 03 rebuilt; every claim engine-checked. | lessons `03-pairing-and-extraction`, `cfop-lessons.test.ts` |
| 18-20 | Three interactive F2L exercises with staged hints | Done. Solved with real turns, judged by the cube. | `f2l-board.tsx`, `lib/f2l-exercises.ts`, e2e |
| 21-25 | F2L practice, levels 1 to 4, U R L F only, metrics | Done | `f2l-practice.tsx`, `f2l.ts`, e2e |
| 26-28 | Advanced F2L, 41-case reference | Part (table row 3) | lesson 07, `/reference/f2l/` |
| 29-31 | 2-look OLL as cards, stage 1 EO and stage 2 CO | Done | `/reference/2look-oll/`, lesson 05 |
| 32-33 | Full OLL (57) rendered as cards | Done | `/reference/oll/`, lesson 08 |
| 34-36 | 2-look PLL and full PLL (21), with bars, headlights, ring | Done. PLL screenshots checked. | `/reference/pll/`, `2look-pll`, lessons 06, 09 |
| 37-38 | Continuous card layout; reference versus lesson | Done | `case-reference.tsx` |
| 39 | Direct links between Learn, Reference and Practice | Done | `PracticeLink`, hub links, e2e |
| 40-42 | One trainer engine, several response types, state-based correctness | Done | `trainer-core.ts`, `classify.ts`, D-084 |
| 43-47 | Last-layer recognition: flow, aliases, real state transitions, stage graph | Done. Seven modes; chains verified by replay. | `ll-trainer.ts`, `ll-trainer.tsx` |
| 48-49 | Timer; wrong-answer teaching | Done | `ll-trainer.tsx`, e2e |
| 50-51 | Statistics and progress UI | Done | `cfop-stats.ts`, `cfop-progress.tsx`, D-083 |
| 52 | Memory practice globally | Audited only (see limits) | - |
| 53-55 | Render modes; state is authoritative | Done | `render-modes.ts` |
| 56-58 | Algorithm verification; case-generation tests; invalid states prevented | Done | `test/cfop/*`, `generated.test.ts` |
| 59 | UI polish across lessons | Done | `styles/cfop.css`, lesson view |
| 60-62 | Homepage, Learn hub, Practice hub | Done. Path cards, grouped by skill. | `home-view.tsx`, `learning-path.tsx`, `practice/page.tsx` |
| 63 | Lesson voices | Done. The picker only appears when a lesson has more than one voice. | `lesson-view.tsx` |
| 64 | OH polishing | Done. OH cards and wording in lessons 02-04; OLL 43 now has its one-handed row. | lessons `oh/*` |
| 65-66 | Search, filter, learning state on cards | Done. Plain-word search; a hand-set status always wins. | `case-reference.tsx`, `cfop-stats.ts` |
| 67-68 | Animation quality; motion consistency | Done. `MOTION_MS` equals the CSS variables (tested); reduced motion honoured. | `design/motion.ts`, `cfop.css` |
| 69-70 | Accessibility; responsive | Done to the extent tested: keyboard, text description of every cube, 44 px touch targets, no sideways scroll at 380 px. Emulation only, no real devices. | e2e `layout` |
| 71-73 | Do not clone J Perm; do not invent algorithms; no destructive rewrites | Done. Missing data is shown as missing; old solver files kept. | D-080 |
| 74-76 | Phases; browser testing; real trainer chains | Done | e2e, `ll-trainer.test.ts` |
| 77 | Validate F2L alternative solutions | Done. A different valid solution is accepted. | e2e, `f2l.test.ts` |
| 78 | Error handling | Done: Zod at the data boundary; unknown stored statuses are rejected. | `packages/storage/src/schema.ts` |
| 79 | Performance | Partly evidenced: static SVG grids, 3D loaded on demand. No timing measurements were taken. | - |
| 80 | Data migration | Nothing to migrate: no stored progress used the old CFOP ids (checked in git). The two new settings are optional, so old data still validates. | `packages/storage/src/schema.ts` |
| 81-82 | Naming consistency; no internal ids in view | Done. Route ids like `1look-oll` stay in URLs only; on-screen copy says "1-look". A test asserts no `pll-nn` ids on screen. | `i18n/cfop.ts`, e2e |
| 83-87 | Information hierarchy; lesson links; feedback; timed practice; session review | Done | `ll-trainer.tsx`, `f2l-practice.tsx` |
| 88 | Keep the site guide updated | Done. New guides and steps exist for every new page and all pass, and the two guide defects (focus return, phone tab-bar step) are fixed. | `components/guide/guides.ts`, `i18n/guides.ts` |
| 89-94 | Definitions of done: F2L, OLL/PLL, recognition, architecture, quality | Met except where marked above | - |
| 95 | Restraint | Kept: no 5BLD, no accounts changes, no analytics, no copied reference-site text. | - |
| 96 | This audit | This file | - |
