import type { KPattern, KTransformation } from "cubing/kpuzzle";
import type { Puzzle } from "./puzzle.js";

export interface WholeCubeRotation {
  /** A shortest way to write it with x, y and z (empty for the identity). */
  readonly alg: string;
  readonly transformation: KTransformation;
}

const ROTATION_MOVES = ["x", "x'", "x2", "y", "y'", "y2", "z", "z'", "z2"] as const;

const rotationCache = new WeakMap<Puzzle, readonly WholeCubeRotation[]>();

/**
 * All 24 whole-cube rotations, each with a shortest alg in x, y and z. Found breadth first from
 * the identity and deduplicated, so each alg has at most two moves.
 */
export function wholeCubeRotationAlgs(puzzle: Puzzle): readonly WholeCubeRotation[] {
  const cached = rotationCache.get(puzzle);
  if (cached !== undefined) return cached;
  const found: WholeCubeRotation[] = [{ alg: "", transformation: puzzle.kpuzzle.identityTransformation() }];
  for (let i = 0; i < found.length; i++) {
    const current = found[i];
    if (current === undefined) break;
    for (const move of ROTATION_MOVES) {
      const next = current.transformation.applyMove(move);
      if (!found.some((r) => r.transformation.isIdentical(next))) found.push({ alg: current.alg === "" ? move : `${current.alg} ${move}`, transformation: next });
    }
  }
  if (found.length !== 24) throw new Error(`expected 24 rotations, found ${found.length}`);
  rotationCache.set(puzzle, found);
  return found;
}

/** All 24 whole-cube rotations. */
export function wholeCubeRotations(puzzle: Puzzle): readonly KTransformation[] {
  return wholeCubeRotationAlgs(puzzle).map((r) => r.transformation);
}

/**
 * The rotation that puts a 3x3x3 pattern's centres in place, the way a solver holds the cube in
 * their standard orientation before memorising, with the rotated pattern. Exactly one rotation
 * does it for a reachable state; undefined if none does.
 */
export function centersRotation(puzzle: Puzzle, pattern: KPattern): { readonly alg: string; readonly pattern: KPattern } | undefined {
  const centers = puzzle.stickerMap.orbits.find((o) => o.kind === "center" && !o.interchangeable);
  if (centers === undefined) return undefined;
  for (const rotation of wholeCubeRotationAlgs(puzzle)) {
    const rotated = pattern.applyTransformation(rotation.transformation);
    const data = rotated.patternData[centers.orbit];
    if (data?.pieces.every((piece, position) => piece === position)) return { alg: rotation.alg, pattern: rotated };
  }
  return undefined;
}

/** Rotate a 3x3x3 pattern so its centres are solved (see `centersRotation`). */
export function normaliseByCenters(puzzle: Puzzle, pattern: KPattern): KPattern | undefined {
  return centersRotation(puzzle, pattern)?.pattern;
}
