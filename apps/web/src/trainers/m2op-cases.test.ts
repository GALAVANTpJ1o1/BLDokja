import { drillScramble, loadPuzzle, M2DatasetSchema, M2OpParityDatasetSchema, OpParityDatasetSchema, OpSetupsDatasetSchema, parseAlg, speffzScheme } from "@bld/cube-engine";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sessionScramble } from "./guided-trace";
import { familyOf, scrambleDrill, shotCases, type MethodDatasets, type ShotDatasets } from "./m2op-cases";

const read = (name: string) => JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "content", "algs", "3x3", name), "utf8")) as unknown;
const datasets: ShotDatasets = {
  opCorners: OpSetupsDatasetSchema.parse(read("op-corners.UBL.json")),
  opEdges: OpSetupsDatasetSchema.parse(read("op-edges.UR.json")),
  m2Edges: M2DatasetSchema.parse(read("m2-edges.DF.json")),
};
const methods: MethodDatasets = { ...datasets, opParity: OpParityDatasetSchema.parse(read("op-parity.UBL-UR.json")), m2opParity: M2OpParityDatasetSchema.parse(read("m2op-parity.UBL-DF.json")) };

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

  it("every target belongs to exactly one face family", async () => {
    const scheme = speffzScheme(await loadPuzzle("3x3x3"));
    for (const mode of ["op-corners", "op-edges", "m2-edges"] as const) for (const c of shotCases(mode, datasets, scheme)) expect(familyOf(c.target), c.id).toBe(c.target[0]);
  });

  it("a full-scramble drill is the solver's solution step by step, and it solves the scramble", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const solved = puzzle.kpuzzle.defaultPattern();
    const ids = new Set((["op-corners", "op-edges", "m2-edges", "m2-special"] as const).flatMap((m) => shotCases(m, datasets, scheme).map((c) => c.id)));
    const specials = shotCases("m2-special", datasets, scheme);
    let parities = 0;
    let oddSpecials = 0;
    for (const method of ["op", "m2"] as const)
      for (let i = 0; i < 40; i++) {
        const scramble = sessionScramble("m2op-scramble-test", i);
        const drill = scrambleDrill(puzzle, scheme, method, scramble, methods);
        if (drill === undefined) throw new Error(`${method} #${String(i)} did not solve`);
        expect(solved.applyAlg(scramble).applyAlg(drill.moves).isIdentical(solved)).toBe(true);
        expect(drill.items.map((it) => it.moves).join(" ").trim()).toBe(drill.moves);
        for (const [k, item] of drill.items.entries()) {
          expect(item.before, `${method} #${String(i)} step ${String(k)}`).toBe(drill.items.slice(0, k).map((it) => it.moves).join(" ").trim());
          if (item.kind === "parity") parities++;
          else {
            expect(ids.has(item.caseId), item.caseId).toBe(true);
            if (item.position === "odd") {
              oddSpecials++;
              expect(item.moves).toBe(specials.find((c) => c.id === item.caseId)?.moves);
            }
          }
        }
        const edgeItems = drill.items.filter((it) => it.pieceType === "edges");
        expect(edgeItems.map((it) => it.letter)).toEqual(drill.memo.edges.slice(0, edgeItems.length));
      }
    expect(parities).toBeGreaterThan(0);
    expect(oddSpecials).toBeGreaterThan(0);
  });
});
