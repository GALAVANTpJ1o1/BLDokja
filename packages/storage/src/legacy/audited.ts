/**
 * Facts about the legacy LetterPairTrainer database, copied from docs/AUDIT.md §4.1–4.2. The
 * importer refuses any file whose schema differs from these after collapsing whitespace.
 */
export const AUDITED_DDL: Readonly<Record<string, string>> = {
  pair_words: `CREATE TABLE pair_words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pair TEXT NOT NULL,
        word TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        UNIQUE(pair, word)
    )`,
  sqlite_sequence: "CREATE TABLE sqlite_sequence(name,seq)",
  memo_attempts: `CREATE TABLE memo_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        difficulty TEXT NOT NULL,
        corners_expected TEXT NOT NULL,
        edges_expected TEXT NOT NULL,
        corners_answer TEXT NOT NULL,
        edges_answer TEXT NOT NULL,
        correct_letters INTEGER NOT NULL,
        total_letters INTEGER NOT NULL,
        accuracy REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  app_settings: `CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )`,
};

/** The implicit indexes SQLite creates for the UNIQUE and PRIMARY KEY constraints above. */
export const AUDITED_AUTOINDEXES = ["sqlite_autoindex_app_settings_1", "sqlite_autoindex_pair_words_1"] as const;

/** Declared storage class of every column (AUDIT §4.2: every value matched its declaration). */
export const COLUMN_TYPES = {
  pair_words: { id: "integer", pair: "text", word: "text", count: "integer" },
  memo_attempts: {
    id: "integer",
    difficulty: "text",
    corners_expected: "text",
    edges_expected: "text",
    corners_answer: "text",
    edges_answer: "text",
    correct_letters: "integer",
    total_letters: "integer",
    accuracy: "real",
    created_at: "text",
  },
  app_settings: { key: "text", value: "text" },
} as const;

/** SHA-256 of `letterpairs.db` when it was audited (AUDIT §4.1). */
export const AUDITED_SHA256 = "4622dd929f2ed7c25298e3ac2b2a23f535aec2c0861116cde5d4795dfc6051d5";

export function collapseWhitespace(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}
