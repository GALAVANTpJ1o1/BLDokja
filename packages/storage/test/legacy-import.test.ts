import "fake-indexeddb/auto";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { memoryBackend } from "../src/backend.js";
import { dexieBackend } from "../src/dexie-backend.js";
import { AUDITED_DDL } from "../src/legacy/audited.js";
import { APPROVED_CORRECTIONS, type Correction } from "../src/legacy/corrections.js";
import { buildLetterPairs, lcsLength, snapshotsOf } from "../src/legacy/images.js";
import { legacySqliteToExport, type LegacyImportResult } from "../src/legacy/importer.js";
import type { ExportV1 } from "../src/schema.js";
import { createStorage, type StorageAdapter } from "../src/storage.js";
import { canonicalJson, exportData, importData } from "../src/transfer.js";
import { buildFixtureDb, FIXTURE_CORRECTIONS, FIXTURE_MEMO_ROWS, FIXTURE_PAIR_ROWS, FIXTURE_SETTINGS, IMPORTED_AT, loadSql } from "./legacy-fixture.js";

async function importFixture(bytes?: Uint8Array, corrections: readonly Correction[] = FIXTURE_CORRECTIONS): Promise<ExportV1> {
  const result = await run(bytes ?? (await buildFixtureDb()), corrections);
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.envelope;
}

async function run(bytes: Uint8Array, corrections: readonly Correction[] = FIXTURE_CORRECTIONS): Promise<LegacyImportResult> {
  return legacySqliteToExport(await loadSql(), bytes, { importedAt: IMPORTED_AT, fileName: "letterpairs.db", corrections });
}

const withoutExportedAt = (e: ExportV1) => canonicalJson({ ...e, exportedAt: undefined });

let dexieCount = 0;
function stores(): [string, () => StorageAdapter][] {
  return [
    ["memory", () => createStorage(memoryBackend(), { now: () => IMPORTED_AT })],
    ["dexie", () => createStorage(dexieBackend(`legacy-test-${++dexieCount}`), { now: () => IMPORTED_AT })],
  ];
}

async function sqliteRows(bytes: Uint8Array, sql: string): Promise<unknown[][]> {
  const SQL = await loadSql();
  const db = new SQL.Database(bytes);
  try {
    return db.exec(sql)[0]?.values ?? [];
  } finally {
    db.close();
  }
}

describe("legacy import: the synthetic database (MIGRATION.md §6)", () => {
  it("1. count parity: snapshots equal rows for each table, and images equal rows minus merges", async () => {
    const e = await importFixture();
    const rows = FIXTURE_PAIR_ROWS.length - 1; // id 31 was deleted
    expect(snapshotsOf(e.letterPairs)).toHaveLength(rows);
    expect(e.events).toHaveLength(FIXTURE_MEMO_ROWS.length);
    expect(e.legacy?.appSettings).toHaveLength(FIXTURE_SETTINGS.length);
    const report = e.provenance[0]?.report;
    const merged = (report?.merges ?? []).reduce((n, m) => n + m.ids.length - 1, 0);
    expect(merged).toBe(3); // EN, TH, LV
    expect(e.letterPairs.reduce((n, p) => n + p.images.length, 0)).toBe(rows - merged);
    expect(report?.rows).toBe(rows);
  });

  it("2. identity bijection: snapshot ids are exactly the source ids, with no duplicates", async () => {
    const e = await importFixture();
    const ids = snapshotsOf(e.letterPairs).map((s) => s.id);
    expect(ids).toEqual(FIXTURE_PAIR_ROWS.map((r) => r[0]).filter((id) => id !== 31));
    expect(e.events.map((ev) => ev.id)).toEqual(FIXTURE_MEMO_ROWS.map((r) => `legacy:memo_attempts:${r[0]}`));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("3. value fidelity: every snapshot value is Object.is-equal to SQLite's, with the matching JS type", async () => {
    const bytes = await buildFixtureDb();
    const e = await importFixture(bytes);
    const snapshots = new Map(snapshotsOf(e.letterPairs).map((s) => [s.id, s]));
    for (const [id, pair, word, count] of await sqliteRows(bytes, "SELECT id, pair, word, count FROM pair_words ORDER BY id")) {
      const s = snapshots.get(id as number);
      expect(s !== undefined && Object.is(s.pair, pair) && Object.is(s.word, word) && Object.is(s.count, count), `row ${String(id)}`).toBe(true);
      expect(Number.isInteger(s?.count)).toBe(true);
    }
    const events = new Map(e.events.map((ev) => [ev.type === "legacy.memoAttempt" ? ev.legacy.id : -1, ev]));
    for (const row of await sqliteRows(bytes, "SELECT id, difficulty, corners_expected, edges_expected, corners_answer, edges_answer, correct_letters, total_letters, accuracy, created_at FROM memo_attempts ORDER BY id")) {
      const ev = events.get(row[0] as number);
      if (ev?.type !== "legacy.memoAttempt") throw new Error("missing event");
      const l = ev.legacy;
      expect([l.id, l.difficulty, l.corners_expected, l.edges_expected, l.corners_answer, l.edges_answer, l.correct_letters, l.total_letters, l.accuracy, l.created_at].every((v, i) => Object.is(v, row[i]))).toBe(true);
      expect(Number.isFinite(l.accuracy)).toBe(true);
    }
    expect(events.get(2)?.type === "legacy.memoAttempt" && events.get(2)).toMatchObject({ legacy: { accuracy: 0.42857142857142855 } });
    const settings = await sqliteRows(bytes, "SELECT rowid, key, value FROM app_settings ORDER BY rowid");
    expect(e.legacy?.appSettings.map((s) => [s.rowid, s.key, s.value])).toEqual(settings);
  });

  it("4. derived fields: text, uses, ordering, timestamps and the LCS score", async () => {
    const e = await importFixture();
    const pairs = new Map(e.letterPairs.map((p) => [p.id, p]));
    for (const p of e.letterPairs) {
      for (const image of p.images) {
        const snapshots = image.legacy ?? [];
        const texts = snapshots.map((s) => {
          const c = FIXTURE_CORRECTIONS.find((x) => x.id === s.id);
          return c !== undefined && "to" in c ? c.to : s.word;
        });
        expect(new Set(texts)).toEqual(new Set([image.text]));
        expect(image.uses).toBe(snapshots.reduce((n, s) => n + s.count, 0));
        expect(image.id).toBe(`legacy:pair_words:${Math.min(...snapshots.map((s) => s.id))}`);
      }
      const order = [...p.images].sort((a, b) => Number(a.flags !== undefined) - Number(b.flags !== undefined) || b.uses - a.uses || (a.text < b.text ? -1 : 1));
      expect(p.images).toEqual(order);
    }
    expect(pairs.get("TH")?.images.map((i) => [i.text, i.uses])).toEqual([["town hall", 4]]);
    expect(pairs.get("LV")?.images.map((i) => [i.text, i.uses, i.id])).toEqual([["louis vuitton", 2, "legacy:pair_words:15"]]);
    expect(pairs.get("EI")?.images.map((i) => [i.text, i.flags])).toEqual([["einstein", undefined], ["no", ["placeholder"]]]);
    expect(pairs.get("AM")?.images.map((i) => i.text)).toEqual(["am", "amaze", "amigo", "amv"]);
    for (const ev of e.events) {
      if (ev.type !== "legacy.memoAttempt") continue;
      expect(ev.at).toBe(`${ev.legacy.created_at.replace(" ", "T")}Z`);
      expect(ev.derived.correctLetters).toBe(independentLcs(ev.legacy.corners_expected, ev.legacy.corners_answer) + independentLcs(ev.legacy.edges_expected, ev.legacy.edges_answer));
    }
    const report = e.provenance[0]?.report;
    expect(report?.memoScoreDiffers).toEqual([3, 5]);
    expect(report?.pairsNeedingWord).toEqual(["EO", "IE"]);
    expect(report?.tieBreakPrimaries).toEqual(["AM"]);
    expect(report?.sharedWords).toEqual([{ text: "war", pairs: ["RW", "WA", "WR"] }]);
    expect(report?.deletedIdGaps).toEqual({ pair_words: [31, 32], memo_attempts: [4] });
    expect(report?.primaryChanges).toEqual([{ pair: "EI", from: "eienstien", to: "einstein" }, { pair: "EN", from: "engish", to: "english" }, { pair: "LV", from: "lui vuiton", to: "louis vuitton" }, { pair: "TH", from: "townhall", to: "town hall" }]);
    expect(e.provenance[0]?.source).toMatchObject({ fileName: "letterpairs.db", rowCounts: { pair_words: 31, memo_attempts: 4, app_settings: 3 }, sqliteSequence: { pair_words: 40, memo_attempts: 5 } });
  });

  it("5. rebuild: the export alone recreates every legacy table row for row", async () => {
    const bytes = await buildFixtureDb();
    const e = await importFixture(bytes);
    const SQL = await loadSql();
    const db = new SQL.Database();
    const source = e.provenance[0]?.source;
    if (source === undefined) throw new Error("no provenance");
    for (const table of ["pair_words", "memo_attempts", "app_settings"]) db.run(source.ddl[table] ?? "");
    for (const s of snapshotsOf(e.letterPairs)) db.run("INSERT INTO pair_words (id, pair, word, count) VALUES (?, ?, ?, ?)", [s.id, s.pair, s.word, s.count]);
    for (const ev of e.events) {
      if (ev.type !== "legacy.memoAttempt") continue;
      const l = ev.legacy;
      db.run("INSERT INTO memo_attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [l.id, l.difficulty, l.corners_expected, l.edges_expected, l.corners_answer, l.edges_answer, l.correct_letters, l.total_letters, l.accuracy, l.created_at]);
    }
    for (const s of e.legacy?.appSettings ?? []) db.run("INSERT INTO app_settings (rowid, key, value) VALUES (?, ?, ?)", [s.rowid, s.key, s.value]);
    db.run("DELETE FROM sqlite_sequence");
    for (const [name, seq] of Object.entries(source.sqliteSequence)) db.run("INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)", [name, seq]);
    const rebuilt = db.export();
    db.close();
    for (const query of ["SELECT rowid, * FROM pair_words ORDER BY rowid", "SELECT rowid, * FROM memo_attempts ORDER BY rowid", "SELECT rowid, * FROM app_settings ORDER BY rowid", "SELECT name, seq FROM sqlite_sequence ORDER BY name"]) {
      expect(await sqliteRows(rebuilt, query), query).toEqual(await sqliteRows(bytes, query));
    }
  });

  it.each(stores())("6. store round-trip (%s): import, export again, canonical JSON is byte-identical", async (_name, make) => {
    const e = await importFixture();
    const storage = make();
    const imported = await importData(storage, e);
    expect(imported.ok).toBe(true);
    expect(withoutExportedAt(await exportData(storage, "2026-09-17T00:00:00Z"))).toBe(withoutExportedAt(e));
  });

  it("7. fixed point: export → import → export → import → export stabilises", async () => {
    const e = await importFixture();
    const cycle = async (input: ExportV1) => {
      const storage = createStorage(memoryBackend());
      await importData(storage, JSON.stringify(input));
      return exportData(storage, input.exportedAt);
    };
    const second = await cycle(e);
    const third = await cycle(second);
    expect(canonicalJson(third)).toBe(canonicalJson(second));
  });

  it.each(stores())("8. idempotency (%s): a second import changes nothing; edits survive; deletions stay deleted", async (_name, make) => {
    const e = await importFixture();
    const once = make();
    await importData(once, e);
    const twice = make();
    await importData(twice, e);
    const again = await importData(twice, e);
    expect(again.ok && again.summary).toMatchObject({ letterPairs: { inserted: 0, unchanged: e.letterPairs.length }, events: { inserted: 0 }, conflicts: [], provenanceAdded: 0 });
    expect(canonicalJson(await exportData(twice, "2026-09-17T00:00:00Z"))).toBe(canonicalJson(await exportData(once, "2026-09-17T00:00:00Z")));

    const ab = await twice.letterPair("AB");
    if (ab === undefined) throw new Error("AB missing");
    await twice.putLetterPair({ ...ab, images: ab.images.map((i) => ({ ...i, text: "abacus (edited)" })) });
    await twice.deleteLetterPair("BA", "2026-09-16T02:00:00Z");
    const afterEdits = await importData(twice, e);
    if (!afterEdits.ok) throw new Error(JSON.stringify(afterEdits.error));
    expect(afterEdits.summary.conflicts).toEqual([{ kind: "letterPair", id: "AB", resolution: "kept-existing" }]);
    expect(afterEdits.summary.stayedDeleted).toEqual(["BA"]);
    expect((await twice.letterPair("AB"))?.images[0]?.text).toBe("abacus (edited)");
    expect(await twice.letterPair("BA")).toBeUndefined();
  });

  it("9. rejection: each corrupted envelope is refused with an error naming the failing path, and the store is unchanged", async () => {
    const e = await importFixture();
    const base = JSON.parse(JSON.stringify(e)) as Record<string, unknown> & { letterPairs: Record<string, unknown>[] };
    const pairs = () => JSON.parse(JSON.stringify(base.letterPairs)) as { id: string; images: Record<string, unknown>[] }[];
    const at = <T extends { id: string }>(list: T[], id: string): T => {
      const found = list.find((p) => p.id === id);
      if (found === undefined) throw new Error(id);
      return found;
    };
    const cases: [string, unknown, string | RegExp][] = [
      ["missing schemaVersion", { ...base, schemaVersion: undefined }, "unsupported-version"],
      ["a future version", { ...base, schemaVersion: 2 }, "newer-version"],
      ["a duplicate legacy id", { ...base, letterPairs: (() => { const p = pairs(); const ab = at(p, "AB"); const ba = at(p, "BA"); const legacy = (ab.images[0]?.legacy as unknown[]); (ba.images[0] as { legacy: unknown[] }).legacy.push(legacy[0]); return p; })() }, /letterPairs\.\d+\.images\.0\.legacy\.1\.id/],
      ["a count stored as a string", { ...base, letterPairs: (() => { const p = pairs(); ((at(p, "AB").images[0] as { legacy: Record<string, unknown>[] }).legacy[0] ?? {}).count = "3"; return p; })() }, /letterPairs\.\d+\.images\.0\.legacy\.0\.count/],
      ["a 3-letter pair", { ...base, letterPairs: (() => { const p = pairs(); const ab = at(p, "AB") as Record<string, unknown>; ab.id = "ABC"; ab.second = "BC"; return p; })() }, /letterPairs\.\d+\.second/],
      ["a truncated image (no uses)", { ...base, letterPairs: (() => { const p = pairs(); delete at(p, "AB").images[0]?.uses; return p; })() }, /letterPairs\.\d+\.images\.0\.uses/],
      ["an unknown top-level key", { ...base, surprise: true }, /\(root\)/],
    ];
    for (const [name, envelope, expected] of cases) {
      const storage = createStorage(memoryBackend());
      await storage.putSettings({ theme: "dark" });
      const before = canonicalJson(await exportData(storage, "2026-09-17T00:00:00Z"));
      const result = await importData(storage, envelope);
      if (result.ok) throw new Error(`${name} was accepted`);
      const described = result.error.code === "invalid" ? result.error.issues.join("\n") : result.error.code;
      if (typeof expected === "string") expect(result.error.code, name).toBe(expected);
      else expect(described, name).toMatch(expected);
      expect(canonicalJson(await exportData(storage, "2026-09-17T00:00:00Z")), name).toBe(before);
    }
  });

  it("10. schema guard: a different DDL, a missing table or a wrong storage class aborts stage 1", async () => {
    const extraColumn = AUDITED_DDL.pair_words?.replace("count INTEGER NOT NULL DEFAULT 1,", "count INTEGER NOT NULL DEFAULT 1,\n        notes TEXT,") ?? "";
    const code = async (bytes: Uint8Array) => {
      const r = await run(bytes);
      return r.ok ? "ok" : r.error.code;
    };
    expect(await code(await buildFixtureDb({ ddl: { pair_words: extraColumn } }))).toBe("schema-mismatch");
    expect(await code(await buildFixtureDb({ ddl: { app_settings: null } }))).toBe("schema-mismatch");
    expect(await code(await buildFixtureDb({ after: "CREATE INDEX extra ON pair_words(word)" }))).toBe("schema-mismatch");
    const wrongClass = await run(await buildFixtureDb({ after: "UPDATE pair_words SET count = 'three' WHERE id = 1" }));
    expect(wrongClass.ok ? "ok" : wrongClass.error).toMatchObject({ code: "storage-class", table: "pair_words", column: "count", rowid: 1, actual: "text" });
    expect(await code(new Uint8Array([1, 2, 3, 4]))).toBe("not-a-database");
  });

  it("11. source untouched: the file's SHA-256 and the input bytes are the same afterwards", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bld-legacy-"));
    const path = join(dir, "letterpairs.db");
    writeFileSync(path, await buildFixtureDb());
    const hash = () => createHash("sha256").update(readFileSync(path)).digest("hex");
    const before = hash();
    const bytes = new Uint8Array(readFileSync(path));
    const copy = new Uint8Array(bytes);
    const e = await importFixture(bytes);
    expect(hash()).toBe(before);
    expect(bytes).toEqual(copy);
    expect(e.provenance[0]?.source.sha256).toBe(before);
    expect(e.provenance[0]?.source.sizeBytes).toBe(bytes.byteLength);
  });

  it("12. corrections guard: an entry whose id, pair or word doesn't match its row aborts before anything is emitted", async () => {
    const bytes = await buildFixtureDb();
    for (const bad of [
      [...FIXTURE_CORRECTIONS, { id: 999, pair: "AB", from: "abacus", to: "x" }],
      [...FIXTURE_CORRECTIONS.slice(1), { id: 12, pair: "EI", from: "engish", to: "english" }],
      [...FIXTURE_CORRECTIONS.slice(1), { id: 12, pair: "EN", from: "english", to: "english" }],
      [...FIXTURE_CORRECTIONS.slice(0, 5), { id: 18, pair: "EI", word: "yes", flag: "placeholder" as const }, ...FIXTURE_CORRECTIONS.slice(6)],
    ] as Correction[][]) {
      const r = await run(bytes, bad);
      expect(r.ok ? "ok" : r.error.code).toBe("correction-mismatch");
    }
  });

  it("13. corrections are reversible: snapshots rebuild the uncorrected import, and the table rebuilds the corrected one", async () => {
    const bytes = await buildFixtureDb();
    const corrected = await importFixture(bytes);
    const uncorrected = await importFixture(bytes, []);
    expect(buildLetterPairs(snapshotsOf(corrected.letterPairs), [])).toEqual(uncorrected.letterPairs);
    expect(buildLetterPairs(snapshotsOf(uncorrected.letterPairs), FIXTURE_CORRECTIONS)).toEqual(corrected.letterPairs);
  });

  it("text survives verbatim: non-ASCII, emoji, markup and length extremes", async () => {
    const e = await importFixture();
    const text = (id: string) => e.letterPairs.find((p) => p.id === id)?.images[0]?.text;
    expect([text("NE"), text("MK"), text("QT"), text("XA"), text("QR")?.length]).toEqual(["ñandú 🐦", "<b>x</b>", '"quotes"', "x", 80]);
  });
});

/** A second, independent LCS (recursive with memo) to check the importer's iterative one. */
function independentLcs(a: string, b: string): number {
  const memo = new Map<string, number>();
  const go = (i: number, j: number): number => {
    if (i === a.length || j === b.length) return 0;
    const key = `${i},${j}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const value = a[i] === b[j] ? 1 + go(i + 1, j + 1) : Math.max(go(i + 1, j), go(i, j + 1));
    memo.set(key, value);
    return value;
  };
  return go(0, 0);
}

describe("lcsLength", () => {
  it("matches the independent version and AUDIT C3's example", () => {
    expect(lcsLength("ABCDEFGH", "ACDEFGH")).toBe(7);
    for (const [a, b] of [["", "ABC"], ["AABB", "ABAB"], ["IUAOSHWJMKC", "IUAOQMXC"], ["XYZ", "ZYX"]] as const) expect(lcsLength(a, b)).toBe(independentLcs(a, b));
  });
});

/**
 * Fixture B (MIGRATION.md §6.1): the real database, only when LEGACY_DB_PATH is set. It is read as
 * bytes once, never opened by SQLite on disk, and its hash is checked before and after.
 */
const realPath = process.env.LEGACY_DB_PATH;
describe.skipIf(realPath === undefined)("legacy import: the real database (LEGACY_DB_PATH)", () => {
  it("reproduces the audited golden numbers", async () => {
    const path = realPath ?? "";
    const hash = () => createHash("sha256").update(readFileSync(path)).digest("hex");
    const before = hash();
    expect(before).toBe("4622dd929f2ed7c25298e3ac2b2a23f535aec2c0861116cde5d4795dfc6051d5");
    const result = await legacySqliteToExport(await loadSql(), new Uint8Array(readFileSync(path)), { importedAt: IMPORTED_AT, fileName: "letterpairs.db", corrections: APPROVED_CORRECTIONS });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const report = result.envelope.provenance[0]?.report;
    expect({
      rows: report?.rows,
      images: report?.images,
      pairs: report?.pairsWithAnyImage,
      uses: report?.totalUses,
      memo: result.envelope.events.length,
      settings: result.envelope.legacy?.appSettings.length,
      corrections: report?.corrections.length,
      merges: report?.merges.reduce((n, m) => n + m.ids.length - 1, 0),
      realWord: report?.pairsWithRealWord,
      needWord: report?.pairsNeedingWord,
      ties: report?.tieBreakPrimaries.length,
      shared: report?.sharedWords.length,
      memoDiffers: report?.memoScoreDiffers.length,
      primaryChanges: report?.primaryChanges.map((c) => c.pair),
    }).toEqual({
      rows: 678,
      images: 660,
      pairs: 552,
      uses: 990,
      memo: 51,
      settings: 4,
      corrections: 20,
      merges: 18,
      realWord: 550,
      needWord: ["EO", "IE"],
      ties: 76,
      shared: 12,
      memoDiffers: 17,
      primaryChanges: ["EI", "EN", "HC", "HG", "LV", "MB", "SD", "SW", "TH", "UG"],
    });
    expect(hash()).toBe(before);
  });
});
