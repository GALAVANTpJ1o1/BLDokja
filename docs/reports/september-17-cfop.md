# CFOP engine handoff — September 17

The user stopped Claude and explicitly authorized continuing its pending CFOP work. Existing edits were preserved and extended, not reset.

## Completed foundation

- Six generated, computationally verified datasets: 57 OLL, 21 PLL, 3 EO, 7 CO, 2 corner-permutation and 4 final edge-permutation cases.
- Boundary schemas reject impossible twist/flip sums, duplicate permutation pieces and incompatible parity.
- Verification binds each ID to its independently enumerated canonical case, checks algorithm metadata, preserves F2L and requires the fixed centre frame for shipped dataset algorithms.
- Stage goals permit legitimate last-layer permutation changes during orientation; they do not weaken existing blindfold algorithm verification.
- Case matching returns the viewing-frame correction and physical pre/post AUFs. Tests apply these paths, rather than treating recognition alone as proof of execution correctness.
- Existing four even-corner cases were not inherently incomplete with independent AUFs: exhaustive checks cover all 288 legal permutation states. They were redundant recognition classes. The new two-class catalogue is the simpler choice; see D046.
- Two research scratch scripts were moved intact to ignored `.artifacts/cfop-handoff/`. They remain recoverable and are not production code.

## Verification

- `pnpm test`: 744 passing, one existing skip; engine 547, web 143, storage 39, analytics 10, SRS 5.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`: passed.
- `pnpm cfop:generate --check`: all six datasets match fresh generation.
- Exhaustive executable-path checks cover 216 legal orientation configurations, all 288 legal PLL/corner-permutation states, and 12 final edge-permutation states. Dataset tests independently rebuild cases from stored fields and apply algorithms.
- Static export: 59 pages, 504 offline files, cache `bldokja-de8d9c2feae3e231`.

## Not completed or claimed

CFOP lessons, UI and recognition/recall drills are next. Solver-generated algorithms can be long and awkward; they are provisional engine fixtures, not ergonomic teaching defaults. Internal case IDs are not conventional OLL/PLL numbering. New CFOP browser flows do not yet exist, so the earlier 77 passing browser checks must not be described as CFOP UI evidence. Mobile Lighthouse, physical-cube checks and physical Safari typography remain open.
