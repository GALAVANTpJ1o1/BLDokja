# UI polish and personal practice workspaces

September 16, 2026. Implemented locally on `4bld/complete`; not deployed or pushed.

## What changed

The existing BLDokja identity is retained: Recursive, slate/chalk and lilac/ink themes, restrained constellation effects and colour reserved for cube faces. The redesign skills guided stronger typography, spacing, fewer repeated panels and clearer hierarchy, rather than a new unrelated theme. Motion remains action-driven and respects both reduced-motion settings.

Desktop uses a compact top navigation; phones use bottom navigation with control scroll clearance. The home hero remains a large 3D cube. Lessons and trainers render exact highlighted nets immediately, with session-level Inspect in 3D. Long lessons have a table of contents, quiet secondary disclosures and saved-position resume links. Below-fold checkpoint datasets load near the viewport instead of during introduction reading.

| Workspace | Implemented behaviour |
|---|---|
| `/practice/first-solve/` | Saves scramble, lettering, standard OP buffers and exact memo/execution cursor. Verifies each letter or execution effect before advancing; resumes after reload. Physical success is explicitly learner-confirmed. |
| `/practice/debug/` | Compares tracing, written/recalled memo, intended/actual execution effects, orientation and reported parity omission. Distinguishes evidence, hypotheses and insufficient information; warns about valid alternative cycle breaks. |
| `/practice/levels/` | Recognition, setup recall, algorithm recall, physical blind-execution reconstruction and complete solves. Separate attempt identifiers and analytics; manual level choice. |
| `/practice/algorithms/` | One preferred algorithm per case in a searchable, spreadsheet-like table. Engine-verified personal alternatives, adjustable ergonomic estimates, personal comfort/regrip/finger-trick notes, CSV export and alternating A/B timed trials. |
| Algorithm explanations | Setup, commutator operands, undos, cancellation, affected pieces and replay. Operand labels are candidates, not unsupported ergonomic assertions. Direct sequences do not invent a decomposition. |
| `/practice/memory/` | Reusable palaces/locations/prompts; locally imported PNG/JPEG/WebP pair pictures; stories composed only from the learner's own images. Drag ordering plus accessible touch/keyboard move buttons; saved stories and pictures survive reload and backup. |
| `/practice/reference/` | Personal scheme, buffers, words and preferred algorithms in local PDF and print views; explicit physical-cube spot-check confirmations. Embedded static Recursive subsets, checked glyph coverage and Unicode browser-print fallback. |
| `/practice/big-cubes/` | Side-by-side 3x3/4x4 differences and links to the existing 4BLD course. Staged 5x5 corners, midges, wings, X-centres and T-centres recognition/tracing using shared shells. Precise centre highlights use nets. |

## Reliability and correctness

- Both standard and non-standard method systems load in disposable workers through validated request/result boundaries. Custom M2 generation never silently falls back to the UI thread.
- 3x3 browser scrambles default to proper random-state generation; 4x4/5x5 use cubing.js standard event generators, not a claim of uniform random-state sampling. Quick random-move scrambles are an explicitly labelled choice, not an automatic fallback. Self-hosted solver/worker modules are included in the offline pack.
- Trainers keep customised buffers; lessons explain their fixed standard teaching convention. Saved beginner solves retain their own snapshot.
- Text cube view supports back/start/forward replay and changing state descriptions. Installed local English speech voices are checked; unavailable/failed TTS leaves visual and screen-reader prompts usable.
- Native keyboard activation no longer also triggers global grading/reveal shortcuts. Case-grid navigation has roving focus, and typed trainer submissions retain focus.
- Saves are serialised against the latest stored settings. Browser persistent-storage permission does not hold up saving; its eventual status is saved separately.
- Offline-pack preparation is discoverable in Settings. Waiting updates have explicit Later and Update actions; no unsolicited reload. The notice participates in document layout rather than covering mobile controls.
- Recognition analytics are distinct from execution analytics. Automatic ramps, scoring weights and ergonomic costs remain explicitly provisional heuristics.
- All 23 existing 3BLD lessons, including 16–23, were present before this pass and remain validated; they were not falsely reported as newly authored. The existing ten 4BLD lessons are retained.
- Independent 5x5 geometry/orbit oracle tests precede UI tracing. Notation depth, input size and expanded-move budgets prevent explosive parser inputs.

## Verification

- Complete unit suite: 706 passed, one skipped (523 engine, 38 storage, 10 analytics, 5 SRS, 130 web).
- Browser suite: 57 passed, three intentionally skipped across Chromium, Firefox, WebKit and an iPhone-sized WebKit viewport. Includes reload/resume, algorithm preferences, palace/story ordering, custom images, native keyboard handling, TTS fallback, text replay, custom M2 responsiveness, local PDFs, update controls and viewport-activated checkpoints. The final explicit scheme snapshot was additionally rechecked in all four configurations.
- Offline workspace navigation and random-state solver modules passed in Chromium and Firefox. WebKit emulated offline tests are not presented as physical iOS PWA verification; the phone's desktop-grid test is also deliberately excluded.
- Typecheck, ESLint and production static export passed. Build emits 58 pages plus pinned local worker modules and the versioned offline pack.
- PDFs generated in all browser configurations. Rendered pages were visually reviewed for clipping and hierarchy; PDF text extraction confirms the tested `Ångström Éclair` words are preserved.
- Screenshots and audit outputs are local, ignored artifacts under `.artifacts/`, not personal data committed to Git.

### Final local mobile Lighthouse snapshot

Lighthouse 13.4.1, default mobile simulated throttling, cold Chromium navigation to a compressed local production export. Other test/build jobs were stopped for these audits. These are single-run lab snapshots, not a before/after comparison across different servers or a deployed guarantee.

| Page | Performance | Accessibility / best practices | LCP | Main-thread blocking | Layout shift |
|---|---:|---:|---:|---:|---:|
| `/learn/commutators/` | 77 | 100 / 100 | 4.4s | 350ms | 0 |
| `/practice/3style/` | 78 | 100 / 100 | 4.5s | 290ms | 0 |

The remaining gap is initial JavaScript/hydration and font/loading cost under simulated slow mobile conditions. It is explicitly not considered a solved 90+ performance target. Net-first display, off-main-thread method builds and deferred below-fold datasets address specific costs; further first-load isolation should be measured on the deployed host and real devices.

## Limits and hands-on review still needed

- Physical-cube verification of the spot-check sheet, notation and finger tricks has not been performed by the assistant. Check only algorithms you actually test on your cube.
- The 5BLD view is a family-introduction and tracing path, not a finished execution course or full 5BLD solver.
- DNF causes cannot always be uniquely inferred from a solver's reports. Timed physical trials and physical solve success remain self-reported.
- Test physical iOS/Safari installation, update notification and offline reopening, installed-voice behaviour, and preferred-algorithm ergonomics on real devices.
- Local Lighthouse measurements are lab checks, not deployed field performance. Performance remains an optimisation area; no blanket 90+ score or calibration claim is made.

## Run locally

```powershell
pnpm dev
pnpm test
pnpm typecheck
pnpm lint
pnpm build
$env:BLD_TEST_URL='http://localhost:3300'
pnpm exec playwright test --workers=2
```

For production-export browser tests, serve `apps/web/out` on port 3300 with compression, for example `pnpm exec serve apps/web/out -l 3300 --no-clipboard`. Deployment must apply the generated `_headers` file through the chosen host; no hosting changes were made here.
