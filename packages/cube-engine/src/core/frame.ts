import type { KPattern, KTransformation } from "cubing/kpuzzle";
import { at } from "./arrays.js";
import type { Puzzle } from "./puzzle.js";

const rotationCache = new WeakMap<Puzzle, readonly KTransformation[]>();

/** All 24 whole-cube rotations, generated from x and y and deduplicated. */
export function wholeCubeRotations(puzzle: Puzzle): readonly KTransformation[] {
  const cached = rotationCache.get(puzzle);
  if (cached !== undefined) return cached;
  const found: KTransformation[] = [puzzle.kpuzzle.identityTransformation()];
  for (let i = 0; i < found.length; i++) {
    for (const move of ["x", "y"]) {
      const next = at(found, i).applyMove(move);
      if (!found.some((t) => t.isIdentical(next))) found.push(next);
    }
  }
  if (found.length !== 24) throw new Error(`expected 24 rotations, found ${found.length}`);
  rotationCache.set(puzzle, found);
  return found;
}

/**
 * Rotate a 3x3x3 pattern so its centres are solved, the way a solver holds the cube in their
 * standard orientation before memorising. Returns undefined if no rotation does it (impossible
 * for a reachable state).
 */
export function normaliseByCenters(puzzle: Puzzle, pattern: KPattern): KPattern | undefined {
  const centers = puzzle.stickerMap.orbits.find((o) => o.kind === "center" && !o.interchangeable);
  if (centers === undefined) return undefined;
  for (const rotation of wholeCubeRotations(puzzle)) {
    const rotated = pattern.applyTransformation(rotation);
    const data = rotated.patternData[centers.orbit];
    if (data?.pieces.every((piece, position) => piece === position)) return rotated;
  }
  return undefined;
}
