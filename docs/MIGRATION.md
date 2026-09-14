# Migration: legacy `letterpairs.db` → versioned local schema

**Status:** approved at the Phase 0 review (2026-09-13). Nothing described here is built yet. Per [BRIEF.md](../BRIEF.md) §14, the importer and its tests are built in **Phase 2**, together with the storage layer.

- **[confirmed]** marks something you decided explicitly. Your answers are recorded in [AUDIT.md §6](AUDIT.md#6-decisions-from-the-phase-0-review).
- **[proposed]** marks something accepted as part of this plan.

Both kinds become `docs/DECISIONS.md` entries when the importer is built.

**Source of truth for the legacy side:** [AUDIT.md §4](AUDIT.md#4-the-letter-pair-database), which has the verbatim DDL, row counts and anomalies.

---

## 1. What has to survive

**All of the database**, not just the letter pairs:

| Legacy table | Rows (2026-09-13) | What it is | Goes to |
|---|---|---|---|
| `pair_words` | 678 | Your words for all 552 pairs, with use counts | `letterPairs` (§3.2), with the approved corrections (§3.6) |
| `memo_attempts` | 51 | Memo drill history, 2026-06-21 → 2026-08-05 | `events`, as legacy memo attempts (§3.3) |
| `app_settings` | 4 | Memo drill settings | `legacy.appSettings`, kept verbatim (§3.4) |
| `sqlite_sequence` | 2 | Autoincrement high-water marks (688, 51) | provenance metadata (§3.1) |

Deleted rows (10 `pair_words` IDs) aren't in the file (`freelist_count = 0`), so there is nothing to recover there.

## 2. Principles

1. **Lossless.**
   - Every source row is kept in exactly one `legacy` snapshot, with every column value verbatim, and later edits never touch it.
   - When two rows merge into one corrected word (§3.6), that word carries both snapshots. No row is ever dropped or duplicated.
   - If the snapshot count doesn't equal the source row count, the import aborts.
2. **The source is never written to.**
   - The importer reads the file into memory as bytes and closes it. SQLite never holds a handle on the original.
   - SHA-256 is checked before and after the run.
3. **No changes you haven't reviewed.**
   - Text is stored exactly as found: no trimming, re-casing, Unicode normalisation or automatic fixing.
   - **The one exception is the corrections table in §3.6, which you approved row by row.** Each entry is keyed by legacy row id and checked against the expected original word. Each is listed in the import report and can be undone, because the snapshot keeps the original.
   - Any other cleanup happens later, in the app, visibly and with undo.
4. **Fail loudly and completely.**
   - If the schema, a storage class or a count doesn't match what's expected, the import stops with a specific error.
   - It never writes a partial import.
5. **Idempotent.**
   - Deterministic IDs mean importing twice gives the same state.
   - Importing after you've edited in the new app reports conflicts instead of overwriting.
6. **Nothing invented.**
   - Legacy rows have no timestamps, recall history or SRS state, so none is fabricated.
   - Missing data stays missing.

## 3. Target shape (schema v1) [proposed]

These shapes are illustrative. The real Zod schemas get written in Phase 2 in `packages/storage/src/schema.ts`, and the TypeScript types are inferred from them.

### 3.1 Export envelope

This is the portable format. The app's JSON export and import (brief §7.4, §8) use it, and so does the legacy importer's output. **Legacy data enters the app through the same validated import path as any other file.**

```ts
type ExportV1 = {
  format: "bld-platform/export";
  schemaVersion: 1;
  exportedAt: string;                       // ISO 8601 UTC
  provenance: Provenance[];                 // append-only history of where data came from
  letterPairs: LetterPair[];
  events: AppEvent[];
  legacy?: { appSettings: LegacySetting[] };
};

type Provenance = {
  kind: "legacy-letterpairtrainer-sqlite";
  importerVersion: string;
  importedAt: string;                       // ISO 8601 UTC
  source: {
    fileName: string;                       // "letterpairs.db" — no absolute paths (they leak usernames)
    sha256: string;
    sizeBytes: number;
    ddl: Record<string, string>;            // verbatim sqlite_master.sql per table
    rowCounts: Record<string, number>;
    sqliteSequence: Record<string, number>; // { pair_words: 688, memo_attempts: 51 }
  };
  report: ImportReport;                     // §4.3 — kept so you can re-read what the import found
};
```

### 3.2 Letter pairs

```ts
type LetterPair = {
  id: string;            // `${first}${second}`, e.g. "AB"
  first: string;         // one letter
  second: string;        // one letter
  images: PairImage[];   // ordered; images[0] is the primary image
  notes?: string;
  category?: string;
  createdAt?: string;    // absent for legacy imports: the legacy DB never recorded it
  updatedAt?: string;
};

type PairImage = {
  id: string;            // legacy: "legacy:pair_words:<lowest source id>"; new: random UUID
  text: string;          // verbatim, or the approved correction from §3.6
  uses: number;          // sum of the snapshots' `count`; see AUDIT C1 for what it does and doesn't mean
  flags?: "placeholder"[];         // §3.6: "needs a word"
  legacy?: LegacyPairWordRow[];    // immutable snapshots; two or more only when rows merged
};

type LegacyPairWordRow = {
  table: "pair_words";
  id: number; pair: string; word: string; count: number;   // exactly as stored
};
```

**Decisions behind this shape:**
- **Several images per pair, primary first** [confirmed].
  - 118 pairs have alternatives, so collapsing each pair to one image would lose rows.
  - Images are ordered with placeholders last, then `uses DESC, text ASC`. That's the ordering the old pair page, memo review and API used (AUDIT C4), applied after corrections.
  - The import report flags the 76 pairs whose primary is still decided by that alphabetical tie-break (89 before corrections), so you can choose deliberately.
- **Pairs are keyed by their letters, not by stickers** [proposed].
  - A letter pair is about the letters. The library is shared by every piece type and puzzle and doesn't depend on any scheme.
  - If you edit your scheme so a letter drops out, pairs using it get marked "not in current scheme". They are never deleted.
- **Same-letter pairs** (`AA`) are allowed by the schema. The legacy data has none. Whether drills and the grid *offer* them depends on what the Phase 1 engine shows (AUDIT §5, item 1).
  - **Settled in DECISIONS D-013.** The library, grid and drills use all 576 cells. No trace produces a same-letter pair, but diagonal cells hold self-pair images for letters left alone in a memo (D-015). After the import the 24 diagonal cells are empty and show as gaps.
- **Letters are opaque strings** (one grapheme each), not restricted to A–X. That leaves room for non-Latin schemes.

### 3.3 Memo attempts become events

The brief's analytics log (§8) is append-only. Legacy attempts go in as a clearly marked event type, so analytics can include or exclude them. They're never mixed silently with new data.

```ts
type LegacyMemoAttemptEvent = {
  id: string;                         // "legacy:memo_attempts:1"
  type: "legacy.memoAttempt";
  at: string;                         // "2026-06-21T08:21:12Z": legacy created_at read as UTC (AUDIT C3)
  legacy: {
    table: "memo_attempts";
    id: number; difficulty: string;
    corners_expected: string; edges_expected: string;
    corners_answer: string;   edges_answer: string;
    correct_letters: number;  total_letters: number;
    accuracy: number;                 // IEEE-754 double; must round-trip bit-exact
    created_at: string;               // raw text, kept verbatim
  };
  derived: {
    scorer: "lcs@1";                  // versioned, so a later scorer adds a new entry instead of overwriting
    correctLetters: number;           // LCS(corners_expected, corners_answer) + LCS(edges_expected, edges_answer)
    totalLetters: number;             // same denominator as legacy total_letters
  };
};
```

- **Re-scored, with the original kept as it was** [confirmed].
  - Positional scoring under-scores 17 of the 51 attempts (AUDIT C3).
  - The importer adds an alignment-based score (longest common subsequence) under `derived`.
  - Analytics shows the derived score. The legacy numbers are never modified.
- **The timezone is explicit.** `created_at` is SQLite `CURRENT_TIMESTAMP`, which is UTC with no zone marker. The importer adds the `Z` and keeps the raw string. Reading it as local time would put every attempt 5 h 30 m off.

### 3.4 Settings

The legacy settings configure a drill the new site doesn't have (fixed-rate letter flashing), and there's no honest one-to-one mapping to the difficulty customiser in §7.7. They're **kept verbatim, including rowid**, under `legacy.appSettings` and have no effect. If a similar drill is built later, it can offer them as a preset.

```ts
type LegacySetting = { rowid: number; key: string; value: string };
```

### 3.5 SRS state

**The import creates no FSRS cards and no review history.** The legacy DB has no recall data, and making up retrievability from use counts would corrupt scheduling from the first day. Cards get created when you start reviewing (Phase 4). All pairs start as new, and that's accurate.

### 3.6 Corrections applied at import

**[confirmed]** You reviewed and approved every row below.

**How corrections work**
- Corrections are data: a committed table the importer reads, never code logic. Each entry is `{ id, pair, from, to }` or `{ id, pair, word, flag: "placeholder" }`.
- Before applying anything, the importer checks that legacy row `id` still has exactly that `pair` and `from` (or `word`). If any entry doesn't match, the whole import aborts.
- After correction, rows in the same pair with identical text merge into one image. `uses` is the sum of their counts, and the image keeps every snapshot.
- Undo is always possible. Rebuilding an image from its snapshots gives back the original rows exactly.

**Spelling**

| Pair | Legacy rows (id: word, count) | Result |
|---|---|---|
| EN | 478 english 1 · **666 engish 1** | english 2 |
| EP | 598 epstein 2 · **304 epstien 1** | epstein 3 |
| GC | 529 group chat 1 · **687 group chay 1** | group chat 2 |
| GK | 649 general knowledge 1 · **473 general knowlegde 1** | general knowledge 2 (`gk` stays a separate image) |
| NS | 58 nice shot 3 · **611 nise shot 1** | nice shot 4 |
| LV | **417 luis vuiton 1** · **637 lui vuiton 1** | louis vuitton 2 (both rows corrected) |
| EI | **260 eienstien 1** | einstein 1 |
| HM | 456 honourable mention 2 · **427 honorable mention 1** | honourable mention 3 |

**Spacing** (merged into the standard spelling)

| Pair | Legacy rows (id: word, count) | Result |
|---|---|---|
| BP | 650 blood pressure 1 · **508 bloodpressure 1** | blood pressure 2 |
| FB | 399 facebook 3 · **667 face book 1** | facebook 4 |
| FW | 626 fuck with 1 · **577 fuckwith 1** | fuck with 2 |
| HC | 286 hermitcraft 1 · **488 hermit craft 1** | hermitcraft 2 |
| HG | 441 homegirl 1 · **371 home girl 2** | homegirl 3 |
| LN | 614 light novel 1 · **16 lightnovel 1** | light novel 2 |
| MB | 313 muscleblaze 1 · **589 muscle blaze 2** | muscleblaze 3 |
| SD | 411 sdslayer 2 · **679 sd slayer 2** | sdslayer 4 (tie; you entered this form first) |
| SW | 595 seaweed 1 · **604 sea weed 1** | seaweed 2 (`star war` stays a separate image) |
| TH | 237 town hall 1 · **30 townhall 3** | town hall 4 |
| UG | 64 undergrad 1 · **308 under grad 1** | undergrad 2 |

**Placeholders** (flagged "needs a word", never the primary while a real word exists)

| Pair | Legacy row | Effect |
|---|---|---|
| EI | 353 no 1 | EI's primary is `einstein` |
| EO | 674 no 1 · 490 yes 1 | **EO has no real word** |
| IE | 234 no 2 | **IE has no real word** |

**Result**
- 20 rows corrected: 9 spelling, 11 spacing.
- 4 rows flagged as placeholders.
- 18 merges: **678 rows become 660 images across 552 pairs**, and total uses stay at **990**.
- 550 pairs have a real word; EO and IE need one.
- The primary text changes in 10 pairs (EI, EN, HC, HG, LV, MB, SD, SW, TH, UG). In every case it's the corrected spelling of the same word.
- Words shared by more than one pair drop from 13 to 12, because `no` is now a placeholder.
- These numbers were computed by applying the table to a copy of the DB, not counted by hand.

**Not decided here: new typos after the import.** The app suggests corrections and never applies them automatically (AUDIT §6). That's a library feature for Phase 4, not part of the migration.

---

## 4. The importer

### 4.1 Two stages, one pure function

```
letterpairs.db ──(read bytes)──► legacySqliteToExport(bytes): ExportV1 ──► export.json
                                          │
                                          └─► app import: Zod parse → migrate → StorageAdapter (one transaction)
```

- **Stage 1: `legacySqliteToExport(bytes: Uint8Array): Result<ExportV1, ImportError>`.**
  - A pure function in `packages/storage/src/legacy/`.
  - No filesystem, no DOM, no clock: `importedAt` is passed in, so tests are deterministic.
  - It has two thin wrappers:
    - `scripts/import-legacy-letterpairs.ts`: a CLI that takes a DB path and an output path, with `--dry-run`.
    - An optional in-app "Import from Letter Pair Trainer (.db)" action, later. Same function, no extra code path.
- **Stage 2: the app's standard import.** Zod-validate the envelope, run forward migrations to the current `schemaVersion`, then write everything through `StorageAdapter` in **one transaction**. Read it back, compare counts, then commit. Nothing Legacy-specific happens in stage 2.

**Reading SQLite: sql.js** [proposed].
- It loads the database from a `Uint8Array`, so the original file is read once as bytes and SQLite never has a handle on it. That's the strongest guarantee principle 2 can get.
- The same code runs in Vitest, the CLI and the browser, with no native build on Windows.
- The alternative was checked: `node:sqlite` works on the installed Node 24.21 without an experimental warning. But it opens a file path and is Node-only, so the browser import would need a second implementation.
- Cost: a WASM dependency of about 1 MB, loaded only by the import feature.

### 4.2 Stage 1 checks (any failure aborts)

**Schema**
1. `sqlite_master` must contain exactly the three audited tables, with DDL equal to the text verbatim in AUDIT §4.2.
   - This is compared after collapsing runs of whitespace.
   - Any other difference in the DDL means an unknown schema version, so the import stops.

**Every row**
2. Storage classes must match what's declared: every value's `typeof()` in `integer | real | text` exactly as declared.
3. No NULLs.
4. `pair` must be two characters.
5. `(pair, word)` must be unique.

**Corrections**
6. Every entry in the §3.6 table must match its legacy row's `id`, `pair` and original word exactly.

**Counts**
7. Legacy snapshots emitted must equal the source row count for each table. For `pair_words`, images must equal rows minus merges.
8. The set of snapshot IDs must equal the set of source IDs, which proves no row was skipped or doubled.

**Envelope**
9. The generated envelope must pass the same Zod schema stage 2 uses.

### 4.3 Import report

A **non-fatal** list, shown before you confirm and stored in `provenance.report`:

**Counts and totals**
- Counts per table.
- Rows versus images (678 → 660).
- Pairs covered: 552 / 552 distinct-letter pairs, of which 550 have a real word.
- Sum of uses.

**What the import changed** (from the approved §3.6 table)
- Every correction and merge, with the before and after of each.
- The 4 placeholders.
- The 2 pairs that now need a word (EO, IE).

**Things worth reviewing**
- Primaries still decided by an alphabetical tie-break (76).
- Words shared by more than one pair (12).
- Words containing digits or punctuation (these matter for TTS).

**Known gaps**
- Legacy memo attempts where the derived score differs from the stored one (17).
- Deleted-ID gaps: informational only.

Beyond the approved table, the report only **suggests**. New typo candidates, tie-breaks and shared words are handled in the app's library cleanup view, with undo.

### 4.4 Stage 2 conflicts and idempotency

IDs are deterministic (`AB`, `legacy:pair_words:32`, `legacy:memo_attempts:1`), so importing again matches existing records:

| Existing record | Incoming record | Result |
|---|---|---|
| none | legacy | insert |
| identical | identical | skip (no-op) |
| edited in the new app | legacy | **keep the edit** and list it in the conflict report |
| deleted in the new app | legacy | **stay deleted** (a tombstone), and list it in the report |

That last row needs a tombstone for deleted legacy IDs, so the Phase 2 storage layer must record deletions of legacy-derived records.

### 4.5 Running it for real (Phase 2)

1. **Check the file is still the audited version.**
   - SHA-256 the live `letterpairs.db` and compare it with AUDIT Appendix C.
   - If it has changed (you used the old app after the audit), re-run the forensics and show you the difference before going on.
2. **Dry run.**
   - `pnpm import:legacy --db <path> --out <path> --dry-run` prints the report.
   - It writes nothing.
3. **Write the export.**
   - The output goes to a path **outside the repo**.
   - Phase 2 also adds `*.export*.json` to `.gitignore`, because the file is personal data.
4. **Import in the app.**
   - The app shows the report and the counts.
   - You confirm, and only then does anything get written.
5. **Check in the UI.**
   - The grid shows 552 of its 576 cells filled with 660 words, with EO and IE flagged as needing a word. The 24 diagonal cells show as gaps (DECISIONS D-013).
   - Spot-check the sample rows from AUDIT §4.7 and a few corrected pairs from §3.6.
6. **Keep the old files.**
   - `letterpairs.db` and `letterpairs.backup-2026-09-13.db` are never deleted by any script.
   - The old app still runs, but is treated as read-only from then on.

---

## 5. Versioning and forward migrations

- **One number.** A single `SCHEMA_VERSION` integer covers both the export envelope and the IndexedDB database.
- **Every schema bump ships four things together** (Phase 2 sets up the pattern, starting at v1):
  1. a Dexie `version(n).upgrade()` for stored data;
  2. a pure `migrateExport_vN_to_vN1(e)` for export files;
  3. a committed fixture export at the *previous* version;
  4. a test that migrates the fixture forward and round-trips it.
- **Older files are fine.** Importing an older export runs the migration chain up to the current version.
- **Newer files are refused.** Importing an export from a *newer* version is rejected with "this file was made by a newer version". No partial import.
- **Stored records are validated on read** (CLAUDE.md). A record that fails goes to a `quarantine` store together with its validation error, and the UI shows it. It's never dropped.

## 6. Round-trip test plan

This lives in Vitest in `packages/storage/test/legacy-import.test.ts` and runs in `pnpm test`.

### 6.1 Fixtures

**A. The synthetic legacy DB, committed as code rather than a binary.**
- A builder creates it in memory with sql.js, from the verbatim legacy DDL.
- It's deterministic, and it's seeded with every anomaly class the audit found, plus a few the new app has to survive anyway:

**Pair and word shapes**
- A pair with one word; a pair with four words tied on count; a pair with a clear top word.
- One word shared by three pairs.

**Corrections** (the synthetic fixture has its own small table, in the §3.6 format)
- A typo that merges into an existing correct spelling (`engish` → `english`).
- A spacing variant that merges, where the less-used form wins (`townhall` 3 → `town hall`).
- Two misspelled rows that merge into a spelling neither of them had (`lui vuiton` + `luis vuiton`).
- A correction with nothing to merge into (`eienstien` → `einstein`).
- A pair with only a placeholder, and a pair with two placeholders.
- A table entry whose `from` doesn't match its row, which must abort the import.
- Words with digits or punctuation (`wd40`, `k-on`, `4`).
- A 1-character word and an 80-character word.

**Text the importer must not change**
- Multi-word text.
- Non-ASCII and emoji. Your data has none, but the old app would have accepted them.
- Markup-like text (`<b>x</b>`, `"quotes"`), to prove the text survives verbatim. Rendering safety is a separate UI test.

**IDs and sequences**
- Deleted-ID gaps, with `sqlite_sequence` set above `MAX(id)`.
- `app_settings` rows with non-consecutive rowids.

**Memo attempts**
- An `easy` attempt containing repeated letters.
- An attempt whose `accuracy` is a long repeating double (`0.42857142857142855`).
- An attempt that is under-scored.

**B. The real DB, local only.**
- It's used only when `LEGACY_DB_PATH` is set; otherwise the test is **skipped** with a visible message.
- Beyond the synthetic suite, it also asserts the golden numbers from AUDIT and §3.6:
  - 678 rows → 660 images, 552 pairs, 990 uses
  - 51 memo attempts, 4 settings
  - source SHA-256
  - 20 corrections and 18 merges
  - 550 pairs with a real word
  - 76 tie-break primaries
  - 12 shared words
- It's never copied into the repo.

### 6.2 Assertions

Each test runs against both fixtures.

| # | Test | Passes when |
|---|---|---|
| 1 | **Count parity** | Legacy snapshots out equal rows in, for each table; images equal rows minus merges |
| 2 | **Identity bijection** | The set of snapshot IDs in the export equals the set of source IDs, with no duplicates |
| 3 | **Value fidelity** | For every source row and column, the snapshot value `Object.is`-equals the SQLite value, and its JS type matches the storage class (`integer` → `Number.isInteger`, `real` → finite number, `text` → string) |
| 4 | **Derived fields** | `text` equals the correction's `to` if there is one, otherwise the snapshot `word`, and all snapshots of an image agree on it. `uses` is the sum of the snapshot counts. Images are ordered placeholders last, then `uses DESC, text ASC`. `at === created_at.replace(" ", "T") + "Z"`. `derived.correctLetters` equals an independently computed LCS |
| 5 | **Rebuild the legacy DB** | From the export alone, create a fresh SQLite DB with the provenance DDL, insert rows with their original IDs and rowids, and restore `sqlite_sequence`. Then `SELECT rowid, * … ORDER BY rowid` for every table equals the source, row for row. This compares logical content: the file bytes will differ because page layout isn't preserved, and that's expected |
| 6 | **Store round-trip** | Import the export into the in-memory `StorageAdapter`, **and** into the Dexie adapter under `fake-indexeddb`, then export again. Canonical JSON (sorted keys, `exportedAt` removed) is byte-identical to the input |
| 7 | **Fixed point** | Export → import → export → import → export: the second and third exports are byte-identical |
| 8 | **Idempotency** | Importing twice leaves the store deep-equal to importing once. After an edit plus a re-import, the edit survives and the conflict report lists it. A deleted legacy record stays deleted |
| 9 | **Rejection** | Each corrupted envelope is rejected with an error naming the failing path, and the store is unchanged afterwards. The cases: missing `schemaVersion`, a future version, a duplicate legacy ID, a `count` as a string, a 3-letter pair, a truncated `images` array, unknown top-level keys |
| 10 | **Schema guard** | Stage 1 aborts on a DB whose DDL differs (an extra column, a missing table), and on a value with the wrong storage class (text in `count`) |
| 11 | **Source untouched** | For the file-based fixture, SHA-256 before equals SHA-256 after |
| 12 | **Corrections guard** | A table entry whose `id`, `pair` or `from` doesn't match its row aborts the import before anything is emitted |
| 13 | **Corrections are reversible** | Regenerating images from the snapshots with an empty corrections table gives exactly the uncorrected import. Applying the table on top of that gives exactly the corrected import |

## 7. Out of scope for the migration

- **Cleaning beyond §3.6.** Tie-breaks, shared words and any typos found later are handled in the new app's library cleanup view, as your own decisions. The app suggests and never changes words automatically.
- **The Android client and the Flask API.** No data lives there. The Android client is retired in favour of the offline web app (AUDIT §6).
- **Keeping both apps in sync.** After the real import, the old app should be treated as read-only. If you keep using it, re-importing is safe (§4.4), but edits made in both places get reported as conflicts, not merged.
