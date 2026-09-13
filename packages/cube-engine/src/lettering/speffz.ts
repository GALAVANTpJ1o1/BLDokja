import type { Face } from "../core/geometry.js";
import type { Puzzle } from "../core/puzzle.js";
import { stickerName } from "../pieces/names.js";
import { PIECE_TYPE_SPECS, type PieceTypeId } from "../pieces/piece-types.js";
import type { Scheme } from "./scheme.js";

/**
 * A "face-cycle" lettering rule, the shape Speffz uses:
 * faces are lettered in a fixed order, four letters per face, and on each face the letters go
 * clockwise (as seen looking at the face in the standard net) starting from the top-left.
 *
 * Speffz facts (Speedsolving wiki, "Speffz"; cross-checked against the reference net diagram in
 * test/lettering/speffz.test.ts):
 * - face order U, L, F, R, B, D;
 * - each face starts at its top-left corner and goes clockwise;
 * - an edge-type piece's letter follows the corner it is clockwise-next to.
 */
export interface FaceCycleRule {
  readonly faceOrder: readonly Face[];
  /** 4 letters per face, in face order. */
  readonly alphabet: readonly string[];
}

export const SPEFFZ_RULE: FaceCycleRule = {
  faceOrder: ["U", "L", "F", "R", "B", "D"],
  alphabet: "A B C D E F G H I J K L M N O P Q R S T U V W X".split(" "),
};

type Cell = readonly [row: number, col: number];

/** The four cells of one piece type on an N×N face, clockwise from the top-left. */
function clockwiseCells(pieceTypeId: PieceTypeId, n: number): readonly Cell[] {
  const last = n - 1;
  switch (pieceTypeId) {
    case "corners":
      return [[0, 0], [0, last], [last, last], [last, 0]];
    case "edges":
    case "wings":
      // The first edge-type sticker clockwise from each corner.
      return [[0, 1], [1, last], [last, last - 1], [last - 1, 0]];
    case "xcenters":
      return [[1, 1], [1, last - 1], [last - 1, last - 1], [last - 1, 1]];
  }
}

export function buildFaceCycleScheme(puzzle: Puzzle, rule: FaceCycleRule, id: string, name: string): Scheme {
  if (rule.alphabet.length !== rule.faceOrder.length * 4) {
    throw new RangeError("A face-cycle rule needs exactly four letters per face");
  }
  const letters: Scheme["letters"] = {};
  for (const spec of PIECE_TYPE_SPECS[puzzle.id]) {
    const entries: Record<string, string> = {};
    rule.faceOrder.forEach((face, faceIndex) => {
      clockwiseCells(spec.id, puzzle.size).forEach(([row, col], k) => {
        const sticker = puzzle.geometry.stickerAt(face, row, col);
        const letter = rule.alphabet[faceIndex * 4 + k];
        if (letter === undefined) throw new RangeError("alphabet too short");
        entries[stickerName(puzzle.geometry, sticker)] = letter;
      });
    });
    letters[spec.id] = entries;
  }
  return { format: "bld-platform/scheme", version: 1, id, name, puzzle: puzzle.id, letters };
}

export function speffzScheme(puzzle: Puzzle): Scheme {
  return buildFaceCycleScheme(puzzle, SPEFFZ_RULE, "speffz", "Speffz");
}

/** An empty scheme for a user to fill in: every piece type present, no letters yet. */
export function blankScheme(puzzle: Puzzle, id: string, name: string): Scheme {
  const letters: Scheme["letters"] = {};
  for (const spec of PIECE_TYPE_SPECS[puzzle.id]) letters[spec.id] = {};
  return { format: "bld-platform/scheme", version: 1, id, name, puzzle: puzzle.id, letters };
}
