# Decisions

Short records of choices that would be expensive to reverse, or where sources disagreed. Newest entries go at the bottom. Each has a status: **accepted**, **draft** (waiting for your review), or **superseded** (with a link to its replacement).

---

## D-001 · cube-engine is a pnpm workspace package

**Status:** accepted (Phase 1 plan review, 2026-09-13)

- **Context.** BRIEF §4 allows `/packages` or `/src/lib`. The engine must run in bare Node with no browser globals (CLAUDE.md).
- **Decision.**
  - The engine lives in `packages/cube-engine`, named `@bld/cube-engine`, inside a pnpm workspace.
  - The Next.js app joins at the repo root in Phase 2.
  - Storage can still live in `/src/lib/storage`, as MIGRATION.md assumes.
- **Consequences.** Purity is enforced three ways:
  - `tsconfig.build.json` compiles `src/` with `lib: ES2023` and `types: []`, so a DOM or Node global is a compile error.
  - ESLint forbids UI, storage, rendering and Node imports in `src/`, and browser globals.
  - `test/purity.test.ts` imports the public API in Node and scans `src/` for forbidden imports.

## D-002 · The cubing.js package is `cubing`, not `@cubing/*`

**Status:** accepted

- **Context.** BRIEF §3 names `@cubing/kpuzzle`, `@cubing/alg` and `@cubing/scramble`. Both `@cubing/kpuzzle` and `@cubing/alg` return 404 on npm (checked 2026-09-13).
- **Decision.** Use `cubing@0.63.4`, pinned exactly, through its subpath exports: `cubing/alg`, `cubing/kpuzzle`, `cubing/puzzles`, `cubing/search` and `cubing/scramble`. `cubing/twisty` belongs to the UI and is forbidden in the engine.
- **Consequences.** The package needs Node ≥ 22.3 (declared in `engines`).

## D-003 · TypeScript is pinned to 6.0.3

**Status:** accepted

- **Context.**
  - `typescript@latest` is 7.0.2.
  - typescript-eslint 8.70.0 declares `typescript >=4.8.4 <6.1.0`.
  - CLAUDE.md requires strict TypeScript with no `any` and no non-null assertions, which is best enforced by typed lint rules.
- **Decision.** Pin `typescript@6.0.3` and use `typescript-eslint` `strictTypeChecked`. Move to TypeScript 7 once typescript-eslint supports it.

## D-004 · zod 4.5.4 instead of 4.6.4

**Status:** accepted

- **Context.**
  - pnpm 12's supply-chain policy (`minimumReleaseAge`) rejected `zod@4.6.4`, which was published a few hours before install.
  - pnpm offered to add an exclusion for it automatically.
- **Decision.**
  - Keep the policy intact: no exclusion.
  - Use `zod@4.5.4` (published 2026-08-29), and pin all dependencies exactly.
- **Consequences.** Upgrades wait until a release has aged past the policy window.

## D-005 · ESLint 10 flat config, and esbuild's install script is allowed

**Status:** accepted

- **ESLint.** One root `eslint.config.js` covers every package.
- **esbuild.** `tsx` depends on esbuild, whose install script only checks its platform binary. It is the single entry under `allowBuilds` in `pnpm-workspace.yaml`.

## D-006 · Sticker positions are derived, never hand-tabulated

**Status:** accepted

- **Context.** Every letter, buffer and algorithm ultimately says "this sticker moves to that slot". A single mistake in a hand-written sticker table would silently corrupt everything built on top of it.
- **Decision.**
  - `src/core/geometry.ts` models an N×N×N cube from first principles: stickers are integer points, and a move rotates the stickers in some layers by a quarter turn.
    - Axes are right-handed: +x = R, +y = U, +z = F.
    - The only convention it takes as input is WCA Regulation 12a: a face turn is clockwise as seen looking at that face.
  - `src/core/sticker-map.ts` matches this model to cubing.js's kpuzzle definitions computationally.
    - Each kpuzzle position is identified with the cubie whose set of layer memberships matches the set of layer moves that disturb the position.
    - Orientation labels are found by propagating the move definitions outward from one seed position.
- **Verification** (`test/core/root-of-trust.test.ts`). For 3x3x3 and 4x4x4, both implementations must agree on every sticker for:
  - every verified move family (face turns, inner slices, M/E/S, wide moves, lowercase moves and rotations), each with the suffixes `""`, `2` and `'`;
  - 150 random sequences, compared as transformations, and as patterns compared by colour.
  - A deliberately broken definition (U replaced by U') is detected.
- **Consequences.** Engine code only generates moves from `VERIFIED_MOVE_FAMILIES`. A new move family must be added there first, which puts it under the same check.

## D-007 · Lowercase face letters mean wide turns; inner slices are written `2R`

**Status:** accepted, as a finding to carry into the 4x4 milestone

- **Finding.** In cubing.js, `r` means `Rw` (two layers) on both 3x3x3 and 4x4x4. The root-of-trust test confirms this against the geometry model. The inner slice alone is `2R`.
- **Why it matters.** Much r2-method literature writes the inner-slice half turn as `r2`. Read with cubing.js's notation, that string would be a wide turn instead.
- **Decision.**
  - Engine data never uses lowercase to mean an inner slice.
  - When the r2 method is built, its swap move is written `2R2`.
  - Text that quotes r2 notation must be converted explicitly. The converter will be tested against the geometry model.

## D-008 · Whole-cube rotations and parity

**Status:** accepted (finding)

- **4x4x4.** All 24 rotations are even permutations of corners, wings and x-centers (labelled model), as computed in `test/core/rotations.test.ts`.
  - So the parity of a 4x4 state doesn't depend on which orientation reference the solver chooses.
  - Choosing a reference only has to pick a rotation. This is the commitment in the Phase 1 plan.
- **3x3x3.** Rotations are always even on corners. 12 of the 24 rotations are odd on edges, and in every one of those they are odd on centers too.
  - This is harmless, because 3x3 tracing first rotates the cube so its centers are solved.
  - It does mean "corner parity equals edge parity" only holds for states with solved centers. A scramble that ends in a rotation has to be normalised before any parity claim is made.
