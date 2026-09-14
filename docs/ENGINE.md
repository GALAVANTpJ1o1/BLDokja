# How the cube engine works

`packages/cube-engine` (`@bld/cube-engine`) is the part of the site that has to be right: lettering, tracing, method solvers, commutators, alg datasets, scrambles and drill selection. This guide is for anyone changing it. The *why* behind each choice is in [DECISIONS.md](DECISIONS.md), cited as D-0NN; this page is the map.

## Ground rules

- **Pure TypeScript.** No React, DOM, browser globals or Node built-ins in `src/`. `tsconfig.build.json` compiles `src/` with no DOM or Node types, ESLint forbids the globals and imports, and `test/purity.test.ts` checks it again. `cubing/kpuzzle`, `cubing/alg`, `cubing/search` and `cubing/scramble` are the only cubing.js subpaths allowed (D-002).
- **Nothing is remembered.** Sticker positions, names, lettering, swap effects, setups, special cases, parity rules and every alg are computed and verified in the engine. A table typed in by hand is a bug waiting to happen (D-006, CLAUDE.md).
- **Errors are values.** Anything a caller can get wrong returns `Result<T, E>` (`src/core/result.ts`) with a typed error code. `throw` is kept for broken invariants, the "this can't happen" cases that tests prove don't.
- **Names, not letters.** Stickers and pieces are named from geometry (`UFR`, `FUR`, `UFr`, D-009). Letters come from a scheme and appear only in traces and memo output. Datasets, solver steps and errors never contain letters, so a user's custom scheme can't break them.
- **Strict TypeScript.** No `any`, no non-null assertions. `noUncheckedIndexedAccess` is on; `at()` and `lookup()` in `src/core/arrays.ts` turn an out-of-range read into an immediate error.

## Layers

Each layer only imports from the ones above it.

| Folder | What it does | Start with |
|---|---|---|
| `core/` | Puzzles, sticker geometry, the sticker map between kpuzzle and physical slots, move tables, rotations, the 48 symmetries | `puzzle.ts`, `geometry.ts`, `sticker-map.ts` |
| `pieces/` | Piece types as data (corners, edges, wings, x-centres), names, twist direction | `piece-types.ts` |
| `lettering/` | Schemes as data, validation, Speffz | `scheme.ts`, `speffz.ts` |
| `trace/` | Scramble or state → targets for one piece type | `trace.ts` |
| `memo/` | Trace → letter-pair memo items | `memo.ts` |
| `commutator/` | Bracket notation, expansion and cancellation, move metrics, comm validation, comm and twist/flip search | `parse.ts`, `validate.ts`, `search.ts` |
| `methods/` | Swap algs, setup search, M2 special-case search, the OP/OP, M2/OP, 3-style and M2 + 3-style solvers, illegal-setup demonstrations | `swap-algs.ts`, `op.ts`, `m2.ts`, `three-style.ts` |
| `data/` | Zod schemas for everything in `content/algs/`, and the verifiers that recheck every record | `alg-dataset.ts` |
| `scramble/` | Scramble providers, constrained generation, drill scrambles | `providers.ts`, `constrained.ts` |
| `random/` | Seeded PRNG, uniform random states, selection strategies with the recency guard | `prng.ts`, `selection.ts` |

`src/index.ts` is the public surface. The app imports only from there.

## The chain of trust

Everything rests on one check: two independent models of the cube agree.

1. **The geometry model** (`core/geometry.ts`) treats stickers as points in space and moves as quarter-turn rotations of layers. Its only outside fact is the WCA rule that a face turn is clockwise seen from that face. It has its own notation reader (`geometry-moves.ts`).
2. **cubing.js's kpuzzle** describes the same puzzle as orbits of pieces with orientation labels.
3. **The sticker map** (`sticker-map.ts`) identifies each kpuzzle position with a geometric cubie by which layer moves disturb it, and propagates orientation labels from one seed position. No hand-written table.
4. **Root of trust** (`test/core/root-of-trust.test.ts`): for every move in `VERIFIED_MOVE_FAMILIES`, on 3x3x3 and 4x4x4, both models must move every sticker to the same slot. The engine only generates moves from those families.
5. **Move tables** (`move-table.ts`) are compiled from kpuzzle through the verified map, for hot loops. A permutation is `perm[from] = to`, and `composePerms(a, b)` means a first, then b.

Everything later is checked against states built this way: comms by applying them and requiring a solved cube, datasets by recomputing each record's whole-puzzle permutation, solvers by solving random cubes in both models.

## Tracing

`trace(puzzle, input, config)` follows the virtual swap from the buffer (D-012):

- read the sticker in the buffer slot, shoot it home, and continue with the piece that was there;
- when the buffer piece comes home, break into the unsolved piece with the lowest letter (or a priority list);
- a piece in its own slot but misoriented is reported separately (`orientedInPlace: "separate"`) or traced as two targets (`"asTargets"`);
- parity is the real permutation parity of the piece type.

**Frames.** On 3x3x3 the state is first rotated so the centres are solved (`frame: centers`), the way a solver holds the cube. On 4x4x4 the frame must be given explicitly; Phase 1 only supports `asIs` (D-014).

`TraceResult` has the brief's fields plus `targetStickers`, `targetKinds`, `cycles` and `orientedInPlace`, which analytics and the guided trace trainer need.

**How tracing is verified:**
- 54 golden fixtures: 44 built from written targets, and 10 real scrambles traced by hand from colour nets (`test/fixtures/`, printed in `docs/fixtures/SPOT-CHECK.md` for a physical check);
- an independent colour-reading oracle (`test/oracle/trace-oracle.ts`), compared on 62,720 traces;
- property tests over random states.

## Memo

`memoView(trace, options)` turns a trace into two-letter items: pairs, lone letters doubled into self-pairs (or chained), and orientation markers (D-015). It only reads a `TraceResult`. `test/memo/boundary.test.ts` fails if anything that solves or searches imports it.

## Commutators

- **Parsing** (`parse.ts`, D-016): moves and bracket groups, `[A, B]` and `[A: B]`, with the nesting rules in the file header. It's separate from cubing.js's parser, which can't read most comm forms.
- **Expansion and cancellation** (`expand.ts`, D-017): same-axis runs merge family by family; different families never merge. Cancelling never lengthens an alg or changes its effect.
- **Metrics** (`metrics.ts`, D-017): HTM, QTM, STM and ETM from the geometry model.
- **Validation** (`validate.ts`, D-018): `threeCyclePattern` builds the state a solver would trace as exactly `[t1, t2]`, and a comm is valid only if applying it solves the whole puzzle. There's no written rule for "direction" to get wrong.
- **Search** (`catalogue.ts`, `conjugate-search.ts`, `search.ts`, D-019): a catalogue of pure comms indexed by their 3-cycle, shared by every buffer, then `[setup: comm]` per case with exact pruning and a deterministic ranking. `orientation-search.ts` does the same for twist and flip algs (D-023).

## Methods

A method solver takes a scramble, traces it with the method's policy, and returns a `MethodSolution`: the traces and a list of steps (`FrameStep`, `TargetStep`, `CycleStep`, `OrientationStep`, `ParityStep`). Steps carry sticker names and alg notation, never English or letters, so the UI can teach from them (`solution.ts`).

- **Old Pochmann** (`op.ts`, D-024): J Perm's swaps; setups searched under the `every-move` rule, where each setup move must leave the buffer and the swap's side effect alone; edges, then parity, then corners.
- **M2** (`m2.ts`, `m2-search.ts`, D-025): setups under the `net` rule; special cases found as a comm next to M2; the odd/even rule derived by simulation, never written in.
- **3-style** (`three-style.ts`, D-026): comms from the dataset, parity with a Jb perm at the end, twists and flips last.
- **Illegal setups** (`illegal-setup.ts`): runs any setup and reports exactly which pieces it damages, for the "why is this setup illegal?" trainer.

**Other buffers.** `opSystem` and `m2OpSystem` build and verify datasets in memory for any buffer a cube symmetry maps onto the committed ones.

## Datasets

Everything in `content/algs/3x3/` is generated, never hand-edited:

```
pnpm engine:generate            # regenerate and write
pnpm engine:generate --check    # regenerate in memory; fail if a committed file differs
```

- **Schemas and verifiers** live in `data/`. A record names its case in sticker names and states its intended effect as sticker cycles.
- **Verifiers trust nothing in a record.** They recompute the effect from the case alone, then check the notation, the cancelled moves, the move counts, the whole-puzzle permutation, and that the alg solves the case state.
- **Provenance is part of each record:** `engine-search`, `cubing-solver`, `reference` (with a citation) or `symmetry` (D-023).
- **The test suite verifies every committed file.** Solvers therefore read datasets without checking them again.
- **Buffers.** The committed buffers are the Gate B choices: OP UBL/UR, M2 DF, 3-style UFR/UF (D-022).

## Scrambles and selection

- **Providers** (`scramble/providers.ts`, D-027): `seededStateProvider3x3` (seeded uniform states, with a wide-move orientation suffix) and `cubingProvider` (cubing.js's official random scrambles). A candidate's state is available at once; its scramble is computed only when asked.
- **Constrained generation** (`constrained.ts`): rejection sampling within a fixed budget.
  - Constraints are Zod-validated data, so presets can be saved and shared.
  - An accepted scramble is traced again before it's returned, so a mismatch can't slip out.
  - Every failure is a typed reason.
- **Drill scrambles** (`drill.ts`): the inverse of a case's alg.
- **Selection** (`random/selection.ts`, D-028): `uniform`, `coverage`, `weakness`, `adversarial` and `spaced`.
  - All five share one seeded selector behind a recency guard.
  - Stats come from an injected provider, so the engine never imports FSRS.

## Tests and commands

```
pnpm test:engine          # fast suite: must never go red
pnpm test:engine:slow     # *.slow.test.ts: 20,000-run solver properties, cubing.js scrambles, full dataset rebuilds
pnpm typecheck && pnpm lint
pnpm engine:report letter-pairs | buffers   # regenerate docs/reports/
pnpm engine:bench                           # tracing and search timings
```

**What tests look like here:**
- **Golden fixtures with hand-verified output**, for anything a person can check.
- **Property tests (fast-check) that solve random cubes.** Applying every solver's output must solve the cube, in kpuzzle and in the geometry model.
- **"Teeth" tests.** Break the thing on purpose (drop the parity alg, flip a twist direction, force wing orientation to 0) and check that a test fails.
- **Fixed seeds everywhere.** A failure always reproduces.

## Adding things

- **A lettering scheme:** it's data. Build a `Scheme` and validate it with `parseScheme`; `compileLettering` reports every duplicate and gap (D-010, D-011).
- **A method or a new swap alg:**
  1. start from a single cited reference alg;
  2. let `analyseSwap` compute its effect and check its shape;
  3. search setups with `searchSetups`;
  4. generate a dataset through `scripts/generate-datasets.ts`, with a verifier in `data/`;
  5. add a full-solve property test with teeth.
- **A comm or alg someone suggests:** add it as a `reference` record with a citation, or as a user override in the app. It gets verified like everything else.
- **5x5x5:**
  - add the puzzle to `PuzzleId` and `VERIFIED_MOVE_FAMILIES`, and let the root-of-trust test cover its moves;
  - add midges, +centres and t-centres to `PIECE_TYPE_SPECS` (the comment there describes their shape);
  - piece names need a depth marker beyond 5x5x5 (D-009).

  Tracing, validation and the searches are already parameterised by puzzle and piece type.

**Known traps:**
- **4x4 wing orientation.** A 4x4 wing away from home can carry kpuzzle orientation 1, so never assume 0 when building 4x4 states (D-018).
- **Rotation parity.** On 3x3x3, 12 of the 24 whole-cube rotations are odd on edges (and on centres). So "corner parity equals edge parity" only holds once the centres are solved; normalise a scramble that ends in a rotation before making any parity claim (D-008).
- **Letter pairs.** A trace never produces same-letter pairs, but the letter-pair library still uses all 576 cells (D-013).
