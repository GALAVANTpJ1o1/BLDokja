# Phase 4 checkpoint: guided trace, M2/OP trainer, letter-pair library

Written overnight 2026-09-16 on `phase-4/trainers`, stacked on `phase-3/lessons`. BRIEF §14's checkpoint is **"I drill for a week"**. Nothing is merged to `master`, and Phase 5 hasn't been started.

## How to try it

```
pnpm dev     # then http://localhost:3000/practice/
```

Every trainer runs from the keyboard. Press `?` inside one to see its keys. Your history is kept in this browser's storage; Settings → backup exports it.

To drill your real letter pairs, import your library first:

1. Run `pnpm --filter @bld/storage import:legacy --db ../LetterPairTrainer/letterpairs.db --out <file outside the repo>`. The database is read as bytes and checked against its audited hash before and after.
2. Restore that file in Settings.

I haven't written that export: only the read-only dry run was authorised.

## The three trainers

### Guided trace (`/practice/trace/`), BRIEF §7.1

- **Scrambles:** seeded 25-move scrambles, traced with the OP buffers (UBL corners, UR edges). Edges come first, then corners, or either alone.
- **Help levels:** 1 lights the buffer and where to look, 2 lights the buffer only, 3 lights nothing, 4 lets you look for as long as you like and then hides the cube.
- **Automatic ramp:** up after 3 clean scrambles, down after 2 scrambles with 3 or more errors. Choosing a level yourself pauses it.
- **Wrong letters:** a wrong letter is revealed and must be retyped.
- **Explanations:** cycle breaks, twists and flips get explained until you have 3 right of each kind.
- **Timing:** every target's time is logged, with its kind (first, normal, break, twist). The summary gives the median per kind.

### M2 / OP trainer (`/practice/m2op/`), BRIEF §7.2

| Mode | What it drills |
|---|---|
| OP corners, OP edges, M2 edges | one case per target (21, 22, 22); filter by the face the target is on |
| M2 special cases | UF, FU, DB, BD in both positions (8 cases); odd steps say which alg to shoot them with |
| Full scramble: OP / M2 edges, OP corners | a whole solve from the engine's solver, step by step, parity included |
| Why is this setup illegal? | every forbidden move family and tempting M2 shortcut, played on the cube with the damaged pieces lit, and the legal setup |

- **Each step:** recall the setup, reveal the setup, swap and undo on the cube (animated once, R to replay), then mark yourself with J or F.
- **Order:** every case once, weakest first, random, or due for review, from FSRS schedules rebuilt from your history.
- **Mastery:** shown per case. A case is mastered at FSRS recall probability ≥ 0.9 with at least 3 successful reviews.
- **Sighted mode:** half tempo, and no autoplay.

### Letter-pair library (`/practice/pairs/`), BRIEF §7.4

- **Library:** the 24 × 24 grid, first letter down the side. Arrow keys move and Enter opens a pair. On a phone it becomes a letter picker and a list.
  - Each cell shows its main word, a mastery strip, and a mark: a ring for due, a dot for new, a square for mastered.
  - The editor holds images (main first, with use counts), notes and category.
  - "Did you mean" is offered from your own words.
- **Review:** today's due pairs.
- **Drill:** pair → image, image → pair (any pair using the word is right), rapid fire (2, 3 or 5 s), and listen (the browser reads the pair). Pairs are weighted by weakness × how often they occur for your buffers.
- **Find a word:** pairs with no word first. Each word you find is logged as a `pairs.discovered` event, never as a drill attempt.
- **Library health:**
  - gaps, most seen in your traces first;
  - placeholders;
  - unedited ties;
  - words shared between pairs;
  - spelling variants;
  - pairs outside your scheme.
- **Memo sentence:** a traced memo shown as your images, to turn into a sentence. What you type isn't saved.
- **Import and export:**
  - find and replace (renaming into an existing word merges the two);
  - a category for the matching pairs;
  - CSV export and add-only CSV import;
  - a link to the full JSON backup.

Home now shows how many letter pairs are due.

## What's checked automatically

- **`packages/srs`:** FSRS replay is deterministic; right answers are rated Good and wrong ones Again; the mastery rule; due ordering.
- **`trainers/guided-trace.test.ts`:** the ramp rules, explanation counts and summaries. The "where to look" logic is tested against the cube on 300 random scrambles (Phase 3).
- **`trainers/m2op-cases.test.ts`:**
  - every case's moves are the dataset record's;
  - the odd-step rule (UF→DB, DB→UF, FU→BD, BD→FU);
  - each case's letter comes from the scheme;
  - **80 full scrambles:** each drill solves the scramble, each step starts where the last ended, every step's case id exists, and odd special steps use the special-case alg.
- **`trainers/pairs.test.ts`:**
  - the 576-cell letter set;
  - seen-pair counts from trace logs;
  - expected occurrence from the engine's report;
  - every health list;
  - did you mean;
  - image → pair answers;
  - edits keep placeholders last and stay valid;
  - merges keep uses and legacy rows;
  - find and replace is literal and ignores case;
  - CSV round trip with quoting and formula guard;
  - bad CSV lines;
  - add-only merging;
  - drill weights and recency;
  - memo sentences match the trace.
- **`packages/storage`:** the discovery event round-trips and is validated.

Totals at the end of the run: engine 449, storage 32 (+1 skipped), srs 5, web 66. Typecheck, lint and the static build are clean.

## Checked in the browser

- **Guided trace:** a full scramble to its summary.
- **M2/OP trainer:**
  - reveal and grade in OP corners;
  - the 8 special cases in coverage order, with the right odd/even algs;
  - the first 14 of the 32 illegal-setup examples: all 3 OP corner families, all 8 OP edge families, and the first 3 M2 shortcuts;
  - the face filter on OP edges;
  - a full M2/OP scramble (19 steps, parity included) and moving on to the next scramble.
- **Letter-pair library** (on made-up pairs imported through CSV, never your data):
  - grid keyboard navigation and the editor (make main, did you mean, add, save);
  - pair → image, image → pair, and rapid fire's time-out. Listen wasn't checked, because the test browser has no audio I can hear.
  - find a word, health and memo sentence;
  - find and replace.
- **Phone width:** no horizontal scroll at 380px on any library tab or on the M2/OP trainer.

## What needs you

1. **Drill for a week.** That's the checkpoint. The things most likely to feel wrong in use:
   - the guided-trace ramp thresholds (3 clean up, 2 bad down);
   - whether rapid fire's default of 3 s is right;
   - whether one FSRS schedule per pair across all drill modes suits you.
2. **"Did you mean" is half of what you asked for.** It uses your own words, not a dictionary (see OVERNIGHT). Tell me if you want a dictionary anyway.
3. **Import your real library** and look at library health. The tie list uses "never edited since import" as its rule, so check it matches the 76 pairs the import report flagged.
4. **The illegal-setup explanations** are built from dataset fields, but the wording is mine.
5. **Every decision I made without you** is in `docs/OVERNIGHT.md` under "Phase 4: trainers", each with how hard it is to reverse.

## Known limits

- **Scrambles:** guided trace, memo sentences and full-scramble drills use random-move scrambles, not random-state ones. The solver-backed provider needs its web worker checked under the static CSP (Phase 8).
- **Buffers:** trainers use the D-022 buffers. Choosing your own is Phase 5's custom schemes.
- **Expected occurrence:** it exists only for buffer pairs the engine's frequency report covers (UBL/UR and UFR/UF).
- **Script size:** the Practice hub, which has no trainer code, loads about 1.2 MB of script, so most of that is the shared shell. I haven't traced which package it is. It's worth a look in Phase 8's performance pass.
