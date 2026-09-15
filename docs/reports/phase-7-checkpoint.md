# Phase 7 checkpoint: 4BLD (stopped early)

Written 2026-09-16 on `phase-7/4bld`, stacked on `phase-6/analytics`. Nothing is merged to `master`.

**Phase 7 is not finished.** You said to stop inside its engine work at a clean commit if it couldn't land today alongside Phases 5, 6 and 8 at Phase 1's verification standard. It couldn't, so I stopped after two of the four deferred engine pieces:

- **Done:** 4x4 orientation references and x-centre tracing.
- **Not built:** r2 wings and U2 x-centres. With them, none of the 4BLD lessons, trainers or parity work exists yet.

The reasons are below. I haven't cut any verification to get further.

## What landed

Engine only (a72a112); nothing on the site changed.

### Orientation references (D-032)

A 4x4 has no fixed centres, so tracing needs to know how the cube is held. Two new frames, both one of the 24 whole-cube rotations, as D-014 committed to:

- **`{ kind: "corner", piece }`:** the one rotation that brings that corner piece home and oriented.
- **`{ kind: "rotation", alg }`:** a rotation you name, such as `x y`. Anything that isn't a rotation is refused.

`applyFrame` returns the rotation and the rotated pattern, so a solver or trainer can show "hold it like this".

### X-centre tracing (D-033)

X-centres are identical within a colour, so they're traced by colour:

- **A normal target:** the buffer's piece goes to any slot of its colour that still needs it.
- **A break:** happens only when the buffer holds its own colour and all of that colour's slots are done.
- **Choosing between slots:** the default sets aside slots holding the buffer's own colour, then takes the lowest letter.
  - On 8,000 sampled traces it averaged 19.3 targets and 0.12 breaks, against 20.1 and 0.92 for plain lowest letter.
  - It was never longer, but that's measured, not proven.
- **Parity:** it's the parity of the swaps traced, since identical pieces have no permutation parity of their own. Different valid choices can change it.
- **For trainers:** `interchangeableChoices` lists every slot a trainer should accept at each step, because more than one answer can be right.

## What's checked automatically

- **Frames** (`test/trace/frames.test.ts`):
  - **named rotations:** all 24 are accepted, non-rotations are refused, and 3x3 refuses both new frames;
  - **corner references,** for all 8 corners on random scrambles with wide moves and rotations:
    - the geometry model's colours show that corner solved;
    - no other rotation does;
    - a trailing rotation changes nothing;
  - **traces under a corner frame** (x-centres, wings, corners) match the colour oracles run on colours the test rotates itself;
  - **parity:** wing and corner parity are the same under all 24 rotations.
- **X-centres** (`test/trace/xcentres.test.ts`, oracle in `test/oracle/xcentre-oracle.ts`):
  - **9 hand-derived fixtures:**
    - choices between slots;
    - the break the default avoids, which also flips the parity;
    - reversed-Greek letters;
    - a solved buffer;
    - a break-order list;
    - fully solved x-centres;
    - another buffer.
  - **The independent oracle** (geometry colours, no kpuzzle) agrees on 60 random states × 24 buffers × 2 schemes × 2 policies.
  - **Properties on 150 random states:**
    - replaying the swaps solves the colours;
    - breaks happen only when forced;
    - target count = wrong slots + breaks;
    - every step is one of `interchangeableChoices`.
  - **Teeth:** dropping the avoidance, or forcing a break whenever the buffer holds its own colour, fails the fixtures and the oracle comparison.

**Totals:** engine 485 (was 470), storage 34 (+1 skipped), srs 5, analytics 9, web 83. Typecheck and lint are clean.

## Why the rest didn't fit today

1. **r2 and U2 need a new setup search.** The M2 search tracks every protected sticker's slot as one number. That works for M2's 3 protected pieces, but r2 protects 11 and U2 protects 15. Throwaway prototypes of an exhaustive depth-limited search (not committed) found:
   - **r2** (buffer DFr, swap `2R2`):
     - every wing except the side-effect wings UFr and DBr is reachable within 6 moves;
     - the three l-slice wings need an l-slice move;
     - an exhaustive search to depth 6 takes about 6 s.
   - **U2** (buffer Ubr, swap slot Ufl): every x-centre except Ubl and Ufr within 6 moves, taking about 60 s.

   That's too slow for verification in the fast suite. Meet-in-the-middle should fix it, but it has to be built and proven exhaustive first.
2. **4x4 verification needs a colour mode.** Four x-centres of a colour are identical, so an OP corner swap or a parity alg on 4x4 only has to leave the right colours. The dataset verifiers compare exact sticker permutations, so they'd reject correct algs.
3. **Special cases need 4x4 comm catalogues.** These are catalogues of wing and x-centre comms with inner-slice generators, used for r2's FUr/BDr cases and U2's side-effect slots. Their size and search time haven't been measured.
4. **Lessons and trainers come after the datasets.** Lessons 5–8 teach U2, r2, corners on 4x4 and 4BLD parity. Every alg in a lesson must be verified, and a 4BLD full-solve property test needs every piece above.

## The plan for the rest of Phase 7

Each step lands only with its own verification:

1. **Setup search:** meet-in-the-middle, proven equal to the exhaustive search on the r2, U2 and M2 cases; the M2 datasets must stay byte-identical.
2. **r2 and U2 swaps:** added as reference swaps with citations (Speedsolving wiki R2 page; the U2 centres tutorial thread), shape-checked like M2.
3. **Colour-equivalent verification** for x-centres, with teeth: a wrong-colour result must fail.
4. **Datasets:** `r2-wings.DFr` and `u2-xcenters.<buffer>`, with setups, special cases, odd/even rules and illegal-setup examples, each verified in full.
5. **4x4 corners and parity:** OP corners on 4x4 and 4BLD parity (wings, corners, centre count).
6. **A 4BLD solver** with the full-solve property test in both models.
7. **Trainers:** 4x4 guided trace (x-centres, wings, corners) and an r2/U2 drill.
8. **Lessons:** 4BLD 1–10, plain voice first like lessons 4–15, each with a cube and a checkpoint.

## What needs you

1. **The U2 buffer.** The U2 tutorial thread uses "Urb", which is Ubr in the engine's names. Tell me if you'd rather use Ubl.
2. **The orientation reference to teach.** Either "hold the cube as scrambled" (`asIs`) or "turn a chosen corner home" (`corner`). The engine supports both; no source settles it. If a corner, which one?
3. **The r2 setup pool.** Face turns plus l-slice moves, which the tutorial PDF uses for l-slice wings. The alternative is face turns only, with those three wings as special cases.
4. **Whether to finish Phase 7 before Phase 8 is reviewed,** or treat 4BLD as post-launch. Phase 8 ran today on the 3BLD site as it stands.
5. **Still open from Phases 5 and 6:**
   - lessons keep the standard buffers;
   - D-031's implication for Gate B;
   - lessons 16–23;
   - the analytics weights and thresholds;
   - legacy memo attempts.
