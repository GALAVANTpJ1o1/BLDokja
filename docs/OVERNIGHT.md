# Overnight log, 2026-09-15 → 16

Decisions made while you were asleep that you weren't asked about. Each entry says what I picked, why, and how hard it would be to reverse. Lesson notes (Phase 3) flag anything I'm unsure reads well.

## Decisions

### Order step 2: "Gate B: record my buffer choices, regenerate milestone 8's datasets"

- **Choice:** what step 2 needed, given that Gate B was already recorded (D-022, 2026-09-14) and datasets for it were committed in milestones 8–11.
- **Picked:** no new decision entry. I ran `pnpm engine:generate`, which wrote no changes, and `--check` confirmed every committed file equals a fresh generation. You kept D-022 as it is on 2026-09-15.
- **Why:** re-recording would duplicate D-022, and regenerating produced byte-identical files.
- **Reversal:** nothing to reverse.

### Branches

- **Choice:** where Phase 2–4 work lives.
- **Picked:**
  - `phase-2/app-shell` branches off `phase-1/cube-engine`;
  - `phase-3/lessons` branches off Phase 2;
  - `phase-4/trainers` branches off Phase 3;
  - each is pushed as it goes, with no PRs and nothing merged to master.
- **Why:** each phase gets reviewed separately and stacks on the one before it.
- **Reversal:** easy; the branches can be merged or rebased in any order you like.

### Storage: additions to MIGRATION.md's illustrative schema

- **Choice:** what schema v1 holds beyond MIGRATION.md §3.
- **Picked:**
  - an optional `settings` block in the export (theme, palette, voice, last backup, persistent-storage status);
  - `drill.attempt` and `lesson.*` event types in v1;
  - a strict import-report schema.
- **Why:** Phases 3–4 need to log lesson progress and drill attempts, and a backup should restore preferences. Adding them now avoids a v2 migration before any real data exists.
- **Reversal:** easy until your real import happens. Afterwards, removing a field would need a v2 migration.

### Storage: Dexie transactions buffer writes (D-029)

- **Choice:** how IndexedDB transactions work.
- **Picked:** each transaction reads through to IndexedDB, buffers its writes, and commits them in one IndexedDB transaction at the end.
- **Why:** Dexie's ambient transactions committed early in tests (`PrematureCommitError`) when a nested operation followed a plain await.
- **Reversal:** moderate. It's contained in `dexie-backend.ts`, and the storage tests pin the behaviour.

### Legacy DB dry run (authorized: read-only)

- **Choice:** none. This is a record of what ran.
- **Ran:** `pnpm import:legacy --db ../LetterPairTrainer/letterpairs.db --dry-run` and the `LEGACY_DB_PATH` test.
  - Both read the file's bytes only. No files were written.
  - The SHA-256 was `4622dd92…51d5` before and after, the same as the audit.
  - Every golden number matched (D-029).
- **Reversal:** nothing to reverse. The real import into the app is still yours to run and confirm.
