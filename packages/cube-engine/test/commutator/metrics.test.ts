import { Alg } from "cubing/alg";
import { experimentalCountMetricMoves, ExperimentalCommonMetric } from "cubing/notation";
import { cube3x3x3 } from "cubing/puzzles";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { verifiedMoves, type PuzzleId } from "../../src/core/puzzle.js";
import { formatMoves } from "../../src/commutator/expand.js";
import { moveCounts } from "../../src/commutator/metrics.js";
import { parseAlg, type AlgMove } from "../../src/commutator/parse.js";

function movesOf(puzzle: PuzzleId, text: string): AlgMove[] {
  const result = parseAlg(puzzle, text);
  if (!result.ok) throw new Error(`${text}: ${JSON.stringify(result.error)}`);
  return result.value.nodes.flatMap((node) => (node.type === "move" ? [node] : []));
}

/**
 * From the Speedsolving wiki's Metric page (checked 2026-09-14): HTM counts any face turn as 1, a
 * slice as 2, a wide move as 1, rotations 0; QTM counts quarter turns, so a half turn is 2, M is
 * 2 and M2 is 4; STM counts any single slice or block turn as 1. ETM here counts every written
 * move, rotations included (see DECISIONS D-017).
 */
const GOLDEN: readonly (readonly [PuzzleId, string, number, number, number, number])[] = [
  //  puzzle    move    htm qtm stm etm
  ["3x3x3", "R", 1, 1, 1, 1],
  ["3x3x3", "R2", 1, 2, 1, 1],
  ["3x3x3", "R'", 1, 1, 1, 1],
  ["3x3x3", "M", 2, 2, 1, 1],
  ["3x3x3", "M2", 2, 4, 1, 1],
  ["3x3x3", "E'", 2, 2, 1, 1],
  ["3x3x3", "S2", 2, 4, 1, 1],
  ["3x3x3", "Rw", 1, 1, 1, 1],
  ["3x3x3", "Rw2", 1, 2, 1, 1],
  ["3x3x3", "r'", 1, 1, 1, 1],
  ["3x3x3", "2R", 2, 2, 1, 1],
  ["3x3x3", "x", 0, 0, 0, 1],
  ["3x3x3", "x2", 0, 0, 0, 1],
  ["4x4x4", "R", 1, 1, 1, 1],
  ["4x4x4", "Rw", 1, 1, 1, 1],
  ["4x4x4", "3Rw2", 1, 2, 1, 1],
  ["4x4x4", "2R", 2, 2, 1, 1],
  ["4x4x4", "2R2", 2, 4, 1, 1],
  ["4x4x4", "2-3Rw'", 2, 2, 1, 1],
  ["4x4x4", "y'", 0, 0, 0, 1],
];

describe("moveCounts", () => {
  it.each(GOLDEN.map(([puzzle, move, htm, qtm, stm, etm]) => ({ puzzle, move, expected: { htm, qtm, stm, etm } })))(
    "$puzzle $move",
    ({ puzzle, move, expected }) => {
      expect(moveCounts(puzzle, movesOf(puzzle, move))).toEqual(expected);
    },
  );

  it("sums over a sequence", () => {
    expect(moveCounts("3x3x3", movesOf("3x3x3", "R U2 M' x D2 Rw"))).toEqual({ htm: 6, qtm: 8, stm: 5, etm: 6 });
  });

  it("agrees with cubing.js's 3x3x3 counters (OBTM, RBTM, ETM), and QTM doubles half turns", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...verifiedMoves("3x3x3")), { maxLength: 25 }), (sequence) => {
        const text = sequence.join(" ");
        const moves = movesOf("3x3x3", text);
        const counts = moveCounts("3x3x3", moves);
        const alg = new Alg(formatMoves(moves));
        expect(counts.htm, text).toBe(experimentalCountMetricMoves(cube3x3x3, ExperimentalCommonMetric.OuterBlockTurnMetric, alg));
        expect(counts.stm, text).toBe(experimentalCountMetricMoves(cube3x3x3, ExperimentalCommonMetric.RangeBlockTurnMetric, alg));
        expect(counts.etm, text).toBe(experimentalCountMetricMoves(cube3x3x3, ExperimentalCommonMetric.ExecutionTurnMetric, alg));
        const quarterWeighted = moves.reduce((sum, move) => sum + moveCounts("3x3x3", [move]).htm * (move.amount === 2 ? 2 : 1), 0);
        expect(counts.qtm, text).toBe(quarterWeighted);
      }),
      { seed: 21092026, numRuns: 500 },
    );
  });
});
