# Checkpoint: the open items (lessons 16–23, mobile performance, older decisions)

Written 2026-09-16 on `4bld/complete`, alongside the Phase 7 checkpoint. It covers items 3 and 5 of the Phase 8
checkpoint's "What needs you": mobile Lighthouse, and the older open items (lessons 16–23, lessons keeping the
standard buffers, D-031 and Gate B, the analytics weights, legacy memo attempts). Nothing is merged or deployed.

## How to try it

```
pnpm build
npx serve apps/web/out -l 3200     # then http://localhost:3200/
```

## Lessons 16–23 (3BLD)

16. M2 edges: the idea
17. M2 edges: every special case
18. Accuracy: why solves fail, and how to find out
19. Cutting memo time
20. Commutators: the [A, B] shape
21. 3-style corners
22. 3-style edges
23. Building your own comms and choosing between them

- **Plain voice only,** like lessons 4–15.
- **New interactive pieces:**
  - an M2 shot, and a tempting M2 setup with its damage;
  - a commutator done part by part (A, B, A undone, B undone, with a setup where there is one);
  - a 3-style case solved by its verified comm;
  - what an Old Pochmann solve with one mistake leaves on the cube.
- **New checkpoints,** all generated and graded by what an answer does:
  - M2 setups (any setup that works);
  - M2 special cases in both positions;
  - writing a comm out (any form that cancels to the same moves);
  - recognising a 3-style case (trace its two letters);
  - building a comm (anything `validateComm` accepts);
  - diagnosing a failed solve.
- **Links:** the M2/OP trainer's M2 modes now link to lessons 16 and 17, and the 3-style trainer to lessons 21
  and 22.

## The older decisions

| Item | What I did |
|---|---|
| Lessons keep the standard buffers | Kept. The prose teaches one buffer's swap spot and setup rule; the 4BLD lessons work the same way. |
| D-031's implication for Gate B | Recorded in D-022: every buffer has the same comm lengths, so UFR/UF stay on convention and on what the lessons teach, not on comm length. |
| Analytics weights and thresholds | Kept. There's still no real drilling history to tune them against. |
| Legacy memo attempts | Still not counted per pair; now shown on Progress as their own section, with a table of every attempt. |

## Mobile performance

Lighthouse 12.8.2, mobile preset (simulated slow 4G, 4× CPU), median of three runs, against the built site on a
local static server. "Before" is the Phase 8 audit. "After" was measured before the last three fixes in the
final commit: trainer loaders now render the same header the trainer does, the 4BLD trace note is shorter,
and Settings loads storage on demand. A re-measure of the final build is in progress, and this table will be
updated with it.

| Route | Before | After | What limits it now |
|---|---|---|---|
| `/` | 92 | 93 | framework script before paint |
| `/learn/` | 91 | 92 | framework script before paint |
| `/learn/<lesson>/` (M2 edges) | 72 | 92 | hydration of lesson components |
| `/learn/<4BLD lesson>/` | — | 91 | hydration of lesson components |
| `/practice/` | 95 | 96 | — |
| `/practice/trace/` | 89 | 91 | trainer start-up |
| `/practice/m2op/` | 87 | 89 | header painted twice (fixed after this run) |
| `/practice/pairs/` | 91 | 86 | header painted twice (fixed after this run) |
| `/practice/3style/` | 82 | 76 | header painted twice (fixed after this run); building every case; this run overlapped a typecheck |
| `/practice/4bld/` | — | 73 | a longer note painted after load (fixed after this run) |
| `/progress/` | 89 | 92 | building the views |
| `/settings/` | 92 | 92 | storage in the first load (fixed after this run) |

**Layout shift is 0 on every route** (lessons were 0.10). Desktop and accessibility weren't re-measured; nothing
in these changes touches either.

**What changed** (D-042):

- **Lessons:** interactive components load lazily, so their code arrives after first paint while the server HTML
  stays the same.
- **Light modules:** the lesson view uses a light reader context and `@bld/storage/options`, keeping the cube
  engine and Zod out of lesson pages' first load.
- **Home and Settings:** home computes "Today" in its own chunk; Settings loads storage and backup code when it
  needs them.
- **Datasets** parse on first read.
- **3D cubes** are built only near the viewport.
- **Theme boot script:** inlined and allowed by hash.
- **Fonts:** fallback fonts carry Recursive's measured metrics, so text doesn't re-wrap when the real font
  arrives.
- **Prerequisites line:** fixed size.

**A bug found on the way:** the CSP step hashed inline scripts with Windows line endings. Browsers hash LF
text, so the inlined boot script was blocked by the site's own policy on a Windows checkout. Both ends now
normalise line endings, checked in the browser.

## What's checked automatically

- **New tests for this work:**
  - lesson items: M2 setups and special cases, expansions, case recognition, built comms, mistake signatures;
  - `effects`: setups graded by what they do;
  - lesson 16–23 claims: M2 setup rules, special cases, mistake signatures, commutator structure, and the
    378 and 440 case counts;
  - legacy memo summaries;
  - labels for 4BLD case ids.
- **Every lesson component prop** in lessons 16–23 is checked against the datasets and engine, including that
  every `<CommParts>` comm cycles exactly three pieces and every `<SolveMistake>` scramble can show its
  mistake.

**Totals:** engine 514, storage 36 (+1 skipped), srs 5, analytics 10, web 123. Typecheck, lint and the static
build (51 pages, CSP hashes on every inline script) are clean.

## Checked in the browser

- **Lesson 18:** each mistake demo lights its signature (4 pieces for parity, 3 for the order of two targets).
- **Lesson 20:** the commutator stepper goes through all its parts and ends on "three pieces have swapped
  round", and the checkpoint asks for a written-out comm.
- **Performance changes:**
  - the built lesson HTML still contains every lazy component's server output (checkpoint headings, cube
    placeholders);
  - the inlined theme script runs under the CSP (its hash is in the policy, and no violation is logged);
  - layout shift on a lesson is 0.

## What needs you

1. **Merging.** Everything is on `4bld/complete`; nothing is on `master`.
2. **Deploying,** when you want it: `docs/DEPLOY.md` is unchanged.
3. **Voices for lessons 16–23 and the 4BLD track,** if you want the other three voices there too. Lessons 1–3
   have them; the rest are plain.

## Known limits

- **Lesson components load during hydration** even when far down the page; a component's code arrives before
  you scroll to it.
- **The 3-style trainer** is still the heaviest page to start: it builds and draws every case for your buffer.
- **Mobile numbers are Lighthouse's simulated slow 4G,** measured on one machine; there are no field
  measurements by design.
