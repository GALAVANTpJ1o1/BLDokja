import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { centersRotation } from "../../src/core/frame.js";
import { lastLayerStageSatisfied } from "../../src/data/last-layer.js";
import { matchLastLayerCase } from "../../src/data/last-layer-match.js";
import { casePattern, caseSetup, CuratedSetSchema, firstTwoLayersIntact, STAGE_KIND, styleMoves, verifyCuratedSet, type CuratedSet, type CuratedStage } from "../../src/cfop/curated.js";
import { matchAnswer, normaliseAnswer, solveStage } from "../../src/cfop/classify.js";
import { CO_2LOOK, CP_2LOOK, EO_2LOOK, EP_2LOOK, OLL, PLL } from "../../scripts/cfop-source.js";

const directory = join(import.meta.dirname, "../../../../content/algs/cfop/curated");
const load = (name: string): CuratedSet => CuratedSetSchema.parse(JSON.parse(readFileSync(join(directory, `${name}.json`), "utf8")));
const puzzle = await loadPuzzle("3x3x3");
const sets = { eo: load("eo"), co: load("co"), cp: load("cp"), ep: load("ep"), oll: load("oll"), pll: load("pll") } as const;

describe("curated CFOP last-layer sets", () => {
  it("holds exactly the sets the brief asks for", () => {
    expect(Object.values(sets).map((set) => set.cases.length)).toEqual([3, 7, 2, 4, 57, 21]);
    expect(sets.oll.cases.map((c) => c.number)).toEqual(Array.from({ length: 57 }, (_, i) => i + 1));
  });

  it("verifies every case and every algorithm against the engine", () => {
    for (const set of Object.values(sets)) expect(verifyCuratedSet(puzzle, set), set.stage).toEqual([]);
  });

  it("is the transcribed source, unchanged (the data file cannot drift from the owner-supplied tables)", () => {
    const expected: Record<string, readonly (readonly (string | undefined)[])[]> = {
      eo: EO_2LOOK.map((r) => [r.alg]), co: CO_2LOOK.map((r) => [r.alg]), cp: CP_2LOOK.map((r) => [r.alg]), ep: EP_2LOOK.map((r) => [r.alg]),
      oll: OLL.map(([, , a, b]) => [a, b]), pll: PLL.map(([, , a, b]) => [a, b]),
    };
    for (const [stage, rows] of Object.entries(expected)) {
      const set = sets[stage as CuratedStage];
      expect(set.cases.map((c) => [c.algs["2H"]?.alg, c.algs.OH?.alg].slice(0, rows[0]?.length))).toEqual(rows);
    }
  });

  it("has a two-handed and a one-handed algorithm for every OLL and PLL case", () => {
    expect(sets.oll.cases.filter((c) => c.missing.length > 0)).toEqual([]);
    expect(sets.oll.cases.every((c) => c.algs.OH !== undefined && c.algs["2H"] !== undefined)).toBe(true);
    expect(sets.pll.cases.every((c) => c.algs.OH !== undefined && c.algs["2H"] !== undefined)).toBe(true);
  });

  it("covers every independently enumerated recognition class exactly once", () => {
    for (const stage of ["oll", "pll", "eo", "co", "cp", "ep"] as const) {
      const ids = sets[stage].cases.map((c) => matchLastLayerCase(puzzle, casePattern(puzzle, stage, c.state), STAGE_KIND[stage])?.id);
      expect(ids.every((id) => typeof id === "string"), stage).toBe(true);
      expect(new Set(ids).size, stage).toBe(sets[stage].cases.length);
    }
  });

  it("agrees with the printed shape of each full-OLL row (edges lit per group)", () => {
    for (const kase of sets.oll.cases) {
      const lit = (kase.state.eo ?? []).filter((v) => v === 0).length;
      const expected = kase.group === "Dot" ? 0 : kase.group === "Cross" ? 4 : 2;
      expect(lit, `OLL ${String(kase.number)}`).toBe(expected);
      if (kase.group === "Corners Oriented") expect(kase.state.co).toEqual([0, 0, 0, 0]);
    }
  });

  it("solves every case in both execution styles, keeping the first two layers and restoring the hold", () => {
    for (const set of Object.values(sets)) for (const kase of set.cases) for (const style of ["2H", "OH"] as const) {
      const entry = kase.algs[style];
      if (entry === undefined) continue;
      const end = casePattern(puzzle, set.stage, kase.state).applyAlg(styleMoves(entry));
      expect(centersRotation(puzzle, end)?.alg, `${kase.id} ${style}`).toBe("");
      expect(firstTwoLayersIntact(end), `${kase.id} ${style}`).toBe(true);
    }
  });

  it("recognises every case from the state alone, under every AUF, in both styles", () => {
    for (const set of Object.values(sets)) for (const kase of set.cases) for (const style of ["2H", "OH"] as const) {
      if (kase.algs[style] === undefined) continue;
      for (const auf of ["", "U", "U'", "U2"]) {
        const state = casePattern(puzzle, set.stage, kase.state).applyAlg(auf);
        const solution = solveStage(puzzle, state, set.stage, set, style);
        expect(solution?.case?.id, `${kase.id} ${style} ${auf}`).toBe(kase.id);
        expect(solution === undefined ? false : firstTwoLayersIntact(solution.result), kase.id).toBe(true);
      }
    }
  }, 120_000);

  it("draws every case from a setup that the case's algorithms solve, from the true cube state", () => {
    for (const set of Object.values(sets)) for (const kase of set.cases) {
      const setup = caseSetup(puzzle, set.stage, kase);
      const drawn = puzzle.kpuzzle.defaultPattern().applyAlg(setup);
      expect(firstTwoLayersIntact(drawn), kase.id).toBe(true);
      for (const style of ["2H", "OH"] as const) {
        const entry = kase.algs[style];
        if (entry === undefined) continue;
        const end = drawn.applyAlg(styleMoves(entry));
        expect(centersRotation(puzzle, end)?.alg, `${kase.id} ${style}`).toBe("");
        expect(lastLayerStageSatisfied(puzzle, end, STAGE_KIND[set.stage]), `${kase.id} ${style}`).toBe(true);
      }
    }
  });

  it("accepts trivial formatting differences in a typed answer", () => {
    expect(normaliseAnswer(" Anti-Sune ")).toBe("antisune");
    for (const text of ["Anti Sune", "anti-sune", "ANTISUNE", "OLL 26", "26", "oll26"]) expect(matchAnswer(sets.oll, text).map((c) => c.number), text).toEqual([26]);
    expect(matchAnswer(sets.co, "antisune").map((c) => c.id)).toEqual(["co_antisune"]);
    expect(matchAnswer(sets.pll, "t-perm").map((c) => c.id)).toEqual(["pll_t"]);
    expect(matchAnswer(sets.pll, "Nb perm").map((c) => c.id)).toEqual(["pll_nb"]);
    expect(matchAnswer(sets.eo, "I shape").map((c) => c.id)).toEqual(["eo_line"]);
    expect(matchAnswer(sets.oll, "not a case")).toEqual([]);
  });
});
