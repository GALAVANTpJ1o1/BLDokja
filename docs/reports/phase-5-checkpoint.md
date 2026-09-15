# Phase 5 checkpoint: 3-style trainer, comm sandbox, custom schemes, difficulty customiser

Written 2026-09-16 on `phase-5/tools`, stacked on `phase-4/trainers`. BRIEF §14 gives Phase 5 no review gate ("—"), so Phase 6 follows without stopping. Nothing is merged to `master`.

## How to try it

```
pnpm dev     # then http://localhost:3000/practice/
```

- **New on the Practice page:** 3-style, Comm sandbox, Difficulty.
- **New in Settings:** Lettering and buffers.

## Before any feature: the design direction

`DESIGN-DIRECTION.md` was already applied in Phase 2 (starfield, transmission window, page transitions). Two small gaps were fixed in their own commit:

- star letters were chalk on every ground, which failed contrast on the light theme;
- two links skipped the page transition.

## An engine bug found and fixed first (D-031)

- **The finding:** building 3-style datasets for other buffers turned up a comm the search had missed. The comm search looked each case up under the wrong one of a 3-cycle's sticker cycles, so it wasn't exhaustive, despite what D-019 said.
- **The fix:**
  - the search keys cases the way the catalogue keys comms;
  - an independent oracle, matching whole permutations, now checks it (every corner case for three buffers in the slow suite);
  - the datasets were regenerated.
- **What changed:**
  - 24 UFR corner cases got one move shorter, none got longer;
  - OP, M2, twist, flip and parity datasets are byte-identical;
  - the only visible change elsewhere is one comm's notation in a pinned solution, whose moves are identical.
- **Why it matters for Gate B:** every buffer now has the same comm-length distribution, as symmetry requires. The buffer report's apparent advantage for U-layer buffers was the bug. Your UFR/UF choice stands, but comm length shouldn't have counted towards it.

## The four deliverables

### Custom schemes and buffers (BRIEF §7.6): Settings → Lettering and buffers

- **Scheme editor:** click a sticker and type its letter; the next sticker is selected for you. The engine checks for duplicates, gaps and anything that isn't a single letter as you type, and only a valid scheme can be saved.
  - You can start from Speffz or from blank, and go back to Speffz at any time.
- **Buffers per method**, limited to what the engine can build and verify:
  - OP: 48 pairs;
  - M2/OP: 8 pairs;
  - 3-style: any corner and any edge.
- **Trainers use your letters and buffers:**
  - OP and M2/OP datasets are built and verified for your buffers (M2 takes about 2 s the first time);
  - 3-style datasets are rotation images of the committed sets, verified in full;
  - M2/OP history for non-standard buffers is kept apart.
- **Lessons use your letters but keep the standard buffers**, because their prose teaches those buffers' swap spots and setups. A note says so. The Speffz lesson always shows Speffz. **This departs from your earlier answer for buffers; see OVERNIGHT.**
- **A broken saved scheme or buffer** falls back to Speffz or the standard buffers, with a message. It never breaks a trainer.

### 3-style trainer (BRIEF §7.3): `/practice/3style/`

- **Grid:** every case for your buffer (378 corner, 440 edge), coloured by mastery with DESIGN.md's ramp and marks. Arrow keys move; on a phone it becomes a first-target picker and a list.
- **Each case shows:**
  - the comm in bracket notation;
  - the cancelled moves and move count;
  - the inverse in notation and moves;
  - an animation with only the three pieces lit.
- **Modes:** learn (the alg is shown, nothing logged) and recall (say it, reveal, mark yourself; logged for FSRS). The order is coverage, weakest, random or due.
- **Your own algs:** each one is checked by the engine before it's saved and again before it's shown. They export and import as JSON, and an import keeps only algs that solve their cases.

### Comm sandbox (BRIEF §7.5): `/practice/sandbox/`

- **Analysis:** type any bracket notation to see:
  - the expanded and cancelled moves;
  - HTM, QTM, STM and ETM for both;
  - the moves saved by cancellation;
  - exactly which pieces move;
  - the 3-cycle it solves, named only once `validateComm` confirms it.
- **The cube** animates the alg with only the moved pieces lit.
- **Reverse:** pick three stickers in order to get verified comms from all three rotations of the cycle, shortest first, with a button to load one into the sandbox.
- **Scratchpad:** saved with your settings, so it's in backups.

### Difficulty customiser (BRIEF §7.7): `/practice/difficulty/`

- **Settings:**
  - piece filter;
  - targets and cycle-break ranges, flipped edges, twisted corners and parity (always, never, or either);
  - case subsets by first target;
  - soft target or hard cutoff;
  - looking again allowed or forbidden;
  - seed.
- **Presets:** saved with names, and shared as a link that carries the preset in the URL fragment. The preset is validated when the link is opened and only applied when you choose to.
- **Where each part applies** (the full table is in OVERNIGHT): guided trace uses the scramble limits, time, looking again and seed; M2/OP and 3-style use subsets, time and seed, and M2/OP's full scrambles use the limits too; letter pairs use the seed. Each trainer shows a one-line summary with a link.
- **Constrained scrambles** come from the engine's generator with a new seeded random-move provider. Each accepted scramble is traced again before use, so it can't fail to match.

## What's checked automatically

**Engine**

- **Comm search completeness** (`test/commutator/search-completeness*.ts`): the oracle agrees on the UBL regression, 25 seeded UBL corner cases (fast), and every corner case for UFR, UBL and FDR plus 12 edge cases each for UF and DF (slow).
- **Symmetry images** (`test/data/alg-dataset-symmetry*.ts`):
  - images for sampled buffers verify in full; every buffer sticker of every kind does in the slow suite;
  - the UBL image matches a fresh exhaustive search's comm lengths;
  - a record whose algs don't match its case is refused.
- **`seededMoveProvider`:** states agree with kpuzzle and the geometry model; results reproduce from the seed; bad moves are refused; it works with constrained generation.
- **Buffer pairs:** 48 OP pairs and 8 M2 pairs, samples build, and invalid pairs are refused.
- **`invertNodes`:** for every committed 3-style comm, the inverse expands to the inverse moves and solves the reversed case.

**Storage**

- **Settings round-trip:** scheme, buffers, alg overrides, difficulty, presets and scratchpad all come back as saved.
- **Bad shapes are refused:** a letter that isn't one character, an empty alg list, a range with min above max, a lowercase buffer name.

**Web**

- **3-style:**
  - case counts, ids and letters;
  - every shown alg and its inverse solve their cases;
  - your algs are verified, and bad ones rejected, never shown;
  - import keeps only valid algs.
- **Sandbox:**
  - expansion, cancellation and counts;
  - 3-cycles are named only when verified;
  - parse errors are reported;
  - candidates are verified and deduplicated.
- **Difficulty:**
  - constraints come only from piece types in play;
  - constrained scrambles reproduce and really match (checked by tracing), and impossible limits exhaust the budget;
  - soft and hard time verdicts;
  - subsets;
  - preset links round-trip and invalid ones are rejected.
- **M2/OP:** non-standard buffers put the buffer in case ids, and full scrambles for those buffers solve.
- **Lessons:** the existing lesson checks still pass with the new `lettering` field.

**Totals:** engine 470, storage 34 (+1 skipped), srs 5, web 79. The slow suite passed after the dataset regeneration (7 files: the byte-exact regeneration check and the 20,000-run solver properties), and the two new slow test files passed (9 tests). Typecheck, lint and the static build (30 pages, CSP hashed) are clean.

## Checked in the browser

- **Lettering and buffers:**
  - a duplicate letter is flagged and blocks saving;
  - a valid swap saves;
  - OP DBL/BR, M2 DBL/UF and 3-style UBL/DF buffers save;
  - the M2/OP trainer then builds for them, with custom letters and non-standard case ids;
  - lesson 12 shows the standard buffer with your letter, and lesson 4 stays on Speffz.
- **3-style:**
  - the 378-cell grid for buffer UBL;
  - recall with reveal and grading;
  - a wrong custom alg is rejected; an alternate saved as yours becomes the main alg with its inverse cancelled.
- **Sandbox:**
  - analysis of `[R: [U', R D R']]` (the 3-cycle UBR → RDF → UFR);
  - a parse error;
  - 6 verified comms for UBL, DFR, RDB;
  - the scratchpad saves.
- **Difficulty:**
  - limits, a hard cutoff and no looking again saved as a preset, with a share link;
  - guided trace found a matching scramble;
  - M2/OP's hard cutoff revealed the answer and counted it as wrong after 3 s;
  - a shared link opened with "Use it now" and "Save".
- **Phone width:** no horizontal scroll at 380px on 3-style, sandbox, difficulty and lettering.

## What needs you

1. **Lessons keep the standard buffers** while trainers use yours. That departs from your answer; say if you'd rather rewrite the OP lessons around your buffers.
2. **D-031:** the comm-search fix, and what it means for the Gate B buffer comparison.
3. **Lessons 16–23** (M2, accuracy, memo time, commutators, 3-style, building comms) aren't in any phase of BRIEF §14. I haven't written them. Which phase do they go in?
4. **Every other decision** I made is in `docs/OVERNIGHT.md` under "Phase 5".

## Known limits

- **Buffers:** OP and M2/OP buffers are limited to the pairs the engine can verify, and any other pair would need a parity search. 3-style parity for non-adjacent buffer pairs isn't built, but the trainer doesn't need it.
- **M2 build time:** building an M2/OP system for new buffers blocks the page for about 2 s on first use. A web worker is Phase 8's job.
- **Scrambles:** constrained scrambles are random-move rather than random-state, because of the same worker check.
- **Search budget:** the comm search is slower since the fix. The D-019 budget figure is now 0.83 s for corners and 18.22 s for edges (was 0.64 s and 14.41 s), both within 60 s.
