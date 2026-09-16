import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { memoryBackend, type Backend } from "../src/backend.js";
import { dexieBackend } from "../src/dexie-backend.js";
import type { DrillAttemptEvent, LetterPair } from "../src/schema.js";
import { createStorage, StorageValidationError } from "../src/storage.js";
import { exportData, importData, parseExport } from "../src/transfer.js";

const AT = "2026-09-16T03:00:00Z";
let n = 0;
const backends: [string, () => Backend][] = [
  ["memory", () => memoryBackend()],
  ["dexie", () => dexieBackend(`storage-test-${++n}`)],
];

const pair = (id: string, text = "word"): LetterPair => ({ id, first: id[0] ?? "", second: id[1] ?? "", images: [{ id: `img-${id}`, text, uses: 1 }] });
const attempt = (id: string, at: string): DrillAttemptEvent => ({ id, type: "drill.attempt", at, trainer: "trace", caseId: "M", correct: true, responseMs: 812 });

describe.each(backends)("storage on the %s backend", (_name, make) => {
  it("round-trips records, orders events by time, and appends events idempotently", async () => {
    const s = createStorage(make(), { now: () => AT });
    await s.putLetterPair(pair("AB"));
    await s.appendEvents([attempt("e2", "2026-09-16T02:00:00Z"), attempt("e1", "2026-09-16T01:00:00Z")]);
    await s.appendEvents([{ ...attempt("e1", "2026-09-16T01:00:00Z"), correct: false }]);
    await s.putSettings({ theme: "dark", palette: "deuteranopia" });
    expect(await s.letterPair("AB")).toEqual(pair("AB"));
    expect((await s.events()).map((e) => [e.id, e.type === "drill.attempt" && e.correct])).toEqual([["e1", true], ["e2", true]]);
    expect(await s.settings()).toEqual({ theme: "dark", palette: "deuteranopia" });
  });

  it("keeps a word found in discovery mode as its own event type, apart from drill attempts", async () => {
    const s = createStorage(make());
    await s.appendEvents([{ id: "d1", type: "pairs.discovered", at: AT, pairId: "EO", word: "emo", added: true }, attempt("e1", AT)]);
    expect((await s.events({ type: "pairs.discovered" })).map((e) => e.id)).toEqual(["d1"]);
    await expect(s.appendEvents([{ id: "d2", type: "pairs.discovered", at: AT, pairId: "EO", word: "", added: true }])).rejects.toBeInstanceOf(StorageValidationError);
  });

  it("keeps a custom scheme, buffers, alg overrides, difficulty presets and the scratchpad in settings, and refuses bad shapes", async () => {
    const s = createStorage(make());
    const settings = {
      scheme: { id: "mine", name: "Mine", letters: { corners: { UBL: "Ä", UBR: "B" }, edges: { UB: "a" } } },
      buffers: { threeStyle: { corners: "UBL", edges: "DF" } },
      algOverrides: { "3style-corners.UBL": { "UBR-UFL": ["[R: [U, R' D R]]"] } },
      difficulty: { pieces: "edges" as const, constraints: { edges: { targets: { min: 8, max: 10 }, parity: false } }, time: { mode: "hard" as const, seconds: 3 }, relook: false, seed: "abc" },
      difficultyPresets: [{ id: "p1", name: "No parity", difficulty: { constraints: { corners: { parity: false } } } }],
      scratchpad: "[R, U]",
    };
    await s.putSettings(settings);
    expect(await s.settings()).toEqual(settings);
    await expect(s.putSettings({ scheme: { id: "x", name: "x", letters: { corners: { UBL: "AB" } } } })).rejects.toBeInstanceOf(StorageValidationError);
    await expect(s.putSettings({ algOverrides: { "3style-corners.UBL": { "UBR-UFL": [] } } })).rejects.toBeInstanceOf(StorageValidationError);
    await expect(s.putSettings({ difficulty: { constraints: { edges: { targets: { min: 9, max: 3 } } } } })).rejects.toBeInstanceOf(StorageValidationError);
    await expect(s.putSettings({ buffers: { op: { corners: "ufr", edges: "UF" } } })).rejects.toBeInstanceOf(StorageValidationError);
  });

  it("keeps the accessibility settings: how cubes are shown, and whether drills are read aloud", async () => {
    const s = createStorage(make());
    const settings = { cubeView: "text" as const, readAloud: true };
    await s.putSettings(settings);
    expect(await s.settings()).toEqual(settings);
    await s.putSettings({ cubeView: "net" });
    expect(await s.settings()).toEqual({ cubeView: "net" });
    await expect(s.putSettings({ cubeView: "ascii" } as never)).rejects.toBeInstanceOf(StorageValidationError);
    await expect(s.putSettings({ readAloud: "yes" } as never)).rejects.toBeInstanceOf(StorageValidationError);
  });

  it("refuses invalid writes", async () => {
    const s = createStorage(make());
    await expect(s.putLetterPair({ ...pair("AB"), id: "BA" })).rejects.toBeInstanceOf(StorageValidationError);
    await expect(s.putSettings({ theme: "neon" } as never)).rejects.toBeInstanceOf(StorageValidationError);
    expect(await s.letterPairs()).toEqual([]);
  });

  it("rolls a transaction back when it throws", async () => {
    const s = createStorage(make());
    await s.putLetterPair(pair("AB"));
    await expect(
      s.transaction(async (tx) => {
        await tx.putLetterPair(pair("CD"));
        await tx.deleteLetterPair("AB", AT);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect((await s.letterPairs()).map((p) => p.id)).toEqual(["AB"]);
  });

  it("tombstones a deleted pair only if it holds legacy data", async () => {
    const s = createStorage(make());
    await s.putLetterPair(pair("AB"));
    await s.putLetterPair({ ...pair("CD"), images: [{ id: "legacy:pair_words:1", text: "cd", uses: 1, legacy: [{ table: "pair_words", id: 1, pair: "CD", word: "cd", count: 1 }] }] });
    await s.deleteLetterPair("AB", AT);
    await s.deleteLetterPair("CD", AT);
    expect(await s.tombstones()).toEqual([{ collection: "letterPairs", id: "CD", deletedAt: AT }]);
  });

  it("clearAll deletes everything, tombstones and quarantine included", async () => {
    const s = createStorage(make());
    await s.putLetterPair({ ...pair("CD"), images: [{ id: "legacy:pair_words:1", text: "cd", uses: 1, legacy: [{ table: "pair_words", id: 1, pair: "CD", word: "cd", count: 1 }] }] });
    await s.deleteLetterPair("CD", AT);
    await s.appendEvents([attempt("e1", AT)]);
    await s.putSettings({ theme: "light" });
    await s.clearAll();
    expect([await s.letterPairs(), await s.events(), await s.settings(), await s.tombstones(), await s.quarantine()]).toEqual([[], [], undefined, [], []]);
  });
});

describe("quarantine", () => {
  it("moves a stored record that no longer parses to quarantine, with its error, instead of dropping it", async () => {
    const bad = { id: "AB", first: "A", second: "B", images: [{ id: "x", text: "word", uses: -3 }] };
    const s = createStorage(memoryBackend({ letterPairs: { AB: bad, CD: pair("CD") } }), { now: () => AT });
    expect((await s.letterPairs()).map((p) => p.id)).toEqual(["CD"]);
    const q = await s.quarantine();
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ collection: "letterPairs", key: "AB", raw: bad, quarantinedAt: AT });
    expect(q[0]?.issues.join()).toMatch(/images\.0\.uses/);
    expect(await s.letterPair("AB")).toBeUndefined();
  });
});

describe("parseExport", () => {
  it("refuses non-JSON, non-exports, and files from a newer version", () => {
    expect(parseExport("{nope")).toMatchObject({ ok: false, error: { code: "not-json" } });
    expect(parseExport({ hello: 1 })).toMatchObject({ ok: false, error: { code: "not-an-export" } });
    expect(parseExport({ format: "bld-platform/export", schemaVersion: 99 })).toMatchObject({ ok: false, error: { code: "newer-version", version: 99, supported: 1 } });
  });

  it("imports a hand-made export and exports it back", async () => {
    const s = createStorage(memoryBackend());
    const envelope = { format: "bld-platform/export", schemaVersion: 1, exportedAt: AT, provenance: [], letterPairs: [pair("XY", "<script>")], events: [attempt("e1", AT)], settings: { voice: "roast" } };
    const result = await importData(s, JSON.stringify(envelope));
    expect(result.ok && result.summary).toMatchObject({ letterPairs: { inserted: 1 }, events: { inserted: 1 } });
    expect(await exportData(s, AT)).toEqual(envelope);
  });
});
