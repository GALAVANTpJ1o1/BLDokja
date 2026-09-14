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
  - Each `orientedInPlace` entry also has `homeSticker` and `homeLetter`: the reference sticker's own slot and its letter (DFR's are `DFR` and V). D-015's `chain` mode reads them, so the memo layer needs nothing but the `TraceResult`. They're the same in every memo mode. The differential test checks `homeSticker` against the oracle.
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
- **Stale sentence in the report: corrected at the source.** The report used to say "The 24×24 grid really has 552 usable cells".
  - `scripts/letter-pair-report.ts` now says no trace lands on the diagonal but the library uses all 576 cells, and the report was regenerated. Every existing number is unchanged.
  - **Memo-item counts added**, so that consequence 2 has real weights for diagonal cells. A new report section, and `memoItems` in `letter-pair-frequencies.json` (format version 2), count the memo items per cell for both `singleLetterRepresentation` modes.
  - With UFR/UF, about 25% of corner items and 15% of edge items are diagonal. Only the buffer piece's own diagonal cells are never used, and the script asserts that.
- **Spot-check buffers.** You left the choice to me. `docs/fixtures/SPOT-CHECK.md` uses UFR corners and UF edges, purely for the physical-cube check, not as a default.
  - It has been generated: the 10 real scrambles of golden fixtures R01–R10, each with a colour net, the trace and the `selfPair` memo.
  - `scripts/spot-check-sheet.ts` fails if a scramble, or (for matching buffers) its targets, differs from the fixture.

## D-014 · 4x4x4 tracing in Phase 1 uses a fixed frame; any later reference policy must be a rotation

**Status:** accepted (Phase 1 plan review)

- **Phase 1 frame.** 4x4x4 traces take `frame: { kind: "asIs" }` explicitly; without a frame, `trace()` returns `frame-required`.
  - Tests and fixtures use states with the DLB corner solved: constructed fixtures, or random sequences of U, R, F, Uw, Rw, Fw and inner slices, with no rotations.
- **Commitment.** The orientation-reference rule chosen in the later 4x4 milestone must come down to choosing one of the 24 whole-cube rotations, applied before the same tracer. Stickers and letters name slots in space, so no re-lettering in a moving frame.
- **Why this doesn't constrain that milestone.**
  - Every 4x4 rotation is even on corners, wings and x-centers (D-008), so parity doesn't depend on the reference chosen.
  - The Phase 1 fixtures are the identity-rotation case of any rule.

## D-015 · Single-letter memo representation: `singleLetterRepresentation`

**Status:** accepted design (Gate A, 2026-09-13); implemented in `src/memo/memo.ts` as `memoView(trace, { singleLetterRepresentation })`.

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

  - **Correction to row 3, found while implementing.** J is on the UFR piece, so with a UFR buffer it can never be a target (D-013). The fixture for this row uses **buffer UBL**; the letters and results are unchanged. As with the prose example (`DA SB` plus DFR), the constructed state also needs a counterclockwise buffer twist to be a real cube state, and the memo leaves that twist out.

- **Tests** (`test/memo/`):
  - The memo layer never modifies the `TraceResult` it reads (deep-frozen input).
  - Neither `TraceConfig` nor `TracePolicy` has a `singleLetterRepresentation` option (compile-time `@ts-expect-error` checks, run by `pnpm typecheck`).
  - Import boundary: only `src/memo/**` and `src/index.ts` import the memo layer, so nothing solve-related can consume a self-pair.
  - Parity is copied, never inferred: a trace with its `parity` flipped gives a flipped flag and identical items.
  - Property tests over random 3x3 states (every buffer, both policies, both modes) and fixed-frame 4x4 corners and wings:
    - every traced target letter appears in the memo exactly once, in order, never doubled or dropped;
    - a pair made of two traced targets is never a diagonal cell (nor is any `pair` item);
    - the number of doubled items matches the mode's rule above;
    - the parity flag equals `TraceResult.parity`;
    - no item comes from the buffer piece.
  - The worked examples above are fixtures, plus the prose example and an edge example (R01 edges: `chain` gives `… UP RR HH` with no parity).
  - Random states contain both `chain`-mode hazards: a leftover without parity, and parity without a leftover.

## D-016 · Commutator notation

**Status:** accepted (rules decided at Gate A, 2026-09-13). The implementation choices listed separately below are for your review.

- **Context.**
  - BRIEF §5.5 asks for `[A, B]`, `[A: [B, C]]`, `[A, B: C]` and nested conjugates. `[A, B: C]` needs a precedence rule.
  - cubing.js's parser can't serve (checked on `cubing@0.63.4`). It rejects `[A: B, C]`, `[A, B: C]`, `[A: B: C]`, bracketless `A: [B, C]` and `’`. It accepts `[,R]` and `Q`.
  - So `src/commutator/parse.ts` is a separate parser. Its output is a tree of moves, commutators and conjugates.
- **Rules (Gate A).**
  - **The first separator inside a bracket splits it.** Everything to its right is read again as the same bracket level:
    - `[A: B, C]` = `[A: [B, C]]`
    - `[A, B: C]` = `[A, [B: C]]`
    - chained colons nest right: `[A: B: C]` = `[A: [B: C]]`
  - **At most one comma per bracket level.** `[A, B, C]` is an error.
  - **Outer brackets are optional.** A top-level colon takes everything to its right: `U: [R, D] U2` = `[U: [R, D] U2]`.
  - **Empty operands are rejected.**
  - **Curly apostrophes count as primes.**
  - **Only verified move families are accepted** (`VERIFIED_MOVE_FAMILIES` for the puzzle, D-006). `M` is an error on 4x4x4.
- **Implementation choices.**
  - **The whole alg is an implicit bracket level.** So `R, U` = `[R, U]`, the same as the colon case. An alg with no separators is a plain sequence.
  - **An explicit bracket must contain a separator.** `[R U]` is an error; brackets never just group moves.
  - **Moves need whitespace between them** (or a bracket or separator). `RU` is an unknown move, not `R U`.
  - **Suffixes:** `""`, `2`, `'` and `2'`.
    - `2'` is read as a half turn and printed as `2`. The geometry model confirms `X2'` ≡ `X2` for every verified family.
    - `R3` and `R'2` are rejected.
    - Both U+2019 `’` and U+2018 `‘` count as primes.
  - **Parentheses are rejected** with their own error code. That was your answer on 2026-09-14. Supporting them later only adds to the grammar.
  - **Errors are codes with a UTF-16 index**, never English: `unexpected-character`, `parentheses-unsupported`, `unknown-move`, `unsupported-amount`, `unclosed-bracket`, `unmatched-closing-bracket`, `bracket-without-separator`, `empty-operand`, `too-many-commas`. The parser reports the first error it reaches, reading left to right.
  - **The canonical form** (`formatAlg`) puts every commutator and conjugate in explicit brackets, so cubing.js can read it too.
- **Verification** (`test/commutator/parse.test.ts`).
  - A golden table of accepted inputs with their canonical forms, and rejected inputs with their error code and index.
  - On random trees for 3x3x3 and 4x4x4:
    - the canonical form round-trips;
    - the form with every optional bracket left out parses to the same tree;
    - for the fully bracketed form, the tree equals the one cubing.js's parser builds.

## D-017 · Expansion, cancellation and move metrics

**Status:** accepted (the cancellation rule was decided at Gate A, 2026-09-13). The metric definitions are for your review.

- **Expansion.** `[A, B]` = A B A⁻¹ B⁻¹ and `[A: B]` = A B A⁻¹. A test checks the expansion of random trees against cubing.js's `Alg.expand()`. A half turn inverts to itself (`U2`, never `U2'`).
- **Cancellation keeps the move families you wrote** (Gate A).
  - Moves about one axis commute. Within a run of same-axis moves, each family merges with itself mod 4, so `R L R` → `R2 L` and `x R x'` → `R`.
  - Different families never merge, even when they're the same turn: `Rw R'` stays, and so does `r Rw'` on 4x4x4.
  - The merged run keeps its families in order of first appearance. A run that cancels to nothing is dropped, and the moves on either side can then merge.
  - The axis of each family comes from the geometry model's notation reader, not from a table.
  - **Properties,** on random trees for 3x3x3 and 4x4x4: the effect is unchanged (kpuzzle), cancelling again changes nothing, the result is never longer, and no metric goes up.
- **Metrics** (`moveCounts`). Definitions checked against the Speedsolving wiki's "Metric" page on 2026-09-14.
  - **HTM:** a face turn is 1 whatever its amount, a slice is 2, a wide move is 1, rotations are 0.
  - **QTM:** a quarter turn is 1 and a half turn 2, so M is 2 and M2 is 4. Wide moves count like face turns; rotations are 0.
  - **STM:** any turn of one slice or contiguous block is 1; rotations are 0.
  - **How they're computed.** A move is a vector of quarter turns per layer along its axis. HTM and QTM take the cheapest way to build that vector from outer-block turns (layers 1..k from either face), with rotations free. STM is 0 when every layer turns together (a rotation) and 1 otherwise. No per-family weights are written by hand.
  - On 3x3x3 the result is exactly HTM, because every outer block is a face turn, or a face turn plus a rotation. On 4x4x4 it's the outer block turn metric (OBTM): `2R` counts 2 and `3Rw` counts 1. cubing.js also treats HTM as OBTM (its `HandTurnMetric` alias).
  - **ETM differs from the wiki, on purpose.** The wiki's ETM counts "perceived movements" in a video: a rotation counts only when it needs a regrip, and a half turn can count as 1 or 2. That can't be computed from notation. Here, ETM counts every written move as 1, rotations included, which is what cubing.js's ETM counter does. It's the tie-break the comm search ranks by (milestone 7).
  - **Verification** (`test/commutator/metrics.test.ts`):
    - a golden table from the wiki's definitions, for 3x3x3 and 4x4x4 moves;
    - on random 3x3x3 sequences, HTM, STM and ETM agree with cubing.js's `OBTM`, `RBTM` and `ETM` counters, and QTM equals HTM with half turns doubled;
    - cubing.js has no QTM counter.
    - `cubing/notation` is imported only by tests.

## D-018 · Comm validation, affected stickers, and a 4x4 wing orientation trap

**Status:** accepted design (plan item 6); the wing finding is recorded for the r2 and 4x4 milestones.

- **`validateComm(puzzle, alg, [buffer, t1, t2])`** judges a comm by what it does, not by a written definition of direction.
  1. `threeCyclePattern` builds the state a solver would trace as exactly t1 then t2: the buffer slot holds the t1 sticker, t1's slot holds t2, and t2's slot holds the buffer sticker. Each piece carries its other stickers along, and every other piece is solved.
  2. Apply the alg. The comm is valid only if the whole puzzle ends solved, centres included.
  - Otherwise the result is `reversed` (the inverse solves it) or `wrong-effect`, with the stickers left unsolved.
  - Errors are typed: `invalid-alg` (carrying the parse error), `wrong-puzzle`, `unknown-sticker`, `mixed-piece-types`, `same-piece` (including a target on the buffer piece) and `interchangeable-pieces-unsupported` (x-centres, as with tracing).
- **`affectedStickers(puzzle, alg)`** returns, for every kpuzzle orbit, the stickers and pieces the alg moves by net effect.
  - A piece that ends back in place and orientation isn't affected.
  - Results are grouped by orbit rather than piece kind, so 5x5x5's two edge orbits will fit.
  - Positions are tracked even for identical x-centres.
- **Finding: a 4x4 wing away from home can have kpuzzle orientation 1.**
  - cubing.js's 4x4x4 `EDGES` orbit has two orientations. Its labels are assigned per slot, so a wing moved by real turns sometimes arrives with orientation 1.
  - Tracing never noticed, because it reads wings by position only. My first `threeCyclePattern` set wing orientation to 0, and the colour-reading oracle saw physically impossible mirrored wings.
  - **Fix:** for piece types that can't reorient in a slot, the orientation of piece p at position q is found by following p through every verified move's definition. A piece reaching one position in two orientations throws.
  - **Consequence for later milestones:** r2 setups and any 4x4 state construction must use this table, never assume 0.
- **Verification** (`test/commutator/validate.test.ts`, `effect.test.ts`).
  - **Every** 3x3 buffer × ordered target pair (9,072 corner and 10,560 edge cases), and three buffers each for 4x4 corners and wings:
    - the constructed state has the stated stickers in the stated slots and nothing else out of place;
    - it traces to exactly `[t1, t2]` under both policies, with no parity and nothing misoriented;
    - the oracle agrees on every wing case and a sample of the rest.
  - **Comms found by enumeration, none remembered:**
    - 3x3 corners: [A, B] with A up to 3 face turns and B one face turn;
    - 3x3 edges: A up to 2 face or slice turns and B one;
    - 4x4 wings: one inner slice against up to 3 U/R/F/D turns, in either order.
    - Only comms whose geometry-model effect is a clean 3-cycle are kept. For each one: the cycle read from that permutation is `valid`, the swapped order is `reversed`, and a target outside the cycle is `wrong-effect`.
  - **Teeth:** forcing wing orientation back to 0 fails both the oracle check and the wing comms.
  - `affectedStickers` matches the geometry model's moved stickers on random trees for 3x3x3 and 4x4x4.

## D-019 · 3-style comm search: search space, exact pruning, ranking and the time budget

**Status:** accepted design (milestone 7 plan review, 2026-09-14). Budget measured 2026-09-14: within budget for both piece types (see "The 60 s budget").

- **Search space.** A comm for case (t1, t2) from buffer b is `[S: [A, B]]`.
  - `[A, B]` is `[X, I]` or `[I, X]`: X a canonical insertion of 1–4 moves, I a single move.
  - S is a canonical setup of 0–3 moves.
  - Its effect must be exactly the 3-cycle b → t1 → t2, with every other sticker left alone, centres included.
  - **Canonical sequences:** no two consecutive moves of one family, and consecutive same-axis moves in generator order.
  - **Generators:** corners U D R L F B; edges U D R L F B M E S. Interchange, insertion and setup all use the same set.
- **Bounds: insertion ≤ 4 and setup ≤ 3 for both piece types.**
  - For edges this is the Phase 1 plan's bound.
  - **Corners were widened from (3, 2).** At (3, 2), six cases per buffer have no comm; for UFR those are the cycles among UBL, DFL and DBR. (4, 3) covers all 378. Compared with insertion ≤ 3, it also improves 26–52 cases per buffer by 1–2 moves, and takes under a second.
- **The catalogue** (`buildCatalogue`) is built once per piece type and shared by every buffer.
  - It holds every `[X, I]` and `[I, X]` with a clean 3-cycle effect, indexed by that directed cycle.
  - Two comms with the same cancelled sequence are one entry; the written form kept is the one first in generator order.
  - **Sizes:** corners 4,608 comms over 528 cycles; edges 100,512 over 1,320. Build times: 0.3 s and 2.5 s.
  - **Test:** at insertion ≤ 2 it finds exactly what a naive walk of every sequence finds.
- **Per buffer** (`searchComms`): for each setup S and case, look up the comms for the cycle `(S(b), S(t1), S(t2))`. Conjugating any of them by S solves the case.
- **Pruning is exact.**
  - Let θ be the case's current 4th-best ETM, σ the setup's last syllable (same-axis run), and c₁, cₘ the comm's first and last syllables.
  - **Bound:** if c₁ ≠ σ⁻¹ and cₘ ≠ σ, then |S C S⁻¹| ≥ 2|S| + |C| − 4|σ|.
    - At each junction the two syllables merge into a non-zero run, so nothing cascades.
    - Each junction loses at most |σ| + |c| − |σ + c| ≤ 2|σ| moves.
  - Each cycle's list is sorted by |C| and scanned only while the bound is ≤ θ.
  - Comms whose first syllable is σ⁻¹ or last syllable is σ could cascade. They're fetched from an index and always evaluated.
  - Setups run shortest first, so θ falls early.
  - **Tests:** the pruned result equals the unpruned search (comms and order) on all 378 UFR corner cases, and on 20 seeded cases for each sampled buffer.
- **Ranking.**
  1. ETM after cancellation (D-017).
  2. QTM.
  3. Setup length.
  4. The written moves in generator order (clockwise, prime, half).
  - This is a deterministic tie-break, not a claim about ergonomics.
  - Each case keeps 4 distinct cancelled sequences: the best and three alternates. Cases with no comm are listed in `noComm`, never dropped.
  - **Observation for Gate B.** Ranking by ETM sometimes prefers a setup that cancels into the comm, so the notation looks unusual. For example `[L: [L' B L F, F']]` is 8 moves, and so is the more conventional `[B': [B, R' F' R]]`.
- **Determinism.** The search has no time cutoff. It is exhaustive within the bounds, so the results are the same on any machine and a dataset can be regenerated exactly.
- **First measurements** (single-threaded, this machine; the benchmark gives the figures of record):
  - UFR corners, all 378 cases: 0.2 s pruned, 0.34 s unpruned.
  - UF edges, all 440 cases: 13.8 s pruned, plus the 2.5 s catalogue. The unpruned search took 85 s in the planning probe.
  - Best-comm ETM for UF: 4 ×6, 5 ×12, 7 ×108, 8 ×240, 9 ×66, 10 ×8.
- **The 60 s budget.**
  - **Definition:** one piece type's full case set for one buffer, in a fresh Node process: catalogue, search, and `validateComm` on every returned comm, single-threaded.
  - **Measurement:** `pnpm engine:bench comms` times every buffer, then re-runs the slowest buffer of each piece type in three fresh processes. The figure is the maximum of those three.
  - **If a buffer is over:** results don't change, the benchmark flags it, and the options go to you. Bounds are never changed silently.
  - **Measured 2026-09-14** on an AMD Ryzen 5 5600H (12 logical cores, 15 GiB), Windows, Node v24.21.0, single-threaded:

    | Piece type | Catalogue | Search per buffer (warm) | Slowest buffer | Budget figure (max of 3 cold runs) |
    |---|---|---|---|---|
    | Corners | 0.28 s | 0.19–0.24 s | UFR | **0.64 s** |
    | Edges | 2.4–2.6 s | 8.5 s (BL) – 14.3 s (UB) | UB | **14.41 s** |

    - Verifying every returned comm with `validateComm` adds under 0.1 s per buffer.
    - Every buffer returns 4 comms for every case, with no case lacking a comm: 1,512 comms per corner buffer and 1,760 per edge buffer.
    - U-layer edge buffers are the slowest and E-slice ones the fastest. Their exact-evaluation counts differ in the same way: 30.9M for UB against 19.7M for BL.
- **Sampling.**
  - `pnpm test`: corners UFR, UBL, DBR and edges UF, DF, FR, each with 20 seeded cases.
  - `pnpm test:engine:slow`: the full UFR corner and UF edge sets.
  - The buffer-comparison report: every buffer piece.

## D-020 · Swap algs for Old Pochmann and M2: reference algs, computed effects, symmetry variants

**Status:** accepted design (milestone 7 plan review, 2026-09-14). Gate B chooses the buffers and the variants.

- **Reference algs** (`REFERENCE_SWAPS`). Each is a single named alg, not a sheet:
  - **OP corners,** buffer UBL: `R U' R' U' R U R' F' R U R' U' R' F R`. Source: J Perm, jperm.net/bld, retrieved 2026-09-14.
  - **OP edges,** buffer UR: `R U R' U' R' F R2 U' R' U' R U R' F'`. Same source.
  - **M2,** buffer DF: the move `M2`, per BRIEF §5.4.
- **Effects are computed, never typed in.** Each alg's sticker permutation comes from the move table, must equal the geometry model's, and must have its method's shape:
  - an involution whose moved pieces pair into transpositions, one of them the buffer's;
  - **OP:** one transposition of the method's own piece kind, one of the other kind, and no centres;
  - **M2:** two edge transpositions and two centre transpositions.
- **Computed effects** (pinned in `test/methods/swap-algs.test.ts`):
  - **OP corners:** UBL↔DFR, with the U sticker sent to RDF (Speffz P). **Side effect:** edges UB↔UL. 15 moves.
  - **OP edges:** UR↔UL, with the U sticker sent to UL. **Side effect:** corners UBR↔UFR. 14 moves.
  - **M2:** DF↔UB, with the D sticker sent to UB. **Side effect:** UF↔DB, plus centres U↔D and F↔B.
- **Finding: every swap has a side effect, whatever a summary says.** The fetched summary of J Perm's page said each OP swap exchanges "only" the buffer and the target. That can't be true: a single swap of two pieces is an odd permutation, so something else must move as well. The engine records the side effects above, and the setup search protects them (D-021).
- **Symmetry variants** (`swapVariants`). Each of the 48 cube symmetries relabels a reference alg, using `relabelMove` from `src/core/symmetry.ts`, into a swap for another buffer piece.
  - Each variant's permutation is recomputed from its own moves. It must equal g·P·g⁻¹ of the reference, agree with the geometry model, and pass the same shape check.
  - An alg repeated for the same buffer is listed once.
  - **OP corners:** 6 distinct variants for each of the 8 corner pieces. Symmetries preserve antipodes, so the swap piece is always the corner opposite the buffer.
  - **OP edges:** 4 distinct variants for each of the 12 edge pieces.
  - **M2** (`m2Swaps`): only images that are still M2, i.e. the M-slice buffers DF↔UB and UF↔DB. Images that become E2 or S2 would be different slice methods, not M2.

## D-021 · Setup search for Old Pochmann and M2

**Status:** accepted design (milestone 7 plan review, 2026-09-14). Gate B may restrict the pools.

- **What a setup must do** (`searchSetups`). Setup S for target t brings t to the swap sticker, the slot the buffer sticker is sent to. Then S · swap · S⁻¹ exchanges the buffer with t and repeats the swap's side effect unchanged.
  - That holds only if S leaves the **protected stickers** where they are: the buffer piece and every side-effect piece.
  - The swap piece isn't protected; setups may move it.
- **Two regimes.**
  - **`every-move`** (OP). Only pool families that move no protected sticker are allowed, which is J Perm's rule. Every other family is reported as forbidden, with the protected pieces it disturbs, as data.
  - **`net`** (M2). Any pool family may be used, as long as the whole setup puts the protected stickers back.
    - M2 needs this: the only face turns that never touch its protected edges are R and L, and neither reaches the helper slot.
    - Setups such as `F U' F'` move a protected edge and bring it back.
- **Algorithm.**
  1. A backward breadth-first search from the goal gives the exact shortest setup length for every target. The state is the target's slot plus one sticker slot per protected piece that some usable move can disturb; M2's centres never move under face turns, so they aren't tracked.
  2. Among the shortest canonical setups, the fewest quarter turns wins, then the earliest in pool order (clockwise, prime, half).
  3. Unreachable targets are listed.
- **Default pools** (`DEFAULT_SETUP_POOLS`):
  - OP corners: face turns, `every-move`;
  - OP edges: face turns and Uw Dw Rw Lw Fw Bw, `every-move`;
  - M2: face turns, `net`.
- **Results for the reference swaps:**
  - **OP corners, buffer UBL, swap sticker RDF.**
    - **Allowed: D, R, F.** This matches J Perm's "only use D/F/R".
    - Forbidden: U (disturbs UBL, UB, UL), L (UBL, UL), B (UBL, UB).
    - Setup lengths: 1 target at 0 moves, 9 at 1, 11 at 2. None unreachable.
  - **OP edges, buffer UR, swap sticker UL.**
    - **Allowed: D, L, Dw, Lw.**
    - **Differs from J Perm, who allows only L, Lw and Dw.** D disturbs no protected piece. Gate B can drop it from the pool.
    - Forbidden: U, R, Uw, Rw (UR, UBR, UFR), F (UFR), B (UBR), Fw (UR, UFR), Bw (UR, UBR).
    - Setup lengths: 1 at 0 moves, 3 at 1, 9 at 2, 8 at 3, 1 at 4. None unreachable.
  - **M2, buffer DF, swap sticker UB.**
    - Setup lengths: 16 targets at 3 moves, BU at 5.
    - **UF, FU, DB and BD can't be set up.** Those pieces are M2's own side effect, so they must stay put. They are the M-slice special cases for milestone 10.
  - All 96 OP symmetry variants, each from its buffer's reference sticker, have a setup for every target. The four M-slice M2 buffers each lose exactly the stickers of their two side-effect edges.
- **Verification** (`test/methods/setup-search.test.ts`).
  - For every reachable target, in every table, S · swap · S⁻¹ is read in the geometry model. It must exchange the buffer and target pieces (buffer sticker ↦ target), repeat the side effect exactly, and move nothing else.
  - For the reference tables, an exhaustive search finds no shorter setup, for setups of up to 3 moves.
- **Not yet:** `demonstrateIllegalSetup` (milestone 9), parity, and the M2 special cases and odd/even rule (milestone 10).
