# Phase 6 checkpoint: analytics

Written 2026-09-16 on `phase-6/analytics`, stacked on `phase-5/tools`. BRIEF §14 gives Phase 6 no review gate ("—"), so Phase 7 follows without stopping. Nothing is merged to `master`.

## How to try it

```
pnpm dev     # then http://localhost:3000/progress/
```

- **New:** the Progress page, Weak 20 (`/practice/weak/`, also linked from home and Practice), and a session report under every trainer.
- **Your data:** a fresh browser has no history, so every view starts in its "not enough data yet" state. Drill for a few days, or restore a backup, to see the charts fill in.

## What BRIEF §8 asked for, and where it is

| BRIEF §8 | Where |
|---|---|
| Event log with case, strategy, correctness, response time, timestamp, settings snapshot | Every `drill.attempt` since Phase 4 has the first five. The snapshot is new: it's added where events are written, so every trainer gets it. |
| Letter-pair heatmap | Progress → letter pairs: 24 × 24, fill = recall speed, inner border = accuracy |
| 3-style mastery grid | Progress → 3-style, corners or edges, for your buffer, same encoding |
| Trace diagnostics | Progress, first chart: median time and accuracy per lookup kind (first target, normal, cycle break, flip or twist) |
| Trend over time | Progress → trends: accuracy and median time per trainer, 7-day rolling, with a "not enough data yet" state |
| Weak 20 | Progress, home, and the drill itself at `/practice/weak/` |
| Session summary after every drill | Under guided trace, M2/OP, 3-style (recall mode) and the pair review and drill tabs |
| Export as JSON, delete all my data | Already in Settings since Phase 2; Progress links to it |

## The pieces

### `@bld/analytics` (new package)

Pure functions over the event log, with no React and no storage. Nothing derived is stored, so export, import and delete can never leave stale numbers.

- `traceDiagnostics`: median and accuracy per lookup kind, with `enough` at 5 targets.
- `heatCells`: per case, speed as a step of five relative to your other cases in the view, and accuracy in three bands (90%+, 70–89%, under 70%).
- `trend`: a rolling window over practice days, `enough` at 3 days and 20 attempts.
- `weakItems`: 0.5 × smoothed error rate + 0.3 × slowness within its own trainer + 0.2 × (1 − FSRS recall probability), from 2 attempts.
- `sessionSummary`: this session against each case's history, and the next steps a report can name a case for.

### Progress (`/progress/`)

- **Period:** 30 days, 90 days or all time. It scopes diagnostics, trends, the heatmap and the 3-style grid. Weak 20 always covers everything, like the deck it links to.
- **Charts:** built for the site, with no chart library.
  - One ink (`--text`), so the cube's six colours stay the only colours on screen.
  - 2px lines and hairline axes, drawn at the container's measured width.
  - A crosshair and tooltip that follow the pointer or the arrow keys.
  - **Show as a table** on every chart.
- **Heat grids:**
  - hover or focus a cell for its numbers;
  - the grid is a single Tab stop and arrow keys move between cells;
  - cells that can't occur are blank.

### Weak 20 (`/practice/weak/`)

- **Asked the way each item's own trainer asks it:**
  - a letter pair: recall the image;
  - a 3-style case: recall the comm, with its three pieces lit on the cube;
  - an M2/OP case: recall the setup;
  - a trace target: type the letter for the lit sticker.
- **Logged:** under the item's own trainer and case, with strategy `weak20`, so it feeds the same schedule.
- **Skipped:** items that no longer exist (a pair with no image, a case for a buffer you've changed), with a note and nothing logged.

### Session reports

Under each trainer, recomputed after every answer, covering the session since you opened the trainer:

- attempts, right and median;
- cases that improved or regressed against their history before the session;
- what to do next: repeat what you missed, practise a lookup kind that's clearly slower than normal targets, or speed up cases that slowed without losing accuracy. "Keep going" appears only when none of those apply.

## What's checked automatically

**Analytics** (`packages/analytics/test/analytics.test.ts`)

- Only graded drill attempts are read, oldest first.
- Medians and per-case summaries.
- Trace diagnostics per kind, and the "too few" state.
- Heat cells: speed steps with the fastest scoring highest, and the accuracy bands.
- Trends: the rolling window over practice days, and "not enough data" below 3 days or 20 attempts.
- Weak 20:
  - the exact scores for a mixed set;
  - errors outrank slowness;
  - slowness is compared within a trainer;
  - forgetting adds to the score;
  - each item gives its reasons;
  - cases under 2 attempts are ignored, and the limit holds.
- Session summary:
  - improved, regressed and first-time cases;
  - the repeat-misses suggestion, and speed-up for cases that slowed without losing accuracy;
  - the slow-lookup suggestion in guided trace;
  - "keep going" only when nothing else applies.

**Web**

- **Settings snapshot:** `settingsSnapshot` records difficulty, buffers (or `"standard"`) and the scheme id, and the result passes the event schema.
- **Case ids:** every trainer's id format parses back (including M2/OP ids with a buffer, and 3-style ids), and anything else is refused.
- **`weakDeck`:** a case you're likelier to have forgotten ranks above an otherwise identical one; each trainer's recall history stays separate; the limit holds.

**Totals:** engine 470, storage 34 (+1 skipped), srs 5, analytics 9, web 83. Typecheck, lint and the static build (31 routes, 32 pages with CSP hashes) are clean.

## Checked in the browser

These checks used about 580 synthetic attempts over 21 days, imported into the dev browser's storage only. Nothing generated is committed.

- **Progress:**
  - the summary line (attempts, days, % right) and the period filter;
  - the diagnostics bars;
  - both trend charts, with keyboard crosshair (for example "2026-09-14 · 12 attempts that day") and the table view (21 days);
  - the letter-pair heatmap and the 3-style grid: one Tab stop each, arrow keys moving across and down and skipping blanks, and the focused cell's numbers in the status line.
- **Weak 20:**
  - the deck's first item matches the top of home's and Progress's lists;
  - 3-style items show the case on the cube, and letter-pair and M2/OP items reveal and self-grade;
  - **a trace item:**
    - the synthetic set had none in its top 20, so I added six missed attempts on DF;
    - it then came first, lit DF on the net, and answered a wrong letter with "Not quite: it's U";
    - it logged under guided trace with `detail.from: "weak20"` and a settings snapshot.
  - answers are logged under their own trainers (3-style, letter pairs, trace).
  - The in-app browser's Enter key doesn't submit forms on any page here, guided trace included, so typed answers were submitted through the form directly.
- **Session report:** after three M2/OP answers it read "3 attempts, 1 right", and listed the two missed cases under "Go over what you missed".
- **Phone width:** no horizontal scroll at 380px on Progress or Weak 20. The trend charts redraw at 348px, so axis text keeps its size.

## What needs you

1. **Weights and thresholds** are first guesses, all in OVERNIGHT under "Phase 6":
   - the Weak 20 weights;
   - the heatmap's relative speed steps and accuracy bands;
   - the "not enough data" limits.
   They'll be easiest to judge against your own week of drilling.
2. **Legacy memo attempts** (the 51 from the old app) aren't counted. They have no per-pair timing, and their correctness is a whole-string score. Say if you want them inferred per pair.
3. **Still open from Phase 5:**
   - lessons keep the standard buffers;
   - D-031's implication for Gate B;
   - which phase lessons 16–23 belong to.

## Known limits

- **Old attempts:** attempts logged before Phase 6 have no settings snapshot. The log is append-only, so they can't gain one.
- **Relative speed steps:** a map where everything is slow still uses the full ramp. The tooltip and table give absolute seconds.
- **Trace items in Weak 20** ask for a sticker's letter on its own, not the lookup in the middle of a trace.
- **Sessions:** a session starts when the trainer opens, so reloading the page starts a new one.
- **Performance:** every view is recomputed from the whole log on each change. That's milliseconds at thousands of attempts; if logs get far larger, a cache or worker is Phase 8's job.
