import { AlgDatasetSchema, loadPuzzle, validateComm } from "@bld/cube-engine";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyseAlg, candidateComms } from "./sandbox";

const read = (name: string) => AlgDatasetSchema.parse(JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "content", "algs", "3x3", name), "utf8")));
const sources = { corners: read("3style-corners.UFR.json"), edges: read("3style-edges.UF.json") };

describe("comm sandbox", () => {
  it("expands, cancels and counts an alg, and names the 3-cycle only when the engine confirms it", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const result = analyseAlg(puzzle, "[R: [U', R D R']]");
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const a = result.analysis;
    expect(a.expanded).toBe("R U' R D R' U R D' R' R'");
    expect(a.cancelled).toBe("R U' R D R' U R D' R2");
    expect([a.expandedCounts.htm, a.cancelledCounts.htm, a.saved]).toEqual([10, 9, 1]);
    expect(a.moved.corners).toHaveLength(3);
    expect(a.moved.edges).toEqual([]);
    expect(a.threeCycle?.pieceType).toBe("corners");
    const cycle = a.threeCycle?.cycle;
    if (cycle === undefined) throw new Error("no cycle");
    const verdict = validateComm(puzzle, a.written, cycle);
    expect(verdict.ok && verdict.value.valid).toBe(true);
  });

  it("doesn't call a non-3-cycle a 3-cycle, and reports parse errors with their position", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const sexy = analyseAlg(puzzle, "R U R' U'");
    if (!sexy.ok) throw new Error("parse");
    expect(sexy.analysis.threeCycle).toBeUndefined();
    expect(sexy.analysis.moved.corners.length + sexy.analysis.moved.edges.length).toBeGreaterThan(3);
    const broken = analyseAlg(puzzle, "[R, U");
    expect(broken.ok ? "ok" : broken.error.code).toBe("unclosed-bracket");
    expect(analyseAlg(puzzle, "  ").ok).toBe(false);
  });

  it("finds verified comms for three stickers from any of the three rotations, shortest first", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const result = candidateComms(puzzle, sources, ["DFR", "UBL", "RDB"]);
    if (!result.ok) throw new Error(result.error);
    expect(result.comms.length).toBeGreaterThanOrEqual(4);
    expect(new Set(result.comms.map((c) => c.moves)).size).toBe(result.comms.length);
    for (const c of result.comms) {
      const verdict = validateComm(puzzle, c.alg, ["DFR", "UBL", "RDB"]);
      expect(verdict.ok && verdict.value.valid, c.alg).toBe(true);
    }
    expect(result.comms.map((c) => c.etm)).toEqual([...result.comms.map((c) => c.etm)].sort((x, y) => x - y));
    const edges = candidateComms(puzzle, sources, ["FR", "UL", "DB"]);
    expect(edges.ok && edges.comms.length > 0).toBe(true);
    expect(candidateComms(puzzle, sources, ["UFR", "UF", "UBL"])).toEqual({ ok: false, error: "mixed-types" });
    expect(candidateComms(puzzle, sources, ["UFR", "FUR", "UBL"])).toEqual({ ok: false, error: "same-piece" });
  });
});
