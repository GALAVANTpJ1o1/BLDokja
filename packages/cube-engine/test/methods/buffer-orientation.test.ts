import { describe, expect, it } from "vitest";
import { formatMoves } from "../../src/commutator/expand.js";
import { loadPuzzle, type Puzzle } from "../../src/core/puzzle.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { m2BufferPairs, m2OpSystem, solveM2Op } from "../../src/methods/m2.js";
import { opBufferPairs, opSystem, solveOpOp, type BufferPair } from "../../src/methods/op.js";
import { pieceType } from "../../src/pieces/piece-types.js";
import { createRng } from "../../src/random/prng.js";
import { randomState3x3 } from "../../src/random/random-state.js";

/**
 * A buffer is a piece, but a learner traces from one of its stickers: UBL, LUB or BUL for the corner, UR or RU for
 * the edge. The settings offer every one of them, so each has to build, verify and solve a cube, not only the
 * reference sticker the pair lists name. The memo differs between them (the first target is where *that* sticker
 * belongs), which is the point of choosing one.
 */
const stickersOfPiece = (puzzle: Puzzle, typeId: "corners" | "edges", sticker: string): string[] =>
  pieceType(puzzle, typeId).pieces.find((p) => p.stickers.some((s) => s.name === sticker))?.stickers.map((s) => s.name) ?? [];

describe("buffer orientations", () => {
  it("the corner UBL has three buffer stickers and the edge UR two, and they name the same pieces", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    expect(stickersOfPiece(puzzle, "corners", "UBL").sort()).toEqual(["BUL", "LUB", "UBL"]);
    expect(stickersOfPiece(puzzle, "edges", "UR").sort()).toEqual(["RU", "UR"]);
  });

  it("OP: every orientation of a buffer pair builds, verifies and solves random cubes", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const solved = puzzle.kpuzzle.defaultPattern();
    const rng = createRng("op buffer orientations");
    const pairs = opBufferPairs(puzzle);
    const sampled: BufferPair[] = [{ corners: "UBL", edges: "UR" }, ...[7, 23, 41].flatMap((i) => (pairs[i] === undefined ? [] : [pairs[i]]))];
    let checked = 0;
    for (const pair of sampled) {
      for (const corner of stickersOfPiece(puzzle, "corners", pair.corners)) {
        for (const edge of stickersOfPiece(puzzle, "edges", pair.edges)) {
          const system = opSystem(puzzle, { cornerBuffer: corner, edgeBuffer: edge });
          expect(system.ok, `${corner}/${edge}`).toBe(true);
          if (!system.ok) continue;
          for (let run = 0; run < 25; run++) {
            const pattern = randomState3x3(puzzle, rng);
            const solution = solveOpOp(puzzle, { pattern }, { scheme, ...system.value });
            expect(solution.ok, `${corner}/${edge} run ${String(run)}`).toBe(true);
            if (solution.ok) expect(pattern.applyAlg(formatMoves(solution.value.moves)).isIdentical(solved), `${corner}/${edge} run ${String(run)}`).toBe(true);
          }
          checked++;
        }
      }
    }
    expect(checked).toBe(sampled.length * 6);
  }, 120_000);

  it("M2: every orientation of a buffer pair builds, verifies and solves random cubes", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const solved = puzzle.kpuzzle.defaultPattern();
    const rng = createRng("m2 buffer orientations");
    const pairs = m2BufferPairs(puzzle);
    const sampled = [{ corners: "UBL", edges: "DF" }, ...[1, pairs.length - 1].flatMap((i) => (pairs[i] === undefined ? [] : [pairs[i]]))];
    let checked = 0;
    for (const pair of sampled) {
      for (const corner of stickersOfPiece(puzzle, "corners", pair.corners)) {
        for (const edge of stickersOfPiece(puzzle, "edges", pair.edges)) {
          const system = m2OpSystem(puzzle, { cornerBuffer: corner, edgeBuffer: edge });
          expect(system.ok, `${corner}/${edge}`).toBe(true);
          if (!system.ok) continue;
          for (let run = 0; run < 25; run++) {
            const pattern = randomState3x3(puzzle, rng);
            const solution = solveM2Op(puzzle, { pattern }, { scheme, ...system.value });
            expect(solution.ok, `${corner}/${edge} run ${String(run)}`).toBe(true);
            if (solution.ok) expect(pattern.applyAlg(formatMoves(solution.value.moves)).isIdentical(solved), `${corner}/${edge} run ${String(run)}`).toBe(true);
          }
          checked++;
        }
      }
    }
    expect(checked).toBe(sampled.length * 6);
  }, 120_000);
});
