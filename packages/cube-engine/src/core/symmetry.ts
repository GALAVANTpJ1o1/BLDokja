import { at } from "./arrays.js";
import { FACE_FRAMES, FACES, type Face, type Vec3 } from "./geometry.js";
import { parseGeometryMove } from "./geometry-moves.js";
import { moveTable, type StickerPerm } from "./move-table.js";
import { VERIFIED_MOVE_FAMILIES, type Puzzle } from "./puzzle.js";

/**
 * The 48 symmetries of the cube: every signed permutation matrix, i.e. the 24 rotations and their
 * mirror images. They act on sticker positions in the geometry model, so nothing here is a table.
 *
 * Relabelling an alg by a symmetry g gives g·A·g⁻¹: the alg that does to g(s) what A does to s.
 * Every relabelled move is checked against the move table (its sticker permutation must equal
 * g·P·g⁻¹), so a wrong face or direction can't slip through; mirrors reverse turn directions
 * automatically.
 */

export interface CubeSymmetry {
  readonly index: number;
  /** Row-major 3×3 signed permutation matrix: g·v. */
  readonly matrix: readonly [Vec3, Vec3, Vec3];
  /** Determinant −1. */
  readonly mirror: boolean;
  /** `sticker[s]` = g(s). */
  readonly sticker: StickerPerm;
}

function apply(matrix: readonly [Vec3, Vec3, Vec3], v: Vec3): Vec3 {
  const [r0, r1, r2] = matrix;
  return [r0[0] * v[0] + r0[1] * v[1] + r0[2] * v[2], r1[0] * v[0] + r1[1] * v[1] + r1[2] * v[2], r2[0] * v[0] + r2[1] * v[1] + r2[2] * v[2]];
}

function faceWithNormal(normal: Vec3): Face {
  const face = FACES.find((f) => FACE_FRAMES[f].normal.every((x, i) => x === normal[i]));
  if (face === undefined) throw new Error(`no face with normal ${normal.join(",")}`);
  return face;
}

const cache = new WeakMap<Puzzle, readonly CubeSymmetry[]>();

export function cubeSymmetries(puzzle: Puzzle): readonly CubeSymmetry[] {
  const cached = cache.get(puzzle);
  if (cached !== undefined) return cached;
  const permutations: [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2][] = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ];
  const { geometry } = puzzle;
  const symmetries: CubeSymmetry[] = [];
  for (const [a, b, c] of permutations) {
    for (let signs = 0; signs < 8; signs++) {
      const sign = (bit: number) => ((signs >> bit) & 1 ? -1 : 1);
      const row = (column: number, s: number): Vec3 => [column === 0 ? s : 0, column === 1 ? s : 0, column === 2 ? s : 0];
      const matrix: [Vec3, Vec3, Vec3] = [row(a, sign(0)), row(b, sign(1)), row(c, sign(2))];
      const inversions = Number(a > b) + Number(a > c) + Number(b > c);
      const determinant = (inversions % 2 === 0 ? 1 : -1) * sign(0) * sign(1) * sign(2);
      const sticker = Uint8Array.from(geometry.stickers, (s) => geometry.stickerAtPosition(apply(matrix, s.position)));
      symmetries.push({ index: symmetries.length, matrix, mirror: determinant < 0, sticker });
    }
  }
  cache.set(puzzle, symmetries);
  return symmetries;
}

/** g·P·g⁻¹ as a sticker permutation: `result[g(s)] = g(P[s])`. */
export function conjugatePerm(symmetry: CubeSymmetry, perm: StickerPerm): StickerPerm {
  const out = new Uint8Array(perm.length);
  perm.forEach((to, from) => {
    out[at(symmetry.sticker, from)] = at(symmetry.sticker, to);
  });
  return out;
}

export function inverseSymmetry(symmetries: readonly CubeSymmetry[], symmetry: CubeSymmetry): CubeSymmetry {
  const inverse = symmetries.find((h) => symmetry.sticker.every((to, from) => h.sticker[to] === from));
  if (inverse === undefined) throw new Error("symmetry has no inverse");
  return inverse;
}

const SLICE_FOR_AXIS = ["M", "E", "S"] as const;
const ROTATION_FOR_AXIS = ["x", "y", "z"] as const;
const SLICE_REFERENCE: Readonly<Record<string, Face>> = { M: "L", E: "D", S: "F" };
const ROTATION_REFERENCE: Readonly<Record<string, Face>> = { x: "R", y: "U", z: "F" };

export interface RelabelMove {
  readonly family: string;
  readonly amount: 1 | 2 | 3;
}

/**
 * The move that does under g what `move` does: same notation kind, face letter carried by g
 * (the opposite face when the carried family isn't verified, as with 2-3Lw), and the amount whose
 * permutation matches.
 */
export function relabelMove(puzzle: Puzzle, symmetry: CubeSymmetry, move: RelabelMove): RelabelMove {
  const families = VERIFIED_MOVE_FAMILIES[puzzle.id];
  const family = move.family;
  const reference = SLICE_REFERENCE[family] ?? ROTATION_REFERENCE[family] ?? parseGeometryMove(family, puzzle.size).face;
  const normal = apply(symmetry.matrix, FACE_FRAMES[reference].normal);
  const image = faceWithNormal(normal);
  const axis = normal.findIndex((x) => x !== 0);
  const opposite = faceWithNormal([-normal[0], -normal[1], -normal[2]]);

  let candidates: string[];
  if (family in SLICE_REFERENCE) candidates = [at(SLICE_FOR_AXIS, axis)];
  else if (family in ROTATION_REFERENCE) candidates = [at(ROTATION_FOR_AXIS, axis)];
  else {
    const withFace = (face: Face) => family.replace(/[UDRLFB]/, face).replace(/[udrlfb]/, face.toLowerCase());
    candidates = [withFace(image), withFace(opposite)];
  }

  const table = moveTable(puzzle, families);
  const target = conjugatePerm(symmetry, table.move(family, move.amount).perm);
  for (const candidate of candidates) {
    if (!families.includes(candidate)) continue;
    for (const amount of [1, 2, 3] as const) {
      if (table.move(candidate, amount).perm.every((to, from) => target[from] === to)) return { family: candidate, amount };
    }
  }
  throw new Error(`no verified move relabels ${family} under symmetry ${symmetry.index}`);
}
