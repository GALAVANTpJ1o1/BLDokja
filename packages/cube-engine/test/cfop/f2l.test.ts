import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Alg } from "cubing/alg";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { createRng } from "../../src/random/prng.js";
import { permutationParity } from "../../src/core/arrays.js";
import {
  allPlacements, classifyF2L, crossSolved, F2L_LEVELS, F2LSetSchema, f2lCases, f2lPattern, f2lSolved, generateF2LPractice, mirrorAlg,
  otherPiecesSolved, unsolvedPairCount, verifyF2LSet, type F2LSet,
} from "../../src/cfop/f2l.js";
import { renderPlan, unsolvedPairs } from "../../src/cfop/render-modes.js";

const puzzle = await loadPuzzle("3x3x3");
const set: F2LSet = F2LSetSchema.parse(JSON.parse(readFileSync(join(import.meta.dirname, "../../../../content/algs/cfop/curated/f2l.json"), "utf8")));
const solutions = set.cases.map((c) => ({ index: c.number, alg: c.algs["2H"].alg }));

describe("F2L cases", () => {
  it("enumerates 41 cases from first principles: 24 + 6 + 6 + 5", () => {
    const cases = f2lCases(puzzle);
    expect(cases).toHaveLength(41);
    const count = (family: string) => cases.filter((c) => c.family === family).length;
    expect([count("both-top"), count("corner-top-edge-slot"), count("corner-slot-edge-top"), count("both-slot")]).toEqual([24, 6, 6, 5]);
    expect(allPlacements()).toHaveLength(5 * 3 * 5 * 2 - 1);
  });

  it("builds only physically legal states, with the cross and other three slots solved", () => {
    for (const placement of allPlacements()) {
      const state = f2lPattern(puzzle, placement);
      const c = state.patternData.CORNERS; const e = state.patternData.EDGES;
      expect(c === undefined || e === undefined).toBe(false);
      if (c === undefined || e === undefined) continue;
      expect(permutationParity(c.pieces)).toBe(permutationParity(e.pieces));
      expect(c.orientation.reduce((a, b) => a + b, 0) % 3).toBe(0);
      expect(e.orientation.reduce((a, b) => a + b, 0) % 2).toBe(0);
      expect(otherPiecesSolved(state)).toBe(true);
      expect(crossSolved(state)).toBe(true);
    }
  });

  it("maps every placement of every U-turn back to its case (AUF never changes the case)", () => {
    for (const kase of f2lCases(puzzle)) for (const member of kase.members) {
      for (const turn of ["", "U", "U2", "U'"]) expect(classifyF2L(puzzle, f2lPattern(puzzle, member).applyAlg(turn))?.index).toBe(kase.index);
    }
  });

  it("stores a reference solution that solves each case, verified by the engine", () => {
    expect(verifyF2LSet(puzzle, set)).toEqual([]);
    expect(set.cases.every((c) => c.missing.includes("OH"))).toBe(true);
  });

  it("solves the mirrored case with the mirrored solution", () => {
    for (const c of set.cases) {
      const mirroredSetup = mirrorAlg(new Alg(c.algs["2H"].alg).invert().toString());
      const state = puzzle.kpuzzle.defaultPattern().applyAlg(mirroredSetup);
      expect(f2lSolved(state.applyAlg(mirrorAlg(c.algs["2H"].alg))), c.id).toBe(true);
    }
  });

  it("makes practice states from legal moves for every level, with pairs really unsolved", () => {
    const rng = createRng("f2l-practice");
    for (const level of F2L_LEVELS) for (let i = 0; i < 40; i += 1) {
      const practice = generateF2LPractice(puzzle, rng, level, solutions);
      expect(crossSolved(practice.state), `level ${String(level)}`).toBe(true);
      if (level === 1) { expect(unsolvedPairCount(practice.state)).toBe(1); expect(classifyF2L(puzzle, practice.state)?.index).toBe(practice.caseIndex); expect(f2lSolved(practice.state.applyAlg(practice.reference))).toBe(true); }
      if (level >= 2) { expect(unsolvedPairCount(practice.state)).toBeGreaterThanOrEqual(level); expect(f2lSolved(practice.state.applyAlg(practice.reference)), `level ${String(level)} reference`).toBe(true); }
      expect(puzzle.kpuzzle.defaultPattern().applyAlg(practice.setup).experimentalIsSolved({ ignorePuzzleOrientation: true, ignoreCenterOrientation: true })).toBe(false);
    }
  });

  it("covers all 41 cases at level 1", () => {
    const rng = createRng("f2l-cover");
    const seen = new Set<number>();
    for (let i = 0; i < 600; i += 1) { const p = generateF2LPractice(puzzle, rng, 1, solutions); if (p.caseIndex !== undefined) seen.add(p.caseIndex); }
    expect(seen.size).toBe(41);
  });

  it("lights the pair and marks the target slot in the single-pair render mode", () => {
    const state = f2lPattern(puzzle, f2lCases(puzzle)[20]?.placement ?? { cornerPlace: 0, cornerTwist: 0, edgePlace: 0, edgeFlip: 0 });
    const plan = renderPlan(puzzle, state, "F2L_SINGLE_PAIR");
    expect(plan.highlight.length).toBeGreaterThanOrEqual(5);
    expect(plan.target).toEqual(expect.arrayContaining(["DFR", "FR"]));
    for (const centre of ["U", "D", "F", "B", "R", "L"]) expect(plan.visibility.get(centre)).toBe("normal");
    expect(plan.visibility.get("DF")).toBe("normal");
    expect(unsolvedPairs(puzzle, state)).toEqual(["FR"]);
  });
});
