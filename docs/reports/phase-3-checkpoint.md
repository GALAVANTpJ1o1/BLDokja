# Phase 3 checkpoint: the beginner path, lessons 1–15

Written overnight 2026-09-16 on `phase-3/lessons` (stacked on Phase 2). BRIEF §14's checkpoint is **"I read through the beginner path"**.

## How to read it

```
pnpm dev     # then http://localhost:3000/learn/
```

On your first lesson visit a window asks which voice you want. Lessons 1–3 exist in all four voices; switch between them in each lesson's header. Lessons 4–15 are plain for now: your pilot plan was to tune the voices on 1–3 first.

## The path

| # | Lesson | Interactive parts | Checkpoint |
|---|---|---|---|
| 1 | What blindfolded solving actually is | scrambled cube, one OP shot | quiz |
| 2 | Pieces, stickers, and why we talk about stickers | lit corner, sticker and edge | quiz |
| 3 | Notation, including slices and wide moves | three move explorers | quiz |
| 4 | The Speffz lettering scheme | clickable lettered net | 10 generated letter items |
| 5 | Buffers and the idea of shooting | OP shot | quiz |
| 6 | Tracing a cycle | worked trace, two guided traces | 5 generated traces, no breaks |
| 7 | Cycle breaks | worked trace, two guided traces | 5 generated traces with a break |
| 8 | Flipped edges and twisted corners | worked trace, guided trace | 4 generated traces with a twist |
| 9 | Letter pairs and images | two worked traces | quiz |
| 10 | Memory palaces | worked trace | quiz |
| 11 | Order, review, what to memorise first | two worked traces | quiz |
| 12 | Old Pochmann corners | three OP shots, an illegal setup | 6 setups, graded by what they do |
| 13 | Old Pochmann edges | four OP shots, an illegal setup | 6 setups, graded by what they do |
| 14 | Parity | the parity alg, a worked trace | 8 generated parity questions |
| 15 | Your first full solve | an 11-step guided OP solve | 4 generated full traces |

## What's checked automatically

`apps/web/src/content/lessons/lessons.test.ts` checks every lesson:

- the frontmatter schema;
- the prerequisite graph;
- 5–8 minutes, and a recap at the start;
- every lesson has something interactive;
- no JavaScript in lesson files;
- identical components and props in every voice;
- checkpoint ids;
- British spelling;
- every alg, sticker, OP target and forbidden-move example against the engine and verified datasets;
- every guided-trace scramble has the feature its lesson claims (no breaks, a break, a twist).

The trace "where to look" logic is tested against the cube on 300 random scrambles.

## What needs you

1. **Read the path.** `docs/OVERNIGHT.md` has one line per lesson naming what I was least sure reads well. **Lesson 11's memo-order advice is the one I most want you to check.**
2. **Tune the three pilot voices** on lessons 1–3 before the others are written.
3. **A real-cube pass on lessons 6–8 and 12–13.**
