import { createRng, loadPuzzle, speffzScheme } from "@bld/cube-engine";
import { LetterPairSchema, type AppEvent, type LetterPair } from "@bld/storage";
import { scheduleAll } from "@bld/srs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scrambleTraces, sessionScramble } from "./guided-trace";
import {
  addImage,
  applyMatches,
  csvRows,
  didYouMean,
  drillWeights,
  expectedOccurrence,
  findImages,
  libraryHealth,
  libraryLetters,
  libraryToCsv,
  mainImage,
  makeMain,
  memoPairIds,
  mergeCsvRows,
  oneEditApart,
  pairsForWord,
  parseCsv,
  pickWeighted,
  renameImage,
  renameOrMerge,
  samePair,
  seenPairs,
  sentenceMemo,
} from "./pairs";

const AT = "2026-09-16T04:00:00Z";
const pair = (id: string, images: [string, number, boolean?][], extra: Partial<LetterPair> = {}): LetterPair => ({
  id,
  first: id[0] ?? "",
  second: id[1] ?? "",
  images: images.map(([text, uses, placeholder], i) => ({ id: `${id}-${String(i)}`, text, uses, ...(placeholder === true ? { flags: ["placeholder" as const] } : {}) })),
  ...extra,
});

const traceEvent = (seed: string, scrambleIndex: number, pieceType: string, index: number, letter: string, correct = true): AppEvent => ({
  id: `${seed}-${String(scrambleIndex)}-${pieceType}-${String(index)}-${String(correct)}`,
  type: "drill.attempt",
  at: AT,
  trainer: "trace",
  caseId: `${pieceType}:X`,
  seed,
  correct,
  responseMs: 900,
  detail: { scrambleIndex, pieceType, index, letter },
});

describe("letter-pair library", () => {
  it("uses the 24 Speffz letters, so the grid has 576 cells", async () => {
    const letters = libraryLetters(speffzScheme(await loadPuzzle("3x3x3")));
    expect(letters.join("")).toBe("ABCDEFGHIJKLMNOPQRSTUVWX");
  });

  it("pairs memo letters in order; a lone letter becomes a self-pair only when asked", () => {
    expect(memoPairIds(["A", "B", "C"], "selfPair")).toEqual(["AB", "CC"]);
    expect(memoPairIds(["A", "B", "C"], "skip")).toEqual(["AB"]);
  });

  it("counts the pairs seen in guided trace from logged letters, once per scramble, ignoring retypes", () => {
    const events = [
      traceEvent("s", 0, "edges", 0, "B"),
      traceEvent("s", 0, "edges", 1, "Q", false),
      traceEvent("s", 0, "edges", 1, "Q"),
      traceEvent("s", 0, "edges", 2, "M"),
      traceEvent("s", 0, "edges", 3, "D"),
      traceEvent("s", 0, "corners", 0, "B"),
      traceEvent("s", 0, "corners", 1, "Q"),
      traceEvent("s", 1, "edges", 1, "Q"),
      traceEvent("s", 1, "edges", 0, "B"),
      traceEvent("s", 1, "edges", 2, "X"),
    ];
    expect(Object.fromEntries(seenPairs(events))).toEqual({ BQ: 3, MD: 1 });
  });

  it("reads expected occurrences for the OP buffers from the engine's report, diagonal cells included", () => {
    const report: unknown = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "docs", "reports", "letter-pair-frequencies.json"), "utf8"));
    const occurrence = expectedOccurrence(report, { corners: "UBL", edges: "UR" });
    expect(occurrence).toBeDefined();
    expect((occurrence?.get("BB") ?? 0) > 0).toBe(true);
    expect(expectedOccurrence(report, { corners: "DFR", edges: "DB" })).toBeUndefined();
    expect(expectedOccurrence({ format: "something else" }, { corners: "UBL", edges: "UR" })).toBeUndefined();
  });

  it("the main image is the first real word; placeholders never are", () => {
    expect(mainImage(pair("EI", [["eiffel", 2], ["no", 1, true]]))?.text).toBe("eiffel");
    expect(mainImage(pair("EO", [["no", 1, true], ["yes", 1, true]]))).toBeUndefined();
  });

  it("library health: gaps by trace frequency, placeholders, unedited ties, shared words, and spelling variants", () => {
    const pairs = [
      pair("AB", [["abacus", 3], ["abbey", 3]]),
      pair("AC", [["acid", 2], ["acorn", 2]], { updatedAt: AT }),
      pair("BA", [["bat", 1]]),
      pair("CA", [["bat", 2]]),
      pair("BC", [["kokonut", 1]]),
      pair("CB", [["koko nut", 4], ["cobra", 1]]),
      pair("DA", [["dancer", 1]]),
      pair("DB", [["dance", 5]]),
      pair("EO", [["no", 1, true]]),
    ];
    const health = libraryHealth(pairs, ["A", "B", "C", "D", "E", "O"], new Map([["OE", 4], ["AA", 1]]), new Map([["BB", 50], ["AD", 20]]));
    expect(health.missing.slice(0, 4).map((m) => m.id)).toEqual(["OE", "AA", "BB", "AD"]);
    expect(health.missing.some((m) => m.id === "EO")).toBe(true);
    expect(health.missing).toHaveLength(36 - 8);
    expect(health.placeholders).toEqual([{ id: "EO", texts: ["no"] }]);
    expect(health.ties).toEqual(["AB"]);
    expect(health.shared).toEqual([{ text: "bat", pairs: ["BA", "CA"] }]);
    expect(health.suggestions.map((s) => `${s.pairId}:${s.text}>${s.suggestion}`)).toEqual(["BC:kokonut>koko nut", "DA:dancer>dance"]);
  });

  it("did you mean: offers your own more-used spelling, never when the word already exists", () => {
    const pairs = [pair("CB", [["koko nut", 4]]), pair("DB", [["dance", 5]]), pair("DC", [["dancer", 1]])];
    expect(didYouMean("kokonut", pairs)).toEqual({ suggestion: "koko nut", usedBy: ["CB"] });
    // One edit from both "dance" and "dancer": the more-used spelling is offered.
    expect(didYouMean("dancr", pairs)).toEqual({ suggestion: "dance", usedBy: ["DB"] });
    expect(didYouMean("dancerr", pairs)).toEqual({ suggestion: "dancer", usedBy: ["DC"] });
    expect(didYouMean("Dance", pairs)).toBeUndefined();
    expect(didYouMean("cat", pairs)).toBeUndefined();
    expect([oneEditApart("dance", "dancer"), oneEditApart("dance", "lance"), oneEditApart("dance", "dunce"), oneEditApart("dance", "trance")]).toEqual([true, true, true, false]);
  });

  it("image → pair accepts every pair that uses the word", () => {
    const pairs = [pair("BA", [["bat", 1]]), pair("CA", [["Bat ", 2]]), pair("EO", [["bat", 1, true]])];
    expect(pairsForWord(pairs, "bat")).toEqual(["BA", "CA"]);
    expect([samePair("b a", "BA"), samePair("ab", "BA")]).toEqual([true, false]);
  });

  it("edits keep placeholders last, refuse duplicates, and stay valid records", () => {
    let p = pair("EI", [["no", 1, true]]);
    const first = addImage(p, "  eiffel ", "new-1", AT);
    expect(first.added).toBe(true);
    p = first.pair;
    expect(p.images.map((i) => i.text)).toEqual(["eiffel", "no"]);
    expect(addImage(p, "EIFFEL", "new-2", AT).added).toBe(false);
    p = addImage(p, "eider", "new-3", AT).pair;
    p = makeMain(p, "new-3", AT);
    expect(p.images.map((i) => i.text)).toEqual(["eider", "eiffel", "no"]);
    expect(makeMain(p, "EI-0", AT)).toBe(p);
    p = renameImage(p, "EI-0", "eiger", AT);
    expect(p.images.map((i) => [i.text, i.flags])).toEqual([["eider", undefined], ["eiffel", undefined], ["eiger", undefined]]);
    expect(LetterPairSchema.safeParse(p).success).toBe(true);
    expect(p.updatedAt).toBe(AT);
  });

  it("renaming an image to a word the pair already has merges them, keeping uses and legacy rows", () => {
    const legacyRow = (id: number, word: string, count: number) => ({ table: "pair_words" as const, id, pair: "CB", word, count });
    const p: LetterPair = {
      id: "CB",
      first: "C",
      second: "B",
      images: [
        { id: "a", text: "koko nut", uses: 4, legacy: [legacyRow(1, "koko nut", 4)] },
        { id: "b", text: "cobra", uses: 1 },
        { id: "c", text: "kokonut", uses: 2, legacy: [legacyRow(9, "kokonut", 2)] },
      ],
    };
    const merged = renameOrMerge(p, "c", "Koko Nut", AT);
    expect(merged.images.map((i) => [i.id, i.text, i.uses, i.legacy?.map((r) => r.id)])).toEqual([["a", "koko nut", 6, [1, 9]], ["b", "cobra", 1, undefined]]);
    expect(LetterPairSchema.safeParse(merged).success).toBe(true);
    expect(renameOrMerge(p, "b", "cobras", AT).images.map((i) => i.text)).toEqual(["koko nut", "cobras", "kokonut"]);
  });

  it("find and replace ignores case, treats the search literally, and skips replacements that would empty an image", () => {
    const pairs = [pair("AB", [["a.b cab", 1]]), pair("CD", [["ab", 1], ["crab", 2]])];
    const matches = findImages(pairs, "A.B", "x$&");
    expect(matches.map((m) => [m.pairId, m.replaced])).toEqual([["AB", "x$& cab"]]);
    expect(findImages(pairs, "ab", "").map((m) => m.replaced)).toEqual(["a.b c", "cr"]);
    const changed = applyMatches(pairs, findImages(pairs, "ab", "AB"), AT);
    expect(changed.flatMap((p) => p.images.map((i) => i.text))).toEqual(["a.b cAB", "AB", "crAB"]);
  });

  it("CSV round-trips the library, quoting and formula-guarding cells", () => {
    const pairs = [pair("AB", [["abacus, big", 3], ['say "hi"', 1], ["=SUM(A1)", 0], ["no", 1, true]], { notes: "line one\nline two", category: "things" }), pair("CD", [], { notes: "to do" })];
    const csv = libraryToCsv(pairs);
    expect(csv.split("\r\n")[0]).toBe("pair,image,uses,notes,category,placeholder");
    expect(csv).toContain(`"abacus, big"`);
    expect(csv).toContain(`'=SUM(A1)`);
    const { rows, problems } = csvRows(csv);
    expect(problems).toEqual([]);
    const merged = mergeCsvRows([], rows, AT, (() => { let n = 0; return () => `id-${String(++n)}`; })());
    expect(merged.added).toBe(4);
    const strip = (p: LetterPair) => ({ id: p.id, images: p.images.map((i) => [i.text, i.uses, i.flags]), notes: p.notes, category: p.category });
    expect(merged.changed.map(strip)).toEqual(pairs.map(strip));
  });

  it("CSV import reports bad lines, and merging adds without removing or overwriting", () => {
    expect(parseCsv('a,"b\r\nc",d\r\n\r\ne\n')).toEqual([["a", "b\r\nc", "d"], ["e"]]);
    expect(csvRows("word,thing\nAB,x").problems).toEqual([{ line: 1, reason: "header" }]);
    const { rows, problems } = csvRows(`${String.fromCharCode(0xfeff)}Pair,Image,Uses,Notes\nABC,x,,\nAB,y,two,\nAB,,,\nAB,abbey,2,new note\nCD,crab,,`);
    expect(problems).toEqual([{ line: 2, reason: "pair" }, { line: 3, reason: "uses" }, { line: 4, reason: "empty" }]);
    const existing = [pair("AB", [["abacus", 3]], { notes: "mine" })];
    const merged = mergeCsvRows(existing, [...rows, ...rows], AT, () => "fresh");
    expect(merged.added).toBe(2);
    expect(merged.changed.map((p) => [p.id, p.images.map((i) => i.text), p.notes])).toEqual([["AB", ["abacus", "abbey"], "mine"], ["CD", ["crab"], undefined]]);
  });

  it("drill weights favour weak and common pairs; the pick skips recent pairs", () => {
    const ids = ["AB", "CD", "EF"];
    const schedules = scheduleAll(ids, new Map([["AB", [{ at: AT, correct: true }, { at: AT, correct: true }]], ["CD", [{ at: AT, correct: false }]]]), new Date(AT));
    const weights = drillWeights(ids, schedules, new Map([["AB", 10], ["CD", 10], ["EF", 100]]));
    expect(weights[1] ?? 0).toBeGreaterThan(weights[0] ?? 0);
    expect(weights[2] ?? 0).toBeGreaterThan(weights[1] ?? 0);
    const rng = createRng("pick");
    for (let i = 0; i < 50; i++) expect(pickWeighted(ids, weights, rng, ["EF"])).not.toBe("EF");
    expect(pickWeighted([], [], rng, [])).toBeUndefined();
  });

  it("a memo sentence is the scramble's trace split into pairs, with a lone letter as its self-pair", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const buffers = { corners: "UBL", edges: "UR" };
    const memo = sentenceMemo(puzzle, scheme, "sentence", 3, buffers);
    const traces = scrambleTraces(puzzle, scheme, sessionScramble("sentence", 3), "both", buffers);
    expect(memo.pieces.map((p) => p.pairs.join("").slice(0, traces.find((t) => t.pieceType === p.pieceType)?.steps.length))).toEqual(traces.map((t) => t.steps.map((s) => s.letter).join("")));
  });
});
