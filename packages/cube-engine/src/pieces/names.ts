import type { Face, StickerGeometry, Vec3 } from "../core/geometry.js";

/**
 * Names for pieces and stickers, generated from geometry.
 *
 * A piece is named by the faces its cubie touches, in the order U/D, F/B, R/L (so "UFR", "UF",
 * "FR"). Cubies inside a face or edge on bigger cubes add lowercase letters for the side they sit
 * towards, in the same order ("UFr" is the wing of UF nearer R; "Ufr" is the U x-centre nearer F
 * and R). A sticker is named by its own face first, then the rest of its piece's name, so the
 * three stickers of UFR are "UFR", "FUR" and "RUF".
 *
 * These rules give unique names up to 5×5×5 (checked in tests). 6×6×6 and larger need a depth
 * marker as well, and are rejected until that is designed.
 */

/** Axis priority for names: y (U/D), then z (F/B), then x (R/L). */
const AXIS_ORDER = [1, 2, 0] as const;
const POSITIVE: readonly Face[] = ["R", "U", "F"];
const NEGATIVE: readonly Face[] = ["L", "D", "B"];

function faceFor(axis: number, sign: number): Face {
  const face = sign > 0 ? POSITIVE[axis] : NEGATIVE[axis];
  if (face === undefined) throw new RangeError(`bad axis ${axis}`);
  return face;
}

export function pieceName(size: number, center: Vec3): string {
  if (size > 5) throw new RangeError("Piece names are only defined up to 5×5×5");
  let outer = "";
  let inner = "";
  for (const axis of AXIS_ORDER) {
    const c = center[axis];
    if (Math.abs(c) === size - 1) outer += faceFor(axis, c);
    else if (c !== 0) inner += faceFor(axis, c).toLowerCase();
  }
  return outer + inner;
}

export function stickerName(geometry: StickerGeometry, stickerIndex: number): string {
  const sticker = geometry.sticker(stickerIndex);
  const piece = pieceName(geometry.size, sticker.cubie);
  return sticker.face + piece.replace(sticker.face, "");
}

/**
 * The piece a sticker slot is part of: "UFR" for each of the slots UFR, FUR and RUF; "U" for the U centre
 * of a 3x3x3. A display that lights one sticker needs this to light the rest of its piece as well:
 * one colour of a corner fits four positions, and only all of its colours say which piece it is.
 * It names the position, not the piece that happens to sit there: a corner's stickers never separate,
 * and interchangeable pieces (a 4x4x4's x-centres of one colour) share an identity but not a position.
 */
export function pieceOfSticker(geometry: StickerGeometry, stickerIndex: number): string {
  return pieceName(geometry.size, geometry.sticker(stickerIndex).cubie);
}
