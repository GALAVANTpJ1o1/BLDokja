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
  - Which policy each method uses by default is decided at Gate B: `asTargets` for OP and M2, `separate` for 3-style (D-022).
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
- **Determinism.** The search has no time cutoff, so the results are the same on any machine and a dataset can be regenerated exactly.
  - **Correction (D-031):** this said the search was exhaustive within the bounds. Until 2026-09-16 it wasn't: a case was looked up under the wrong one of its sticker cycles, which missed comms. It is exhaustive now, checked against an independent oracle.
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

**Status:** accepted design (milestone 7 plan review, 2026-09-14). Gate B chose J Perm's reference swaps for UBL corners and UR edges, and M2 for DF (D-022).

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

**Status:** accepted design (milestone 7 plan review, 2026-09-14). Gate B restricted the OP pools to J Perm's moves (D-022).

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
    - **Differs from J Perm, who allows only L, Lw and Dw.** D disturbs no protected piece. Gate B dropped it: with L, Lw and Dw the setup lengths are the same and every target is still reachable (D-022).
    - **Correction (milestone 9, 2026-09-14).** That summary was incomplete. J Perm's page says "Only use L/Lw/Dw moves", but its own recipe for D-face stickers is "do some D-turn followed by L2". D is back in the edge pool (D-022 amended, D-024).
    - Forbidden: U, R, Uw, Rw (UR, UBR, UFR), F (UFR), B (UBR), Fw (UR, UFR), Bw (UR, UBR).
    - Setup lengths: 1 at 0 moves, 3 at 1, 9 at 2, 8 at 3, 1 at 4. None unreachable.
  - **M2, buffer DF, swap sticker UB.**
    - Setup lengths: 16 targets at 3 moves, BU at 5.
    - **UF, FU, DB and BD can't be set up.** Those pieces are M2's own side effect, so they must stay put. They are the M-slice special cases for milestone 10.
  - All 96 OP symmetry variants, each from its buffer's reference sticker, have a setup for every target. The four M-slice M2 buffers each lose exactly the stickers of their two side-effect edges.
- **Verification** (`test/methods/setup-search.test.ts`).
  - For every reachable target, in every table, S · swap · S⁻¹ is read in the geometry model. It must exchange the buffer and target pieces (buffer sticker ↦ target), repeat the side effect exactly, and move nothing else.
  - For the reference tables, an exhaustive search finds no shorter setup, for setups of up to 3 moves.
- **Later milestones:** the illegal-setup demonstration (built as `demonstrateSetup`) and OP parity came in milestone 9 (D-024); the M2 special cases, the odd/even rule and M2/OP parity in milestone 10 (D-025).

## D-022 · Gate B: buffers, swap algs, setup moves and orientation policy per method

**Status:** accepted (Gate B, 2026-09-14). You decided after reviewing `docs/reports/buffer-comparison.md`. These become the defaults the datasets are generated for; users can still choose other buffers (BRIEF §7.6). **Amended in milestone 9 (2026-09-14):** the OP edge setup pool is D, L, Dw, Lw (see below and D-024).

- **Holding orientation: white up, green front,** the WCA scrambling orientation, with the standard colour scheme (U white, F green, R red, D yellow, L orange, B blue).
  - This is what tracing's `centers` frame and `SPOT-CHECK.md` already assume.
- **Buffers.** Each buffer sticker is its piece's reference sticker; the Speffz letter is in brackets.

  | Method | Corners | Edges |
  |---|---|---|
  | OP/OP | OP, buffer **UBL** (sticker UBL, A) | OP, buffer **UR** (sticker UR, B) |
  | M2/OP | OP, buffer **UBL** (sticker UBL, A) | M2, buffer **DF** (sticker DF, U), helper UB |
  | 3-style | **UFR** (sticker UFR, C) | **UF** (sticker UF, C) |

  - M2 on DF is what BRIEF §5.4 names.
- **Swap algs: J Perm's reference swaps, unchanged** (D-020).
  - **Corners:** `R U' R' U' R U R' F' R U R' U' R' F R`. It sends UBL to RDF and swaps edges UB↔UL.
  - **Edges:** `R U R' U' R' F R2 U' R' U' R U R' F'`. It sends UR to UL and swaps corners UBR↔UFR.
  - **M2:** the move `M2`.
- **Setup moves: J Perm's lists** (D-021, `every-move` regime).
  - **OP corners:** D, F, R. That's the same set the engine computes from all face turns.
  - **OP edges:** ~~L, Lw, Dw~~ **D, L, Dw, Lw** (amended). At Gate B you chose L, Lw, Dw as J Perm's list. In milestone 9 it turned out that J Perm's page contradicts itself: it says "Only use L/Lw/Dw moves", but its recipe for D-face stickers is "do some D-turn followed by L2". You chose to add D (2026-09-14).
    - D moves no protected piece, and the setup-length distribution is identical either way (1 target at 0 moves, 3 at 1, 9 at 2, 8 at 3, 1 at 4; mean 2.23).
    - With D in the pool, the tie-break picks D over Dw for 10 targets, which now match J Perm's recipe: for example DF `D' L2`, UF `Lw2 D L2`.
  - **M2:** face turns under the `net` regime, unchanged.
  - The code's `DEFAULT_SETUP_POOLS` still lists the wider pools, which are the candidates checked for forbidden families. These lists are `GATE_B_SETUP_FAMILIES`, and the datasets are generated with them.
- **Twisted and flipped pieces** (`orientedInPlace`, D-012). This is separate from how the cube is held.
  - **OP/OP and M2/OP: `asTargets`.** Pieces in their slot but misoriented are traced into the letter chain as two targets, as on jperm.net/bld. No twist or flip algs are needed.
  - **3-style: `separate`.** They're reported apart from the targets and solved with twist algs (14 corner: UFR with each other corner, both directions) and flip algs (11 edge: UF with each other edge). Milestone 8 generates and verifies them.
- **What these choices mean, from the report:**
  - **3-style UFR:** all 378 cases have a comm. Best-comm ETM: 198 cases at 8, 110 at 9, 38 at 10, 26 at 11, 6 at 13 (mean 8.78).
    - **Superseded by D-031:** after the search fix, 198 at 8, 126 at 9, 30 at 10, 18 at 11, 6 at 13 (mean 8.71), the same for every corner buffer.
    - **What that means for this choice (settled 2026-09-16):** comm length can't favour any 3-style buffer, since every corner buffer has the same distribution and so does every edge buffer. The lower means for U-layer buffers in the Gate B report were an artifact of the bug D-031 fixed. UFR and UF stay: they're the buffers most 3-style material uses and the site's lessons teach, and nothing in the corrected report argues for another. The letter-pair cost below (UFR and UF share Speffz C) is still real, and is the one trade-off of this choice.
  - **3-style UF:** all 440 cases have a comm. Best-comm ETM: 6 at 4, 12 at 5, 108 at 7, 240 at 8, 66 at 9, 8 at 10 (mean 7.80).
  - **OP UBL corners:** setups are at most 2 moves (mean 1.48). OP UR edges: at most 4 (mean 2.23).
  - **M2 DF:** 16 targets have 3-move setups and BU has 5. UF, FU, DB and BD are the special cases (milestone 10).
  - **Letter pairs** (D-013 consequence 4):
    - **3-style UFR and UF share Speffz C.** Tracing with them can produce 494 of the 552 distinct-letter pairs, the lowest of any combination. All 46 pairs containing C are lost, plus 12 other pairs that neither the corner trace nor the edge trace can produce.
    - OP/OP (UBL, UR) can produce 532 under `asTargets`, and so can M2/OP (UBL, DF).
    - The library still holds all 576 cells either way (D-013). This only affects which pairs these buffers produce.

## D-023 · 3-style alg datasets, twist and flip algs, and how datasets are verified

**Status:** accepted design (milestone 8 plan review, 2026-09-14). The notation observation below is for your review.

- **What ships** in `content/algs/3x3/`, generated for the Gate B buffers (D-022):

  | File | Records | Main-alg ETM: moves: records |
  |---|---|---|
  | `3style-corners.UFR.json` | 378 cycles | 8: 198 · 9: 126 · 10: 30 · 11: 18 · 13: 6 (regenerated for D-031; was 9: 110 · 10: 38 · 11: 26) |
  | `3style-edges.UF.json` | 440 cycles | 4: 6 · 5: 12 · 7: 108 · 8: 240 · 9: 66 · 10: 8 |
  | `3style-twists.UFR.json` | 14 twists (7 corners × 2 directions) | 16: 14 |
  | `3style-flips.UF.json` | 11 flips | 12: 10 · 13: 1 |

- **Format** (`src/data/alg-dataset.ts`, Zod-validated).
  - One dataset per method, piece type, buffer and kind (`cycles`, `twists` or `flips`). Records are in canonical case order, and there are no timestamps.
  - **A record names its case in sticker and piece names, never letters** (D-009): `targets` for a cycle; `target` plus `direction` for a twist; `target` for a flip.
  - **It states the intended effect explicitly**, as sticker cycles (every sticker the alg moves), with `sideEffectPieces`, always empty for 3-style.
  - **It holds 1–4 algs, main first.** Each carries its canonical notation, cancelled moves, ETM/QTM/HTM/STM and its source (`engine-search` or `cubing-solver`).
- **Verification** (`verifyRecord` and `verifyDataset`).
  - The intended effect is recomputed from the case alone, never from the algs, and must match what's stored.
  - For every alg:
    - its notation must parse and already be canonical;
    - its stored moves must equal its cancelled expansion;
    - its counts must match D-017;
    - its whole-puzzle sticker permutation, centres included, must equal the intended effect;
    - it must solve the case state (`validateComm` or `validateOrientationAlg`).
  - Coverage must be complete, with no unexpected records and nothing out of order.
  - **Tests:** `test/data/alg-dataset.test.ts` shows each kind of corruption is caught. `test/data/datasets.test.ts` runs every committed file through all of this (fast suite).
- **Reproducibility.**
  - `pnpm engine:generate` writes the files, and verifies every record first.
  - `pnpm engine:generate --check`, also in the slow suite, regenerates them and fails on any difference. A deliberately corrupted file makes it exit 1.
  - `.gitattributes` pins `content/algs/**` to LF so the comparison is byte-exact on Windows checkouts.
- **Twist and flip cases follow what tracing reports.**
  - The case state is the target twisted in the direction `trace` reports (D-012), with the buffer twisted the other way; for flips, both flipped.
  - A test traces each state and checks it reports exactly those two pieces and no targets.
- **Twist and flip search** (`searchOrientationAlgs`).
  - Searches `[S: [X, I]]` whose effect twists or flips exactly two pieces in place.
  - X alternates between two non-parallel move families, up to 8 moves. I is one move. S is a setup of up to 3 moves.
  - Setups, exact pruning and ranking are the shared conjugate search (D-019).
  - Every case is covered.
- **Solver alternates: none made it in.** You chose comm-shaped main algs, with shorter cubing.js solver algs allowed as alternates. The solver never beat the comm-shaped algs:
  - twists: 16–17 moves, against 16 for the comms;
  - flips: 16–18 moves, against 12–13.
  - The rule stays in the generator in case bounds or buffers change.
- **Observation for your review: ETM ranking sometimes picks awkward notation.**
  - The main algs are verified correct, but some aren't how a person would write or learn them:
    - an insertion that starts on the interchange's axis, such as `[D, D L' U L]`;
    - slice-heavy conjugates such as `[M2: [D' S U D, D2]]`;
    - flips built on E and S slices.
  - Nothing in the lessons or trainers uses these files yet.
  - **Options for later:** keep ETM ranking, normalise the notation of equivalent forms, or add an ergonomic tie-break (fewer slices, fewer move families). Your call.

## D-024 · Old Pochmann datasets, the OP/OP solver, and OP parity

**Status:** accepted design (milestone 9 plan review, 2026-09-14). The findings and deviations below are for your review.

- **What ships** in `content/algs/3x3/`, for the Gate B buffers (D-022):

  | File | Records | Setup length: moves: targets | Main-alg ETM (cancelled): moves: targets |
  |---|---|---|---|
  | `op-corners.UBL.json` | 21 targets | 0: 1 · 1: 9 · 2: 11 (mean 1.48) | 14: 2 · 15: 2 · 16: 4 · 17: 6 · 19: 7 |
  | `op-edges.UR.json` | 22 targets | 0: 1 · 1: 3 · 2: 9 · 3: 8 · 4: 1 (mean 2.23) | 14: 1 · 16: 3 · 18: 9 · 20: 8 · 22: 1 |
  | `op-parity.UBL-UR.json` | 1 parity alg | | 16 |

- **Format** (`src/data/op-dataset.ts`, Zod-validated; `ContentDatasetSchema` covers every kind under `content/algs/`, discriminated on `kind`).
  - **Setups dataset:**
    - the swap, with its source (`reference` or `symmetry`), citation, symmetry index, swap sticker and side-effect pieces;
    - `candidateFamilies` (the `DEFAULT_SETUP_POOLS` checked for forbidden moves), `setupFamilies` (the Gate B pool, in candidate order) and `allowed`;
    - `forbidden`: each family with the protected pieces it disturbs and one example of the damage (below);
    - one record per non-buffer sticker: the setup, the intended effect, and the alg `[setup: swap]` (the plain swap for the swap sticker).
  - **Parity dataset:** the two buffers and swap algs it belongs with, the symmetry index, and one record with its intended effect and the alg.
  - **Alg entries** gain the sources `reference` and `symmetry`, which must carry a citation. The 3-style files are unchanged byte for byte.
- **Verification.** Nothing is trusted from the records.
  - The swap must be a verified symmetry image of J Perm's reference under the stated symmetry, with the stated swap sticker and side effect; `reference` only for the identity.
  - The allowed and forbidden families, and every setup, must equal a fresh search. Setups may only use `setupFamilies`.
  - Every alg's whole-puzzle permutation must equal the exchange of buffer and target (the 2-cycle state from `stickerCyclePattern`) plus the swap's side effect, built from the case alone. Notation, cancelled moves and counts are checked as for 3-style (`checkAlgEntry`).
  - Each forbidden example must use its family, bring the target to the swap sticker, and damage something (`demonstrateSetup`).
  - **The parity alg's effect is derived, never read from the source:** the corner swap's side effect together with the edge swap's side effect.
  - **Tests:** `test/data/op-dataset.test.ts` catches each corruption: wrong or non-shortest setups, a forbidden family, a wrong side effect, wrong tables, a harmless example, a non-reference swap, wrong provenance or citation, wrong counts or notation, and missing or out-of-order records. `test/data/datasets.test.ts` verifies the committed files, and checks they equal what `opSystem` builds at runtime.
- **Parity.**
  - **Source:** J Perm, jperm.net/bld: `R U' R' U' R U R D R' U' R D' R' U2 R' U'`, performed "between solving edges and solving corners" when both letter counts are odd. The page mentions no letter swap.
  - **Computed effect:** UB↔UL (LU↔BU) and UBR↔UFR (FUR↔RUB, RUF↔BUR).
    - That is exactly the corner swap's edge side effect together with the edge swap's corner side effect. Every target step repeats its swap's side effect once, so with odd counts the edges leave UBR/UFR swapped and the corners would leave UB/UL swapped.
  - **Why only between the phases.** Parity after the edges puts UBR/UFR back before the corner memo runs. The corners then swap UB/UL back. Placed after the corners, the corner memo would run on a cube whose UBR and UFR are swapped, so it fails.
  - A test shows this: over 200 random states, leaving parity out fails on every parity state, and moving it after the corners fails too.
- **Solver** (`solveOpOp`, `src/methods/op.ts`).
  - Traces corners and edges once, with `asTargets`, from the datasets' buffers. The scheme and break order are the caller's.
  - **Steps, in J Perm's order:**
    1. a frame rotation, if the scramble leaves the centres turned (`centersRotation`);
    2. edge targets;
    3. parity, when the traces have parity;
    4. corner targets.
  - Each target step has its setup, core and undo, and its index into the trace. The parity step names the pieces it cancels. There is no English text and there are no letters (`src/methods/solution.ts`).
  - `opPhase` builds one piece type's steps; M2/OP (milestone 10) reuses it.
  - **Typed errors:** `dataset-mismatch`, `trace`, `orientation-left-over`, `inconsistent-parity`, `missing-setup`, `invalid-dataset-alg`.
- **Other buffers: symmetric systems only.** `opSystem(puzzle, { cornerBuffer, edgeBuffer })` builds and verifies all three datasets in memory for any buffer pair a cube symmetry maps (UBL, UR) onto. It relabels the swaps, the Gate B setup families and the parity alg by that symmetry.
  - Those are 48 pairs, one symmetry each: a corner with an edge that lies on one of the corner's faces but doesn't touch it.
  - **Every other pair returns `no-verified-parity-alg`,** including 3-style's UFR/UF. Supporting them needs a parity-alg search (a conjugate that produces exactly the two leftover swaps). That isn't built; it's a decision for when custom buffers reach the OP trainer.
- **Illegal-setup examples** (`illegalSetupExamples`), for Phase 4's "Why is this setup illegal?" mode.
  - **Rule:** for each forbidden family, among all targets, take the shortest setup that uses the family and brings the target to the swap sticker (tie-breaks as D-021). The example is the target where that setup saves the most moves against the legal one; ties go to sticker order.
  - For corners no forbidden move ever saves a move, so the examples cost the same or more.

    | Method | Family | Target | Tempting setup | Legal setup | Damaged pieces |
    |---|---|---|---|---|---|
    | corners | U | FUR | `U F2` | `R2 D'` | UBL UB UL UFL UF UFR |
    | corners | L | UFL | `L D` | `F R'` | UBL UB UL UFL BL DBL |
    | corners | B | UBR | `B' R` | `R D'` | UBL UB UBR UL BL DBL |
    | edges | U / Uw | UF | `U` / `Uw` | `Lw2 D L2` | UBL UB UBR UR UF UFR |
    | edges | R / Rw | RD | `R Dw' L'` / `Rw Dw' L'` | `D Lw' D' L2` | UBR UR UFR FR DFR DR |
    | edges | F | FU | `F' L'` | `Lw D' L2` | UBR UFR DFR |
    | edges | B | BU | `B L` | `Lw' D L2` | UBR UFR DBR |
    | edges | Fw | RD | `D2 Fw` | `D Lw' D' L2` | UBR UL UR UFL UFR DR |
    | edges | Bw | RD | `D2 Bw'` | `D Lw' D' L2` | UBL UBR UL UR UFR DR |

  - `demonstrateSetup` runs any setup and reports the protected pieces it disturbs, the intended and actual sticker cycles, and the damaged pieces.
  - **Tests:** every legal setup in the Gate B tables and in all 96 symmetry-variant tables reports no damage. Every example's damage is checked again in the geometry model.
- **Full-solve verification** (`test/methods/op-solve.test.ts`, slow suite in `op-solve.slow.test.ts`).
  - **Fast suite:**
    - 1,000 seeded runs on (UBL, UR): random states, and scrambles ending in wide moves, slices or rotations; Speffz and a reversed Greek scheme; custom break orders. Each run is checked in kpuzzle, and the scrambles also in the geometry model. 30 runs on each of the 48 symmetric systems.
    - **Teeth:** no parity, parity after the corners, and the forbidden-U example substituted for a real setup.
    - **Golden fixture R06** (UBL/UR, parity, two twists traced as targets): all 25 steps pinned, for following on a physical cube.
  - **Slow suite:** 20,000 random states on (UBL, UR), and 500 on each symmetric system. None fail.
- **Deviations from the milestone 9 plan:**
  - The target-slot search the examples need lives in `illegal-setup.ts`, not as a new mode of `searchSetups`.
  - The illegal-setup commit came before the dataset commit, because the dataset verifier uses it.
  - `demonstrateIllegalSetup` is named `demonstrateSetup`, since it also shows that legal setups do no damage.
  - `ENGINE_VERSION` moved to `src/version.ts`, so engine code can stamp datasets without importing the index.
- **Observation: ETM in the table is after cancellation.** For example RUF `[R': swap]` cancels to 14 moves, fewer than the swap alone. `MethodSolution.moves` is uncancelled, because that's what a learner executes step by step.

## D-025 · M2 edges: special cases, the odd/even rule, and the M2/OP solver

**Status:** accepted design (milestone 10 plan review, 2026-09-14). The findings and deviations below are for your review.

- **What ships** in `content/algs/3x3/`, for the Gate B buffers (D-022):
  - **`m2-edges.DF.json`:** 22 records.
    - 18 targets are set up. Setups are 3 moves for 16 targets, 5 for BU, and none for UB (just `M2`). Every alg is `[setup: M2]`, 7 moves (11 for BU).
    - 4 special cases (UF, FU, DB, BD) have up to 4 algs each.
    - The file also holds the odd/even rule and 21 tempting setups.
  - **`m2op-parity.UBL-DF.json`:** the M2/OP parity alg with 3 alternates. Its corners are the OP/OP corner dataset, `op-corners.UBL.json`, unchanged.
- **What M2 leaves behind.** `M2` swaps DF with UB and also has a side effect X: UF↔DB, FU↔BD, and centres U↔D, F↔B.
  - Every step repeats X once, so the cube carries X after every odd-numbered step.
  - For a target that X doesn't touch, the exchange and X commute, so the step is the same on odd and even steps.
  - The special-case and parity algs below come from this algebra and a search, never from a sheet.
- **Special cases: derived, then searched.**
  - A target t on X's edges can't be set up. D-021 already found UF, FU, DB and BD unreachable.
  - The step for such a t must do E(DF, t)·X. `targetEffect(..., { onSideEffectPiece: "compose" })` computes it.
  - That effect, with `M2` taken off either end, is a clean edge 3-cycle. So the candidates are a comm C from the comm search, followed or preceded by `M2` (`searchSliceComposites`).
  - **Ranking:** cancelled ETM of the whole alg, then QTM, then form (comm first), then the comm's own rank.
  - **The ranking is exact.** Joining `M2` to C can shorten it by at most one move, so the comm list is widened until no longer comm could tie. The first probe in planning looked at only the top 4 comms and reported the parity alg at 9 moves; the exact search finds 7.
  - **Bounds (your choice): U D R L F B M only, no E or S;** insertion ≤ 4, setup ≤ 3. With E and S allowed, FU would get `U' S' U' F2 U S U' F2 U2 M2`. The verifier rejects any special or parity alg outside the recorded bounds.
  - **Special algs are stored as plain cancelled move sequences.** The comm-plus-M2 bracket form reads badly, for example `[U2 R L M, M'] M2` for `U2 M' U2 M'`.

  | Target | Main alg (ETM) | Alternates |
  |---|---|---|
  | UF | `U2 M' U2 M'` (4) | `M' B2 M' B2`, `M F2 M' F2 M2`, `M2 D2 M' D2 M` |
  | FU | `D M' D B2 D' M D B2 D2 M2` (10) | three more at 10 |
  | DB | `B2 M B2 M` (4) | `M U2 M U2`, `M' D2 M D2 M2`, `M2 F2 M F2 M'` |
  | BD | `U2 F2 U' M' U F2 U' M U' M2` (10) | three more at 10 |

  - **BU** has a 5-move setup, `[U B' R U' B: M2]` (11 moves). The flip-pair-plus-M2 form would take 14, so BU stays a setup target.
- **Compared with the Speedsolving wiki's M2/R2 page** (as fetched 2026-09-14; the fetch summaries were partial and inconsistent, so only clear rows are used):
  - **Same as the engine:**
    - UF `U2 M' U2 M'` (engine main);
    - DB `M U2 M U2` (engine's first alternate; it ties with `B2 M B2 M` on every count and loses on written order);
    - BU `U B' R U' B M2 B' U R' B U'` (identical);
    - FR, DR, BR, FL, DL, BL (same 3-move setups).
  - **Different:**
    - UR and UL: the wiki uses 4-move setups (`R' U R U'`, `L U' L' U`), the engine 3 (`F U' F'`, `F U F'`);
    - R-face and L-face stickers: the wiki uses `x'` rotations, the engine 3-move face-turn setups (for example RU `B' R B`, LB `D B' D'`).
  - Both forms are correct. The engine keeps the shortest face-turn setups (D-021).
- **The odd/even rule is derived by simulation, never written in.**
  - On an odd step (0-based; the second target of each pair) target t needs X·E_t. That equals E_X(t)·X: exactly the record of the sticker X sends t to.
  - `deriveOddStepRule` finds, for every target, the one record whose effect is X·E_t. For DF the result is:
    - **UF→DB, FU→BD, DB→UF, BD→FU** (Speffz C↔W, I↔S);
    - every other target keeps its own record.
  - The verifier recomputes the rule, and `m2Phase` applies it, recording `shotAs` on the step.
  - **Sources disagree:**
    - One forum answer (Joël, speedsolving.com "HELP with M2 blindfolded") agrees: UF as the second letter means shoot to DB.
    - Another reply in the same thread contradicts itself. First it says FU goes to DB and UF to BD, which is wrong: the engine shows UF↔DB and FU↔BD. Then it says FU at an odd position uses the BD alg, which agrees.
    - cubefreak's M2 guide describes a variant that avoids the swap by using different algs.
    - The wiki page states no rule.
  - **The engine's rule is proven by the tests.** Ignoring it fails on every state that needs it.
- **M2/OP parity.**
  - The leftover with odd counts is X together with the OP corner swap's UB↔UL. That leftover with `M2` taken off is again an edge 3-cycle.
  - **The search finds `U' F2 U M2 U' F2 U` (7).** `D' L2 D M2 D' L2 D` ties on every count and is the first alternate.
  - **Placement (your choice): between edges and corners,** so the centres are back in place before the corner phase.
  - **Finding:** nothing the parity alg fixes touches a corner, so it also works after the corners. A test checks both placements on every parity state. This differs from OP/OP (D-024).
- **Tempting setups** (`temptingSetups`), for Phase 4's counterexample mode. For every target, the shortest face-turn setup that ignores the protected pieces, where it beats the legal setup or no legal setup exists.
  - That covers 21 targets, all but UB. Examples: UR `U'` instead of `F U' F'`; UF `U2`; DB `B2`.
  - Each carries its damage, checked in the geometry model.
  - `demonstrateSetup` gained the same `onSideEffectPiece` option.
- **Solver** (`solveM2Op`, `src/methods/m2.ts`).
  - Steps: frame, edges (odd/even rule applied), parity when the counts are odd, corners (`opPhase`).
  - The trace-and-frame start is shared with `solveOpOp` (`traceForSolve`).
  - `MethodSolution.method` is `m2-op`. `TargetStep.shotAs` names the record shot.
- **Other buffers** (`m2OpSystem`). It builds and verifies the datasets for the 8 buffer pairs that a symmetry keeping M2 an M move maps (UBL, DF) onto: UBL/DF, UBR/DF, UFL/DB, UFR/DB, DBL/UF, DBR/UF, DFL/UB and DFR/UB.
  - The corner swap and Gate B corner families are relabelled by the lowest-index such symmetry.
  - **Deviation from the plan:** the special cases and the parity alg are searched for the given buffer stickers, not relabelled. That also covers a non-reference buffer sticker, and the searches take well under a second once the catalogue is built.
  - Other pairs return `no-verified-m2-system`.
- **Verification.**
  - `verifyM2Dataset` checks:
    - the swap is an M2 variant under the stated symmetry;
    - setups and special targets match a fresh `net` search;
    - every alg's permutation equals its effect;
    - special algs stay within the bounds;
    - the rule and the tempting setups match a fresh derivation;
    - coverage and order.
  - `verifyM2OpParityDataset` derives the effect from the two datasets and checks buffers, swaps, symmetry and bounds.
  - **Tests:**
    - `test/data/m2-dataset.test.ts`: every kind of corruption is caught, and an M-preserving mirror image verifies;
    - `test/methods/m2-search.test.ts`: the search is exact against a brute-force comm list;
    - `test/methods/m2op-solve.test.ts`: 1,000 seeded runs on (UBL, DF) (random states, scrambles with wide moves and rotations, two schemes, custom break orders), 30 per symmetric system, the teeth above, and golden fixture R02 pinned (UF on an even step, BD on an odd step shot as FU, parity);
    - slow suite: 20,000 runs on (UBL, DF) and 500 per system. None fail.
- **Scope change (your choice):** the "M2 + 3-style corners" full-solve test moves from milestone 10 to milestone 11, where the 3-style corner phase is built.
- **Speed:** `searchSetups` results are now cached, because the `net` search takes about 0.45 s per call and verification repeats it. Building (UBL, DF) takes about 1.5 s including the 0.6 s catalogue.

## D-026 · 3-style parity and the 3-style solvers

**Status:** accepted design (milestone 11 plan review, 2026-09-14). The findings below are for your review.

- **What ships** in `content/algs/3x3/`:
  - `3style-parity.UFR-UF.json`: the 3-style/3-style parity alg, 11 moves.
  - `m2-3style-parity.UFR-DF.json`: the parity alg for M2 edges with 3-style corners, 15 moves.
- **Strategy (your choice): a Jb perm at the end, both memos straight from the scramble.**
  - With odd target counts, each piece type's last target is paired with its buffer's **partner**: UBR for UFR corners, UR for UF edges. Then one alg swaps UFR↔UBR and UF↔UR.
  - **This is the community convention for adjacent UFR/UF buffers.** In the SpeedSolving forum help thread ("[Help Thread] Blindsolving", page 40):
    - abunickabhi: "You setup a UF-UR swap and UFR-UBR swap, which is just a Jb perm."
    - Habsen: "For ECEC order: Just append UR to your edge memo when you realize that you have parity".
  - **The alternative I prototyped also solved every state:** a T perm (UFR↔UBR, UL↔UR) with edges traced as if UL and UR were exchanged. You chose the Jb.
- **The alg.**
  - Source: the Speedsolving wiki PLL page, Jb permutation, first alg listed, written `(y2) R' U L U' R U2' L' U L U2 L'` (retrieved 2026-09-14).
  - Relabelled by y2 (symmetry 5) it's the face-turn alg `L' U R U' L U2 R' U R U2 R'`. The geometry model confirms it has exactly the effect of the published form wrapped in `y2 … y2`.
  - **Computed effect:** UFR↔UBR (FUR↔RUB, RUF↔BUR) and UF↔UR (FU↔RU). The verifier recomputes this from the buffers and partners and never reads it from the source.
- **Partners and tails are derived, never written in.**
  - The partners are where the alg sends each buffer sticker.
  - **A last target on the partner's piece** can't be paired with the partner (a comm needs distinct pieces):
    - **The partner itself** (UBR or UR): no comm. The parity alg solves it; the parity step lists it in `shoots`.
    - **Another sticker of that piece:** E(buffer, t)·E(buffer, partner) is a pure twist or flip. Its "tail" is the orientation record with the same `intendedEffect`, matched by effect. The results are **BUR → `UBR-clockwise`, RUB → `UBR-counterclockwise`, RU → the `UR` flip.**
- **Solve order:** frame, corner comms (plus tail), edge comms (plus tail), parity alg, twists, flips.
  - **Finding: twists and flips must come after the parity alg.** A twist or flip alg acts on the buffer slot. Before the parity alg that slot holds the partner's piece, not the buffer's. In the tests, moving a twist before the parity alg failed on every parity state that had one.
  - The buffer's own twist or flip is never solved on its own; the others' algs fix it.
- **Solver output** (`src/methods/three-style.ts`, `solution.ts`).
  - New step kinds:
    - `cycle`: targets, trace indices, `parityTarget` for the appended partner;
    - `orientation`: piece, direction or flip, `parityTail`.
  - Each carries the dataset's notation (for example `[L2, F R F']`) and its cancelled moves, which are what gets executed.
  - `traceForSolve` now takes an orientation policy per piece type.
- **M2 edges with 3-style corners** (`solveM2ThreeStyle`). The Phase 1 plan's combination, moved here from milestone 10.
  - **Order:** corners (as above), M2 edges, parity alg, twists.
  - **When the count is odd, UR is appended to the M2 memo** (`TargetStep.parityTarget`). M2 then ends with an even count and never needs its own parity.
    - The odd/even rule applies to the appended step too; UR isn't an M-slice special case.
  - **The parity alg must swap DF↔UR and UFR↔UBR.** It's the Jb conjugated by a searched setup: the Jb is analysed as a swap from UR, and the op-edges pool is searched in the `every-move` regime for the DF target.
    - Result: **`[D2 Lw2: L' U R U' L U2 R' U R U2 R']`, 15 moves.** The T-perm alternative `[D' L2: T perm]` would be 18.
    - The verifier searches the setup again.
- **Verification.**
  - **Parity datasets** (`verifyThreeStyleParityDataset`, `verifyM2ThreeStyleParityDataset`):
    - buffers match their sibling datasets;
    - partners equal the alg's images of the buffers, and sit on non-buffer pieces;
    - the effect and every alg are checked;
    - the main alg is the relabelled reference (`3style`) or its searched conjugate (`m2-3style`), with citation and symmetry;
    - the tails match a fresh derivation.
  - **Tests:**
    - `test/data/three-style-parity.test.ts`: each corruption is caught (a wrong partner, a wrong tail, a T perm in place of the Jb, provenance, buffers, a missing citation);
    - `test/data/datasets.test.ts`: the committed files are verified and equal the builders' output.
  - **Full solves:**
    - `test/methods/three-style-solve.test.ts` and `m2-three-style-solve.test.ts`: 1,000 seeded runs each (random states, scrambles ending in wide moves or rotations, two schemes, custom break orders), checked in kpuzzle and the geometry model.
    - Every traced target is covered exactly once (comm, tail, or the parity alg). Every tail case is hit.
    - **Teeth:** leaving out the parity alg fails; the opposite twist fails; leaving out the appended UR fails; a twist before the parity alg fails.
    - Golden fixture R02 is pinned for both solvers.
    - **Slow suite:** 20,000 runs each. None fail.
- **Other buffers.** These solvers read 3-style datasets, and only UFR/UF are committed. Generating the edge set for another buffer takes about 15 s. The solvers reject mismatched datasets, and a runtime system for other 3-style buffers isn't built.
- **Phase 1:** every full-solve combination in the Phase 1 plan (OP/OP, M2/OP, M2 + 3-style corners and 3-style/3-style) is now property-tested.

## D-027 · Scramble providers, constrained generation, and drill scrambles

**Status:** accepted design (milestone 12 plan review, 2026-09-14). The measurements below are for your review.

- **The port** (`src/scramble/providers.ts`). A `ScrambleProvider` hands out candidates.
  - Each candidate gives its **state** right away. On 3x3 the state is rotated so the centres are solved: the frame tracing uses. On 4x4 it's left as it is (below).
  - It gives its **scramble** only when asked, cached after the first call. Rejection sampling then never pays for the solver on rejected states.
  - The engine stays pure. `cubing/scramble` and `cubing/search` are allowed subpaths (D-002), and nothing imports Node modules.
- **`seededStateProvider3x3(puzzle, { seed, orientation })`.** One seeded generator (`createRng`, D-012) draws, for each candidate:
  1. a uniform random state P (`randomState3x3`);
  2. with `orientation: "wide"` (the default), a uniform orientation. The orientation is written as a wide-move suffix W, the way 333bf scrambles end. `orientationSuffixes` holds the first shortest Uw/Rw/Fw suffix for each of the 24 orientations, at most 2 moves, checked against `centersRotation`.
  - **The state is `normaliseByCenters(P·W)`.** That is still uniform, because the face-turn part of W is a bijection.
  - **The scramble is inverse(solve(P)) + W**, solved with cubing.js's `experimentalSolve3x3x3IgnoringCenters` and written in the engine's notation.
  - **What's reproducible:** a seed always gives the same states. The scramble strings also repeat with the pinned cubing.js 0.63.4, because its solver is deterministic (D-023 relies on this too). If cubing.js changes its solver, the states still match but the strings may not.
  - **Measured:** about 24 ms per solve after warm-up; solutions of 18–21 moves plus the suffix.
  - **Orientation counts,** 2,400 draws from seed "coverage": 77–119 per orientation, against 100 expected.
- **`cubingProvider(puzzle, "333bf" | "444bf")`** wraps `randomScrambleForEvent`, which isn't seeded.
  - **Measured:** 333bf takes 7–220 ms and ends with 0–2 wide moves; 444bf takes about 1.7 s and ends with a rotation. Both log a timing line and spawn a worker.
  - **4x4 states are left as they are.** A 4x4 has no fixed centres to normalise by; choosing a frame is the later 4x4 milestone (D-014).
  - It's covered only by the slow suite.
- **Trace constraints as data** (`src/scramble/constraints.ts`), Zod-validated so §7.7 presets can be saved and shared.
  - Per trace config name: `targets`, `cycleBreaks` and `misoriented` bounds (min and max), and `parity`.
  - **`cycleBreaks` counts breaks into unsolved pieces only.** Orientation cycles go under `misoriented`, which matches `targetKinds` and Phase 6's diagnostics.
  - **`misoriented` counts twisted or flipped non-buffer pieces under either policy:** `orientedInPlace` entries under `separate`, orientation cycles under `asTargets`.
  - **Checked** against the ten hand-traced golden fixtures under both policies. Under `asTargets` the target count is the `separate` count plus 2 per misoriented piece.
- **`generateConstrained(puzzle, { provider, traceConfigs, accept, maxAttempts })`.** `accept` is a predicate or a constraints object.
  - **The loop:** take a candidate, trace its state for every config, test it. On acceptance, compute the scramble and **trace the scramble string again**, requiring identical traces.
  - **Never runs past its budget:** the provider is asked for at most `maxAttempts` candidates.
  - **Typed failures:**
    - `budget-exhausted`, with stats: per config, the ranges of targets, breaks and misoriented pieces and how many had parity; with constraints, how often each field failed;
    - `trace-error`;
    - `scramble-mismatch`: the guard against "silently returning something that doesn't match";
    - `invalid-options`: a bad `maxAttempts`, no configs, a puzzle mismatch, or an invalid or unknown constraint. It's reported before the provider is asked for anything.
  - **BRIEF §5.6's examples,** each from its own fixed seed, with UFR/UF buffers:

    | Constraint | Attempts | Time |
    |---|---|---|
    | exactly 2 corner cycle breaks | 1 | 322 ms (the solver's first load) |
    | has parity | 3 | 72 ms |
    | at most 8 edge targets | 41 | 11 ms |
    | at least one twisted corner | 1 | 9 ms |
    | all four at once | 2,372 | 207 ms |

  - An impossible constraint (zero corner targets with parity) uses exactly its budget and never calls the solver.
- **Drill scrambles** (`drillScramble`): the inverse of the case's cancelled alg.
  - On random alg trees for 3x3 and 4x4, the scramble followed by the alg leaves the whole puzzle unchanged.
  - Tracing the drill scramble of every committed 3-style record (378 corner and 440 edge cycles, 14 twists, 11 flips) gives exactly its case. So does every OP target record: exactly its one target.
- **Not in milestone 12:** selection strategies and the recency guard (milestone 13); choosing a 4x4 frame; scrambles restricted to a chosen case subset.

## D-028 · Selection strategies and the recency guard

**Status:** accepted (milestone 13, 2026-09-15). The recency default and the weighting of never-drilled cases are your answers from 2026-09-15. The weight formulas are mine, recorded here.

- **One selector** (`src/random/selection.ts`). `createSelector({ strategy, cases, seed, recency })` returns a selector whose `next(context)` gives a case id or a typed error.
  - It draws only from its own `createRng(seed)` generator (D-012), so a seed string replays a session exactly, given the same stats.
  - It copies the case list. Empty sets, duplicate ids, a non-integer or negative window and unknown strategies are rejected when it's created.
- **Stats are injected.** `CaseStatsProvider(caseId)` returns attempts, errors, and optionally FSRS retrievability and a due time. cube-engine never imports `ts-fsrs`. Invalid stats (errors > attempts, retrievability outside [0, 1]) give `invalid-stats` rather than a skewed pick.
- **The recency guard applies to every strategy.** No case repeats within `recency` picks.
  - **Default:** a quarter of the set, clamped to 1..10. 4 cases get 1, 22 get 5, 440 get 10.
  - **Always capped at size − 1**, so a pick exists. A 1-case set has no window.
  - **Coverage needs no fallback.** The window holds at most size − 1 distinct cases, and the ones left from the previous round can never cover everything remaining in this round.
- **Strategies:**
  - `uniform`: uniform over the cases outside the window.
  - `coverage`: seeded shuffles, one round at a time. The guard only reorders picks within a round, so every case appears once per round. With the window at size − 1 it's a strict rotation.
  - `weakness`: weight `0.05 + w`. `adversarial`: weight `0.005 + w⁴`, which puts about 70% of picks on the weakest of five evenly spread cases.
    - `w`, the weakness of a case, is the Laplace-smoothed error rate `(errors + 1) / (attempts + 2)`. For a case with an FSRS card it's averaged with `1 − retrievability`.
    - **A never-drilled case counts as weak as the weakest case with history.** If none has history, every case counts as fully weak (your answer).
    - The floors give every case a nonzero chance.
  - `spaced`: the pure FSRS due queue. It takes due cases, most overdue first, then least retrievable, then set order.
    - **When nothing is due** it returns `nothing-due`, with a count of the due cases held back by the window. The trainer decides what to offer (Phase 4).
    - New cards come up only if the SRS layer gives them a due time.
- **Tests** (`test/random/selection.test.ts`):
  - **Property tests:** the recency invariant for every strategy, set size, window and stats; one round per `size` picks for coverage.
  - **Determinism:** same seed gives the same sequence, different seeds differ, and a short sequence is pinned.
  - **Weights:** exact values; the never-drilled rule; frequency ordering for weakness and adversarial.
  - **Other:** the due-queue order, `nothing-due`, and validation.

## D-029 · The storage layer: one port, two backends, and the legacy importer

**Status:** built overnight (Phase 2, 2026-09-16), following the approved MIGRATION.md. Where I filled a gap, it's also in `docs/OVERNIGHT.md`.

- **Package.** `packages/storage` (`@bld/storage`), next to cube-engine, following your `apps/web` answer. MIGRATION.md's `src/lib/storage` paths are updated.
- **Port.** `StorageAdapter` (`src/storage.ts`) is the only way the app reads or writes data. It's built once, by `createStorage(backend)`, on top of a raw key-value `Backend`.
  - `memoryBackend` is for tests and environments without IndexedDB.
  - `dexieBackend` (`src/dexie-backend.ts`) is the only file that imports Dexie.
- **Validation both ways.**
  - Every write is Zod-checked; an invalid one throws `StorageValidationError`.
  - Every read is checked again. A stored record that no longer parses goes to `quarantine`, with its validation issues, and is left out of results. It's never dropped.
- **Explicit transaction scopes.** `Backend.transaction(fn)` passes `fn` a scope, and every storage operation runs inside one.
  - **Why:** with Dexie's ambient transactions, starting a sub-transaction after a plain `await` committed the parent early (`PrematureCommitError`), which the tests reproduced.
  - **Dexie backend:** a transaction reads through to IndexedDB, buffers its writes, and commits them in one IndexedDB transaction when `fn` returns, or writes nothing if it throws.
  - **Serialised:** transactions in a tab run one at a time.
  - **Known limit:** another tab writing between a transaction's reads and its commit isn't isolated against. That's acceptable for a local single-user app; a remote adapter would need real isolation.
- **Schema v1** (`src/schema.ts`), one `SCHEMA_VERSION` for the store and the export envelope, as MIGRATION.md §3–5 describes. Three additions to the illustrative shapes, all optional or new union members:
  1. `settings` in the envelope (theme, palette, voice, last backup, persistent-storage status), so a backup restores preferences;
  2. `drill.attempt` and `lesson.opened` / `lesson.checkpointPassed` event types, so Phases 3–4 log into v1 without a migration;
  3. the import report fields as a strict schema.
  - **Rule for bumps:** adding an optional field or a new event type doesn't bump the version, because older data still parses. Changing or removing anything does, with the four parts MIGRATION.md §5 requires. `EXPORT_MIGRATIONS` is the (empty) chain.
- **Import and export** (`src/transfer.ts`): canonical JSON (sorted keys), `parseExport` (JSON, format, version, migrations, Zod), and `importData`, applying MIGRATION.md §4.4's table in one transaction.
  - Insert, skip identical, keep an edited record and report the conflict, keep a deleted legacy pair deleted (its tombstone).
  - Everything is read back and counted before commit.
- **Legacy importer** (`src/legacy/`), stage 1 exactly as MIGRATION.md §4.1–4.3.
  - **Bytes in, envelope out:** SQLite via sql.js reads a copy of the bytes, so the original file is never opened by SQLite.
  - **Checks first:** schema and storage classes against the audited DDL, then the corrections table row by row.
  - **Then build:** images merge by corrected text, and memo attempts get the LCS re-score.
  - **Corrections are data** (`APPROVED_CORRECTIONS`, the §3.6 table).
  - **CLI:** `pnpm import:legacy --db <path> --dry-run | --out <file>` refuses a database whose hash differs from the audit (unless `--allow-changed`), checks the hash again after reading, and refuses to write inside the repo.
- **Verification:**
  - **All 13 assertions of MIGRATION.md §6.2** run on a synthetic database built in memory from the verbatim DDL, covering every anomaly class in §6.1. Round-trip, fixed-point and idempotency run on both backends (Dexie under `fake-indexeddb`).
  - **Real-file test:** it's skipped unless `LEGACY_DB_PATH` is set. With the live file (read-only, 2026-09-16) it reproduced every audited number: 678 rows to 660 images, 552 pairs, 990 uses, 51 memo attempts, 4 settings, 20 corrections and 18 merges, 550 pairs with a real word (EO and IE need one), 76 tie-break primaries, 12 shared words, and 17 re-scored attempts.
  - **Hash unchanged:** the file's hash was the audited one before and after.

## D-030 · The web app: static Next.js 16, workspace packages, CSP by hash, and the cube component

**Status:** built overnight (Phase 2, 2026-09-16). Next.js 16, `apps/web`, static-first hash CSP, face-only colour, Recursive, the slate and lilac grounds, the navigation and adaptive home are your answers from 2026-09-15; the rest is here and in `docs/OVERNIGHT.md`.

- **Stack:**
  - Next.js 16.3.5 (Turbopack) with React 19.3 and Tailwind 4, in `apps/web`. This is a change from BRIEF §3's "Next.js 15"; you chose it.
  - Recursive, self-hosted through `@fontsource-variable/recursive` (all axes).
- **Fully static** (`output: "export"`, `trailingSlash`). Everything is local-first, so there's no server. `pnpm --filter @bld/web build` writes `apps/web/out`.
- **Workspace packages are consumed as built JavaScript.**
  - `@bld/cube-engine` and `@bld/storage` export `dist/`. Turbopack doesn't map the packages' NodeNext `.js` import specifiers to `.ts` sources.
  - `pnpm dev` builds both packages first. After changing a package, rebuild it (`pnpm --filter <pkg> build`).
- **CSP** (`apps/web/scripts/csp.mjs`, run by `build`):
  - hashes every inline script in each exported HTML file and puts a `<meta>` policy first in `<head>`: `script-src 'self' 'wasm-unsafe-eval'` plus those hashes, `style-src 'self' 'unsafe-inline'` (React style attributes, cubing.js shadow DOM), `worker-src 'self' blob:`, `object-src 'none'`, `base-uri 'self'`;
  - a meta policy can't set `frame-ancestors`, which is left for deploy headers in Phase 8;
  - checked in the browser against the static build: no violations.
- **Segment payload names** (`scripts/segments.mjs`): Next 16's export writes `__next.x/__PAGE__.txt`, but its client asks for `__next.x.__PAGE__.txt`. The script copies each payload to the flat name, which removes the 404s on prefetch.
- **The Cube component** (`components/cube/cube.tsx`) wraps cubing.js's `TwistyPlayer`:
  - It uses the `PG3D` renderer, because it's the one that takes floating hint facelets and sticker colours from puzzle geometry. The `Cube3D` renderer has fixed colours.
  - **Sticker colours:** the 3x3x3 loader's `pg()` is wrapped once, so its geometry colours each sticker from the current `--face-*` token (`player-palette.ts`). The player remounts when the palette changes. If cubing.js changes shape, the wrapper steps aside and logs.
  - **Checked in the browser:** the standard green renders as `#1FA25A`, and the deuteranopia preset shows the Okabe–Ito colours in both the 3D cube and the net.
  - **Masks:** the engine's `stickeringMask` turns "highlight these slots" into the player's per-piece mask (tested against the player's own geometry, sticker by sticker, and against the geometry model on scrambles).
  - **The default dim is strong** (cubing.js `ignored`, grey). Its `dim` measured about 73% brightness in the browser, too subtle to direct attention. `dim="soft"` keeps colours.
  - **Fallbacks:** a text description of every face, row by row, for screen readers; a flat SVG net (`StickerNet`) if the 3D player fails; reduced motion jumps to the end of an alg.
- **Theme without a flash:** a fixed boot script (`next/script`, `beforeInteractive`) applies theme and palette from a localStorage mirror. The settings themselves live in IndexedDB. The CSP step hashes the script.
- **Data in the app** (Settings):
  - export a backup; import a backup, validated with `parseExport`, previewed, then confirmed;
  - delete all data, after typing DELETE;
  - storage persistence is requested on the first save and its status shown;
  - a reminder shows when the last backup is over 30 days old, or there is none;
  - quarantined records are counted.
- **Copy** is in `src/i18n/en.ts`; strings that change with the voice are `Voiced` records.
- **Feature flags** (`src/lib/flags.ts`): `/lab` is on in development, and in production only with `NEXT_PUBLIC_FLAGS=lab`.
- **Datasets in the app** (`src/content/algs.ts`) are parsed with the engine's Zod schemas where they cross in.
- **Tests:** `src/design/palette.test.ts` checks `tokens.css` against `palette.ts`, every DESIGN.md contrast floor in both themes, and a 3:1 tile-letter contrast for every face in every palette.

## D-031 · The comm search missed comms filed under a sibling sticker cycle

**Status:** fixed 2026-09-16, before the Phase 5 3-style trainer. Found while building 3-style datasets for other buffers.

- **How it showed up.** A rotation image of the UFR corner dataset, onto buffer UBL, held a 9-move comm for UBL → BUR → RDF: `[L' F': [F L' F L, B2]]`. It verifies in full and is within D-019's bounds, but a fresh search for UBL, pruned or not, returned 10 moves as the best.
- **The cause.**
  - A 3-cycle of corners moves three sticker cycles, one per orientation (edges: two).
  - The catalogue files each comm under exactly one: the cycle starting at its lowest moved sticker (`THREE_CYCLE.classify`).
  - `searchComms` looked a case up under the image of the buffer sticker's cycle, (S(b), S(t1), S(t2)). When that wasn't the cycle through the lowest moved sticker, the lookup found a different set of comms, and every comm filed under a sibling cycle was never considered.
  - Pruned and unpruned searches share the lookup, so the test comparing them couldn't see it. The orientation search already keyed its cases the catalogue's way, and was unaffected.
- **The fix** (`commutator/search.ts`): a case is keyed like the catalogue keys a comm. Build the case state, take every sticker it moves, and use the cycle through the lowest image under S.
- **The oracle** (`test/commutator/comm-oracle.ts`) shares none of that keying.
  - It files every catalogue comm under its whole sticker permutation.
  - For every setup S, it asks which comms have exactly the permutation the case needs under S.
  - **Fast suite:** the UBL regression, and 25 seeded UBL corner cases.
  - **Slow suite:** every corner case for UFR, UBL and FDR, and 12 seeded edge cases each for UF and DF.
  - The oracle's best comm for each case is also run through `validateComm`.
- **Datasets regenerated** (`pnpm engine:generate`; every record verified).
  - **`3style-corners.UFR`:**
    - 24 cases are now one move shorter, and none is longer (ETM 9: 110→126, 10: 38→30, 11: 26→18);
    - 170 main comms changed. The other 146 are the same length, with ties broken among more candidates.
  - **`3style-edges.UF`:** no case changed length; 100 main comms changed at the same length.
  - **Unchanged:** the OP, M2, twist, flip and parity datasets are byte-identical.
- **What else changed.**
  - **Pinned solutions:** golden fixture R02's pinned 3-style and M2 + 3-style solutions each show one changed comm: `[L: [F', L' B L]]` became `[L F' L' F, B]`. Both cancel to `L F' L' B L F L' B'`, so the moves on a physical cube are the same.
  - **Reports:** `docs/reports/buffer-comparison.md` counts comm lengths for every buffer, so it was regenerated.
- **The regenerated report confirms the fix, and it matters for Gate B.**
  - Every corner buffer now has the same best-comm distribution (8: 198 · 9: 126 · 10: 30 · 11: 18 · 13: 6, mean 8.71), and every edge buffer the same (mean 7.80). That's what cube symmetry requires.
  - Before, the D-layer corner buffers looked about 0.2 moves worse on average (mean 8.97–8.98 against 8.78), and some edge buffers slightly worse too. **Those differences were an artifact of the bug.** Gate B read these numbers (D-022), so any weight given to "U-layer buffers have shorter comms" should be dropped. The choice of UFR/UF itself doesn't change.
  - **Search time.** More candidates are now looked up, so the search is slower. `pnpm engine:bench comms` re-measured the budget (three cold runs of the slowest buffer, 2026-09-16, same machine as D-019):
    - corners: **0.83 s**, was 0.64 s;
    - edges: **18.22 s**, was 14.41 s.
    - Both are within the 60 s budget.
    - Exact evaluations per edge buffer are now about 45.4M, against 19.7–30.9M before, and they no longer differ between buffers.
- **Nothing on the site used the 3-style files yet**, so no lesson or trainer changed.


## D-032 · 4x4 orientation references: a named corner, or a named rotation

**Status:** accepted 2026-09-16, Phase 7. Carries out D-014's commitment.

- **The question.** A 4x4 has no fixed centres, so "solved" corners, wings and x-centres only mean something once the solver fixes how the cube is held. BRIEF §6 (4BLD lesson 2) asks the site to teach choosing that reference.
- **Sources.** None of the pages read state a convention: the Speedsolving wiki's 4x4 BLD page (a short event description), its r2 page, the 4x4 U2 centres tutorial thread, and a 4BLD tutorial PDF based on Xin Shi's method (zodzhao.github.io/res/4bld.pdf), all retrieved 2026-09-16. So nothing here is taken from a source; the engine offers the mechanisms and the lessons explain them.
- **Engine** (`trace/trace.ts`, `applyFrame`). Two new frames, both one of the 24 whole-cube rotations applied after the scramble, as D-014 requires:
  - **`{ kind: "corner", piece }`:** the one rotation that brings that corner piece home and oriented. The 24 rotations act freely and transitively on a corner's 24 placements, so exactly one exists.
  - **`{ kind: "rotation", alg }`:** any alg equal to one of the 24 rotations. Anything else is `unknown-rotation`.
  - Both are refused on 3x3x3, where the centres fix the frame. `asIs` stays available on both puzzles.
- **Verification** (`test/trace/frames.test.ts`):
  - **Corner reference, all 8 corners, random scrambles with wide moves and rotations:**
    - the geometry model's colours, after the scramble and the chosen rotation, show that corner solved;
    - no other rotation does;
    - a rotation added to the scramble changes nothing.
  - **Traces under a corner frame** (x-centres, wings, corners) match the colour oracles run on geometry colours rotated until that corner is solved. The rotation there is found by the test itself.
  - **Parity:** wing and corner parity are the same under all 24 rotations, as D-008 predicts.
- **Which reference the site teaches** is a lesson and trainer choice (Phase 7), recorded in OVERNIGHT.

## D-033 · Tracing x-centres: by colour, avoiding the buffer's colour when there's a choice

**Status:** accepted 2026-09-16, Phase 7. Found computationally; no source was used for the rule.

- **Why x-centres differ.** The four x-centres of a colour are identical, so a slot is solved when it holds its colour, and the buffer's piece can go to any slot of its colour that still needs it. Tracing had refused interchangeable pieces (`interchangeable-pieces-unsupported`) until now.
- **The rules** (`runInterchangeableTrace`):
  - **Normal target:** the buffer holds colour X. Shoot it to a slot of colour X that doesn't hold X. One exists unless X is the buffer's own colour, because each colour has exactly as many pieces as slots.
  - **Break:** the buffer holds its own colour and every slot of that colour is done. If anything is unsolved, break into an unsolved slot (`breakOrder`). A later target filling that slot is a `cycleClose`.
  - **Parity:** there is no permutation to take the parity of, because swapping two identical pieces changes nothing visible. `parity` is the parity of the number of swaps traced, which is what a swap method has to fix. Different valid choices can give different parities.
- **The choice between slots** (`policy.sameColour`):
  - **`lowestLetter`:** the lowest letter.
  - **`avoidBufferColour`** (the default): first set aside slots holding the buffer's own colour, then the lowest letter. That colour then returns to the buffer as late as possible, which is what forces a break.
  - **Measured** on 4,000 random-move states (80 moves) for buffers Ubl and Ubr:

    | Policy | Mean targets | Mean breaks |
    |---|---|---|
    | `lowestLetter` | 20.07 | 0.92 |
    | `avoidBufferColour` | 19.27 | 0.12 |

  - The avoiding policy was never longer in those 8,000 traces, and was shorter in 53% of them. That's a measurement, not a proof, so no test asserts it.
- **Trainers:** since several answers can be right, `interchangeableChoices` lists the slots a trainer should accept at each step.
- **Verification** (`test/trace/xcentres.test.ts`):
  - **9 hand-derived fixtures:**
    - choices between slots;
    - a break forced by `lowestLetter` that the default avoids, which also flips the parity;
    - a reversed-Greek scheme;
    - a solved buffer;
    - a `breakOrder` list;
    - a fully solved type;
    - another buffer.
  - **Agreement with an independent colour oracle** (`test/oracle/xcentre-oracle.ts`, geometry colours, no kpuzzle): 60 random states × 24 buffers × two schemes × both policies.
  - **Properties on 150 random states:**
    - replaying the swaps solves the colours;
    - every break happens only when all the buffer colour's slots are done;
    - target count = wrong non-buffer slots + breaks;
    - every traced step is one of `interchangeableChoices`.
  - **Teeth:** dropping the avoidance, or forcing a break whenever the buffer holds its own colour, fails the fixtures and the oracle comparison.

## D-034 · Zod runs jitless, so the strict CSP stays quiet

**Status:** accepted 2026-09-16, Phase 8.

- **Finding.** Lighthouse reported a Content Security Policy issue on every page, with no console error.
  - Zod 4 compiles fast object parsers when it can.
  - To find out whether it can, it runs `new Function("")` inside a try/catch the first time an object schema is created.
  - The site's CSP forbids that, so the browser records a violation even though Zod swallows the error. Zod's own source comments on this.
- **Decision.** `z.config({ jitless: true })`, applied before any schema exists.
  - The engine, storage and web app each have a `zod.ts` that sets it and re-exports `z`.
  - Every schema module imports `z` from there, never from "zod", so the setting always comes first.
  - `test/purity.test.ts` fails if an engine source file imports "zod" directly. A deliberate direct import was caught, then reverted.
- **Cost.** Parsing is interpreted instead of compiled. Measured on the same machine:
  - the engine's dataset suite took 12.0 s against 12.5 s before;
  - storage took 1.3 s against 1.5 s.
  - No measurable slowdown at the site's data sizes.
- **Reversal.** Easy: remove the three `config` calls. The CSP issue comes back.

## D-035 · Offline: one service worker that precaches the whole static export

**Status:** accepted 2026-09-16, Phase 8 (BRIEF §10: "lessons and all trainers work with no network").

- **Build.** `scripts/sw.mjs` runs after `next build`, `segments.mjs` and `csp.mjs`, and writes `out/sw.js`:
  - every file in `out/` is precached (264 files, about 7 MB), except the worker and the development-only `/lab` page;
  - pages are cached under their URLs, so `learn/index.html` is `/learn/`;
  - the cache name is a hash of every file's contents.
- **Runtime:**
  - **Requests:** served from this version's cache first, ignoring query strings (Next fetches route payloads as `….txt?_rsc=…`), then from the network.
  - **HEAD prefetches:** answered from the cache.
  - **An unknown page offline:** gets the 404 page.
  - **A new deploy:** installs a new worker in the background. It takes over only when no tab still runs the old one, then deletes the old cache, so a page never mixes files from two builds.
  - **Registration:** production builds only (`ServiceWorkerRegistration`), because in development it would cache pages that are still changing.
- **Why precache everything.** The site is local-first, a learner may open any lesson or trainer first while offline, and every asset is already a static file. Runtime caching would only make pages you'd visited available offline.
- **Manifest and icons.**
  - `app/manifest.ts` is exported statically.
  - The icons (SVG, 192 and 512 PNG, maskable, Apple touch) are drawn by `scripts/icons.mjs` from `design/palette.ts`, so no image is hand-made.
- **Checked in the browser** against the static build:
  1. load once, and the worker activates with 264 files cached;
  2. stop the server;
  3. **offline:** guided trace loads and grades an answer, client-side navigation reaches a lesson and Progress, and a full page load of a lesson not yet opened shows its 4 cubes and checkpoint.
- **Deploy note.** `sw.js` should be served with `Cache-Control: no-cache`, so a new deploy is seen (docs/DEPLOY.md).
- **Reversal.** Easy. Drop the registration and ship a worker that unregisters itself.

## D-036 · Non-visual paths: a cube written out, and drills read aloud

**Status:** accepted 2026-09-16, Phase 8 (BRIEF §10: "screen reader support and a text-only mode", and "every trainer must have a non-visual path with TTS").

- **What was missing.** Every cube already carried a screen-reader description, and the trainers were fully keyboard-operable, but there was no text-only mode and nothing spoke.
- **Cube display** (`settings.cubeView`), a setting with three values:
  - **`3d`** (default): cubing.js's player.
  - **`net`:** the flat sticker net the 3D player already falls back to, with no 3D loaded at all. The step controls are hidden, because only the player animates.
  - **`text`:** the state written out face by face, with the alg above it, and no picture.
  - The screen-reader description stays in every mode.
- **Read drills aloud** (`settings.readAloud`):
  - The browser's own `speechSynthesis`, so nothing is sent anywhere and it works offline where the device has a voice.
  - Each trainer passes its current prompt to `TrainerShell` as `announce`; the shell speaks it whenever it changes, and each announcement cancels the last so a fast drill can't queue up a backlog.
  - The toggle sits in every trainer's header as well as in Settings, and Settings says so when the browser has no voices.
- **Why the browser's voice and not a recording:** it's offline, free, in the user's chosen voice and speed, and it needs no audio files in the repo.
- **Storage:** two optional fields on the existing settings record, so no migration and both are in every backup.
- **Checked in the browser:** the written-out mode loads no 3D player, the net mode shows a labelled net, and the toggle speaks each prompt ("Target 1 of 20", then the correction after a wrong letter).
- **Reversal:** easy. Both are settings with defaults that keep today's behaviour.

## D-037 · Setups as pairs of halves, when the tracked slots outgrow one number

**Status:** accepted 2026-09-16, Phase 7.

- **The limit.** The setup search packs the target's slot and every tracked protected sticker into one
  number (`slot₀·n^k + …`). That stays exact while `stickerCount^(tracked + 1)` is a safe integer: fine for
  M2's three protected edges on 54 stickers, impossible for 4x4's r2 (eleven protected pieces) or U2
  (fifteen) on 96.
- **The pair search.** Every canonical half-sequence up to half the bound is listed once, with where it
  sends each sticker and where each sticker came from. A setup S = A·B leaves a protected sticker p alone
  exactly when `A[p] = B⁻¹[p]`, so halves are matched on that vector; the target of a matched pair is the
  sticker A sends to the slot B takes the swap sticker from. Junctions are checked so the joined sequence
  is canonical, and the same tie-breaks apply (shortest, then fewest quarter turns, then pool order).
- **Bound.** Six moves by default, which covers every r2 and U2 target; a longer bound costs time and finds
  nothing more.
- **Which search runs** is decided by the state size, and `strategy: "pairs"` forces the new one so the two
  can be compared.
- **Verification** (`test/methods/setup-search.test.ts`): the two searches return the same setup for every
  target, for M2 on all four M-slice buffers and for both Old Pochmann swaps; the pair search honours its
  bound; and its setups go through the same geometry-model check as before.
- **Reversal:** easy; the breadth-first search is untouched and still runs wherever it fits.

## D-038 · 4BLD: r2 wings and U2 x-centres

**Status:** accepted 2026-09-16, Phase 7. Datasets in `content/algs/4x4/`.

- **Sources**, both read 2026-09-16, both only for conventions and published algs — every effect is computed here:
  - **r2:** Speedsolving wiki, R2 page. "The buffer is DFr", `r2` as the swap, two r-slice special cases,
    and the rule that if either is the second target of a pair you shoot the other.
  - **U2:** Speedsolving forums, "4x4 Blindfolded, U2 Centers Method Tutorial". Buffer `Urb`, `Ulf: U2`,
    one U2 per target, and algs for the two U-face special cases.
- **Notation.** The sources' `r`, `d` and `u` are inner slices, which this engine writes `2R`, `2D`, `2U`
  (D-006: cubing.js's `r` is the two-layer turn). Read that way, every published alg matches the effect the
  engine derives from its case; read as wide turns, none of them do. That is what fixes the reading.
- **What the engine derived:**
  - **r2:** buffer sticker FDr (the lettered sticker of the DFr wing — a wing can't be flipped, so only one
    of its two stickers can name an exchange), swap sticker BUr, 23 records, special cases UFr and DBr, and
    the odd/even rule UFr ↔ DBr — the same rule the source states.
  - **U2:** buffer Ubr, swap sticker Ufl (the setup for it is empty: the swap alone), 23 records, special
    cases Ubl and Ufr, odd/even rule Ubl ↔ Ufr.
- **Special-case algs.**
  - **r2:** searched as a comm next to the swap, three per case at 11 moves, with the wiki's own alg kept
    beside them as a cited fourth.
  - **U2:** the tutorial's algs, cited. The search finds nothing for these cases, because the effect they
    need is a 3-cycle of three x-centres *on one face*, and no comm in the catalogue makes one: of 144 such
    cycles, the catalogue has none, while it covers 7,488 of the 12,144 cycles overall. Whether a shorter
    alg exists is open; the cited ones are 16 moves and verified.
- **Verification:** both datasets go through the same verifier as M2's (setups re-searched, every alg's
  whole-puzzle permutation equal to the exchange plus the swap's side effect, odd/even rule and illegal
  setups re-derived), plus `test/data/four-bld-datasets.test.ts`, which pins the buffers, swap slots,
  special cases and rules, and checks the published algs. They regenerate byte for byte.
- **Two engine changes this needed:**
  - **Case states for interchangeable pieces.** A pattern names identical pieces by colour, so it can't say
    which of the four U x-centres came from where. The exchange a swap step performs is now built directly
    at sticker level (`rigidExchangePerm`), which also decides which of a wing's two stickers can name a
    given exchange at all — the other describes a state the cube can't reach.
  - **Cited algs are exempt from the search bounds.** The bounds say what the search was allowed to try; an
    alg from a source is judged by its effect and carries its citation.
- **Reversal:** the datasets regenerate from the script; changing a buffer means regenerating and updating
  the pinned test.

## D-039 · 4BLD parity, and judging a 4x4 alg by what the cube shows

**Status:** accepted 2026-09-16, Phase 7.

- **The leftover.** Every r2 step repeats the swap's side effect: the other pair of r-slice wings, and
  eight x-centres. After an odd number of wing targets the cube still carries it, so the parity alg's job
  is exactly that permutation — derived from the swap, never written in (`swapParityEffect`).
- **The alg** comes from the 4BLD tutorial PDF (Xin Shi's method), cited in the dataset.
- **Judged by colour.** That alg does *not* equal the leftover sticker for sticker: it leaves some
  x-centres of a face swapped with each other. Four x-centres of a colour are the same piece to a solver,
  so `sameVisibleEffect` compares interchangeable slots by colour and everything else sticker by sticker.
  A parity record is checked that way; every other record is still checked exactly.
  - **Teeth:** two x-centres of one face count as the same; two from different faces don't; two wings never
    do; and the parity alg with one extra turn fails.
- **What isn't built yet:** corner parity on 4x4 (an odd number of corner targets), which needs the
  leftover to be absorbed into the wing memo the way 3-style parity is absorbed on 3x3 (D-026), and a
  4BLD solver that runs the three phases end to end. Both are listed in the Phase 7 checkpoint.
- **Reversal:** easy. The dataset regenerates; a different published alg can replace it as long as it
  verifies.

## D-040 · Lighting x-centres on the 3D cube

**Status:** accepted 2026-09-16, Phase 7.

- **Finding.** cubing.js's 4x4 has no identity for centres: its pattern gives the four centres of a colour
  one piece value (0, 4, 8 … 20), and the 3D player draws each of them with that value's stickering mask.
  So a mask can light a colour of x-centres, never one x-centre. Found in the browser: with the trace
  trainer's help on, every sticker went dark, because `stickeringMask` wrote each slot's mask onto the
  colour's shared entry and whichever slot came last won.
- **Engine.** For single-sticker pieces, `stickeringMask` now gives every piece of a colour the most visible
  mask any of its slots asked for (regular over dim over ignored over invisible). Lighting one x-centre
  lights its colour, predictably. Corners and wings on 4x4 are still lit slot by slot; a new test checks
  both against the geometry model on random scrambles, and fails on the old code.
- **Trainers.** Where one x-centre matters (tracing x-centres with help on), a flat net lights the exact
  slots next to the 3D cube, which shows no centre highlight. The U2 drill keeps the 3D highlight with the
  soft dim, so the rest of the cube stays readable.
- **Also:** a U2 case whose target is on the U face swaps two white centres, which no picture can show from
  solved. The drill still animates the verified alg; the lesson explains why the state looks untouched.
- **Reversal:** easy. It's one function and two call sites. A player that tracked centre identity would
  need its own 4x4 puzzle definition with 24 distinct centres, which would also have to go through the
  engine's chain of trust.

## D-041 · A full 4BLD solve: order, corners and every parity

**Status:** accepted 2026-09-16, Phase 7. Solver in `methods/four-bld.ts`; datasets `u2-parity.Ubr` and
`op-corner-parity.UBL`.

- **Method.** U2 for x-centres (D-038), r2 for wings (D-038), Old Pochmann for corners with the committed
  3x3 dataset `op-corners.UBL`. The 3BLD path teaches OP corners and the 4BLD track assumes 3BLD, so
  corners stay OP; OP uses only outer turns, so its setups and swap work on a 4x4 as written. The 4BLD
  trainer's corner buffer moves from UFR to UBL to match.
- **Order.** Centres, wings, corners, each followed by its parity alg when its target count is odd.
  - Centres must come first: the wing and corner parity algs are right only by colour (they may swap
    x-centres within a face), which holds only once the centres are solved. A test runs centres last and
    finds scrambles it breaks.
  - Wings and corners could swap places: each phase with its parity step puts back every other piece. A
    test runs corners first on 60 scrambles and solves them all. Wings first is kept as the usual order.
- **Centre parity.** An odd number of U2 targets leaves U2's own side effect (the rest of the U layer). A
  plain `U2` undoes it once the U-face x-centres are one colour. Found by checking, not from a source, so
  its entry is marked `engine-search`.
- **Wing parity.** The r2 parity alg (D-039).
- **Corner parity.** On a 4x4 the OP corner swap also swaps the UB and UL *wing pairs* (the 3x3 swap's UB
  and UL edges), so an odd corner count leaves those two pairs swapped, with the corners solved. The fix
  is the Speedsolving wiki's adjacent-dedge PLL parity alg, `(R2 D' x) r2 U2 r2 Uw2 r2 u2 (x' D R2)` with
  its lower-case letters as inner slices, conjugated by `U2`, the shortest setup the engine found that puts
  its two pairs on UB and UL: `[U2: R2 D' x 2R2 U2 2R2 Uw2 2R2 2U2 x' D R2]`. Verified by colour against
  the swap's non-corner effect, inverted; without the setup it fails.
- **Parity is per piece type.** Wing and corner counts are odd exactly when their permutations are, and
  they're independent: an inner slice quarter turn changes the wings' parity only, an outer turn the
  corners' only, a wide turn both (tested). X-centres have no parity of their own (D-033); the U2 step is
  about the swap's leftover, not the centres.
- **Checked:** 120 random scrambles of outer, wide and inner turns all solve by colour, covering all eight
  odd/even combinations; dropping any parity step breaks a solve; every OP corner record on 4x4 moves
  exactly its corners plus the UB/UL wing pairs.
- **Reversal:** moderate. Another corner method needs its own leftover and parity alg; the solver's phases
  are separate functions.

## D-042 · What a page loads before it paints

**Status:** accepted 2026-09-16, closing the mobile Lighthouse gap left open in Phase 8.

- **The rule.** A page's first-load scripts are the framework and what renders its visible text. The cube engine,
  Zod, the datasets, spaced repetition and analytics load after first paint, on every content page.
- **How each page keeps to it:**
  - **Lessons:** every interactive component is a `React.lazy` wrapper (`components/lesson/mdx-lazy.tsx`). The
    server renders them in full, so the HTML doesn't change; the browser fetches their code during hydration
    and keeps the server's HTML until it arrives. A new lesson component must be added there, or it goes back
    into every lesson's first load (`docs/CONTENT.md` says so).
  - **Light modules for what content pages read:** the reader's context and standard buffers
    (`lib/reader-context.ts`), and the settings' option lists (`@bld/storage/options`), so the lesson view
    doesn't pull in the engine or Zod.
  - **Home** computes "Today" in its own chunk (`app/home-data.ts`) once storage has answered.
  - **Trainers** already loaded as client-only chunks (Phase 8).
- **Also part of it:**
  - datasets parse on first read, one at a time;
  - a 3D cube is built only near the viewport;
  - the theme boot script is inline, allowed by hash, with line endings normalised because browsers hash LF
    text;
  - fallback fonts carry Recursive's measured metrics;
  - the prerequisites line has a fixed size.
- **Reversal:** easy per piece. The rule itself is the thing to keep.

## D-043 · Browser workers and an explicit offline pack

**Status:** implemented 2026-09-16, following the requested polishing and feature pass.

- OP/M2 and 3-style datasets are built in disposable module workers, including standard-buffer dataset parsing. Results cross a Zod-validated boundary. Custom systems never fall back to blocking the UI thread; unavailable workers and timeouts produce visible failures.
- Next/Turbopack did not reliably emit the TypeScript method worker or cubing.js nested solver workers: generated files contained TypeScript or build-time file URLs. A pre-dev/pre-build esbuild script now produces the method worker and self-hosts the reachable pinned cubing.js module graph, bundling its bare dependencies while preserving relative worker URLs. Generated files are ignored in Git and included in the offline pack.
- 3x3 browser scrambles use proper random-state providers by default. Larger cubes use the pinned cubing.js event generators, without asserting uniform random-state sampling. Quick random moves are explicitly labelled, opt-in alternatives, never silent fallbacks. Engine provider ports keep browser loading and timeout policy outside the pure engine.
- A new visitor prepares the full offline pack after interaction or through Settings, rather than downloading the entire course during the first paint. Returning installations check updates immediately. A waiting version is offered visibly; only an explicit update request activates it and reloads.
- Lessons/trainers initially render exact nets, with session-level 3D opt-in. The home hero remains 3D. Recursive's versioned self-hosted Latin font is preloaded with the same URL used by CSS.
- Below-fold lesson checkpoints load their datasets only within 300px of the viewport, and read only the datasets their kind needs. Default route-link prefetching is disabled to avoid speculative course downloads on mobile; navigation and the explicit offline pack still fetch normally.
- Non-obvious dependencies: esbuild for worker emission; Playwright and Lighthouse for verification; Phosphor for consistent lightweight navigation; pdf-lib/fontkit and static Recursive subsets for local PDFs. Variable font subsetting failed at runtime, so PDFs deliberately use static fonts and validate glyph coverage. Unsupported lettering offers browser Print / Save as PDF instead of missing-glyph output.
- Reversal: moderate for the worker/module pipeline; easy for net-first display and offline registration timing. Keep worker emission and offline solver tests when changing bundlers or cubing.js.

## D-044 · Evidence, personal state and staged big-cube teaching

**Status:** implemented 2026-09-16, within the user's latest requested scope.

- First successful solve stores its scramble, scheme, standard teaching buffers and verified cursor. Scheme/buffer edits elsewhere do not silently change an in-progress lesson. Each memo letter or execution effect must verify before advancing; physical success remains the learner's confirmation.
- DNF diagnoses distinguish direct evidence from hypotheses. A different valid cycle break is not proof of tracing failure; missing recall/execution reports cannot be reconstructed by guessing. Algorithm regrips and finger tricks are personal annotations, not inferred physical measurements.
- Recognition, setup, full-algorithm, blind-execution reconstruction and complete-solve practice have separate event identifiers. Provisional scoring/ramp heuristics are labelled; levels remain manually selectable. Alternating timed trials record the learner's own success judgement.
- Optional schema fields preserve existing version-1 backups and add personal algorithms, preferences, images, palaces, stories, lesson positions and spot-check confirmations through StorageAdapter. Raster image imports validate type, signature and size; no remote image URLs or uploads are needed.
- The latest user request explicitly supersedes the earlier no-5BLD scope for family introductions. The engine adds independently tested 5x5 corners, midges, wings, X-centres and T-centres. The UI reuses recognition/trace shells and introduces one family at a time; it does not claim a completed 5BLD execution method or provide unverified algorithms.
- Algorithm expansion now has length, depth and expanded-move limits to prevent malicious or accidentally explosive notation from freezing a trainer.
- Reversal: additive storage fields must remain readable; teaching views can change independently of verified engine state and saved personal data.

## D-045 · Whole-piece recognition and optional learning-room appearance

**Status:** implemented locally 2026-09-17 within the user's explicit extension request; no phase marker advanced.

- Guided recognition reveals a complete physical piece and six fixed 3x3 centres, including net, loading fallback and text descriptions. Previous target is read-only review, never another scored attempt. Parent Back links navigate to stable parent routes rather than relying on browser history.
- The dedicated Speffz drill intentionally uses standard Speffz, even when other trainers use custom schemes. Seeded edge/corner queues cover each physical piece before repetition; every sticker must be corrected before advancement. Only the first attempt is scored, independently of execution analytics. Unsaved attempts retain their event ID for retry. Completed attempts persist; active rounds are session-only, and elapsed round time explicitly includes pauses.
- The September 17 user request supersedes the earlier face-only interface-colour/no-daylight-scenery design limitation for optional appearance. Six paired light/dark interface colourways do not alter sticker palettes, lettering or buffer conventions. Canonical TypeScript/CSS values are contrast- and drift-tested.
- Scenery uses one pointer-inert adaptive canvas: galaxy, rain, snow, forest, ocean or none. It repaints on actions; navigation has at most 360ms of animation, no idle loop. Reduced motion removes scroll/travel; hidden tabs cancel frames; low-data/memory hints lower cost. Opaque work surfaces isolate text contrast from the decoration.
- Compact layout reduces spacing and maximum width, not important controls. The six-step guide stores its cursor and can be replayed. Writes are pessimistic, failure stays in scope, and modal closure returns focus explicitly. Dialog entrances change opacity only: mobile WebKit pointerdown/click testing proved scale could move a small control under the pointer.
- Appearance/guide fields are optional additive v1 settings, validated through StorageAdapter and included in backup roundtrips; no database reset or silent data migration is needed. The boot mirror accepts only whitelisted appearance values.
- BrowserAct 1.4.2 and uv 0.12.15 were installed with user approval; no browser/profile/API key was configured. Browser creation awaits the plugin's separate confirmation gate. Generated image concepts are unapproved direction references, not shipped assets or verified cube diagrams.
- Reversal: theme/canvas UI can be replaced independently, but additive stored settings and recognition event identifiers must remain readable. CFOP and verified navigation patterns remain separate pending work.

## D-046 · CFOP case identity, stage goals and executable AUFs

**Status:** engine foundation implemented 2026-09-17, continuing the user's stopped Claude handoff. CFOP teaching UI remains pending; no phase marker advanced.

- Enumerate reachable U-layer states rather than copy algorithm sheets: corner twists sum to zero modulo three, edge flips have even sum and corner/edge permutations share parity. OLL uses orientation rotations; full PLL uses independent pre-/post-AUF equivalence. Computed recognition counts are 57 OLL, 21 PLL, three EO, seven CO, two corner-permutation and four final edge-permutation cases.
- The handoff's four even-only corner patterns can cover all 288 legal PLL states with independent AUFs, but duplicate recognition classes. Replace them with the conventional two corner classes and parity-compatible edge companions. This refines the initial suspicion of missing coverage; tests, not intuition, decide it. The corner stage may change edge permutation while preserving edge orientation and F2L.
- Bind each canonical ID to its independently enumerated case fields, not only a list of IDs. A valid algorithm and picture from another case cannot masquerade under that ID. Validate orientation sums, unique permutation values and parity at the Zod boundary.
- CFOP goals are stage-specific: OLL need not finish PLL; EO need not orient corners. Every stage preserves F2L. Metadata verification recomputes canonical notation, expansion and counts through the existing parser; shipped algorithms restore the centre frame. BLD's exact-effect validators remain unchanged.
- `matchLastLayerCase` returns the reference-frame correction and physically executable before/after AUFs. Already-complete/AUF-only states return no case ID; unmet prerequisites return no match. Tests apply returned paths on every legal PLL state and rotated OLL views.
- The six handoff datasets remain computationally generated `cubing-solver` reference options, not ergonomic or standard named speedcubing recommendations. Case IDs are internal catalogue IDs, not community OLL numbering. Better algorithms must verify against these goals before becoming teaching defaults or personal choices.
- Keep the pure engine free of file/browser access. Generator tooling alone reads/writes data; the complete content-dataset test includes every CFOP file. Preserve Claude's scratch research in ignored `.artifacts/cfop-handoff/` rather than publish it or delete it.
- Reversal: recognition identities and stage contracts remain independent from algorithm choice, lesson copy and presentation. Full CFOP lessons, friendly algorithm choices and separate recognition/recall analytics remain the next milestone.

## D-047 · Independent sighted path and exact move review

**Status:** first two CFOP lessons implemented and verified 2026-09-17; bounded finish review disposition ship, full production regression 85 passing / three intentional skips. No phase marker advanced.

- Extend existing typed MDX, checkpoints, lesson renderer and roadmap rather than build a separate course UI. CFOP has no BLD prerequisites and its own next marker; existing BLD roadmap behaviour is preserved. Native track jump links avoid burying the new path below 33 BLD lessons.
- Deliver notation and connected-pair insertions first, explicitly not a complete beginner F2L or full CFOP course. Pairing/extraction, 2-look OLL/PLL, advanced F2L and full OLL/PLL drills remain pending. Do not expose provisional solver strings as ergonomic teaching defaults.
- Computational search selected the insertion demonstrations; independent content tests pin all five pair sticker colours, starting identities, preserved cross/other slots and exact solved result. Examples use the site's white-U/yellow-D fixed frame, hence a yellow cross on D, and explain using another physical cross colour.
- Cube highlights follow the pair's physical identities and retain the six fixed centre landmarks. Do not highlight unrelated pieces occupying the destination slot as if they belonged to the pair.
- Previous move removes one explorer action without storage mutation; clearing the last action or resetting returns focus to the first move. Each explorer has independent history. Net-first remains the default; autoplay animates only after session consent to 3D.
- Quiz retry remounts the answer registry and questions together. Clearing only the registry left stale visual selections and prevented their unchanged choices from being registered again.
- CFOP suppresses irrelevant custom BLD buffer warnings, without changing custom trainer configuration or the standard-buffer convention in BLD lessons. Existing StorageAdapter checkpoint events and backups need no schema change.
- No new visual tokens, fonts, raster assets, identity or image-comp approval. Reversal: CFOP content/recognition can grow independently of the existing blindfold courses and algorithm-selection layer.

## D-048 · Guide readiness belongs to the application, not Firefox session restore

**Status:** narrow correction implemented and verified 2026-09-17: five repeated original Firefox checks, ten native diagnostics and complete four-target production regression passed.

- The complete regression exposed a reproducible Firefox guide-reopen failure after reload. Native event logging pinned the discrepancy: DOM `disabled` was false while React's current handler props still had `disabled: true`; all pointer/click events reached the trigger, but React correctly withheld its handler until settings were ready.
- Firefox restores dynamic button enablement across loads. Set only the guide trigger's native `autocomplete="off"` policy, preserving SSR disabled state, hydration readiness, keyboard behaviour and saved guide progress. The small literal spread emits this documented Firefox button attribute without unsafe type casts or weakening the readiness guard.
- Primary references: [MDN disabled attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/disabled) and [Mozilla's matching React hydration report](https://bugzilla.mozilla.org/show_bug.cgi?id=1847798). No browser sniffing, forced clicks, fixture sleep or global autocomplete policy.
- The existing browser test also asserts the native policy before exercising save, Escape, reload, resume and restart. No persistence schema, visual system or phase marker changes.
- Reversal: easy, but retain the reload regression; removing the attribute reintroduces a window in which the trigger appears interactive before its handler is ready.

## D-049 · Verified CFOP reference and OH teaching boundary

**Status:** implemented 2026-09-17, before the visual redesign requested in `FRONTEND.md`.

- The CFOP curriculum now finishes the confirmed order: notation, beginner F2L, two-look OLL/PLL,
  advanced intuitive F2L, then full OLL/PLL. Its six compact reference groups read the existing
  engine-verified case datasets (3 EO, 7 CO, 57 OLL, 2 corner-permutation, 4 edge-permutation and
  21 PLL classes); they do not create a second case, notation or animation implementation.
- The algorithm library is one selectable reference surface: CFOP last layer, 3-style commutators/setup
  detail, 3BLD method parity and 4BLD piece-family parity. Ordinary 3×3 CFOP is explicitly kept out of
  the parity categories. A case animation begins at the inverse of verified notation and plays the
  stored moves back to the relevant stage goal.
- OH is a separate, open 3×3 learning track. It teaches grip, turning, CFOP execution and practice
  without claiming that a solver-generated reference sequence is an ergonomic OH default. Standard
  notation, personal verified alternatives and subjective grip/finger-trick annotations remain distinct.
- The official shadcn initializer (Base UI/Nova) is compatible with Next 16 and Tailwind 4. It created
  `components.json` and the utility entry point. Its generated visual theme was intentionally removed;
  shadcn remains an optional accessible primitive source and cannot silently replace the product token
  system. The first initializer attempt was blocked by the sandbox proxy; the approved network retry
  completed.
- Reversal: lesson content and the reference viewer are additive. Keep the strict dataset parse and the
  distinction between computed reference notation and personal ergonomics if replacing their presentation.

## D-050 · Navigation cube uses engine-verified display patterns

**Status:** accepted (2026-09-17).

- The navigation cube uses checkerboard, cube-in-a-cube, and superflip rather than arbitrary short move snippets. The sequences were transcribed from named pattern references and checked by `navigation-patterns.test.ts`: each is parsed by the cube engine, returns to solved through its computed inverse, and has its documented finite order.
- The runtime always travels through `inverse(current) + target`, so it remains a legal state transition rather than a sticker replacement.

## D-051 · Precision-workbench frontend redesign

**Status:** implemented locally 2026-09-18 at the user's explicit request; no phase marker advanced.

- The frontend now uses a shared precision-workbench system across home, learning, trainers, algorithm/reference workspaces, progress and settings. It preserves the existing route, StorageAdapter, form, validation, dataset and cube-engine boundaries; the change is presentation and interaction framing, not replacement product functionality.
- Manrope 5.3.0 is a local, self-hosted interface/readability face (`public/fonts/manrope-5.3.0-latin-wght.woff2`, OFL license included). Recursive remains for spatial-letter display and verified algorithm notation. This replaces the overly casual all-Recursive interface without adding a network font dependency.
- `study-room.webp` and `scenic-atlas.webp` are local generated visual assets for the configurable room surface. They are decorative, pointer-inert and independent of learning data; they never stand in for a cube state, case diagram or user-uploaded content.
- Navigation patterns now include engine-tested checkerboard, cube-in-a-cube, superflip, snake and donut states. The player routes through the computed inverse of its completed logical pattern before applying the requested target; it coalesces a rapid retarget, pauses out of view/hidden, and remains still under reduced motion. `navigation-patterns.test.ts` proves the named patterns parse, transform and invert in the cube engine.
- The visual direction is deliberately blue-charcoal and jade rather than the prior purple-slate treatment. Scenery remains subordinate to opaque reading/work surfaces, and all colourway values retain the contrast checks in the design suite.
- Reversal: the modular styles and image assets can be exchanged independently. Keep the verified cube pattern tests, local-font license, native control semantics and contrast coverage if the visual layer changes again.

## D-052 · Public v1 distribution is a reproducible static checkout

**Status:** accepted 2026-09-18 at the owner's request to publish Version 1.

- The public checkout declares Node.js `>=22.3.0` and documents Corepack as the package-manager activation path. `pnpm install --frozen-lockfile`, `pnpm dev`, and the four verification commands are documented at the repository root.
- The built app is a static export in `apps/web/out/`; it remains local-first with no account, backend, analytics, or configuration secret required for a new contributor to run it. Host-specific headers and offline verification remain in `docs/DEPLOY.md`.
- Local agent instructions, build products, generated worker/vendor bundles, review artifacts, legacy databases, exports, and environment files stay ignored. They do not belong in the public source history.
- Reversal: update the documented toolchain together with the lockfile; do not loosen the data, build-output, or environment ignore rules when adding public documentation.

---

## D-053 · v2 scope: accounts, cross-device sync and launch polish, on top of an unchanged v1

**Status:** accepted (owner-approved plan, 2026-09-18). Supersedes CLAUDE.md's "Don't add accounts, auth, or a backend — v1 is local-only" for this new scope only.

- v1 (this document's D-001 through D-052) is unchanged and complete. v2 is a strictly additive extension: a Supabase-backed account layer, cross-device sync of durable data, an activity calendar/streaks/goals, three opt-in leaderboards, a custom loader, and launch polish (SEO, contact/privacy pages, 5BLD "building in progress" labelling).
- Guest mode keeps working exactly as it does today, with no account. The local `StorageAdapter`/Dexie architecture is the working store for both guests and account holders; sync is a layer behind it, not a replacement (v2 plan §B).
- CLAUDE.md's phase line ("Phase 1 — cube engine, no UI") and AGENTS.md are stale relative to the actual repository: v1 shipped a complete app (README.md: "Version 1 is complete"), confirmed at inspection on 2026-09-18. This decision does not touch that phase line — only the owner advances it — but records that v2 work proceeds from the real, current state of the repository, not from CLAUDE.md's outdated snapshot.
- Work happens on branch `v2/accounts-sync`, branched from `master` after fast-forwarding `master` to the tip of the completed v1 work (`4bld/complete`, 129 commits, pushed 2026-09-18). Merges to `master` only on the owner's confirmation, per milestone.

## D-054 · Accounts are username/password, not email — no email-delivery channel exists

**Status:** accepted (owner request, 2026-09-18).

- **Context.** The deployment target is the free `bldokja.pages.dev` origin. There is no owned domain, so there is no DNS to verify a sender against — no SPF/DKIM/DMARC is possible, and no transactional-email provider can be configured for outbound mail from this project. The v2 plan itself flagged this as a blocker requiring resolution before authentication could be built. The owner's resolution: don't use email for registration at all.
- **Decision.** Supabase Auth's `auth.users` table is still email-shaped internally, so sign-up uses a synthetic, never-delivered address deterministically derived from the chosen username: `lower(username) + "@accounts.bldokja.internal"`. The real identity is `public.profiles.username` (supabase/migrations/20260918100000_profiles.sql), unique, format-checked (`^[a-z0-9_-]{3,24}$`). Email confirmation is disabled in Supabase's auth config (`enable_confirmations = false`) since there is no channel to confirm through — sessions are active immediately after sign-up.
- **Consequence: "change email" becomes "change username".** The client updates `profiles.username` and calls `auth.updateUser({ email: newSyntheticEmail })` under the user's own session (self-service, no elevated privilege needed) to keep the two in lockstep.
- **Consequence: sign-in needs no lookup.** Because the synthetic email is a pure function of the username, the client computes it directly and never needs to query `profiles` (which has no public read grant) before calling `signInWithPassword`.
- **Anti-abuse.** Removing email confirmation removes a natural bot deterrent, so sign-up (M3) adds a Cloudflare Turnstile widget — same Cloudflare account as Pages hosting, no new account needed.
- **Reversal.** If a real domain is later purchased and transactional email becomes available, migrating to email-based accounts would need: collecting a real email per existing account, Supabase's email-change flow, and retiring the synthetic-email convention. Not attempted now; flagging the cost so it isn't a surprise later.

## D-055 · Password recovery without email: a one-time recovery code, redeemed through an Edge Function

**Status:** accepted (owner delegated the mechanism: "freedom to modify for best results", 2026-09-18). Flagged for the owner to veto in favour of the simpler "no recovery, make a new account" alternative if preferred — not yet exercised in a live environment.

- **Context.** D-054 removes the only channel ("email a reset link") the original plan's "forgot/reset password" requirement assumed.
- **Decision.** At sign-up (and on demand from Settings), the client generates a high-entropy one-time code, shown once, never stored in plaintext. Only its SHA-256 hash is stored, in `public.account_recovery` (supabase/migrations/20260918100001_account_recovery.sql) — a table with **no RLS policies granting anon or authenticated anything at all**, reachable only by `service_role` and by the user's own `set_recovery_code()` call (security definer, restricted to `auth.uid()`'s own row). This is deliberately stricter than protecting a couple of columns on `profiles` with a `WITH CHECK` clause: the hash is not queryable by any client role, by any path, ever.
- **Redemption is an Edge Function (`supabase/functions/redeem-recovery-code`), not a Postgres function.** The actual password change must go through `auth.admin.updateUserById()`, which needs the `service_role` key and Supabase's own password-hashing/session-invalidation logic — directly writing `auth.users.encrypted_password` from SQL would bypass that and is explicitly the kind of internal-table manipulation Supabase's own guidance warns against. Verified against current docs on 2026-09-18 (supabase.com/docs/reference/javascript/auth-admin-updateuserbyid): `admin.updateUserById(uid, { password })` is the documented, supported, server-only path.
- **Lockout, not infinite guessing.** Five wrong attempts (`account_recovery.failed_attempts`) locks the code; recovery beyond that falls back to emailing the site owner (`rinckyshivkumarjain@gmail.com`, already required for the contact page) for a manual reset via the Supabase dashboard. Given ~80 expected users, a manual fallback is an acceptable cost for not building a second recovery channel.
- **Username existence is never revealed** by this endpoint: an unknown username still hashes the input and returns the same generic `invalid` error as a wrong code.
- **Unverified.** No live Supabase project or Docker was available in this environment to deploy and exercise this function end to end. The exact environment-variable name Supabase provisions for the service-role secret has reportedly changed across project generations (community reports of a newer `SUPABASE_SECRET_KEYS` scheme alongside the long-documented `SUPABASE_SERVICE_ROLE_KEY`); the function checks both names defensively, but this needs confirming against the actual project once created (M8).

## D-056 · Sync reuses the existing local storage semantics; only leaderboards compute anything new server-side

**Status:** accepted design (owner-approved plan, 2026-09-18). SQL is committed but **untested against a live Postgres** — no Docker was available in this environment. Treat as draft-verified-by-reasoning only until exercised for real (plan §K/M7).

- **Events** (`sync_events`, `…100002_sync_events.sql`) mirror the local event log's own already-idempotent, id-keyed, append-only semantics exactly: insert-only RLS (no client update/delete), `server_seq` identity column as the pull cursor. No new conflict logic was needed — the local semantics already were the right cloud semantics.
- **`sync_events.id` is `text`, not `uuid`.** `apps/web/src/lib/ids.ts`'s `newId()` falls back to a non-UUID string when `crypto.randomUUID` is unavailable. Assuming UUID formatting would have been exactly the kind of "obviously right" assumption CLAUDE.md warns against; checked the source before writing the column type.
- **SRS needs no sync path at all.** `packages/srs` stores no scheduling state — a card is rebuilt by replaying `drill.attempt` events in time order every time (packages/srs/src/index.ts). Once events sync, any device with the unioned log recomputes an identical schedule. This satisfies the plan's "never let the last-synced device clobber scheduling" requirement without any new code.
- **Letter pairs** (`sync_letter_pairs`) use optimistic concurrency: a `rev` column, force-incremented by a `BEFORE INSERT OR UPDATE` trigger regardless of what the client sends, so a client's `.eq('rev', localRev)` push against a stale revision matches zero rows — the client reads that as a conflict rather than silently overwriting someone else's edit. This is the same "insert if new, never silently overwrite, report conflicts" rule `packages/storage/src/transfer.ts`'s existing `importData()` already implements for local import, applied over the network.
- **Settings merge per field, not as one blob**, via a single `security definer` function (`merge_settings`) that is the *only* write path — direct `UPDATE` is revoked from `authenticated` specifically so the per-field merge can't be bypassed by a raw PostgREST update. The local `Settings` schema gained an additive, optional `syncFieldUpdatedAt` shadow map (packages/storage/src/schema.ts) populated only when signed in; guests are completely unaffected.
- **Images never enter Postgres.** Bytes go to a private, owner-path-scoped Storage bucket (`letter-pair-images`); `sync_letter_pairs.data` carries a small path reference instead of a multi-megabyte base64 string, keeping rows small per the plan's "don't send the whole account after every answer" rule.
- **Leaderboard points, open interpretation flagged for confirmation.** The v2 plan says points are "proposed... requiring approval" but doesn't say whether the points board resets weekly (like "weekly active days") or accumulates. Implemented as an **all-time cumulative total** (daily-capped, summed forever) as the more natural complement to the two explicitly time-scoped boards — flag this at review if a weekly-reset points board was actually intended.
- **Streak/timezone SQL is the riskiest part of this migration set.** `leaderboard_streaks()` converts each event's `timestamptz` to the user's own IANA-zone wall-clock date with a **single** `AT TIME ZONE` conversion — chaining two (`AT TIME ZONE 'UTC' AT TIME ZONE tz`) was an actual mistake caught and corrected while drafting this migration; that double form does the opposite of what's needed (flips a wall-clock reading back into a different instant rather than reading a local date). The "current streak" cutoff (`run_end >= today - 1`) implements the plan's own rule that a streak stays current when yesterday was active and today hasn't ended yet, evaluated in the user's own zone, not UTC. This must be exercised against a real database with an IANA zone that actually crosses a DST boundary before it ships.

## D-057 · The Dexie object-store version is now separate from the export-format schema version

**Status:** accepted (this session, 2026-09-18). First time either version number has ever changed since the project began.

- **Context.** v2's local sync layer needs a new, purely local `outbox` table (queued pushes) that never appears in an export or affects record validation. The existing code shared one constant (`SCHEMA_VERSION`) between Dexie's `.version()` call and the export envelope's `schemaVersion` literal, documented as "one number covers both" — true only because nothing had ever needed them to diverge before.
- **Decision.** `packages/storage/src/schema.ts` now has `DEXIE_VERSION` (2) separate from `SCHEMA_VERSION` (still 1, unchanged). `dexie-backend.ts`'s `BldDatabase` uses `DEXIE_VERSION`. Adding a new object store bumps `DEXIE_VERSION` alone and needs no data migration (an empty new store has nothing to transform); a change that alters what an existing record means, or what a valid export contains, still bumps `SCHEMA_VERSION` (and needs an `EXPORT_MIGRATIONS` entry) exactly as before.
- **Verification.** `packages/storage/test/dexie-upgrade.test.ts` builds a v1-shaped database by hand (the five original stores, none of `outbox`) via `fake-indexeddb`, the way any real v1 install's browser actually has it on disk, then opens it through today's `dexieBackend()` and confirms existing letter pairs, events and settings all survive, and the new `outbox` store is immediately usable. This project's own rule against "never drop user data silently" applies to schema upgrades, not only to JSON import — this is the first Dexie version bump this codebase has ever shipped, so it gets its own explicit test rather than trusting the mechanism by inspection alone.
- **`COLLECTIONS` (backend.ts) is the single source of truth** for the store set — both `memoryBackend()` and `dexieBackend()` derive their tables from it, so adding `"outbox"` there was the only change needed to give both backends the new collection.

## D-058 · Dependency additions for v2: exact-pinned, matching this repo's existing supply-chain posture

**Status:** accepted (this session, 2026-09-18).

- `supabase` (CLI, 2.117.0) and `wrangler` (Cloudflare CLI, 4.133.0) added as root devDependencies, pinned exactly — matching D-003/D-004's rationale (avoid supply-chain surprises from range installs), even though a couple of pre-existing devDependencies (`lighthouse`, `@playwright/test`) already used caret ranges; exact-pinning the new ones is the more conservative choice and doesn't require touching the existing ones.
- `pnpm-workspace.yaml`'s `allowBuilds` gained `workerd: false` — pnpm's own supply-chain gate blocking wrangler's `workerd` (the Cloudflare Workers runtime binary) install script by default, the same pattern D-005 already established for esbuild (there, explicitly allowed after review; here, left blocked since nothing yet needs a local Workers runtime — M8's actual Cloudflare Pages deploy doesn't require it either, since Pages serves the static export directly).
- **Caught and corrected before committing:** an early `npx --yes supabase --version` invocation silently added both packages as unpinned devDependencies and ran an implicit `supabase init`, rather than actually just printing a version. Reverted the unpinned additions and redid them as an explicit, exact-pinned `pnpm install`; kept the `supabase/` scaffold it created (a standard `supabase init` config.toml) rather than discard-and-redo, after reviewing its contents.

## D-059 · Points leaderboard: daily, weekly and monthly cadences, with a permanent monthly top-10 archive

**Status:** accepted (owner's choice, 2026-09-18), resolving D-056's flagged open interpretation.

- **Decision.** Points are not a single all-time total (D-056's original guess). Three live boards share one `daily_points` view (a UTC-day, 20-point-capped count per user, per day — the one place the cap is applied): `leaderboard_points_daily()` (today only), `leaderboard_points_weekly()` (the same Monday–Sunday UTC window as the active-days board), `leaderboard_points_monthly()` (the current calendar month, live).
- **Monthly results are permanently archived, not just computed live forever.** `archive_monthly_points()` snapshots a month's top 10 (`month_start`, `rank`, `user_id`, `points`) into `monthly_points_archive` once the month ends, so a later change to the points formula — or someone opting out afterwards — can't quietly rewrite who won a past month. Reading it back (`leaderboard_points_monthly_archive(month)`) still joins live to `profiles` and re-checks *current* `leaderboard_opt_in`, so opting out does remove past placements from public view; only the frozen `points`/`rank` values themselves survive that. Deleting an account still removes the archived rows too, via the same `auth.users` cascade as everything else — a deleted account has no public trace anywhere, past or present.
- **Scheduling: `pg_cron`,** which ships enabled on every Supabase project including the free tier (verified 2026-09-18: supabase.com/docs/guides/database/extensions/pg_cron, supabase.com/docs/guides/cron). Runs at 00:05 UTC on the 1st of each month, archiving the month that just ended.
- **A real privilege bug caught while writing this.** Postgres grants `EXECUTE` on a new function to `PUBLIC` by default. `archive_monthly_points()` deletes and rewrites the archive table, so it must never be callable by an ordinary signed-in user (they could force a repeated full recompute on demand) — it explicitly revokes from `public, anon, authenticated`. Writing this migration is what prompted checking whether the *other* security-definer functions (`set_recovery_code`, `merge_settings`) had the same exposure; see D-060 for what live testing found.

## D-060 · v2 schema and auth design, actually verified against a live Supabase project

**Status:** accepted / verified (2026-09-18). Supersedes D-055/D-056's "untested, no Docker available" caveat — the owner created a real project (`dlqphprfgsqyfbpsfvqd`) and authenticated the `supabase`/`wrangler` CLIs, so this was exercised for real rather than reasoned through alone. Several real issues surfaced that pure review had missed; each is recorded here with what was actually observed, not just what was intended.

- **All migrations applied cleanly** (`supabase db push`) against the live project, including the `pg_cron` extension and `cron.schedule` call from D-059 — nothing in the schema itself failed to install.

- **Real bug found: `revoke all on function ... from public` is not enough on Supabase.** Supabase's project setup grants `EXECUTE` on every new `public`-schema function directly to `anon` and `authenticated` via its own default-privileges configuration — a separate grant from the standard Postgres default to `PUBLIC`. `set_recovery_code()` and `merge_settings()` were written revoking only from `public` (unlike `archive_monthly_points()`, which correctly named `anon, authenticated` explicitly). Live-tested: an anonymous request reached each function's body and hit its own `auth.uid() is null` check (still safe in effect) instead of getting refused before entering the function at all. Fixed in `20260918110000_fix_public_only_revokes.sql` rather than editing the already-applied originals, and reverified live — both now correctly return a permission-denied to an anonymous caller. **Every future `revoke` in this schema must name `anon`/`authenticated` explicitly, never rely on `from public` alone.**

- **The synthetic-email design (D-054) works as intended, once one thing was true.** Sign-up with `<username>@accounts.bldokja.internal` initially failed with `email_address_invalid` — this turned out to be caused by `enable_confirmations` still being `true` on the *remote* project (the local `supabase/config.toml` edit only ever affects `supabase start`'s local dev stack, never the hosted project — a genuinely easy mistake to make). Once `enable_confirmations`/`minimum_password_length` were pushed to the live project via `supabase config push`, the same `.internal` address signed up successfully with an immediate session, exactly as designed. **`.internal` was not the problem and needs no change** — the earlier suspicion that it might be a rejected reserved TLD was itself wrong; recorded here so nobody "fixes" it later based on that red herring.
  - **`config push` pushes every property your file declares, not just the ones you meant to change.** The full `supabase init` template declares ~14 properties (pooler connection limits, MFA enrollment, storage analytics, SMS) that were never deliberately reviewed. Pushed only the two intended keys (`auth.email.enable_confirmations`, `auth.minimum_password_length`) via a minimal scratch `config.toml` linked with `--workdir`, confirmed by `config diff` to touch nothing else, rather than pushing the full committed file. The committed `supabase/config.toml` stays the full local-dev template; it has not been, and should not be, blanket-pushed to the real project.

- **Live-verified, with real data, not just empty-result "didn't error":**
  - Cross-user RLS isolation on `profiles`, `sync_events`, `sync_letter_pairs`: one account cannot read, update, or spoof-insert as another; an `UPDATE` attempting to reassign a profile's own `id` to someone else's is rejected (`42501`), not silently ignored.
  - Optimistic concurrency on letter pairs: an insert claiming `rev: 999` is forced back to `rev: 1` by the trigger; a stale `.eq('rev', 1')` update after a real update has advanced the row to `rev: 2` matches zero rows rather than clobbering it.
  - Per-field settings merge: an older-timestamped write to one field is correctly ignored while a newer-timestamped write to a *different* field in the same call still applies — confirming the merge is genuinely per-key, not per-call.
  - The streak SQL, for a real 3-day run with a gap (attempts on day −2, −1, 0, plus an isolated attempt on day −5): correctly reports a current streak of 3, with the disconnected day −5 attempt neither extending it nor being mistaken for the current run. This was the single riskiest piece of untested SQL in D-056; it now has an actual, non-trivial passing case behind it, not just review.
  - Account deletion's cascade: cleaning up the test accounts via `delete from auth.users where …` correctly removed every dependent row (profile, events, letter pair) with no orphans left in any table or leaderboard — a real exercise of the same cascade M3/M4's account-deletion feature will rely on, not just a schema inspection.

- **Credential handling.** The database password was pasted into chat twice (once mistakenly authenticated against an already-rotated password, then again after a dashboard reset) rather than entered by the owner directly into an interactive CLI prompt — the safer path that was offered first. Recorded so the pattern isn't repeated: prefer having the owner run password-requiring commands themselves; if a secret does end up in the conversation, treat it as burned and get it rotated, which happened here via the dashboard's reset-password flow.

## D-061 · M3: account-aware local storage switches by localStorage, not by racing an async session check

**Status:** accepted (this session, 2026-09-18).

- **The problem.** `storage-client.ts`'s `getStorage()` is a plain module-level singleton with no parameters, called from many places (settings-provider.tsx, use-events.ts, every trainer loader) with no consistent ordering. Determining "is anyone signed in" needs an async round trip through Supabase (`onAuthStateChange`), so on a fresh page load there is no way to guarantee that check resolves before some other component's effect calls `getStorage()` first -- if it did, that component would get the guest database, and no amount of correcting `activeAccountId` afterwards would un-open it.
- **Decision.** The active account id is mirrored into `localStorage` (`bld.activeAccountId`), read synchronously the instant `storage-client.ts`'s module evaluates -- before any component's effect has had a chance to run at all. `AccountProvider`'s async session check still runs, but only to confirm or correct what's already true from a *previous* page load; the only genuinely async transition is a fresh sign-in/out, which `AccountProvider` handles by calling `setActiveAccount()` (which persists the new id) and then reloading the page, so every already-mounted component re-derives its state against the newly-correct storage instance rather than needing to be individually taught to react to an account switch.
- **`setActiveAccount()` returns whether it actually changed anything** (a plain boolean), so `AccountProvider` can call it unconditionally on every `onAuthStateChange` event (`INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`, a plain token refresh) without needing to filter by event type -- a same-account call is already a no-op internally, so there is nothing to filter.
- **Guests are untouched.** `dbNameFor(undefined)` is still the literal, original `"bldokja"` name; nothing about this changes what an existing v1 install (or a browser that never touches accounts at all) reads.
- **Verification.** `apps/web/src/lib/storage-client.test.ts` exercises the naming/switching logic directly (default guest name, switching, the no-op-when-unchanged return value, persistence surviving a simulated reload via `vi.resetModules()`, and that switching away from an account actually hides its data). It does not, and cannot, prove that switching *back* restores the same data under `memoryBackend()` (the jsdom test environment has no `indexedDB`) -- that half of the guarantee rests on Dexie's real on-disk persistence, already covered by `packages/storage/test/dexie-upgrade.test.ts`.

## D-062 · Account deletion needs its own Edge Function; recovery's error-mapping is a best-effort guess pending live UI testing

**Status:** accepted design (this session, 2026-09-18). The error-mapping half is explicitly flagged unverified.

- **`supabase/functions/delete-own-account`** mirrors `redeem-recovery-code`'s service-role pattern, with one addition redeem-recovery-code doesn't need: it also removes the caller's `letter-pair-images` Storage objects before deleting the `auth.users` row, since Postgres's cascade (profiles/sync_events/sync_letter_pairs/sync_settings/monthly_points_archive, all confirmed working live in D-060) doesn't reach into Storage at all. The caller's identity comes from verifying their own bearer token through a second, anon-keyed client's `auth.getUser()` -- never a client-supplied id, so nobody can ask this function to delete someone else.
- **The Storage cleanup is recursive-by-one-level** (list the user's folder, then list each pair-id subfolder found inside it), matching the `<user_id>/<pairId>/<imageId>` path convention from D-056. This function has not been deployed or exercised against a real uploaded image in this environment; confirm the recursion actually clears everything once there's a real image to test with.
- **`account.ts`'s `mapAuthError()` is reasoned, not verified.** The exact shape of a "username already taken" response (particularly the rarer race where two sign-ups for the same username hit the `profiles.username` unique constraint at the same instant, rather than GoTrue's own duplicate-email rejection catching it first) wasn't reachable to test live -- a fresh browser permission prompt blocked navigating to the Supabase project's origin from this session, separately from the earlier, already-open tab used for D-060's testing. Matches on `error.code === "user_already_exists"` (current supabase-js's documented code for a duplicate email) plus a message-substring fallback; needs confirming once the sign-up form can actually be exercised (submit the same username twice) in a real browser.
- **UI verification gap, stated plainly.** `pnpm build` succeeds and `/account` prerenders (confirmed by inspecting the static output directly), and `pnpm typecheck`/`lint`/`test` are all clean, including new tests for the pure logic in `account.ts` and the storage-namespacing logic in `storage-client.ts`. What is **not** verified: actually loading `/account/` in a live browser and exercising sign-up, sign-in, and the forgot-password flow end to end. This session's browser tool could not reach `localhost` (a sandboxing boundary, not a one-off permission prompt -- confirmed by starting the dev server directly and checking the port was genuinely listening before the navigation was still refused). The owner should run `pnpm dev` and click through `/account/` before this is considered done, not just built.
