import { at, lookup, mod } from "./arrays.js";

/**
 * First-principles sticker geometry for an N×N×N cube.
 *
 * This model is deliberately independent of cubing.js. Stickers are points in space and a move is
 * a quarter-turn rotation of the stickers in some layers. Its only external input is the WCA
 * notation convention (Regulation 12a): a face turn is clockwise as seen looking at that face.
 * The root-of-trust test checks that this model and cubing.js's kpuzzle agree on every sticker
 * for every generator move.
 *
 * Coordinates are right-handed and doubled so they stay integers:
 *   +x = R, +y = U, +z = F; cubie centres lie on -(N-1), -(N-3), …, N-1; face planes are at ±N.
 */

export type Face = "U" | "L" | "F" | "R" | "B" | "D";

/** Net order: U on top, then L F R B across, D at the bottom. Sticker indices follow this order. */
export const FACES: readonly Face[] = ["U", "L", "F", "R", "B", "D"];

export type Vec3 = readonly [number, number, number];
export type Axis = 0 | 1 | 2;

export interface FaceFrame {
  /** Outward normal. */
  readonly normal: Vec3;
  /** Screen-up direction when the face is viewed from outside in the standard net. */
  readonly up: Vec3;
  /** Screen-right direction when the face is viewed from outside in the standard net. */
  readonly right: Vec3;
}

export const FACE_FRAMES: Readonly<Record<Face, FaceFrame>> = {
  U: { normal: [0, 1, 0], up: [0, 0, -1], right: [1, 0, 0] },
  L: { normal: [-1, 0, 0], up: [0, 1, 0], right: [0, 0, 1] },
  F: { normal: [0, 0, 1], up: [0, 1, 0], right: [1, 0, 0] },
  R: { normal: [1, 0, 0], up: [0, 1, 0], right: [0, 0, -1] },
  B: { normal: [0, 0, -1], up: [0, 1, 0], right: [-1, 0, 0] },
  D: { normal: [0, -1, 0], up: [0, 0, 1], right: [1, 0, 0] },
};

export interface Sticker {
  readonly index: number;
  readonly face: Face;
  /** Row in the face's net view, 0 = top. */
  readonly row: number;
  /** Column in the face's net view, 0 = left. */
  readonly col: number;
  /** Position on the surface (doubled coordinates). */
  readonly position: Vec3;
  /** Centre of the cubie this sticker belongs to (doubled coordinates). */
  readonly cubie: Vec3;
}

export interface Cubie {
  readonly index: number;
  readonly center: Vec3;
  /** Indices of this cubie's stickers, in FACES order of the face they lie on. */
  readonly stickers: readonly number[];
}

/** A rotation of the stickers in some layers, as seen from one face. */
export interface LayerTurn {
  readonly face: Face;
  /** 1 = the layer at that face; N = the opposite face's layer. */
  readonly depths: readonly number[];
  /** Clockwise quarter turns as seen from `face`, 0–3. */
  readonly quarters: number;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(v: Vec3, k: number): Vec3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

export function vecKey(v: Vec3): string {
  return `${v[0]},${v[1]},${v[2]}`;
}

export function faceAxis(face: Face): { axis: Axis; sign: 1 | -1 } {
  const n = FACE_FRAMES[face].normal;
  if (n[0] !== 0) return { axis: 0, sign: n[0] > 0 ? 1 : -1 };
  if (n[1] !== 0) return { axis: 1, sign: n[1] > 0 ? 1 : -1 };
  return { axis: 2, sign: n[2] > 0 ? 1 : -1 };
}

/**
 * One clockwise quarter turn as seen from the positive end of the axis
 * (a rotation by -90° under the right-hand rule).
 */
function quarterClockwiseFromPositive(v: Vec3, axis: Axis): Vec3 {
  const [x, y, z] = v;
  switch (axis) {
    case 0:
      return [x, z, -y];
    case 1:
      return [-z, y, x];
    case 2:
      return [y, -x, z];
  }
}

export class StickerGeometry {
  readonly size: number;
  readonly stickers: readonly Sticker[];
  readonly cubies: readonly Cubie[];
  readonly #stickerAt = new Map<string, number>();
  readonly #cubieAt = new Map<string, number>();
  readonly #cubieOfSticker: readonly number[];

  constructor(size: number) {
    if (!Number.isInteger(size) || size < 2) {
      throw new RangeError(`Cube size must be an integer ≥ 2, got ${size}`);
    }
    this.size = size;
    const stickers: Sticker[] = [];
    for (const face of FACES) {
      const frame = FACE_FRAMES[face];
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          const u = -(size - 1) + 2 * col;
          const v = size - 1 - 2 * row;
          const offset = add(scale(frame.right, u), scale(frame.up, v));
          const position = add(scale(frame.normal, size), offset);
          const cubie = add(scale(frame.normal, size - 1), offset);
          const index = stickers.length;
          stickers.push({ index, face, row, col, position, cubie });
          this.#stickerAt.set(vecKey(position), index);
        }
      }
    }
    this.stickers = stickers;

    const cubies: { index: number; center: Vec3; stickers: number[] }[] = [];
    const cubieOfSticker: number[] = [];
    for (const sticker of stickers) {
      const key = vecKey(sticker.cubie);
      let cubieIndex = this.#cubieAt.get(key);
      if (cubieIndex === undefined) {
        cubieIndex = cubies.length;
        cubies.push({ index: cubieIndex, center: sticker.cubie, stickers: [] });
        this.#cubieAt.set(key, cubieIndex);
      }
      at(cubies, cubieIndex).stickers.push(sticker.index);
      cubieOfSticker.push(cubieIndex);
    }
    this.cubies = cubies;
    this.#cubieOfSticker = cubieOfSticker;
  }

  get stickerCount(): number {
    return this.stickers.length;
  }

  sticker(index: number): Sticker {
    return at(this.stickers, index);
  }

  stickerAtPosition(position: Vec3): number {
    return lookup(this.#stickerAt, vecKey(position));
  }

  stickerAt(face: Face, row: number, col: number): number {
    return FACES.indexOf(face) * this.size * this.size + row * this.size + col;
  }

  cubieOf(stickerIndex: number): Cubie {
    return at(this.cubies, at(this.#cubieOfSticker, stickerIndex));
  }

  /** Depth (1-based) of a cubie's layer counted from `face`. */
  depthFrom(face: Face, cubieCenter: Vec3): number {
    const { axis, sign } = faceAxis(face);
    return (this.size + 1 - sign * cubieCenter[axis]) / 2;
  }

  /** Sticker permutation for a layer turn: `perm[s]` is the slot the sticker at `s` moves to. */
  layerTurnPermutation(turn: LayerTurn): Int32Array {
    const perm = new Int32Array(this.stickerCount);
    const { axis, sign } = faceAxis(turn.face);
    const quarters = mod(sign === 1 ? turn.quarters : -turn.quarters, 4);
    const depths = new Set(turn.depths);
    for (const sticker of this.stickers) {
      if (!depths.has(this.depthFrom(turn.face, sticker.cubie)) || quarters === 0) {
        perm[sticker.index] = sticker.index;
        continue;
      }
      let position = sticker.position;
      for (let q = 0; q < quarters; q++) {
        position = quarterClockwiseFromPositive(position, axis);
      }
      perm[sticker.index] = this.stickerAtPosition(position);
    }
    return perm;
  }

  /** The solved state: `facelets[slot]` = home sticker currently at that slot. */
  solvedFacelets(): Int32Array {
    return Int32Array.from(this.stickers, (s) => s.index);
  }
}

/** Apply a sticker permutation to a facelet state, returning a new state. */
export function applyStickerPermutation(facelets: Int32Array, perm: Int32Array): Int32Array {
  const next = new Int32Array(facelets.length);
  for (let slot = 0; slot < facelets.length; slot++) {
    next[at(perm, slot)] = at(facelets, slot);
  }
  return next;
}

/** Compose two sticker permutations: first `a`, then `b`. */
export function composeStickerPermutations(a: Int32Array, b: Int32Array): Int32Array {
  const out = new Int32Array(a.length);
  for (let s = 0; s < a.length; s++) {
    out[s] = at(b, at(a, s));
  }
  return out;
}
