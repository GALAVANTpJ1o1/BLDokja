# Decisions

Short records of choices that would be expensive to reverse, or where sources disagreed. Newest entries go at the bottom. Each has a status: **accepted**, **draft** (waiting for your review), or **superseded** (with a link to its replacement).

---

## D-001 · cube-engine is a pnpm workspace package

**Status:** accepted (Phase 1 plan review, 2026-09-13)

- **Context.** BRIEF §4 allows `/packages` or `/src/lib`. The engine must run in bare Node with no browser globals (CLAUDE.md).
- **Decision.**
  - The engine lives in `packages/cube-engine`, named `@bld/cube-engine`, inside a pnpm workspace.
  - The Next.js app joins at the repo root in Phase 2.
  - Storage can still live in `/src/lib/storage`, as MIGRATION.md assumes.
- **Consequences.** Purity is enforced three ways:
  - `tsconfig.build.json` compiles `src/` with `lib: ES2023` and `types: []`, so a DOM or Node global is a compile error.
  - ESLint forbids UI, storage, rendering and Node imports in `src/`, and browser globals.
  - `test/purity.test.ts` imports the public API in Node and scans `src/` for forbidden imports.

## D-002 · The cubing.js package is `cubing`, not `@cubing/*`

**Status:** accepted

- **Context.** BRIEF §3 names `@cubing/kpuzzle`, `@cubing/alg` and `@cubing/scramble`. Both `@cubing/kpuzzle` and `@cubing/alg` return 404 on npm (checked 2026-09-13).
- **Decision.** Use `cubing@0.63.4`, pinned exactly, through its subpath exports: `cubing/alg`, `cubing/kpuzzle`, `cubing/puzzles`, `cubing/search` and `cubing/scramble`. `cubing/twisty` belongs to the UI and is forbidden in the engine.
- **Consequences.** The package needs Node ≥ 22.3 (declared in `engines`).

## D-003 · TypeScript is pinned to 6.0.3

**Status:** accepted

- **Context.**
  - `typescript@latest` is 7.0.2.
  - typescript-eslint 8.70.0 declares `typescript >=4.8.4 <6.1.0`.
  - CLAUDE.md requires strict TypeScript with no `any` and no non-null assertions, which is best enforced by typed lint rules.
- **Decision.** Pin `typescript@6.0.3` and use `typescript-eslint` `strictTypeChecked`. Move to TypeScript 7 once typescript-eslint supports it.

## D-004 · zod 4.5.4 instead of 4.6.4

**Status:** accepted

- **Context.**
  - pnpm 12's supply-chain policy (`minimumReleaseAge`) rejected `zod@4.6.4`, which was published a few hours before install.
  - pnpm offered to add an exclusion for it automatically.
- **Decision.**
  - Keep the policy intact: no exclusion.
  - Use `zod@4.5.4` (published 2026-08-29), and pin all dependencies exactly.
- **Consequences.** Upgrades wait until a release has aged past the policy window.

## D-005 · ESLint 10 flat config, and esbuild's install script is allowed

**Status:** accepted

- **ESLint.** One root `eslint.config.js` covers every package.
- **esbuild.** `tsx` depends on esbuild, whose install script only checks its platform binary. It is the single entry under `allowBuilds` in `pnpm-workspace.yaml`.

## D-006 · Sticker positions are derived, never hand-tabulated

**Status:** accepted

- **Context.** Every letter, buffer and algorithm ultimately says "this sticker moves to that slot". A single mistake in a hand-written sticker table would silently corrupt everything built on top of it.
- **Decision.**
  - `src/core/geometry.ts` models an N×N×N cube from first principles: stickers are integer points, and a move rotates the stickers in some layers by a quarter turn.
    - Axes are right-handed: +x = R, +y = U, +z = F.
    - The only convention it takes as input is WCA Regulation 12a: a face turn is clockwise as seen looking at that face.
  - `src/core/sticker-map.ts` matches this model to cubing.js's kpuzzle definitions computationally.
    - Each kpuzzle position is identified with the cubie whose set of layer memberships matches the set of layer moves that disturb the position.
    - Orientation labels are found by propagating the move definitions outward from one seed position.
- **Verification** (`test/core/root-of-trust.test.ts`). For 3x3x3 and 4x4x4, both implementations must agree on every sticker for:
  - every verified move family (face turns, inner slices, M/E/S, wide moves, lowercase moves and rotations), each with the suffixes `""`, `2` and `'`;
  - 150 random sequences, compared as transformations, and as patterns compared by colour.
  - A deliberately broken definition (U replaced by U') is detected.
- **Consequences.** Engine code only generates moves from `VERIFIED_MOVE_FAMILIES`. A new move family must be added there first, which puts it under the same check.

## D-007 · Lowercase face letters mean wide turns; inner slices are written `2R`

**Status:** accepted, as a finding to carry into the 4x4 milestone

- **Finding.** In cubing.js, `r` means `Rw` (two layers) on both 3x3x3 and 4x4x4. The root-of-trust test confirms this against the geometry model. The inner slice alone is `2R`.
- **Why it matters.** Much r2-method literature writes the inner-slice half turn as `r2`. Read with cubing.js's notation, that string would be a wide turn instead.
- **Decision.**
  - Engine data never uses lowercase to mean an inner slice.
  - When the r2 method is built, its swap move is written `2R2`.
  - Text that quotes r2 notation must be converted explicitly. The converter will be tested against the geometry model.

## D-008 · Whole-cube rotations and parity

**Status:** accepted (finding)

- **4x4x4.** All 24 rotations are even permutations of corners, wings and x-centers (labelled model), as computed in `test/core/rotations.test.ts`.
  - So the parity of a 4x4 state doesn't depend on which orientation reference the solver chooses.
  - Choosing a reference only has to pick a rotation. This is the commitment in the Phase 1 plan.
- **3x3x3.** Rotations are always even on corners. 12 of the 24 rotations are odd on edges, and in every one of those they are odd on centers too.
  - This is harmless, because 3x3 tracing first rotates the cube so its centers are solved.
  - It does mean "corner parity equals edge parity" only holds for states with solved centers. A scramble that ends in a rotation has to be normalised before any parity claim is made.

## D-009 · Sticker and piece names are generated from geometry

**Status:** accepted

- **Pieces** are named by the faces their cubie touches, in the order U/D, F/B, R/L: `UFR`, `UF`, `FR`.
- **Bigger cubes** add lowercase letters for the side a cubie sits towards:
  - `UFr` is the UF wing nearer R;
  - `Ufr` is the U x-center nearer F and R.
- **Stickers** are named by their own face, then the rest of the piece name. UFR's three stickers are `UFR`, `FUR` and `RUF`.
- **Scope.** Names are proved unique for 3x3x3, 4x4x4 and 5x5x5. 6x6x6 and larger need a depth marker, and the naming function refuses them until that exists.
- **Datasets, fixtures and schemes key everything by these names, never by letters.**

## D-010 · Speffz is the only complete scheme shipped; alternatives ship as a blank template

**Status:** accepted (Gate A, 2026-09-13). It narrows BRIEF §5.1 ("Speffz + a couple of common alternatives"); you confirmed Speffz plus the blank template is enough.

- **Speffz** is built from its documented rule (Speedsolving wiki "Speffz"):
  - faces are lettered in the order U, L, F, R, B, D;
  - each face is lettered clockwise from its top-left in the standard net;
  - an edge-type piece takes the letter of the corner it is clockwise-next to.
- **Checked against the reference.** `test/lettering/speffz.test.ts` compares all 48 3x3 sticker letters with an explicit table read off an independent net diagram (Voltara/vcube `doc/speffz.md`). On 4x4 it also checks wings and x-centers, and that every wing gets exactly one letter.
- **The alternatives search found nothing usable.**
  - The other systems the wiki names take letters from colours or from face names. Many stickers share a letter under those systems, so they fail the rule that a letter names exactly one sticker (D-011).
  - I found no complete, unambiguous published definition of any other scheme, including Chichu.
  - I won't invent a scheme and present it as a standard.
- **What ships instead:**
  - `blankScheme()`, a template users fill in;
  - `buildFaceCycleScheme()`, which builds any "four letters per face, clockwise" variant (different face order or alphabet) as data.
- **To revisit.** If you know a scheme you want as a second default, name it and I'll verify it the same way.

## D-011 · A letter must name exactly one sticker within a piece type

**Status:** accepted

- **Rule.** Scheme validation treats a duplicate letter within one piece type as an **error**, not a warning.
  - A traced memo is only readable if each letter maps back to one sticker.
  - This is also a premise of the 552/576 analysis.
- **Allowed.** The same letter may appear on a corner and on an edge (Speffz does this everywhere), because memo never mixes piece types.
- **Letters** are single grapheme clusters. Non-Latin letters are allowed; whitespace and multi-character strings are rejected.
- **Wings and x-centers** need exactly one lettered sticker per piece. Corners and edges need every sticker lettered.

## D-012 · Tracing conventions

**Status:** accepted (Gate A, 2026-09-13: no objection to the break order or the twisted-piece naming, which the golden fixtures encode).

- **Model.** Tracing follows the virtual swap:
  - read the sticker in the buffer slot and shoot it home;
  - the piece displaced from there becomes the new buffer contents;
  - when the buffer piece comes home, break into a new cycle.
- **Break choice.** `breakOrder: "scheme"` by default: the lowest letter, by code point, among stickers of unsolved non-buffer pieces. A priority list of sticker names can override it, falling back to letter order.
  - The brief only says "the next unsolved piece". This default is deterministic, and it matches how the reference sites break.
- **Twisted and flipped pieces.** Two policies:
  - `orientedInPlace: "separate"` (default): reported in `twisted`/`flipped` and never chosen as break targets.
  - `"asTargets"` (J Perm's beginner approach): traced as a two-target orientation cycle.
  - Which policy each method uses by default is decided at Gate B.
- **Reporting a misoriented piece.**
  - It is named by the slot where its U/D sticker now shows. E-slice edges use their F/B sticker.
  - Its direction is geometric: clockwise if that sticker moved to the next face clockwise, seen from outside the corner. For example, UFR clockwise shows its U colour on the R face, which is Speffz M.
  - The list is in letter order, with the buffer last.
- **Pairs** run straight across cycle boundaries. Only the final odd target is left single.
- **Parity** is the permutation parity of the piece type's actual pieces. Tests assert it equals `targetCount % 2`.
- **`solvedPieces`** holds piece names, not letters, because a letter names a sticker.
- **Additive fields.** On top of the brief's `TraceResult`: `targetStickers`, `targetKinds` (`normal | cycleBreak | cycleClose | orientationTarget`), `cycles`, `orientedInPlace` and `buffer`. Phase 6's trace diagnostics need `targetKinds`.
- **Verification.**
  - **Golden fixtures (54):** 44 constructed from hand-written targets, plus 10 real scrambles traced by hand from colour nets.
  - **Differential test:** an independent colour-reading oracle, over 62,720 traces.
  - **Properties:** 1,500 random cases.

## D-013 · Tracing never produces same-letter pairs, but the library uses all 576 cells

**Status:** accepted (Gate A, 2026-09-13), revised from the draft. The draft concluded 552; you changed the conclusion to 576 and kept the computed result. Evidence is in [reports/letter-pair-reachability.md](reports/letter-pair-reachability.md).

- **Question.** The old app treats the grid as 552 pairs; BRIEF §7.4 says 576. AUDIT C6 and MIGRATION §3.2 deferred the question to the engine.
- **Result, computed.** No same-letter pair appears in any trace, for any buffer, either orientation policy, 3x3x3 corners and edges, and 4x4x4 corners and wings.
  - All 104 buffer-piece/policy configurations reach 0 of the 24 diagonal cells.
  - `test/trace/letter-pairs.test.ts` enforces the underlying invariants on 160,000 3x3 traces and 57,600 4x4 traces:
    1. consecutive targets are never the same sticker;
    2. a target is never on the buffer piece;
    3. under `separate`, consecutive targets are never on the same piece.
  - Because D-011 makes letters unique within a piece type, (1) rules out the diagonal.
- **Further finding: for a fixed pair of buffers, some distinct-letter pairs can't occur either.**
  - Any pair containing a buffer-piece letter is impossible. So is any pair of two stickers of one piece, except the opening of an `asTargets` orientation cycle.
  - Corners and edges together on 3x3x3 reach **494–526 of 552** (`separate`), depending on the buffer pieces.
  - A corner buffer and an edge buffer that share a Speffz letter lose every pair containing that letter. UFR and UF share C, so all 46 C-pairs are impossible and the count drops to 494. UBL/UR reaches 526.
- **Occurrence is far from uniform.** In 10,000 random-state traces (UFR corners), the most common corner pair occurs about 12× as often as the rarest reachable one: 370 vs 31, against 85 if uniform.
- **Decision: the letter-pair library, drills and the 24×24 schema use all 576 cells.**
  - The computed result stands: no trace ever lands on the diagonal. The grid keeps labelling diagonal cells "can't occur from tracing".
  - Diagonal cells still hold images. A letter can end up alone in a memo, with no partner to pair with:
    - a trailing target, when a piece type's targets are odd;
    - a twisted or flipped piece under `orientedInPlace: "separate"`, recorded as one letter.
  - Such a letter is held with a **self-pair image**: J alone is memorised as JJ. How lone letters become pairs is D-015.
  - This affects only what is shown or looked up for memorisation. It never touches tracing, solve logic, setup search or which alg runs.
- **Consequences:**
  1. **The library is complete at 576 cells.** Legacy data has no same-letter pairs, so after the import the 24 diagonal cells are empty and show up as gaps, together with the EO and IE placeholders (MIGRATION §3.6). MIGRATION §3.2 already allows same-letter pairs in the schema.
  2. **Drills (Phase 4) include diagonal cells**, because memos use them for lone letters. Pairs that can't occur for the user's current buffers and policy stay in the library (buffers can change). Drills and the gap finder weight every cell by how often it really occurs, and the engine can compute both the reachable set and the frequencies.
  3. **Scheme validation.** Duplicate letters within a piece type stay an error (D-011). The diagonal result depends on it, and so does reading a self-pair back as one sticker.
  4. **Buffer choice.** Gate B's buffer comparison includes the combined reachable-pair count, because shared letters between corner and edge buffers cost pairs.
- **Stale sentence in the report.** `docs/reports/letter-pair-reachability.md` still says "The 24×24 grid really has 552 usable cells". That text comes from `scripts/letter-pair-report.ts`, so it will be reworded, and the report regenerated, the next time that script changes. This commit is documentation only.
- **Spot-check buffers.** You left the choice to me. `docs/fixtures/SPOT-CHECK.md` will use UFR corners and UF edges, purely for the physical-cube check, not as a default. It hasn't been generated yet.

## D-014 · 4x4x4 tracing in Phase 1 uses a fixed frame; any later reference policy must be a rotation

**Status:** accepted (Phase 1 plan review)

- **Phase 1 frame.** 4x4x4 traces take `frame: { kind: "asIs" }` explicitly; without a frame, `trace()` returns `frame-required`.
  - Tests and fixtures use states with the DLB corner solved: constructed fixtures, or random sequences of U, R, F, Uw, Rw, Fw and inner slices, with no rotations.
- **Commitment.** The orientation-reference rule chosen in the later 4x4 milestone must come down to choosing one of the 24 whole-cube rotations, applied before the same tracer. Stickers and letters name slots in space, so no re-lettering in a moving frame.
- **Why this doesn't constrain that milestone.**
  - Every 4x4 rotation is even on corners, wings and x-centers (D-008), so parity doesn't depend on the reference chosen.
  - The Phase 1 fixtures are the identity-rotation case of any rule.

## D-015 · Single-letter memo representation: `singleLetterRepresentation`

**Status:** accepted design (Gate A, 2026-09-13). **Not implemented yet**; nothing in the code uses it.

- **Why.** D-013 gives the library 576 cells so that letters left alone in a memo still get an image. This policy decides how those lone letters become two-letter memo items.
- **Where it lives.**
  - It is a memo-representation layer (`src/memo/`) that reads a finished `TraceResult`. It is **not** an option of `trace()`, and tracing output never depends on it.
  - Solve logic, setup search, comm search and alg selection keep reading `TraceResult`. They must never import the memo layer.
- **Values:** `"chain" | "selfPair"`, default `"selfPair"`. Every memo item is two letters, so each maps to one of the 576 cells.
- **Lone letters** are:
  - the **trailing target** when a piece type's target count is odd;
  - under `orientedInPlace: "separate"`, each **non-buffer** twisted or flipped piece.
  - Under `"asTargets"` twists and flips are already targets, so only the trailing target can be alone.
- **The buffer's own twist or flip is never memorised in either mode.** It's always implied by the other pieces, so `TraceResult` still reports it but the memo view leaves it out.
- **Two letters per piece, used differently by the two modes:**
  - **Displayed letter:** the slot where the piece's reference sticker (U/D, or F/B on E-slice edges) now shows. It's the letter `TraceResult` reports (D-012): DFR twisted clockwise shows K.
  - **Home letter:** the letter of that reference sticker's own slot. DFR's home letter is V.
- **`selfPair` (default):**
  - Targets pair up exactly as traced.
  - A trailing target J becomes **JJ**.
  - Each non-buffer twisted or flipped piece becomes its displayed letter doubled: DFR clockwise gives **KK**.
- **`chain`:**
  1. Build one letter chain: the traced targets, then the home letter of each non-buffer twisted or flipped piece, in the order `TraceResult` reports them (letter order).
  2. Pair the whole chain. If one letter is left unpaired at the end, double it.
  3. Append each chained piece's displayed letter doubled, as that piece's orientation marker. It is kept distinct from the unpaired-leftover item.
- **Parity is an explicit flag on the memo view, in both modes.** It equals `TraceResult.parity` and is never inferred from a doubled item.
  - This was a deliberate choice. In `chain` mode an odd number of non-buffer twisted or flipped pieces changes whether a letter is left over, so the leftover can't be trusted to mean parity:
    - trailing J (parity) with DFR twisted gives `JV KK`, with no leftover;
    - `DA SB` (no parity) with DFR twisted gives `DA SB VV KK`.
  - Edges can't hit this: the total number of flips is always even. With the buffer excluded, though, the listed count can be odd, so the flag is used there too.
- **Worked examples** (Speffz; the traces are golden fixtures R01 and R02, corner buffer UFR):

  | Trace | `selfPair` | `chain` | Parity flag |
  |---|---|---|---|
  | R01: targets `D A S B P B`; DFL twisted (shows L, home U); DBR twisted (shows O, home W) | `DA SB PB LL OO` | `DA SB PB UW LL OO` | no |
  | R02: targets `X D P N A U E`; DBR twisted (shows O, home W); buffer UFR twisted (J, omitted) | `XD PN AU EE OO` | `XD PN AU EW OO` | yes |
  | Trailing J; DFR twisted clockwise (shows K, home V) | `JJ KK` | `JV KK` | yes |

- **Tests required when it's implemented:**
  - The memo layer never modifies the `TraceResult` it reads (deep-frozen input).
  - `TraceConfig` has no `singleLetterRepresentation` option (a compile-time `@ts-expect-error` check).
  - Import boundary: only `src/memo/**` and `src/index.ts` import the memo layer, so nothing solve-related can consume a self-pair.
  - Property tests over random scrambles:
    - every traced target letter appears in the memo exactly once, never doubled or dropped;
    - a pair made of two traced targets is never a diagonal cell;
    - the number of doubled items matches the mode's rule above;
    - the parity flag equals `TraceResult.parity`;
    - the worked examples above appear as fixtures.
