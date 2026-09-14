import { Alg, Move } from "cubing/alg";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { mod } from "../../src/core/arrays.js";
import { loadPuzzle, type PuzzleId } from "../../src/core/puzzle.js";
import { cancelMoves, expandAlg, expandNodes, formatMoves } from "../../src/commutator/expand.js";
import { moveCounts } from "../../src/commutator/metrics.js";
import { formatNodes, parseAlg, type AlgMove, type QuarterTurns } from "../../src/commutator/parse.js";
import { algNodesArbitrary } from "./arbitraries.js";

function parsed(puzzle: PuzzleId, text: string) {
  const result = parseAlg(puzzle, text);
  if (!result.ok) throw new Error(`${text}: ${JSON.stringify(result.error)}`);
  return result.value;
}

/** Bracket definitions: [A, B] = A B A' B', [A: B] = A B A'. */
const EXPANSIONS: readonly (readonly [string, string])[] = [
  ["[R, U]", "R U R' U'"],
  ["[R, U2]", "R U2 R' U2"],
  ["[R U R', D]", "R U R' D R U' R' D'"],
  ["[U: [R, D]]", "U R D R' D' U'"],
  ["[U: R, D]", "U R D R' D' U'"],
  ["[R, U: D]", "R U D U' R' U D' U'"],
  ["[R2' U: [M', D2]]", "R2 U M' D2 M D2 U' R2"],
  ["[R, U] [F: D]", "R U R' U' F D F'"],
];

/** Cancellation keeps families as written: same axis commutes, same family merges. */
const CANCELLATIONS: readonly (readonly [string, string])[] = [
  ["R L R", "R2 L"],
  ["Rw R'", "Rw R'"],
  ["R U U' R'", ""],
  ["R R R", "R'"],
  ["R2' R2", ""],
  ["U D U' D'", ""],
  ["R M' L'", "R M' L'"],
  ["x R x'", "R"],
  ["U R U'", "U R U'"],
  ["F B F2 S B'", "F' S"],
  ["[R: [U, R]]", "R U R U' R2"],
  ["[R U: R']", "R U R' U' R'"],
];

function fromCubing(alg: Alg): AlgMove[] {
  return [...alg.expand().childAlgNodes()].map((node): AlgMove => {
    const move = node.as(Move);
    if (move === null) throw new Error(`not a move: ${node.toString()}`);
    return { type: "move", family: move.quantum.toString(), amount: mod(move.amount, 4) as QuarterTurns };
  });
}

describe("expandAlg: golden cases", () => {
  it.each(EXPANSIONS.map(([input, expanded]) => ({ input, expanded })))("$input", ({ input, expanded }) => {
    expect(formatMoves(expandAlg(parsed("3x3x3", input)))).toBe(expanded);
  });

  it.each(CANCELLATIONS.map(([input, cancelled]) => ({ input, cancelled })))("$input cancels to $cancelled", ({ input, cancelled }) => {
    expect(formatMoves(expandAlg(parsed("3x3x3", input), { cancel: true }))).toBe(cancelled);
  });

  it("cancels 4x4 moves by axis, not by layer", () => {
    expect(formatMoves(expandAlg(parsed("4x4x4", "2R 3Rw' 2R' Rw 3Rw"), { cancel: true }))).toBe("Rw");
    expect(formatMoves(expandAlg(parsed("4x4x4", "r Rw'"), { cancel: true }))).toBe("r Rw'");
  });
});

describe.each(["3x3x3", "4x4x4"] as const)("expandAlg properties: %s", (id) => {
  it("expands exactly as cubing.js does", () => {
    fc.assert(
      fc.property(algNodesArbitrary(id), (nodes) => {
        const text = formatNodes(nodes);
        expect(expandNodes(nodes), text).toEqual(fromCubing(new Alg(text)));
      }),
      { seed: 19092026, numRuns: 400 },
    );
  });

  it("cancellation keeps the effect, is idempotent, never lengthens and never raises a metric", async () => {
    const puzzle = await loadPuzzle(id);
    // A few families on few axes, so merges and commuting runs happen often.
    const families = id === "3x3x3" ? ["R", "L", "M", "Rw", "x", "U", "D", "E"] : ["R", "L", "2R", "Rw", "3Lw", "x", "U", "2D", "Uw"];
    fc.assert(
      fc.property(fc.oneof(algNodesArbitrary(id, { families }), algNodesArbitrary(id)), (nodes) => {
        const expanded = expandNodes(nodes);
        const cancelled = cancelMoves(id, expanded);
        const text = formatNodes(nodes);
        const effect = (moves: readonly AlgMove[]) => puzzle.kpuzzle.algToTransformation(formatMoves(moves));
        expect(effect(cancelled).isIdentical(effect(expanded)), text).toBe(true);
        expect(cancelMoves(id, cancelled), text).toEqual(cancelled);
        expect(cancelled.length, text).toBeLessThanOrEqual(expanded.length);
        const before = moveCounts(id, expanded);
        const after = moveCounts(id, cancelled);
        for (const metric of ["htm", "qtm", "stm", "etm"] as const) expect(after[metric], `${text} ${metric}`).toBeLessThanOrEqual(before[metric]);
      }),
      { seed: 20092026, numRuns: 400 },
    );
  });
});
