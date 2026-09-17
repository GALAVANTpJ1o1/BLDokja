import type { KPattern } from "cubing/kpuzzle";
import type { Puzzle } from "../core/puzzle.js";
import { centersRotation } from "../core/frame.js";
import { lastLayerCases, lastLayerStageSatisfied, type LastLayerKind } from "./last-layer.js";

const AUFS = ["", "U", "U2", "U'"] as const;
const INVERSE_AUFS = ["", "U'", "U2", "U"] as const;
const IDENTITY = [0, 1, 2, 3] as const;

export interface LastLayerMatch {
  /** null means this stage needs at most the given AUF, not another case algorithm. */
  readonly id: string | null;
  readonly frame: string;
  readonly before: string;
  readonly after: string;
}

/**
 * Recognition with executable AUFs. Inverse post-AUF relabels piece values (left multiplication);
 * pre-AUF physically shifts slots. Tests independently apply the returned turns on all 288 PLL
 * states. Undefined means wrong puzzle, unsolved F2L or an unmet prerequisite, never a guessed case.
 */
export function matchLastLayerCase(puzzle: Puzzle, pattern: KPattern, kind: LastLayerKind): LastLayerMatch | undefined {
  if (puzzle.id !== "3x3x3") return undefined;
  const frame = centersRotation(puzzle, pattern);
  if (frame === undefined) return undefined;
  const corners = frame.pattern.patternData.CORNERS; const edges = frame.pattern.patternData.EDGES;
  if (corners === undefined || edges === undefined) return undefined;
  for (const orbit of [corners, edges]) {
    if (!orbit.pieces.slice(4).every((piece, index) => piece === index + 4) || !orbit.orientation.slice(4).every(value => value === 0)) return undefined;
  }
  const oriented = kind === "pll" || kind === "corner-perm" || kind === "edge-perm";
  if ((oriented && !corners.orientation.every(value => value === 0))
    || ((oriented || kind === "co") && !edges.orientation.every(value => value === 0))) return undefined;
  const cases = lastLayerCases(kind);
  const same = (actual: readonly number[], expected: readonly number[]) => expected.every((value, index) => actual[index] === value);
  for (const before of AUFS) {
    const aligned = frame.pattern.applyAlg(before);
    if (lastLayerStageSatisfied(puzzle, aligned, kind)) return { id: null, frame: frame.alg, before, after: "" };
    const c = aligned.patternData.CORNERS; const e = aligned.patternData.EDGES;
    if (c === undefined || e === undefined) return undefined;
    for (const record of cases) {
      if (!oriented) {
        if ((record.corners === undefined || same(c.orientation, record.corners)) && (record.edges === undefined || same(e.orientation, record.edges)))
          return { id: record.id, frame: frame.alg, before, after: "" };
        continue;
      }
      for (let index = 0; index < AUFS.length; index += 1) {
        const after = AUFS[index]; const inverse = INVERSE_AUFS[index];
        if (after === undefined || inverse === undefined) continue;
        const postInverse = puzzle.kpuzzle.defaultPattern().applyAlg(inverse);
        const pc = postInverse.patternData.CORNERS; const pe = postInverse.patternData.EDGES;
        if (pc === undefined || pe === undefined) return undefined;
        const cp = record.corners ?? IDENTITY; const ep = record.edges ?? IDENTITY;
        if (cp.every((piece, slot) => c.pieces[slot] === pc.pieces[piece])
          && (kind === "corner-perm" || ep.every((piece, slot) => e.pieces[slot] === pe.pieces[piece])))
          return { id: record.id, frame: frame.alg, before, after };
      }
    }
  }
  return undefined;
}
