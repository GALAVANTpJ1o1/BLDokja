"use client";

import { faceletsOf, type Puzzle } from "@bld/cube-engine";
import type { KPattern } from "cubing/kpuzzle";
import type { FaceName } from "@/design/palette";
import { en } from "@/i18n/en";

/** One slot of the net: where it is, and which face's colour it shows. */
export interface NetCell {
  readonly index: number;
  readonly slotFace: FaceName;
  readonly row: number;
  readonly col: number;
  readonly colour: FaceName;
}

export function patternFor(puzzle: Puzzle, alg: string): KPattern | undefined {
  try {
    return puzzle.kpuzzle.defaultPattern().applyAlg(alg);
  } catch {
    return undefined;
  }
}

export function netCells(puzzle: Puzzle, pattern: KPattern): NetCell[] {
  const facelets = faceletsOf(puzzle, pattern);
  return puzzle.geometry.stickers.map((s) => ({
    index: s.index,
    slotFace: s.face,
    row: s.row,
    col: s.col,
    colour: puzzle.geometry.stickers[facelets[s.index] ?? s.index]?.face ?? s.face,
  }));
}

/** The screen-reader text for a cube state: each face, row by row, as colour names (BRIEF §10). */
export function describeCube(cells: readonly NetCell[], revealed?: ReadonlySet<number>): string[] {
  const faces: FaceName[] = ["U", "F", "R", "B", "L", "D"];
  return faces.map((face) => {
    const onFace = cells.filter((c) => c.slotFace === face).sort((a, b) => a.row - b.row || a.col - b.col);
    const size = Math.round(Math.sqrt(onFace.length));
    const rows = Array.from({ length: size }, (_, r) =>
      onFace
        .filter((c) => c.row === r)
        .map((c) => revealed === undefined || revealed.has(c.index) ? en.cube.colourNames[c.colour] : en.cube.hiddenSticker)
        .join(" "),
    );
    return en.cube.faceRow(en.cube.faceNames[face], rows.join("; "));
  });
}
