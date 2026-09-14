import { at } from "./arrays.js";
import { faceAxis, type Axis } from "./geometry.js";
import { parseGeometryMove } from "./geometry-moves.js";
import { VERIFIED_MOVE_FAMILIES, type Puzzle, type PuzzleId } from "./puzzle.js";
import { transformationToStickerPermutation } from "./sticker-map.js";

/**
 * Sticker permutations for hot loops (searches). Each move's table is compiled from cubing.js's
 * kpuzzle definition through the verified sticker map, so it inherits the root-of-trust check;
 * test/core/move-table.test.ts compares it with the geometry model and with KPattern.applyAlg.
 *
 * A permutation is a Uint8Array with `perm[from] = to`: the slot the sticker at `from` moves to.
 */

export type StickerPerm = Uint8Array;

export interface TableMove {
  readonly index: number;
  readonly family: string;
  /** Clockwise quarter turns: 1, 2, or 3 (prime). */
  readonly amount: 1 | 2 | 3;
  readonly name: string;
  readonly axis: Axis;
  readonly perm: StickerPerm;
  readonly inverse: StickerPerm;
  readonly inverseIndex: number;
}

export interface MoveTable {
  readonly puzzle: PuzzleId;
  readonly stickerCount: number;
  /** Families in the order given, each with amounts 1, 3, 2 (clockwise, prime, half). */
  readonly families: readonly string[];
  readonly moves: readonly TableMove[];
  move(family: string, amount: 1 | 2 | 3): TableMove;
}

export const AMOUNT_ORDER = [1, 3, 2] as const;

export function identityPerm(stickerCount: number): StickerPerm {
  return Uint8Array.from({ length: stickerCount }, (_, i) => i);
}

/** First `a`, then `b`. */
export function composePerms(a: StickerPerm, b: StickerPerm): StickerPerm {
  const out = new Uint8Array(a.length);
  for (let s = 0; s < a.length; s++) out[s] = at(b, at(a, s));
  return out;
}

export function invertPerm(perm: StickerPerm): StickerPerm {
  const out = new Uint8Array(perm.length);
  perm.forEach((to, from) => {
    out[to] = from;
  });
  return out;
}

function suffix(amount: 1 | 2 | 3): string {
  return amount === 1 ? "" : amount === 2 ? "2" : "'";
}

const tables = new WeakMap<Puzzle, Map<string, MoveTable>>();

export function moveTable(puzzle: Puzzle, families: readonly string[]): MoveTable {
  const cacheKey = families.join(" ");
  let byPuzzle = tables.get(puzzle);
  if (byPuzzle === undefined) {
    byPuzzle = new Map();
    tables.set(puzzle, byPuzzle);
  }
  const cached = byPuzzle.get(cacheKey);
  if (cached !== undefined) return cached;

  const stickerCount = puzzle.geometry.stickerCount;
  if (stickerCount > 256) throw new RangeError(`${puzzle.id} has too many stickers for byte permutations`);
  const verified = new Set(VERIFIED_MOVE_FAMILIES[puzzle.id]);
  if (new Set(families).size !== families.length) throw new RangeError("duplicate move family");

  const moves: TableMove[] = [];
  for (const family of families) {
    if (!verified.has(family)) throw new RangeError(`${family} is not a verified move family on ${puzzle.id}`);
    const axis = faceAxis(parseGeometryMove(family, puzzle.size).face).axis;
    for (const amount of AMOUNT_ORDER) {
      const name = `${family}${suffix(amount)}`;
      const data = puzzle.kpuzzle.moveToTransformation(name).transformationData;
      const perm = Uint8Array.from(transformationToStickerPermutation(puzzle.stickerMap, data, stickerCount));
      moves.push({ index: moves.length, family, amount, name, axis, perm, inverse: invertPerm(perm), inverseIndex: -1 });
    }
  }
  const indexOf = new Map(moves.map((m) => [`${m.family}/${m.amount}`, m.index]));
  const linked = moves.map((m): TableMove => ({ ...m, inverseIndex: indexOf.get(`${m.family}/${4 - m.amount}`) ?? -1 }));

  const table: MoveTable = {
    puzzle: puzzle.id,
    stickerCount,
    families: [...families],
    moves: linked,
    move: (family, amount) => {
      const index = indexOf.get(`${family}/${amount}`);
      if (index === undefined) throw new RangeError(`no ${family} in this move table`);
      return at(linked, index);
    },
  };
  byPuzzle.set(cacheKey, table);
  return table;
}
