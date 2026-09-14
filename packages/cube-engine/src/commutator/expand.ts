import { faceAxis, type Axis } from "../core/geometry.js";
import { parseGeometryMove } from "../core/geometry-moves.js";
import { PUZZLE_SIZES, type PuzzleId } from "../core/puzzle.js";
import { formatMove, type AlgMove, type AlgNode, type ParsedAlg, type QuarterTurns } from "./parse.js";

/**
 * Expansion and cancellation (DECISIONS D-017).
 *
 * Cancellation keeps the move families as written. Moves on one axis commute, so within a run of
 * same-axis moves each family merges with itself (`R L R` → `R2 L`), but different families never
 * merge (`Rw R'` stays). Cancellation never changes the alg's effect and never makes it longer.
 */

export interface ExpandOptions {
  readonly cancel?: boolean;
}

export function invertMoves(moves: readonly AlgMove[]): AlgMove[] {
  return moves.map((move): AlgMove => ({ ...move, amount: (4 - move.amount) as QuarterTurns })).reverse();
}

export function expandNodes(nodes: readonly AlgNode[]): AlgMove[] {
  return nodes.flatMap((node): AlgMove[] => {
    switch (node.type) {
      case "move":
        return [node];
      case "commutator": {
        const a = expandNodes(node.a);
        const b = expandNodes(node.b);
        return [...a, ...b, ...invertMoves(a), ...invertMoves(b)];
      }
      case "conjugate": {
        const setup = expandNodes(node.setup);
        return [...setup, ...expandNodes(node.body), ...invertMoves(setup)];
      }
    }
  });
}

export function expandAlg(alg: ParsedAlg, options: ExpandOptions = {}): AlgMove[] {
  const moves = expandNodes(alg.nodes);
  return options.cancel === true ? cancelMoves(alg.puzzle, moves) : moves;
}

export function formatMoves(moves: readonly AlgMove[]): string {
  return moves.map(formatMove).join(" ");
}

const axisCache = new Map<string, Axis>();

/** The axis a move family turns about, read from the geometry model's notation reader. */
export function moveAxis(puzzle: PuzzleId, family: string): Axis {
  const key = `${puzzle}/${family}`;
  let axis = axisCache.get(key);
  if (axis === undefined) {
    axis = faceAxis(parseGeometryMove(family, PUZZLE_SIZES[puzzle]).face).axis;
    axisCache.set(key, axis);
  }
  return axis;
}

interface Run {
  readonly axis: Axis;
  /** Family → quarter turns, in order of first appearance within the run. */
  readonly turns: Map<string, number>;
}

export function cancelMoves(puzzle: PuzzleId, moves: readonly AlgMove[]): AlgMove[] {
  const runs: Run[] = [];
  for (const move of moves) {
    const axis = moveAxis(puzzle, move.family);
    const last = runs[runs.length - 1];
    if (last?.axis !== axis) {
      runs.push({ axis, turns: new Map([[move.family, move.amount]]) });
      continue;
    }
    const amount = ((last.turns.get(move.family) ?? 0) + move.amount) % 4;
    if (amount === 0) last.turns.delete(move.family);
    else last.turns.set(move.family, amount);
    // An emptied run is the identity, so what follows may merge with the run before it.
    if (last.turns.size === 0) runs.pop();
  }
  return runs.flatMap((run) => [...run.turns].map(([family, amount]): AlgMove => ({ type: "move", family, amount: amount as QuarterTurns })));
}
