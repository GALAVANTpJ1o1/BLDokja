import { at } from "../core/arrays.js";
import type { Puzzle } from "../core/puzzle.js";
import { transformationToStickerPermutation, type OrbitKind } from "../core/sticker-map.js";
import { pieceName, stickerName } from "../pieces/names.js";
import { expandNodes, formatMoves } from "./expand.js";
import type { AlgMove, ParsedAlg } from "./parse.js";

/** Stickers and pieces of one kpuzzle orbit, in sticker order. */
export interface AffectedOrbit {
  readonly orbit: string;
  readonly kind: OrbitKind;
  readonly pieces: readonly string[];
  readonly stickers: readonly string[];
}

/** Group geometry sticker indices by kpuzzle orbit. Every orbit is listed, possibly empty. */
export function stickersByOrbit(puzzle: Puzzle, stickers: Iterable<number>): AffectedOrbit[] {
  const { geometry, stickerMap } = puzzle;
  const chosen = [...new Set(stickers)].sort((a, b) => a - b);
  return stickerMap.orbits.map((orbit, orbitIndex) => {
    const inOrbit = chosen.filter((s) => at(stickerMap.slotOfSticker, s).orbitIndex === orbitIndex);
    return {
      orbit: orbit.orbit,
      kind: orbit.kind,
      pieces: [...new Set(inOrbit.map((s) => pieceName(geometry.size, geometry.sticker(s).cubie)))],
      stickers: inOrbit.map((s) => stickerName(geometry, s)),
    };
  });
}

export function movesOf(puzzle: Puzzle, alg: ParsedAlg | readonly AlgMove[]): readonly AlgMove[] {
  if (!("nodes" in alg)) return alg;
  if (alg.puzzle !== puzzle.id) throw new RangeError(`alg was parsed for ${alg.puzzle}, not ${puzzle.id}`);
  return expandNodes(alg.nodes);
}

/**
 * Exactly which stickers and pieces an alg moves, by its net effect: a piece that ends up back in
 * place and orientation is not affected. Positions are tracked even for identical pieces (4x4
 * x-centres), so a centre swapped with a same-coloured one still counts as moved.
 */
export function affectedStickers(puzzle: Puzzle, alg: ParsedAlg | readonly AlgMove[]): AffectedOrbit[] {
  const transformation = puzzle.kpuzzle.algToTransformation(formatMoves(movesOf(puzzle, alg)));
  const perm = transformationToStickerPermutation(puzzle.stickerMap, transformation.transformationData, puzzle.geometry.stickerCount);
  const moved: number[] = [];
  perm.forEach((to, from) => {
    if (to !== from) moved.push(from);
  });
  return stickersByOrbit(puzzle, moved);
}
