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
