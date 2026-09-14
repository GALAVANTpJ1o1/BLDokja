# Phase 1 checkpoint: cube engine

Prepared 2026-09-16 at the end of milestone 14, for your review. BRIEF §14's checkpoint is **"all golden fixtures pass; alg dataset verified"**. CLAUDE.md's phase line stays at Phase 1 until you confirm.

## Status against the checkpoint

| Check | Command | Result |
|---|---|---|
| Fast engine suite, including all 54 golden trace fixtures | `pnpm test:engine` | 45 files, 447 tests, all pass |
| Slow suite: 20,000-run solver properties, cubing.js scrambles, dataset rebuilds | `pnpm test:engine:slow` | 6 files, 10 tests, all pass (42 s) |
| Committed datasets equal a fresh deterministic generation | `pnpm engine:generate --check` | all match (31 s) |
| Types and lint | `pnpm typecheck && pnpm lint` | clean |

**Alg datasets, every record verified** (`content/algs/3x3/`, Gate B buffers, D-022):

| Dataset | Records |
|---|---|
| `3style-corners.UFR` | 378 comms |
| `3style-edges.UF` | 440 comms |
| `3style-twists.UFR` / `3style-flips.UF` | 14 / 11 |
| `3style-parity.UFR-UF`, `m2-3style-parity.UFR-DF` | parity alg + tails each |
| `op-corners.UBL` / `op-edges.UR` | 21 / 22 setups |
| `op-parity.UBL-UR` | 1 |
| `m2-edges.DF` | 22 (18 setups, 4 special cases) |
| `m2op-parity.UBL-DF` | 1 |

## What Phase 1 delivered

Milestone by milestone, with the decision record for each:

1. Workspace, strict TypeScript, Vitest, purity lint (D-001 to D-005).
2. Sticker geometry, the derived sticker map, the root-of-trust test, move tables, the seeded PRNG and random states (D-006 to D-008).
3. Piece types, names, schemes and Speffz (D-009 to D-011).
4. Tracing with the oracle, golden fixtures and the spot-check sheet (D-012, D-014).
5. The 552/576 finding, **Gate A** (D-013, D-015).
6. Commutator notation, expansion, metrics and validation (D-016 to D-018).
7. Comm search and swap/setup search; the buffer report, **Gate B** (D-019 to D-022).
8. 3-style datasets, twists and flips (D-023).
9. Old Pochmann datasets, the OP/OP solver and parity (D-024).
10. M2 special cases, the odd/even rule, and the M2/OP solver (D-025).
11. 3-style parity and the 3-style solvers (D-026).
12. Scramble providers, constrained generation, drill scrambles (D-027).
13. Selection strategies and the recency guard (D-028).
14. `docs/ENGINE.md`, this summary.

## What needs you

1. **Physical spot check.** Work through `docs/fixtures/SPOT-CHECK.md` on a real cube. Ten scrambles, each with a colour net and memo. It's the one check a computer can't do for you.
2. **Confirm Phase 1** so the phase line in CLAUDE.md can move. Tonight's Phase 2–4 work sits on its own branches and changes nothing in the engine's verified output.

## Known limits, all deliberate

- **3-style datasets only for UFR/UF.** Other 3-style buffers can be searched at run time (about 15 s for edges); no runtime 3-style system is built yet.
- **OP and M2 systems for other buffers.** `opSystem` and `m2OpSystem` build and verify them in memory for any buffer a symmetry maps onto the committed ones.
- **4x4x4 needs an explicit frame.** It traces in a fixed frame (`asIs`); choosing an orientation reference belongs to the 4BLD phase (D-014).
- **r2 wings and U2 centres are not built.** They're listed in BRIEF §5.4, but they weren't in the approved Phase 1 milestone list; the 4BLD phase (7) builds them. The engine's piece types, tracing and comm validation already cover wings and x-centres.
