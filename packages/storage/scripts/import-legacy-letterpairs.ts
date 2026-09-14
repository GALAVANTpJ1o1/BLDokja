/**
 * Legacy LetterPairTrainer database → export JSON (MIGRATION.md §4.5).
 *
 *   pnpm import:legacy --db <path/to/letterpairs.db> --dry-run          print the import report, write nothing
 *   pnpm import:legacy --db <path/to/letterpairs.db> --out <file.json>  also write the export (outside the repo)
 *
 * The database is read once, as bytes; SQLite never opens the file. Its SHA-256 is checked before and
 * after, and against the audited hash: if the file changed since the audit, this stops, so the change
 * can be looked at first (MIGRATION.md §4.5 step 1). `--allow-changed` skips only that last check.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import initSqlJs from "sql.js";
import { AUDITED_SHA256 } from "../src/legacy/audited.js";
import { APPROVED_CORRECTIONS } from "../src/legacy/corrections.js";
import { legacySqliteToExport } from "../src/legacy/importer.js";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const dbPath = option("--db");
const outPath = option("--out");
const dryRun = flag("--dry-run");
if (dbPath === undefined || (!dryRun && outPath === undefined)) {
  console.error("usage: import:legacy --db <letterpairs.db> (--dry-run | --out <export.json>) [--allow-changed]");
  process.exit(1);
}

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
if (outPath !== undefined && !relative(repoRoot, resolve(outPath)).startsWith("..")) {
  console.error("refusing to write the export inside the repository: it is personal data (MIGRATION.md §4.5 step 3)");
  process.exit(1);
}

const sha = () => createHash("sha256").update(readFileSync(dbPath)).digest("hex");
const before = sha();
if (before !== AUDITED_SHA256 && !flag("--allow-changed")) {
  console.error(`letterpairs.db has changed since the audit (sha256 ${before}, audited ${AUDITED_SHA256}). Look at the difference before importing, or pass --allow-changed.`);
  process.exit(2);
}

const bytes = new Uint8Array(readFileSync(dbPath));
const result = await legacySqliteToExport(await initSqlJs(), bytes, { importedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), fileName: basename(dbPath), corrections: APPROVED_CORRECTIONS });
const after = sha();
if (after !== before) {
  console.error("the database file changed while it was being read; nothing was written");
  process.exit(3);
}
if (!result.ok) {
  console.error(`import aborted: ${JSON.stringify(result.error, null, 2)}`);
  process.exit(4);
}

const report = result.envelope.provenance[0]?.report;
if (report === undefined) throw new Error("the envelope has no import report");
const merged = report.merges.reduce((n, m) => n + m.ids.length - 1, 0);
const lines = [
  `source: ${basename(dbPath)}, sha256 ${before} (${before === AUDITED_SHA256 ? "matches the audit" : "DIFFERS from the audit"}), unchanged after reading`,
  `tables: ${Object.entries(report.tables).map(([t, n]) => `${t} ${n}`).join(", ")}`,
  `rows → images: ${report.rows} → ${report.images} (${merged} merged)`,
  `pairs: ${report.pairsWithAnyImage} with a word, ${report.distinctLetterPairsCovered} of 552 distinct-letter pairs, ${report.pairsWithRealWord} with a real word`,
  `pairs that need a word: ${report.pairsNeedingWord.join(", ") || "none"}`,
  `total uses: ${report.totalUses}`,
  `corrections applied: ${report.corrections.length}; placeholders flagged: ${report.placeholders.length}`,
  `primary word changed in: ${report.primaryChanges.map((c) => c.pair).join(", ") || "none"}`,
  `primaries still decided by the alphabetical tie-break: ${report.tieBreakPrimaries.length}`,
  `words shared by more than one pair: ${report.sharedWords.length}`,
  `words with digits or punctuation: ${report.wordsWithDigitsOrPunctuation.length}`,
  `legacy memo attempts whose re-score differs: ${report.memoScoreDiffers.length} of ${result.envelope.events.length}`,
  `deleted-id gaps: ${Object.entries(report.deletedIdGaps).map(([t, ids]) => `${t} ${ids.length}`).join(", ")}`,
];
console.log(lines.join("\n"));

if (dryRun) {
  console.log("dry run: nothing written");
} else if (outPath !== undefined) {
  writeFileSync(outPath, `${JSON.stringify(result.envelope, null, 2)}\n`);
  console.log(`wrote ${outPath}`);
}
