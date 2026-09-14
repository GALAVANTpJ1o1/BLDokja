import { describe, expect, it } from "vitest";
import { loadPuzzle, type Puzzle } from "../../src/core/puzzle.js";
import { buildCatalogue, buildOrientationCatalogue, DEFAULT_COMM_BOUNDS, DEFAULT_ORIENTATION_BOUNDS } from "../../src/commutator/catalogue.js";
import { searchOrientationAlgs } from "../../src/commutator/orientation-search.js";
import { searchComms } from "../../src/commutator/search.js";
import { algEntry, AlgDatasetSchema, buildRecord, verifyDataset, type AlgDataset, type DatasetProblem } from "../../src/data/alg-dataset.js";
import { ENGINE_VERSION } from "../../src/index.js";

function cornerCycles(puzzle: Puzzle): AlgDataset {
  const bounds = DEFAULT_COMM_BOUNDS.corners;
  const result = searchComms(puzzle, buildCatalogue(puzzle, "corners", bounds), { buffer: "UFR" });
  if (!result.ok) throw new Error("search failed");
  return {
    format: "bld-platform/alg-dataset",
    version: 1,
    id: "3style-corners.UFR",
    puzzle: "3x3x3",
    method: "3style",
    pieceType: "corners",
    buffer: "UFR",
    kind: "cycles",
    generatedBy: { engine: ENGINE_VERSION, bounds: { generators: [...bounds.generators], maxInsertion: bounds.maxInsertion, maxSetup: bounds.maxSetup } },
    records: result.value.cases.map((c) =>
      buildRecord(puzzle, "UFR", { kind: "cycle", targets: [c.targets[0], c.targets[1]] }, c.comms.map((found) => algEntry(puzzle, found, "engine-search"))),
    ),
  };
}

const codes = (problems: readonly DatasetProblem[]) => [...new Set(problems.map((p) => p.code))].sort();
const clone = (dataset: AlgDataset): AlgDataset => structuredClone(dataset);

describe("alg dataset verification", () => {
  it("accepts a complete, freshly searched dataset, including after a JSON round trip", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const dataset = cornerCycles(puzzle);
    expect(dataset.records).toHaveLength(378);
    expect(verifyDataset(puzzle, dataset)).toEqual([]);
    const reparsed = AlgDatasetSchema.parse(JSON.parse(JSON.stringify(dataset)));
    expect(verifyDataset(puzzle, reparsed)).toEqual([]);
  });

  it("accepts twist records built from the twist search", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const bounds = DEFAULT_ORIENTATION_BOUNDS.corners;
    const result = searchOrientationAlgs(puzzle, buildOrientationCatalogue(puzzle, "corners", bounds), { buffer: "UFR" });
    if (!result.ok) throw new Error("search failed");
    const dataset: AlgDataset = {
      ...(cornerCycles(puzzle)),
      id: "3style-twists.UFR",
      kind: "twists",
      records: result.value.cases.map((c) =>
        buildRecord(puzzle, "UFR", { kind: "twist", target: c.target, direction: c.direction ?? "clockwise" }, c.comms.map((f) => algEntry(puzzle, f, "engine-search"))),
      ),
    };
    expect(dataset.records).toHaveLength(14);
    expect(verifyDataset(puzzle, dataset)).toEqual([]);
  });

  it("catches every kind of broken record", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const good = cornerCycles(puzzle);
    const first = good.records[0];
    const second = good.records[1];
    if (first === undefined || second === undefined) throw new Error("no records");
    const mainAlg = first.algs[0];
    if (mainAlg === undefined) throw new Error("no algs");

    const withFirst = (change: (record: AlgDataset["records"][number]) => void): AlgDataset => {
      const dataset = clone(good);
      const record = dataset.records[0];
      if (record === undefined) throw new Error("no record");
      change(record);
      return dataset;
    };

    // The reversed comm: [A, B] becomes [B, A].
    const parsedMain = first.algs[0]?.alg ?? "";
    const reversed = parsedMain.replace(/\[([^[\]:,]+), ([^[\]:,]+)\]/, "[$2, $1]");
    expect(reversed).not.toBe(parsedMain);
    expect(codes(verifyDataset(puzzle, withFirst((r) => { r.algs[0] = { ...mainAlg, alg: reversed }; })))).toContain("does-not-solve");

    expect(codes(verifyDataset(puzzle, withFirst((r) => { r.algs[0] = { ...mainAlg, etm: mainAlg.etm + 1 }; })))).toEqual(["counts-mismatch"]);
    expect(codes(verifyDataset(puzzle, withFirst((r) => { r.algs[0] = { ...mainAlg, alg: "[R, U" }; })))).toEqual(["invalid-alg"]);
    expect(codes(verifyDataset(puzzle, withFirst((r) => { r.algs[0] = { ...mainAlg, alg: mainAlg.alg.replace(/, /g, ",") }; })))).toEqual(["alg-not-canonical"]);
    expect(codes(verifyDataset(puzzle, withFirst((r) => { r.algs[0] = { ...mainAlg, moves: `${mainAlg.moves} U U'` }; })))).toEqual(["moves-mismatch"]);
    expect(codes(verifyDataset(puzzle, withFirst((r) => { r.algs[1] = { ...mainAlg }; })))).toEqual(["duplicate-alg"]);
    expect(codes(verifyDataset(puzzle, withFirst((r) => { r.intendedEffect.stickerCycles.reverse(); })))).toEqual(["wrong-intended-effect"]);
    expect(codes(verifyDataset(puzzle, withFirst((r) => { r.intendedEffect.sideEffectPieces.push("UF"); })))).toEqual(["side-effects-not-allowed"]);
    expect(codes(verifyDataset(puzzle, withFirst((r) => { r.id = "not-a-case"; })))).toEqual(["missing-record", "unexpected-record", "wrong-id"]);

    // An alg that solves a different case: a correct alg on the wrong record.
    const otherAlg = second.algs[0];
    if (otherAlg === undefined) throw new Error("no algs");
    expect(codes(verifyDataset(puzzle, withFirst((r) => { r.algs[0] = otherAlg; })))).toEqual(["does-not-solve", "wrong-effect"]);

    const missing = clone(good);
    missing.records.splice(5, 1);
    expect(codes(verifyDataset(puzzle, missing))).toEqual(["missing-record"]);
    const reordered = clone(good);
    reordered.records.reverse();
    expect(codes(verifyDataset(puzzle, reordered))).toEqual(["records-out-of-order"]);
    const wrongKind = clone(good);
    wrongKind.kind = "flips";
    expect(codes(verifyDataset(puzzle, wrongKind))).toContain("kind-mismatch");
    expect(codes(verifyDataset(puzzle, { ...clone(good), buffer: "UF" }))).toEqual(["unknown-buffer"]);
  });

  it("rejects malformed JSON shapes", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const good = JSON.parse(JSON.stringify(cornerCycles(puzzle))) as { records: { targets: string[]; algs: { source: string }[] }[] };
    const parses = (mutate: (d: typeof good) => void) => {
      const copy = structuredClone(good);
      mutate(copy);
      return AlgDatasetSchema.safeParse(copy).success;
    };
    expect(parses(() => undefined)).toBe(true);
    expect(parses((d) => { if (d.records[0]) d.records[0].targets = ["UFR", "not a sticker"]; })).toBe(false);
    expect(parses((d) => { d.records[0]?.algs.push(...(d.records[0].algs)); })).toBe(false);
    expect(parses((d) => { if (d.records[0]?.algs[0]) d.records[0].algs[0].source = "memory"; })).toBe(false);
  });
});
