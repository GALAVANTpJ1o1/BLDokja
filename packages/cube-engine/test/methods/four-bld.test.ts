import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { formatMoves } from "../../src/commutator/expand.js";
import type { AlgMove } from "../../src/commutator/parse.js";
import { faceletsOf, loadPuzzle, verifiedMoves, type Puzzle } from "../../src/core/puzzle.js";
import { ContentDatasetSchema } from "../../src/data/content-dataset.js";
import type { OpCornerParityDataset } from "../../src/data/four-bld-parity.js";
import type { OpSetupsDataset } from "../../src/data/op-dataset.js";
import type { SwapDataset, SwapParityDataset } from "../../src/data/swap-dataset.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { fourBldStepMoves, solveFourBld, type FourBldConfig, type FourBldPieceType, type FourBldSolution } from "../../src/methods/four-bld.js";
import { stickerName } from "../../src/pieces/names.js";
import { createRng } from "../../src/random/prng.js";
import { randomMoveSequence } from "../../src/random/random-state.js";

/**
 * The 4BLD solver (D-041): U2 centres, r2 wings, OP corners, each with its parity alg. The property that
 * matters is that the solution solves the cube, judged by what it shows (x-centres of a colour are the same
 * piece). Scrambles use outer, wide and inner-slice turns, so the cube is also turned as a whole.
 */

const algs = join(import.meta.dirname, "..", "..", "..", "..", "content", "algs");
const load = (path: string) => ContentDatasetSchema.parse(JSON.parse(readFileSync(join(algs, path), "utf8")));

let puzzle: Puzzle;
let config: FourBldConfig;

beforeAll(async () => {
  puzzle = await loadPuzzle("4x4x4");
  config = {
    scheme: speffzScheme(puzzle),
    centres: load("4x4/u2-xcenters.Ubr.json") as SwapDataset,
    centreParity: load("4x4/u2-parity.Ubr.json") as SwapParityDataset,
    wings: load("4x4/r2-wings.FDr.json") as SwapDataset,
    wingParity: load("4x4/r2-parity.FDr.json") as SwapParityDataset,
    corners: load("3x3/op-corners.UBL.json") as OpSetupsDataset,
    cornerParity: load("4x4/op-corner-parity.UBL.json") as OpCornerParityDataset,
  };
});

/** Slots showing a colour other than their face's, by name. */
function wrongSlots(alg: string): string[] {
  const facelets = faceletsOf(puzzle, puzzle.kpuzzle.defaultPattern().applyAlg(alg));
  return Array.from(facelets).flatMap((home, slot) => (puzzle.geometry.sticker(home).face === puzzle.geometry.sticker(slot).face ? [] : [`${stickerName(puzzle.geometry, slot)}<-${stickerName(puzzle.geometry, home)}`]));
}

/** Slots holding another sticker than their own, compared exactly except where pieces are interchangeable. */
function movedSlots(alg: string): string[] {
  const facelets = faceletsOf(puzzle, puzzle.kpuzzle.defaultPattern().applyAlg(alg));
  return Array.from(facelets).flatMap((home, slot) => {
    if (home === slot) return [];
    const orbit = puzzle.stickerMap.orbits[puzzle.stickerMap.slotOfSticker[slot]?.orbitIndex ?? -1];
    if (orbit?.interchangeable === true && puzzle.geometry.sticker(home).face === puzzle.geometry.sticker(slot).face) return [];
    return [`${stickerName(puzzle.geometry, slot)}<-${stickerName(puzzle.geometry, home)}`];
  });
}

function scramble(seed: string, i: number): string {
  const rng = createRng(`${seed}#${String(i)}`);
  const moves = verifiedMoves("4x4x4").filter((m) => /^(?:[UDRLFB]|[UDRLFB]w|2[UDRLFB])['2]?$/.test(m));
  return randomMoveSequence(rng, moves, 40).join(" ");
}

function solve(s: string): FourBldSolution {
  const solved = solveFourBld(puzzle, { alg: s }, config);
  if (!solved.ok) throw new Error(`${s}: ${JSON.stringify(solved.error)}`);
  return solved.value;
}

/** A piece type's steps (targets, then its parity step if any), as moves. */
const phase = (solution: FourBldSolution, pieceTypeId: FourBldPieceType): AlgMove[] => solution.steps.filter((st) => st.pieceType === pieceTypeId).flatMap((st) => [...fourBldStepMoves(st)]);
const odd = (solution: FourBldSolution, pieceTypeId: FourBldPieceType) => solution.traces[pieceTypeId].targetStickers.length % 2 === 1;

describe("4BLD solver", () => {
  it("solves random scrambles, and meets every combination of odd and even counts along the way", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 120; i++) {
      const s = scramble("4bld solver", i);
      const solution = solve(s);
      expect(wrongSlots(`${s} ${formatMoves(solution.moves)}`), s).toEqual([]);
      for (const pieceTypeId of ["xcenters", "wings", "corners"] as const) {
        // One step per traced target, and a parity step exactly when the count is odd.
        expect(solution.steps.filter((st) => st.kind === "target" && st.pieceType === pieceTypeId)).toHaveLength(solution.traces[pieceTypeId].targetStickers.length);
        expect(solution.steps.some((st) => st.kind === "parity" && st.pieceType === pieceTypeId), `${s} ${pieceTypeId}`).toBe(odd(solution, pieceTypeId));
      }
      seen.add((["xcenters", "wings", "corners"] as const).map((t) => (odd(solution, t) ? "odd" : "even")).join("/"));
    }
    expect(seen.size, [...seen].join(", ")).toBe(8);
  });

  it("wing and corner counts are odd exactly when their permutations are", () => {
    for (let i = 0; i < 60; i++) {
      const s = scramble("4bld parity", i);
      const solution = solve(s);
      for (const pieceTypeId of ["wings", "corners"] as const) expect(odd(solution, pieceTypeId), `${s} ${pieceTypeId}`).toBe(solution.traces[pieceTypeId].parity);
    }
  });

  it("an inner slice quarter turn makes the wings odd and not the corners; an outer turn the reverse; a wide turn both", () => {
    const parities = (alg: string) => {
      const solution = solve(alg);
      return { wings: solution.traces.wings.parity, corners: solution.traces.corners.parity };
    };
    expect(parities("2R")).toEqual({ wings: true, corners: false });
    expect(parities("R")).toEqual({ wings: false, corners: true });
    expect(parities("Rw")).toEqual({ wings: true, corners: true });
  });

  it("has teeth: leaving out any parity step leaves the cube unsolved", () => {
    const checked = new Set<FourBldPieceType>();
    for (let i = 0; i < 120 && checked.size < 3; i++) {
      const s = scramble("4bld teeth", i);
      const solution = solve(s);
      for (const step of solution.steps) {
        if (step.kind !== "parity" || checked.has(step.pieceType)) continue;
        const without = solution.steps.filter((st) => st !== step).flatMap((st) => [...fourBldStepMoves(st)]);
        expect(wrongSlots(`${s} ${formatMoves(without)}`).length, `${s} without ${step.pieceType} parity`).toBeGreaterThan(0);
        checked.add(step.pieceType);
      }
    }
    expect([...checked].sort()).toEqual(["corners", "wings", "xcenters"]);
  });

  it("wings and corners can go in either order, but centres must come first", () => {
    let cornersFirst = 0;
    let centresLastFailed = false;
    for (let i = 0; i < 60; i++) {
      const s = scramble("4bld order", i);
      const solution = solve(s);
      const [centres, wings, corners] = [phase(solution, "xcenters"), phase(solution, "wings"), phase(solution, "corners")];
      // Each wing and corner phase puts back everything but its own pieces, once its parity step is in.
      expect(wrongSlots(`${s} ${formatMoves([...centres, ...corners, ...wings])}`), `${s}: corners before wings`).toEqual([]);
      cornersFirst++;
      // The wing and corner parity algs are only right by colour once the x-centres are solved.
      if ((odd(solution, "wings") || odd(solution, "corners")) && wrongSlots(`${s} ${formatMoves([...wings, ...corners, ...centres])}`).length > 0) centresLastFailed = true;
    }
    expect(cornersFirst).toBe(60);
    expect(centresLastFailed).toBe(true);
  });
});

describe("OP corners on a 4x4", () => {
  it("every corner shot also swaps the UB and UL wing pairs, and moves no other piece but its two corners", () => {
    const leftover = ["BUl<-LUf", "BUr<-LUb", "LUb<-BUr", "LUf<-BUl", "UBl<-ULf", "UBr<-ULb", "ULb<-UBr", "ULf<-UBl"];
    for (const record of config.corners.records) {
      const wrong = movedSlots(record.algs[0]?.moves ?? "");
      expect(wrong.filter((w) => !/^[UDRLFB]{3}</.test(w)).sort(), record.target).toEqual(leftover);
    }
  });

  it("the corner parity alg undoes exactly that, and fails without its U2 setup", () => {
    const [record] = config.cornerParity.records;
    const alg = record.algs[0]?.moves ?? "";
    expect(movedSlots(`${config.corners.swap.alg} ${alg}`).every((w) => /^[UDRLFB]{3}</.test(w))).toBe(true);
    const withoutSetup = "R2 D' x 2R2 U2 2R2 Uw2 2R2 2U2 x' D R2";
    expect(movedSlots(`${config.corners.swap.alg} ${withoutSetup}`).some((w) => !/^[UDRLFB]{3}</.test(w))).toBe(true);
  });

  it("an odd U2 phase is undone by one more U2", () => {
    expect(config.centreParity.records[0].algs.map((a) => a.alg)).toEqual(["U2"]);
  });
});
