# Phase 2 checkpoint: design, shell, cube component, storage, import

Built overnight 2026-09-16 on `phase-2/app-shell`, for your review. BRIEF §14's checkpoint is **"I review the visual direction"**.

## How to look at it

```
pnpm install
pnpm dev                      # builds the packages, then http://localhost:3000
```

- `/lab`: every token, palette, type role, letter tile, control, a 3D cube with a comm lit (UFR buffer, UBR → UBL), and a net.
- `/settings`: theme, sticker palette, lesson voice; backup export, import with preview, delete all.
- Resize to 380px: the rail becomes a bottom bar.
- `pnpm --filter @bld/web build` then serve `apps/web/out` to see the static site with its CSP.

## What's in it

| Part | Where | Decision |
|---|---|---|
| Design tokens, palettes, type, layout, motion, review against the brief's tells | `docs/DESIGN.md`, `apps/web/src/styles/tokens.css` | your 2026-09-15 answers |
| Storage port, IndexedDB and memory backends, schema v1, export/import | `packages/storage` | D-029 |
| Legacy importer and CLI (dry run on your real file matched every audited number) | `packages/storage/src/legacy` | D-029 |
| Web app: shell, settings, data tools, CSP, flags, i18n | `apps/web` | D-030 |
| Cube component: PG3D, palette colours, engine masks, text description, net fallback | `apps/web/src/components/cube` | D-030 |
| Slot highlights to player masks, tested against the player's geometry | `packages/cube-engine/src/display` | D-030 |

## Checks

- `pnpm test`: engine 449, storage 30 (+1 real-file test, skipped without `LEGACY_DB_PATH`), web 7. All pass.
- `pnpm typecheck`, `pnpm lint`: clean.
- **Browser, by hand:**
  - the cube renders, and masks and palettes apply;
  - there are no console errors on `/settings` or `/lab`;
  - the static build loads under its CSP with no violations;
  - the phone layout works at 380px.

## What needs you

1. **The visual direction.** Does `/lab` look like this site and not "a dark dashboard"? DESIGN.md's last section asks the same.
2. **Your real import.** It isn't done. When you want it:
   1. `pnpm import:legacy --db ../LetterPairTrainer/letterpairs.db --out <somewhere outside the repo>/letterpairs.export.json`;
   2. then Settings → Import a backup.
3. **Decisions made overnight** are in `docs/OVERNIGHT.md`.
