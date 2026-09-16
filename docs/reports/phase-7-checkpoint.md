# Phase 7 checkpoint: 4BLD

Written 2026-09-16 on `4bld/complete`, branched from `phase-8/launch`. Nothing is merged to `master` and nothing
is deployed. The earlier, stopped-early version of this checkpoint is on `phase-7/4bld`.

**Phase 7 is finished:** the r2 and U2 datasets, 4x4 corners and every 4BLD parity step, a full 4BLD solver
with a property test, the 4BLD trainer, and lessons 1–10 of the 4BLD track.

## How to try it

```
pnpm build
npx serve apps/web/out -l 3200     # then http://localhost:3200/
```

- **Lessons:** `/learn/` has a 4BLD section after 3BLD; start at "What changes on a 4x4".
- **Trainer:** `/practice/4bld/`: trace x-centres, wings or corners, or drill r2 and U2 targets and special
  cases.

## The engine

### r2 wings and U2 x-centres (D-037, D-038)

- **Setup search as pairs of halves.** The old search packed every protected sticker's slot into one number;
  r2 protects 11 pieces and U2 15, which overflowed. Meet-in-the-middle finds the same shortest setups (a test
  compares it with the exhaustive search) and keeps every committed 3x3 dataset byte-identical.
- **r2:** buffer DFr (lettered by its sticker FDr), swap `2R2`, swap slot BUr, 23 records, special cases UFr
  and DBr with the odd/even rule UFr ↔ DBr. The Speedsolving wiki's own special-case algs match the engine's
  cases and are kept beside the searched ones.
- **U2:** buffer Ubr, swap `U2`, swap slot Ufl, 23 records, special cases Ubl and Ufr with the tutorial's
  16-move algs. No comm in the engine's catalogue makes the same-face 3-cycle those cases need (0 of 144).
- **Notation:** the sources' `r`, `u` and `d` are inner slices, written `2R`, `2U` and `2D` here. Read that
  way every published alg matches its case; read as wide turns none does.

### Judging a 4x4 alg by what the cube shows (D-039)

Four x-centres of a colour are one piece. A parity alg may leave them rearranged within a face and still be
right, so parity datasets are checked by colour; everything else is still checked sticker by sticker. Tests
give this teeth: a swap between faces, or a wing swap, must fail.

### Corners and every parity step (D-041)

- **Corners are Old Pochmann from UBL,** the committed 3x3 dataset used unchanged: its setups and swap turn
  only outer faces. On a 4x4 the swap also swaps the UB and UL wing pairs.
- **Centres:** an odd number of U2 targets is finished with one more U2.
- **Wings:** an odd number of r2 targets is finished with the r2 parity alg from the tutorial PDF.
- **Corners:** an odd number of OP targets leaves the UB and UL wing pairs swapped. The fix is the wiki's
  adjacent-dedge PLL parity alg with a `U2` setup the engine found: `[U2: R2 D' x 2R2 U2 2R2 Uw2 2R2 2U2 x' D R2]`.
- **Order:** centres, wings, corners. Centres must come first, because the wing and corner parity algs are
  only right by colour; wings and corners could go either way.

### The solver (`solveFourBld`)

Traces all three piece types once, holding the cube as scrambled, and returns the steps with each parity alg
in place.

### Lighting x-centres (D-040)

cubing.js's 3D player can only light x-centres a colour at a time. The engine now does that predictably, and
the trainer and lessons show exact slots on a flat net.

## The trainer (`/practice/4bld/`)

- **Trace x-centres, wings or corners** from seeded 4x4 scrambles, with help that lights where to look.
  X-centre tracing accepts any slot of the right colour and follows your choice.
- **r2 and U2 drills:** recall a target's setup (or a special case's alg), reveal it animated with only the
  buffer, target and swap slot lit, and mark yourself. Cases are scheduled with FSRS, like M2/OP.
- **Special cases in both positions,** with the odd/even rule.
- **Logged under `4bld`**, with case ids Weak 20 and Progress's trends read back.

## The lessons (4BLD track, 1–10)

1. What changes on a 4x4
2. Holding the cube and choosing your reference
3. Lettering wings and x-centres
4. Solve order, and why centres go first
5. Centres: the U2 method
6. Wings: r2, and how it differs from M2
7. Corners on a 4x4
8. 4BLD parity, all of it
9. What a 4BLD memo actually looks like
10. Your first 4BLD solve

- **Plain voice only,** as for 3BLD lessons 4–15.
- **Every lesson has an interactive 4x4** (trace, shots, parity algs or a whole solve) and a checkpoint:
  4x4 letters, 4x4 traces, parity questions, r2 or U2 setups, or a quiz.

## What's checked automatically

- **Datasets:** `r2-wings.FDr`, `u2-xcenters.Ubr`, `r2-parity.FDr`, `u2-parity.Ubr` and `op-corner-parity.UBL`
  go through their verifiers with every other committed dataset. Buffers, swap slots, special cases and rules
  are pinned, and the published algs are checked against the cases the engine derives. Regenerating writes
  every file byte for byte.
- **Solver** (`test/methods/four-bld.test.ts`):
  - 120 random scrambles of outer, wide and inner turns all solve by colour, covering all eight odd/even
    combinations;
  - a parity step appears exactly when its count is odd;
  - wing and corner counts are odd exactly when their permutations are;
  - an inner slice quarter turn makes only the wings odd, an outer turn only the corners, a wide turn both;
  - leaving out any parity step breaks a solve;
  - corners before wings still solves, and centres last breaks some solves;
  - every OP corner shot on a 4x4 moves exactly its corners and the UB/UL wing pairs.
- **Masks:** on 4x4, wings and corners are lit slot by slot and x-centres by colour, checked against the
  geometry model; the old code fails the test.
- **Trainer logic:**
  - shot cases and special cases follow the datasets;
  - every drill state is solved by its alg;
  - x-centre sessions accept any valid slot, refuse others, and end solved;
  - scrambles are seeded.
- **Checkpoints:**
  - the table's setup and any other setup that works are accepted, and tempting setups are refused;
  - an x-centre memo is accepted whichever valid slots it picks;
  - parity answers are the count's parity.
- **Lessons:** every 4x4 component prop is checked against the datasets and solver. Every number the prose
  states has its own test: piece counts, which moves setups use, parity by turn type, and average memo sizes
  over 200 scrambles (about 19, 24 and 8).

## Checked in the browser

- **Trainer:**
  - an x-centre trace answered wrong ("Any of Q, R, S, T is right") and then with one of those;
  - an r2 reveal showing setup `B L B'`, swap `2R2` and undo `B L' B'` with the three wings lit;
  - the U2 special-case drill's four cases in both positions.
- **Weak 20:** a U2 case after two misses, labelled "4BLD · U2 centres: C (Ufr) · even position".
- **Lessons:**
  - the path's 4BLD section;
  - lesson 3's letters (UBl A, Ubr B, FDr K);
  - lesson 10's walkthrough stepped through all 24 steps, with the centre, wing and corner parity steps in
    place and a note on the odd step shot as its partner.

## Decisions I made without you

These were the three questions in the earlier version of this checkpoint.

- **U2 buffer:** Ubr, the tutorial's "Urb".
- **Orientation:** hold the cube as scrambled. Lesson 2 mentions a corner reference as an alternative.
- **r2 setups:** face turns plus 2L, as the tutorial PDF does.

Each is in `docs/OVERNIGHT.md` with how to reverse it.

## Known limits

- **X-centres on the 3D cube** light a colour at a time; the net shows exact slots.
- **The x-centre count, and so the U2 parity step,** depend on which slots you choose; the trainer and lessons
  follow your choices, and the solver's walkthrough shows its own.
- **Progress's trace diagnostics** (medians by lookup kind) read only the 3BLD trace trainer.
- **Corner parity** uses a published PLL parity alg under a setup the engine found; no source I could read
  describes 4x4 corner parity, so this is the engine's construction, verified, not a quoted method.
