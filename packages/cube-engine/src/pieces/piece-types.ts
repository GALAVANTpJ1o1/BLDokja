import { at } from "../core/arrays.js";
import type { Face } from "../core/geometry.js";
import type { Puzzle, PuzzleId } from "../core/puzzle.js";
import type { OrbitKind } from "../core/sticker-map.js";
import { pieceName, stickerName } from "./names.js";

/**
 * Piece types as data. Everything about a piece type that can be computed (which stickers, which
 * pieces, names, kpuzzle labels) is computed from the puzzle; only the physical facts that
 * geometry can't state on its own are declared here, and each is backed by a test.
 */

export type PieceTypeId = "corners" | "edges" | "wings" | "xcenters" | "midges" | "tcenters";

export interface PieceTypeSpec {
  readonly id: PieceTypeId;
  readonly kind: OrbitKind;
  /** How many distinct orientations a piece can physically have in a fixed slot. */
  readonly orientationOrder: 1 | 2 | 3;
  /** Whether several pieces are identical (the same colours), so a slot only needs the right colour. */
  readonly interchangeable: boolean;
  /**
   * How many stickers per piece carry a letter. Corners and edges letter every sticker because
   * orientation matters; wings and x-centres letter one sticker per piece.
   */
  readonly letteredStickersPerPiece: 1 | 2 | 3;
  /** Select among multiple same-kind orbits by physical geometry, not cubing.js orbit labels. */
  readonly pieceCount?: number;
  readonly innerAxes?: 1 | 2;
}

/**
 * Leaving room for 5×5×5: midges would be `{ kind: "edge", orientationOrder: 2 }` like 3x3 edges,
 * and +centres / t-centres would be interchangeable `center` kinds like x-centres.
 */
export const PIECE_TYPE_SPECS: Readonly<Record<PuzzleId, readonly PieceTypeSpec[]>> = {
  "5x5x5": [
    { id: "corners", kind: "corner", orientationOrder: 3, interchangeable: false, letteredStickersPerPiece: 3 },
    { id: "midges", kind: "edge", pieceCount: 12, orientationOrder: 2, interchangeable: false, letteredStickersPerPiece: 2 },
    { id: "wings", kind: "edge", pieceCount: 24, orientationOrder: 1, interchangeable: false, letteredStickersPerPiece: 1 },
    { id: "xcenters", kind: "center", pieceCount: 24, innerAxes: 2, orientationOrder: 1, interchangeable: true, letteredStickersPerPiece: 1 },
    { id: "tcenters", kind: "center", pieceCount: 24, innerAxes: 1, orientationOrder: 1, interchangeable: true, letteredStickersPerPiece: 1 },
  ],
  "3x3x3": [
    { id: "corners", kind: "corner", orientationOrder: 3, interchangeable: false, letteredStickersPerPiece: 3 },
    { id: "edges", kind: "edge", orientationOrder: 2, interchangeable: false, letteredStickersPerPiece: 2 },
  ],
  "4x4x4": [
    { id: "corners", kind: "corner", orientationOrder: 3, interchangeable: false, letteredStickersPerPiece: 3 },
    { id: "wings", kind: "edge", orientationOrder: 1, interchangeable: false, letteredStickersPerPiece: 1 },
    { id: "xcenters", kind: "center", orientationOrder: 1, interchangeable: true, letteredStickersPerPiece: 1 },
  ],
};

export interface StickerInfo {
  /** Geometry-derived name, unique within the puzzle ("UFR", "FUR", "UFr", "Ufr"). */
  readonly name: string;
  readonly index: number;
  readonly face: Face;
  /** kpuzzle position of the slot this sticker belongs to. */
  readonly position: number;
  /** kpuzzle orientation label of this sticker within its slot. */
  readonly label: number;
  /**
   * The sticker whose facing defines orientation: the U/D sticker of a corner or edge, or the
   * F/B sticker of an E-slice edge. Always true for single-sticker pieces; unused for wings.
   */
  readonly isOrientationReference: boolean;
}

export interface PieceInfo {
  readonly position: number;
  readonly name: string;
  /** This slot's stickers, indexed by kpuzzle label. */
  readonly stickers: readonly StickerInfo[];
  /** Face colour of the piece that belongs here (for single-sticker pieces). */
  readonly homeFace: Face;
}

export interface PieceType extends PieceTypeSpec {
  readonly puzzle: PuzzleId;
  readonly orbit: string;
  readonly orbitIndex: number;
  readonly orientationSign: 1 | -1;
  readonly pieces: readonly PieceInfo[];
  readonly stickers: readonly StickerInfo[];
  stickerByName(name: string): StickerInfo | undefined;
  pieceByName(name: string): PieceInfo | undefined;
}

function isReference(face: Face, pieceFaces: string): boolean {
  if (face === "U" || face === "D") return true;
  const hasUD = /[UD]/.test(pieceFaces);
  return !hasUD && (face === "F" || face === "B");
}

export function pieceTypesFor(puzzle: Puzzle): readonly PieceType[] {
  return PIECE_TYPE_SPECS[puzzle.id].map((spec) => buildPieceType(puzzle, spec));
}

export function pieceType(puzzle: Puzzle, id: PieceTypeId): PieceType {
  const spec = PIECE_TYPE_SPECS[puzzle.id].find((s) => s.id === id);
  if (spec === undefined) throw new RangeError(`${puzzle.id} has no piece type "${id}"`);
  return buildPieceType(puzzle, spec);
}

const built = new WeakMap<Puzzle, Map<PieceTypeId, PieceType>>();

function buildPieceType(puzzle: Puzzle, spec: PieceTypeSpec): PieceType {
  const cached = built.get(puzzle)?.get(spec.id);
  if (cached !== undefined) return cached;

  const orbitIndex = puzzle.stickerMap.orbits.findIndex((o) => {
    if (o.kind !== spec.kind || spec.pieceCount !== undefined && o.numPieces !== spec.pieceCount) return false;
    if (spec.innerAxes === undefined) return true;
    const first = o.slots[0]?.[0];
    if (first === undefined) return false;
    return puzzle.geometry.sticker(first).cubie.filter((coordinate) => coordinate !== 0 && Math.abs(coordinate) < puzzle.size - 1).length === spec.innerAxes;
  });
  const orbit = at(puzzle.stickerMap.orbits, orbitIndex);
  if (orbit.interchangeable !== spec.interchangeable) {
    throw new Error(`${puzzle.id} ${spec.id}: kpuzzle interchangeability disagrees with the piece type spec`);
  }
  const { geometry } = puzzle;
  const stickers: StickerInfo[] = [];
  const pieces: PieceInfo[] = orbit.slots.map((labels, position) => {
    const first = geometry.sticker(at(labels, 0));
    const name = pieceName(geometry.size, first.cubie);
    const pieceStickers = labels.map((index, label) => {
      const sticker = geometry.sticker(index);
      const info: StickerInfo = {
        name: stickerName(geometry, index),
        index,
        face: sticker.face,
        position,
        label,
        isOrientationReference: labels.length === 1 || isReference(sticker.face, name),
      };
      stickers.push(info);
      return info;
    });
    return { position, name, stickers: pieceStickers, homeFace: first.face };
  });

  const byName = new Map(stickers.map((s) => [s.name, s]));
  const piecesByName = new Map(pieces.map((p) => [p.name, p]));
  const type: PieceType = {
    ...spec,
    puzzle: puzzle.id,
    orbit: orbit.orbit,
    orbitIndex,
    orientationSign: orbit.orientationSign,
    pieces,
    stickers,
    stickerByName: (name) => byName.get(name),
    pieceByName: (name) => piecesByName.get(name),
  };
  let forPuzzle = built.get(puzzle);
  if (forPuzzle === undefined) {
    forPuzzle = new Map();
    built.set(puzzle, forPuzzle);
  }
  forPuzzle.set(spec.id, type);
  return type;
}
