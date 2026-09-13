import type { KPattern, KPuzzle } from "cubing/kpuzzle";
import { cube3x3x3, puzzles } from "cubing/puzzles";
import { StickerGeometry } from "./geometry.js";
import { geometryMovePermutation } from "./geometry-moves.js";
import { deriveStickerMap, patternToFacelets, transformationToStickerPermutation, type StickerMap } from "./sticker-map.js";

export type PuzzleId = "3x3x3" | "4x4x4";

export const PUZZLE_SIZES: Readonly<Record<PuzzleId, number>> = {
  "3x3x3": 3,
  "4x4x4": 4,
};

/**
 * Move families whose meaning is checked sticker-by-sticker against the geometry model
 * (test/core/root-of-trust.test.ts), each with the suffixes "", "2" and "'".
 * Engine code only generates moves from these families.
 */
export const VERIFIED_MOVE_FAMILIES: Readonly<Record<PuzzleId, readonly string[]>> = {
  "3x3x3": [
    "U", "D", "R", "L", "F", "B",
    "M", "E", "S",
    "x", "y", "z",
    "Uw", "Dw", "Rw", "Lw", "Fw", "Bw",
    "u", "d", "r", "l", "f", "b",
    "2U", "2D", "2R", "2L", "2F", "2B",
  ],
  "4x4x4": [
    "U", "D", "R", "L", "F", "B",
    "2U", "2D", "2R", "2L", "2F", "2B",
    "3U", "3D", "3R", "3L", "3F", "3B",
    "Uw", "Dw", "Rw", "Lw", "Fw", "Bw",
    "u", "d", "r", "l", "f", "b",
    "3Uw", "3Dw", "3Rw", "3Lw", "3Fw", "3Bw",
    "2-3Uw", "2-3Rw", "2-3Fw",
    "x", "y", "z",
  ],
};

export const MOVE_SUFFIXES = ["", "2", "'"] as const;

export function verifiedMoves(id: PuzzleId): string[] {
  return VERIFIED_MOVE_FAMILIES[id].flatMap((family) => MOVE_SUFFIXES.map((suffix) => `${family}${suffix}`));
}

export interface Puzzle {
  readonly id: PuzzleId;
  readonly size: number;
  readonly kpuzzle: KPuzzle;
  readonly geometry: StickerGeometry;
  readonly stickerMap: StickerMap;
}

const cache = new Map<PuzzleId, Promise<Puzzle>>();

async function loadKPuzzle(id: PuzzleId): Promise<KPuzzle> {
  if (id === "3x3x3") return cube3x3x3.kpuzzle();
  const loader = puzzles[id];
  if (loader === undefined) throw new Error(`cubing.js has no puzzle ${id}`);
  return loader.kpuzzle();
}

/** Load a puzzle and derive its sticker map. Cached per puzzle. */
export function loadPuzzle(id: PuzzleId): Promise<Puzzle> {
  let pending = cache.get(id);
  if (pending === undefined) {
    pending = (async () => {
      const kpuzzle = await loadKPuzzle(id);
      const geometry = new StickerGeometry(PUZZLE_SIZES[id]);
      return { id, size: geometry.size, kpuzzle, geometry, stickerMap: deriveStickerMap(kpuzzle, geometry) };
    })();
    cache.set(id, pending);
  }
  return pending;
}

export function faceletsOf(puzzle: Puzzle, pattern: KPattern): Int32Array {
  return patternToFacelets(puzzle.stickerMap, pattern.patternData, puzzle.geometry.stickerCount);
}

/**
 * Moves on which cubing.js and the geometry model disagree about any sticker.
 * An empty result is the root-of-trust guarantee for those moves.
 */
export function movesDisagreeingWithGeometry(puzzle: Puzzle, moves: readonly string[]): string[] {
  return moves.filter((move) => {
    const fromKPuzzle = transformationToStickerPermutation(
      puzzle.stickerMap,
      puzzle.kpuzzle.moveToTransformation(move).transformationData,
      puzzle.geometry.stickerCount,
    );
    const fromGeometry = geometryMovePermutation(puzzle.geometry, move);
    return fromKPuzzle.some((to, from) => to !== fromGeometry[from]);
  });
}
