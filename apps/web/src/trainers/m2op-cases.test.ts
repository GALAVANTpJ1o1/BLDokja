import { drillScramble, loadPuzzle, M2DatasetSchema, OpSetupsDatasetSchema, parseAlg, speffzScheme } from "@bld/cube-engine";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shotCases, type ShotDatasets } from "./m2op-cases";

const read = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "content", "algs", "3x3", name), "utf8")) as unknown;
const datasets: ShotDatasets = {
  opCorners: OpSetupsDatasetSchema.parse(read("op-corners.UBL.json")),
  opEdges: OpSetupsDatasetSchema.parse(read("op-edges.UR.json")),
  m2Edges: M2DatasetSchema.parse(read("m2-edges.DF.json")),
};

describe("M2/OP trainer cases", () => {
  it("has one case per target (21 corner, 22 edge, 22 M2) and 8 M2 special cases, all with unique ids", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const counts = (["op-corners", "op-edges", "m2-edges", "m2-special"] as const).map((m) => shotCases(m, datasets, scheme));
    expect(counts.map((c) => c.length)).toEqual([21, 22, 22, 8]);
    const ids = counts.flat().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every case's moves, setup and notation are the dataset record's, and its drill scramble exists", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    for (const mode of ["op-corners", "op-edges", "m2-edges"] as const) {
      const records = mode === "m2-edges" ? datasets.m2Edges.records : (mode === "op-corners" ? datasets.opCorners : datasets.opEdges).records;
      for (const c of shotCases(mode, datasets, scheme)) {
        const record = records.find((r) => r.target === c.target);
        if (record === undefined) throw new Error(c.id);
        expect([c.moves, c.notation], c.id).toEqual([record.algs[0]?.moves, record.algs[0]?.alg]);
        expect(c.setup, c.id).toBe("setup" in record ? record.setup : "");
        expect(parseAlg("3x3x3", c.moves).ok).toBe(true);
        expect(drillScramble(puzzle, c.moves).ok).toBe(true);
      }
    }
  });

  it("special cases follow the dataset's odd-step rule: odd UF is shot as DB, and so on; even uses the target's own alg", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const specials = shotCases("m2-special", datasets, scheme);
    for (const rule of datasets.m2Edges.oddStepRule) {
      const odd = specials.find((c) => c.target === rule.target && c.position === "odd");
      const even = specials.find((c) => c.target === rule.target && c.position === "even");
      expect(odd?.shootAs).toBe(rule.shootAs);
      expect(odd?.moves).toBe(datasets.m2Edges.records.find((r) => r.target === rule.shootAs)?.algs[0]?.moves);
      expect(even?.moves).toBe(datasets.m2Edges.records.find((r) => r.target === rule.target)?.algs[0]?.moves);
    }
    expect(datasets.m2Edges.oddStepRule.map((r) => `${r.target}>${r.shootAs}`).sort()).toEqual(["BD>FU", "DB>UF", "FU>BD", "UF>DB"]);
  });

  it("letters come from the scheme", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    for (const c of shotCases("op-edges", datasets, scheme)) expect(c.letter).toBe(scheme.letters.edges?.[c.target]);
  });
});
