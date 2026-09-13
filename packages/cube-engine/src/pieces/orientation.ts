import { mod } from "../core/arrays.js";
import { FACE_FRAMES, type Vec3 } from "../core/geometry.js";
import type { Puzzle } from "../core/puzzle.js";
import type { PieceType, StickerInfo } from "./piece-types.js";

export type TwistDirection = "clockwise" | "counterclockwise";

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * For a piece sitting in its own slot with kpuzzle orientation `k`, the slot sticker where its
 * orientation-reference sticker (U/D, or F/B on E-slice edges) now shows.
 */
export function referenceStickerSlot(type: PieceType, position: number, k: number): StickerInfo {
  const piece = type.pieces[position];
  if (piece === undefined) throw new RangeError(`no ${type.id} position ${position}`);
  const reference = piece.stickers.find((s) => s.isOrientationReference);
  if (reference === undefined) throw new RangeError(`${piece.name} has no reference sticker`);
  const n = piece.stickers.length;
  const slot = piece.stickers[mod(reference.label + type.orientationSign * k, n)];
  if (slot === undefined) throw new RangeError("label out of range");
  return slot;
}

/**
 * Direction of a corner twisted in place, as seen looking at the corner from outside: clockwise
 * if its reference sticker has moved to the face that comes next clockwise around the corner.
 * Computed from geometry (normals and the cubie's outward direction), not from kpuzzle labels.
 */
export function cornerTwistDirection(puzzle: Puzzle, type: PieceType, position: number, k: number): TwistDirection {
  const piece = type.pieces[position];
  if (piece === undefined) throw new RangeError(`no ${type.id} position ${position}`);
  const reference = piece.stickers.find((s) => s.isOrientationReference);
  if (reference === undefined) throw new RangeError(`${piece.name} has no reference sticker`);
  const now = referenceStickerSlot(type, position, k);
  const outward = puzzle.geometry.sticker(reference.index).cubie;
  const turn = dot(cross(FACE_FRAMES[reference.face].normal, FACE_FRAMES[now.face].normal), outward);
  return turn < 0 ? "clockwise" : "counterclockwise";
}
