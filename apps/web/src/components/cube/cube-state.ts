"use client";

import { faceletsOf, pieceOfSticker, slotViews, stickeringMask, type FaceletMask, type PlayerStickeringMask, type Puzzle, type SlotView } from "@bld/cube-engine";
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
  /** The piece this slot is part of: "UFR" for each of the slots UFR, FUR and RUF. */
  readonly piece: string;
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
    piece: pieceOfSticker(puzzle.geometry, s.index),
  }));
}

/**
 * The middle sticker of a face on an odd-sized cube. It is the one fixed reference on the cube (green
 * is the front because the front centre is green), so a display that dims or hides stickers to direct
 * attention never dims or hides these.
 */
export function isFixedCentre(cell: NetCell, size: number): boolean {
  const middle = (size - 1) / 2;
  return size % 2 === 1 && cell.row === middle && cell.col === middle;
}

/**
 * The other stickers of every piece that has a highlighted sticker (by position: a piece's stickers
 * never separate, and interchangeable pieces such as a 4x4x4's x-centres of one colour are not one piece). One colour of a corner fits four
 * positions (green alone could be I, J, K or L), and only all of its colours say which piece it is and
 * so where it belongs. Pieces with a single sticker (centres, 4x4x4 x-centres) have no others.
 */
export function pieceContext(cells: readonly NetCell[], focus: ReadonlySet<number>): Set<number> {
  const lit = new Set(cells.filter((c) => focus.has(c.index)).map((c) => c.piece));
  const stickersOf = new Map<string, number>();
  for (const c of cells) stickersOf.set(c.piece, (stickersOf.get(c.piece) ?? 0) + 1);
  return new Set(cells.filter((c) => lit.has(c.piece) && (stickersOf.get(c.piece) ?? 0) > 1 && !focus.has(c.index)).map((c) => c.index));
}

/**
 * The 3D player's stickering mask for a highlight, as a pure function of the state it is read in:
 *
 * - the named slots and the rest of their pieces are `regular` (full colour);
 * - a fixed centre (a slot named with one face letter) is always `regular`, so the cube never loses
 *   its orientation and no one has to name the centres to keep them;
 * - everything else is `ignored` (grey), or `dim` with `dim: "soft"`.
 *
 * "The rest of a piece" is read from the sticker in each named slot, so it follows the piece wherever
 * the pieces have moved. With nothing named, every sticker is `regular`.
 */
export function playerMask(puzzle: Puzzle, pattern: KPattern, highlight: ReadonlySet<string>, dim: "strong" | "soft"): PlayerStickeringMask {
  const views = slotViews(puzzle, pattern);
  const stickersOf = new Map<string, number>();
  for (const v of views) stickersOf.set(v.piece, (stickersOf.get(v.piece) ?? 0) + 1);
  // Only pieces with more than one sticker have a rest to light. Read by position, the same way as the net.
  const lit = new Set(views.filter((v) => highlight.has(v.slot) && (stickersOf.get(v.piece) ?? 0) > 1).map((v) => v.piece));
  return stickeringMask(puzzle, pattern, (v: SlotView): FaceletMask => (highlight.size === 0 || v.slot.length === 1 || highlight.has(v.slot) || lit.has(v.piece) ? "regular" : dim === "soft" ? "dim" : "ignored"));
}

/** Everything a cube that hides the rest still shows: the highlighted stickers, the rest of their pieces, and the fixed centres. */
export function revealedCells(cells: readonly NetCell[], size: number, focus: ReadonlySet<number>): Set<number> {
  const shown = new Set(focus);
  for (const index of pieceContext(cells, focus)) shown.add(index);
  for (const c of cells) if (isFixedCentre(c, size)) shown.add(c.index);
  return shown;
}

/** The screen-reader text for a cube state: each face, row by row, as colour names (BRIEF §10). */
export function describeCube(cells: readonly NetCell[], revealed?: ReadonlySet<number>, shown?: Readonly<Record<FaceName, FaceName>>): string[] {
  const faces: FaceName[] = ["U", "F", "R", "B", "L", "D"];
  return faces.map((face) => {
    const onFace = cells.filter((c) => c.slotFace === face).sort((a, b) => a.row - b.row || a.col - b.col);
    const size = Math.round(Math.sqrt(onFace.length));
    const rows = Array.from({ length: size }, (_, r) =>
      onFace
        .filter((c) => c.row === r)
        .map((c) => revealed === undefined || revealed.has(c.index) ? en.cube.colourNames[shown?.[c.colour] ?? c.colour] : en.cube.hiddenSticker)
        .join(" "),
    );
    return en.cube.faceRow(en.cube.faceNames[face], rows.join("; "));
  });
}
