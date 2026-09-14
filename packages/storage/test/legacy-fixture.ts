import initSqlJs from "sql.js";
import type { SqlJsStatic } from "sql.js";
import type { Correction } from "../src/legacy/corrections.js";
import { AUDITED_DDL } from "../src/legacy/audited.js";

/**
 * The synthetic legacy database (MIGRATION.md §6.1 fixture A), built in memory from the verbatim DDL.
 * It holds every anomaly class the audit found, plus a few the new app has to survive anyway.
 */
let sql: Promise<SqlJsStatic> | undefined;
export const loadSql = () => (sql ??= initSqlJs());

type PairRow = readonly [id: number, pair: string, word: string, count: number];

export const FIXTURE_PAIR_ROWS: readonly PairRow[] = [
  [1, "AB", "abacus", 3], // one word
  [2, "AM", "amv", 1], // four words tied on count
  [3, "AM", "amaze", 1],
  [4, "AM", "amigo", 1],
  [5, "AM", "am", 1],
  [6, "BA", "barbarian", 2], // a clear top word
  [7, "BA", "bar", 1],
  [8, "WA", "war", 4], // one word shared by three pairs
  [9, "WR", "war", 1],
  [10, "RW", "war", 2],
  [11, "EN", "english", 1], // a typo merging into the correct spelling
  [12, "EN", "engish", 1],
  [13, "TH", "town hall", 1], // a spacing variant where the less-used form wins
  [14, "TH", "townhall", 3],
  [15, "LV", "luis vuiton", 1], // two misspellings merging into a spelling neither had
  [16, "LV", "lui vuiton", 1],
  [17, "EI", "eienstien", 1], // a correction with nothing to merge into, plus a placeholder
  [18, "EI", "no", 1],
  [19, "EO", "no", 1], // two placeholders and nothing else
  [20, "EO", "yes", 1],
  [21, "IE", "no", 2], // only a placeholder
  [22, "WD", "wd40", 2], // digits and punctuation
  [23, "KO", "k-on", 1],
  [24, "IV", "4", 1],
  [25, "XA", "x", 1], // 1 character
  [26, "QR", "q".repeat(80), 1], // 80 characters
  [27, "LA", "los angeles", 2], // multi-word
  [28, "NE", "ñandú 🐦", 1], // non-ASCII and emoji
  [29, "MK", "<b>x</b>", 1], // markup-like text
  [30, "QT", '"quotes"', 1],
  [31, "ZZ", "deleted later", 1], // removed below: a deleted-id gap
  [33, "CA", "california", 1],
];

export const FIXTURE_CORRECTIONS: readonly Correction[] = [
  { id: 12, pair: "EN", from: "engish", to: "english" },
  { id: 14, pair: "TH", from: "townhall", to: "town hall" },
  { id: 15, pair: "LV", from: "luis vuiton", to: "louis vuitton" },
  { id: 16, pair: "LV", from: "lui vuiton", to: "louis vuitton" },
  { id: 17, pair: "EI", from: "eienstien", to: "einstein" },
  { id: 18, pair: "EI", word: "no", flag: "placeholder" },
  { id: 19, pair: "EO", word: "no", flag: "placeholder" },
  { id: 20, pair: "EO", word: "yes", flag: "placeholder" },
  { id: 21, pair: "IE", word: "no", flag: "placeholder" },
];

type MemoRow = readonly [id: number, difficulty: string, ce: string, ee: string, ca: string, ea: string, correct: number, total: number, accuracy: number, createdAt: string];

export const FIXTURE_MEMO_ROWS: readonly MemoRow[] = [
  [1, "easy", "AABB", "CDCD", "AABB", "CDCD", 8, 8, 1, "2026-06-21 08:21:12"], // repeated letters
  [2, "custom", "ABCDEFG", "", "ABCXXXX", "", 3, 7, 0.42857142857142855, "2026-06-25 10:00:00"], // a long repeating double
  [3, "custom", "ABCDEFGH", "IJKL", "ACDEFGH", "IJKL", 5, 12, 0.4166666666666667, "2026-08-05 14:44:07"], // under-scored: positional 1/8 + 4/4
  [5, "custom", "MNOP", "QRST", "MNOP", "QRTS", 6, 8, 0.75, "2026-08-06 00:00:59"], // after a deleted id
];

export const FIXTURE_SETTINGS: readonly (readonly [rowid: number, key: string, value: string])[] = [
  [69, "corner_length", "8"],
  [70, "edge_length", "12"],
  [72, "letter_time_ms", "1000"],
];

export interface FixtureOptions {
  /** Replace a table's DDL (schema guard tests). `null` leaves the table out. */
  readonly ddl?: Partial<Record<keyof typeof AUDITED_DDL, string | null>>;
  /** Raw SQL run after the rows are inserted. */
  readonly after?: string;
}

export async function buildFixtureDb(options: FixtureOptions = {}): Promise<Uint8Array> {
  const SQL = await loadSql();
  const db = new SQL.Database();
  for (const table of ["pair_words", "memo_attempts", "app_settings"] as const) {
    const ddl = options.ddl?.[table] === undefined ? AUDITED_DDL[table] : options.ddl[table];
    if (ddl !== null && ddl !== undefined) db.run(ddl);
  }
  if (options.ddl?.pair_words !== null) {
    for (const row of FIXTURE_PAIR_ROWS) db.run("INSERT INTO pair_words (id, pair, word, count) VALUES (?, ?, ?, ?)", [...row]);
    db.run("DELETE FROM pair_words WHERE id = 31");
  }
  if (options.ddl?.memo_attempts !== null) {
    for (const row of FIXTURE_MEMO_ROWS) {
      db.run("INSERT INTO memo_attempts (id, difficulty, corners_expected, edges_expected, corners_answer, edges_answer, correct_letters, total_letters, accuracy, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [...row]);
    }
  }
  if (options.ddl?.app_settings !== null) {
    for (const row of FIXTURE_SETTINGS) db.run("INSERT INTO app_settings (rowid, key, value) VALUES (?, ?, ?)", [...row]);
  }
  // sqlite_sequence above MAX(id), as in the real file.
  db.run("UPDATE sqlite_sequence SET seq = 40 WHERE name = 'pair_words'");
  db.run("UPDATE sqlite_sequence SET seq = 5 WHERE name = 'memo_attempts'");
  if (options.after !== undefined) db.run(options.after);
  const bytes = db.export();
  db.close();
  return bytes;
}

export const IMPORTED_AT = "2026-09-16T01:00:00Z";
