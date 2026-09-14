import type { Puzzle, PuzzleId } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { cancelMoves, expandNodes, formatMoves, invertMoves } from "../commutator/expand.js";
import { parseAlg, type AlgMove, type AlgParseError, type ParsedAlg } from "../commutator/parse.js";

/**
 * Drill scrambles (BRIEF §5.6): to practise one case, don't scramble a whole cube; apply the inverse
 * of the case's alg. The case alg then solves the cube exactly, and tracing the scramble gives
 * exactly the case (tested against every committed dataset record).
 */

export interface DrillScramble {
  readonly scramble: string;
  readonly moves: readonly AlgMove[];
}

export type DrillScrambleError =
  | { readonly code: "invalid-alg"; readonly error: AlgParseError }
  | { readonly code: "wrong-puzzle"; readonly expected: PuzzleId; readonly actual: PuzzleId };

export function drillScramble(puzzle: Puzzle, alg: string | ParsedAlg): Result<DrillScramble, DrillScrambleError> {
  let parsed: ParsedAlg;
  if (typeof alg === "string") {
    const result = parseAlg(puzzle.id, alg);
    if (!result.ok) return err({ code: "invalid-alg", error: result.error });
    parsed = result.value;
  } else {
    if (alg.puzzle !== puzzle.id) return err({ code: "wrong-puzzle", expected: puzzle.id, actual: alg.puzzle });
    parsed = alg;
  }
  const moves = invertMoves(cancelMoves(puzzle.id, expandNodes(parsed.nodes)));
  return ok({ scramble: formatMoves(moves), moves });
}
