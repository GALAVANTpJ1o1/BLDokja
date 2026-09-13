import type { Face, LayerTurn, StickerGeometry } from "./geometry.js";
import { composeStickerPermutations } from "./geometry.js";
import { mod } from "./arrays.js";

/**
 * A small, independent move-notation reader for the geometry model. It is intentionally separate
 * from cubing.js's parser so the root-of-trust test compares two implementations of the notation.
 *
 * Supported (WCA / SiGN conventions):
 *   X        outer layer of face X              (X ∈ U D R L F B)
 *   nX       the n-th layer from X only         (inner slice for 1 < n < N)
 *   Xw       two outer layers
 *   nXw      layers 1..n
 *   n-mXw    layers n..m
 *   x        lowercase face letter = Xw         (this is cubing.js's reading; see DECISIONS)
 *   M E S    middle slice, turning like L, D, F (odd N only)
 *   x y z    whole-cube rotation, turning like R, U, F
 *   suffix   optional amount, optional '        (R2, R', R2', R3)
 */

const FACE_LETTERS = new Set(["U", "D", "R", "L", "F", "B"]);
const SLICE_FACE: Readonly<Record<string, Face>> = { M: "L", E: "D", S: "F" };
const ROTATION_FACE: Readonly<Record<string, Face>> = { x: "R", y: "U", z: "F" };

const MOVE_PATTERN = /^(?:(\d+)(?:-(\d+))?)?([UDRLFBudrlfbMESxyz])(w?)(\d*)('?)$/;

export class GeometryMoveError extends Error {
  constructor(move: string, reason: string) {
    super(`Cannot read move "${move}": ${reason}`);
    this.name = "GeometryMoveError";
  }
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let d = from; d <= to; d++) out.push(d);
  return out;
}

export function parseGeometryMove(move: string, size: number): LayerTurn {
  const match = MOVE_PATTERN.exec(move);
  if (match === null) throw new GeometryMoveError(move, "unrecognised notation");
  const [, firstRaw, secondRaw, family = "", wide, amountRaw = "", prime] = match;
  const first = firstRaw === undefined ? undefined : Number(firstRaw);
  const second = secondRaw === undefined ? undefined : Number(secondRaw);
  const amount = amountRaw === "" ? 1 : Number(amountRaw);
  const quarters = mod(prime === "'" ? -amount : amount, 4);

  let face: Face;
  let depths: number[];

  const sliceFace = SLICE_FACE[family];
  const rotationFace = ROTATION_FACE[family];
  if (sliceFace !== undefined) {
    if (first !== undefined || wide === "w") throw new GeometryMoveError(move, "slice moves take no prefix");
    if (size % 2 === 0) throw new GeometryMoveError(move, "middle slices exist only on odd cubes");
    face = sliceFace;
    depths = [(size + 1) / 2];
  } else if (rotationFace !== undefined) {
    if (first !== undefined || wide === "w") throw new GeometryMoveError(move, "rotations take no prefix");
    face = rotationFace;
    depths = range(1, size);
  } else if (FACE_LETTERS.has(family)) {
    face = family as Face;
    if (wide === "w") {
      if (first === undefined) depths = [1, 2];
      else if (second === undefined) depths = range(1, first);
      else depths = range(first, second);
    } else {
      if (second !== undefined) throw new GeometryMoveError(move, "a layer range needs w");
      depths = [first ?? 1];
    }
  } else {
    // Lowercase face letter: read as the two-layer wide move.
    if (first !== undefined || wide === "w") throw new GeometryMoveError(move, "lowercase moves take no prefix");
    face = family.toUpperCase() as Face;
    depths = [1, 2];
  }

  if (depths.length === 0 || depths.some((d) => d < 1 || d > size)) {
    throw new GeometryMoveError(move, `layers out of range for a ${size}×${size}×${size}`);
  }
  return { face, depths, quarters };
}

export function geometryMovePermutation(geometry: StickerGeometry, move: string): Int32Array {
  return geometry.layerTurnPermutation(parseGeometryMove(move, geometry.size));
}

/** Sticker permutation for a whitespace-separated move sequence (no brackets). */
export function geometryAlgPermutation(geometry: StickerGeometry, alg: string): Int32Array {
  let perm: Int32Array = Int32Array.from({ length: geometry.stickerCount }, (_, i) => i);
  for (const move of alg.trim().split(/\s+/).filter((m) => m.length > 0)) {
    perm = composeStickerPermutations(perm, geometryMovePermutation(geometry, move));
  }
  return perm;
}
