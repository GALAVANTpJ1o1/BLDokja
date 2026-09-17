import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KPattern } from "cubing/kpuzzle";
import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { permutationParity } from "../../src/core/arrays.js";
import { entryForAlg } from "../../src/data/alg-dataset.js";
import { matchLastLayerCase } from "../../src/data/last-layer-match.js";
import {
  enumerateOll, enumeratePll, enumerateEo, enumerateCo, enumerateCornerPermOnly,
  enumerateEdgePermOnly, LastLayerDatasetSchema, verifyLastLayerDataset,
  LAST_LAYER_KINDS, pllPattern, ollPattern, lastLayerRecordPattern, lastLayerStageSatisfied,
  type Perm4, type CornerOrient, type EdgeOrient,
} from "../../src/data/last-layer.js";

const directory = join(import.meta.dirname, "../../../../content/algs/cfop");
const load = (kind: string) => LastLayerDatasetSchema.parse(JSON.parse(readFileSync(join(directory, `${kind}.json`), "utf8")));
const turns = ["", "U", "U2", "U'"] as const;
const permutations: Perm4[] = [];
for (const a of [0, 1, 2, 3] as const) for (const b of [0, 1, 2, 3] as const)
  for (const c of [0, 1, 2, 3] as const) for (const d of [0, 1, 2, 3] as const)
    if (new Set([a, b, c, d]).size === 4) permutations.push([a, b, c, d]);

function firstTwoLayersSolved(state: KPattern): boolean {
  return ["CORNERS", "EDGES"].every(name => {
    const orbit = state.patternData[name];
    return orbit !== undefined && orbit.pieces.slice(4).every((piece, i) => piece === i + 4)
      && orbit.orientation.slice(4).every(value => value === 0);
  });
}

describe("CFOP last-layer foundation", () => {
  it("derives the complete recognition sets, including odd-parity 2-look corners", () => {
    expect([enumerateOll(), enumeratePll(), enumerateEo(), enumerateCo(), enumerateCornerPermOnly(), enumerateEdgePermOnly()].map(set => set.length))
      .toEqual([57, 21, 3, 7, 2, 4]);
  });

  it("pins U-layer indices to the actual engine instead of trusting slot names", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const state = puzzle.kpuzzle.defaultPattern().applyMove("U");
    expect(firstTwoLayersSolved(state)).toBe(true);
    for (const name of ["CORNERS", "EDGES"]) {
      const orbit = state.patternData[name];
      expect(orbit?.pieces.slice(0, 4)).not.toEqual([0, 1, 2, 3]);
      expect(orbit?.orientation.every(value => value === 0)).toBe(true);
    }
  });

  it.each(LAST_LAYER_KINDS)("%s: validates and independently applies every generated alg", async kind => {
    const puzzle = await loadPuzzle("3x3x3");
    const dataset = load(kind);
    expect(dataset.id).toBe(kind);
    expect(verifyLastLayerDataset(puzzle, dataset)).toEqual([]);
    for (const record of dataset.records) for (const entry of record.algs) {
      // Rebuild from the independently enumerated stored case, not the algorithm inverse.
      const state = lastLayerRecordPattern(puzzle, dataset, record);
      expect(firstTwoLayersSolved(state), record.id).toBe(true);
      expect(state.applyAlg(entry.moves).isIdentical(puzzle.kpuzzle.defaultPattern()), record.id).toBe(true);
    }
  });

  it("rejects unreachable orientations, malformed permutations and parity mismatches", () => {
    const oll = load("oll");
    if (oll.kind !== "oll") throw new Error("wrong dataset");
    const first = oll.records[0];
    if (first === undefined) throw new Error("empty dataset");
    expect(LastLayerDatasetSchema.safeParse({ ...oll, records: [{ ...first, corners: [1, 0, 0, 0] }] }).success).toBe(false);
    expect(LastLayerDatasetSchema.safeParse({ ...oll, records: [{ ...first, edges: [1, 0, 0, 0] }] }).success).toBe(false);
    const pll = load("pll");
    if (pll.kind !== "pll" || pll.records[0] === undefined) throw new Error("wrong dataset");
    expect(LastLayerDatasetSchema.safeParse({ ...pll, records: [{ ...pll.records[0], corners: [0, 0, 2, 3] }] }).success).toBe(false);
    expect(LastLayerDatasetSchema.safeParse({ ...pll, records: [{ ...pll.records[0], corners: [1, 0, 2, 3], edges: [0, 1, 2, 3] }] }).success).toBe(false);
  });

  it("accepts an OLL that permutes U, but rejects one that damages the first two layers", async () => {
    const puzzle = await loadPuzzle("3x3x3"); const dataset = load("oll");
    if (dataset.kind !== "oll" || dataset.records[0] === undefined || dataset.records[0].algs[0] === undefined) throw new Error("empty dataset");
    const first = dataset.records[0]; const entry = first.algs[0];
    if (entry === undefined) throw new Error("empty algorithm");
    const changed = (suffix: string) => ({ ...dataset, records: [{ ...first, algs: [entryForAlg(puzzle, `${entry.alg} ${suffix}`, "cubing-solver")] }, ...dataset.records.slice(1)] });
    expect(verifyLastLayerDataset(puzzle, changed("U"))).toEqual([]);
    expect(verifyLastLayerDataset(puzzle, changed("R")).map(problem => problem.code)).toContain("does-not-solve");
    expect(verifyLastLayerDataset(puzzle, changed("x")).map(problem => problem.code)).toContain("does-not-solve");
  });

  it("OLL covers all 216 legal orientation states with non-identity permutation", async () => {
    const puzzle = await loadPuzzle("3x3x3"); const dataset = load("oll");
    if (dataset.kind !== "oll") throw new Error("wrong dataset");
    const corners: CornerOrient[] = []; const edges: EdgeOrient[] = [];
    for (const a of [0, 1, 2] as const) for (const b of [0, 1, 2] as const) for (const c of [0, 1, 2] as const) for (const d of [0, 1, 2] as const)
      if ((a + b + c + d) % 3 === 0) corners.push([a, b, c, d]);
    for (const a of [0, 1] as const) for (const b of [0, 1] as const) for (const c of [0, 1] as const) for (const d of [0, 1] as const)
      if ((a + b + c + d) % 2 === 0) edges.push([a, b, c, d]);
    let checked = 0;
    for (const co of corners) for (const eo of edges) {
      const input = ollPattern(puzzle, { corners: co, edges: eo });
      const c = input.patternData.CORNERS; const e = input.patternData.EDGES;
      if (c === undefined || e === undefined) throw new Error("missing orbits");
      const state = new KPattern(puzzle.kpuzzle, { ...input.patternData, CORNERS: { ...c, pieces: [1, 0, 2, 3, 4, 5, 6, 7] }, EDGES: { ...e, pieces: [1, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] } });
      let result = lastLayerStageSatisfied(puzzle, state, "oll") ? state : undefined;
      if (result === undefined) outer: for (const turn of turns) {
        const aligned = state.applyAlg(turn);
        for (const record of dataset.records) {
          if (JSON.stringify(aligned.patternData.CORNERS?.orientation.slice(0, 4)) !== JSON.stringify(record.corners)
            || JSON.stringify(aligned.patternData.EDGES?.orientation.slice(0, 4)) !== JSON.stringify(record.edges)) continue;
          const entry = record.algs[0];
          if (entry === undefined) throw new Error("empty algorithm");
          result = aligned.applyAlg(entry.moves); break outer;
        }
      }
      expect(result, `${co.join(",")}|${eo.join(",")}`).toBeDefined();
      if (result === undefined) throw new Error("missing orientation case");
      expect(lastLayerStageSatisfied(puzzle, result, "oll"), `${co.join(",")}|${eo.join(",")}`).toBe(true);
      checked += 1;
    }
    expect(checked).toBe(216);
  });

  it("rejects a valid algorithm/case substituted under another canonical id", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const dataset = load("oll");
    if (dataset.kind !== "oll") throw new Error("wrong dataset");
    const first = dataset.records[0]; const second = dataset.records[1];
    if (first === undefined || second === undefined) throw new Error("empty dataset");
    const substituted = { ...dataset, records: [{ ...second, id: first.id }, ...dataset.records.slice(1)] };
    expect(verifyLastLayerDataset(puzzle, LastLayerDatasetSchema.parse(substituted)).map(problem => problem.code)).toContain("invalid-case");
  });

  it("catches missing, duplicate, reordered and broken algorithm records", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const dataset = load("eo");
    if (dataset.kind !== "eo") throw new Error("wrong dataset");
    const first = dataset.records[0]; const alg = first?.algs[0];
    if (first === undefined || alg === undefined) throw new Error("empty dataset");
    expect(verifyLastLayerDataset(puzzle, { ...dataset, records: dataset.records.slice(1) }).map(problem => problem.code)).toContain("missing-record");
    expect(verifyLastLayerDataset(puzzle, { ...dataset, records: [...dataset.records].reverse() }).map(problem => problem.code)).toContain("records-out-of-order");
    expect(verifyLastLayerDataset(puzzle, LastLayerDatasetSchema.parse({ ...dataset, records: [first, ...dataset.records] })).length).toBeGreaterThan(0);
    expect(verifyLastLayerDataset(puzzle, LastLayerDatasetSchema.parse({ ...dataset, records: [{ ...first, algs: [{ ...alg, htm: alg.htm + 1 }] }, ...dataset.records.slice(1)] })).map(problem => problem.code)).toContain("counts-mismatch");
  });

  it("2-look corner stage covers every one of the 288 legal PLL states, with independent AUFs", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const dataset = load("corner-perm");
    let checked = 0;
    for (const corners of permutations) for (const edges of permutations) {
      if (permutationParity(corners) !== permutationParity(edges)) continue;
      const state = pllPattern(puzzle, { corners, edges });
      const cornerSolved = (pattern: KPattern) => pattern.patternData.CORNERS?.pieces.every((piece, i) => piece === i)
        && pattern.patternData.CORNERS.orientation.every(value => value === 0);
      let result = turns.map(turn => state.applyAlg(turn)).find(cornerSolved);
      if (result === undefined) outer: for (const before of turns) for (const record of dataset.records) for (const entry of record.algs) for (const after of turns) {
        const candidate = state.applyAlg(`${before} ${entry.moves} ${after}`);
        if (cornerSolved(candidate)) { result = candidate; break outer; }
      }
      expect(result, `corners ${corners.join(",")}, edges ${edges.join(",")}`).toBeDefined();
      if (result === undefined) throw new Error("missing corner case");
      expect(firstTwoLayersSolved(result)).toBe(true);
      expect(result.patternData.EDGES?.orientation.every(value => value === 0)).toBe(true);
      checked += 1;
    }
    expect(checked).toBe(288);
  });

  it.each(["pll", "corner-perm", "edge-perm"] as const)("%s matching returns physically correct pre/post-AUFs", async kind => {
    const puzzle = await loadPuzzle("3x3x3"); const dataset = load(kind);
    let checked = 0;
    for (const corners of permutations) for (const edges of permutations) {
      if (permutationParity(corners) !== permutationParity(edges)) continue;
      if (kind === "edge-perm" && !corners.every((piece, slot) => piece === slot)) continue;
      const state = pllPattern(puzzle, { corners, edges });
      const match = matchLastLayerCase(puzzle, state, kind);
      expect(match, `${kind}: ${corners.join(",")}|${edges.join(",")}`).toBeDefined();
      if (match === undefined) throw new Error("missing match");
      const moves = match.id === null ? "" : dataset.records.find(record => record.id === match.id)?.algs[0]?.moves;
      if (moves === undefined) throw new Error("missing algorithm");
      const result = state.applyAlg(`${match.frame} ${match.before} ${moves} ${match.after}`);
      expect(lastLayerStageSatisfied(puzzle, result, kind)).toBe(true);
      checked += 1;
    }
    expect(checked).toBe(kind === "edge-perm" ? 12 : 288);
  });

  it("recognises OLL with a rotated viewing frame and refuses unmet prerequisites", async () => {
    const puzzle = await loadPuzzle("3x3x3"); const dataset = load("oll");
    for (const record of dataset.records) {
      const state = lastLayerRecordPattern(puzzle, dataset, record).applyAlg("U2 y");
      const match = matchLastLayerCase(puzzle, state, "oll");
      expect(match).toBeDefined();
      if (match === undefined || match.id === null) throw new Error("missing match");
      const moves = dataset.records.find(candidate => candidate.id === match.id)?.algs[0]?.moves;
      if (moves === undefined) throw new Error("missing algorithm");
      expect(lastLayerStageSatisfied(puzzle, state.applyAlg(`${match.frame} ${match.before} ${moves} ${match.after}`), "oll")).toBe(true);
      expect(matchLastLayerCase(puzzle, state, "pll")).toBeUndefined();
    }
    expect(matchLastLayerCase(puzzle, puzzle.kpuzzle.defaultPattern().applyMove("R"), "oll")).toBeUndefined();
    expect(matchLastLayerCase(puzzle, puzzle.kpuzzle.defaultPattern().applyMove("U"), "pll")?.id).toBeNull();
  });
});
