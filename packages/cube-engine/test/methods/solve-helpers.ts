import { expect } from "vitest";
import { verifiedMoves, type Puzzle } from "../../src/core/puzzle.js";
import { formatMoves } from "../../src/commutator/expand.js";
import { stepMoves, type MethodSolution, type MethodStep } from "../../src/methods/solution.js";
import type { Rng } from "../../src/random/prng.js";
import { randomMoveSequence, randomState3x3 } from "../../src/random/random-state.js";
import type { TraceInput, TraceResult } from "../../src/trace/trace.js";

/** Shared by the 3-style and M2 + 3-style full-solve tests. */

const WIDE_AND_ROTATIONS = ["Uw", "Rw", "Fw", "x", "y", "z", "M", "E", "S"];

export function solvesIt(puzzle: Puzzle, input: TraceInput, moves: string): boolean {
  const pattern = "pattern" in input ? input.pattern : puzzle.kpuzzle.defaultPattern().applyAlg(input.alg);
  return pattern.applyAlg(moves).isIdentical(puzzle.kpuzzle.defaultPattern());
}

export function randomInput(puzzle: Puzzle, rng: Rng): TraceInput {
  if (rng.int(2) === 0) return { pattern: randomState3x3(puzzle, rng) };
  const moves = verifiedMoves("3x3x3");
  const tail = moves.filter((m) => WIDE_AND_ROTATIONS.includes(m.replace(/['2]/g, "")));
  return { alg: [...randomMoveSequence(rng, moves, 20), ...randomMoveSequence(rng, tail, 2)].join(" ") };
}

export const movesOf = (steps: readonly MethodStep[]) => formatMoves(steps.flatMap((s) => [...stepMoves(s)]));

/** Every traced target of one piece type is solved exactly once: by a comm, a tail, or the parity alg itself. */
export function checkCoverage(solution: MethodSolution, typeId: "corners" | "edges", trace: TraceResult, context: string): void {
  const covered: number[] = [];
  for (const step of solution.steps) {
    if (step.kind === "cycle" && step.pieceType === typeId) {
      step.traceIndices.forEach((index, k) => {
        expect(step.targets[k], `${context} ${typeId} target ${index}`).toBe(trace.targetStickers[index]);
      });
      covered.push(...step.traceIndices);
    }
    if (step.kind === "orientation" && step.pieceType === typeId && step.parityTail !== undefined) {
      expect(step.parityTail.target, context).toBe(trace.targetStickers[step.parityTail.traceIndex]);
      covered.push(step.parityTail.traceIndex);
    }
    if (step.kind === "parity") for (const shot of step.shoots ?? []) if (shot.pieceType === typeId) covered.push(shot.traceIndex);
  }
  expect([...covered].sort((a, b) => a - b), `${context} ${typeId} coverage`).toEqual(trace.targetStickers.map((_, i) => i));
}

