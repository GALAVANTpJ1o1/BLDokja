import { at } from "../core/arrays.js";
import { composePerms, identityPerm, moveTable, type MoveTable, type StickerPerm, type TableMove } from "../core/move-table.js";
import type { Puzzle } from "../core/puzzle.js";
import { pieceType, type PieceTypeId } from "../pieces/piece-types.js";
import { moveCounts } from "./metrics.js";
import type { AlgMove } from "./parse.js";
import { syllableCodec, type SyllableCodec, type Syllables } from "./syllables.js";

/**
 * The pure-commutator catalogue (DECISIONS D-019). Built once per piece type and shared by every
 * buffer: it holds every [X, I] and [I, X], with X a canonical insertion of up to `maxInsertion`
 * moves and I a single move, whose effect is exactly a 3-cycle of three pieces of the type with
 * every other sticker, centres included, left alone. Comms are indexed by that directed 3-cycle.
 */

export interface CommSearchBounds {
  readonly generators: readonly string[];
  readonly maxInsertion: number;
  readonly maxSetup: number;
}

/** Generator preference order is the order listed; it is also the lexicographic tie-break. */
export const DEFAULT_COMM_BOUNDS: Readonly<Record<"corners" | "edges", CommSearchBounds>> = {
  corners: { generators: ["U", "D", "R", "L", "F", "B"], maxInsertion: 4, maxSetup: 3 },
  edges: { generators: ["U", "D", "R", "L", "F", "B", "M", "E", "S"], maxInsertion: 4, maxSetup: 3 },
};

export interface CatalogueComm {
  /** [A, B] as written: A is the insertion for [X, I], the interchange for [I, X]. */
  readonly a: readonly AlgMove[];
  readonly b: readonly AlgMove[];
  readonly syllables: Syllables;
  readonly length: number;
  /** Move-table indices of A then B, for the lexicographic tie-break. */
  readonly writtenKey: readonly number[];
  /** Position in its key's length-sorted list. */
  readonly rank: number;
}

export interface CatalogueList {
  /** Sorted by cancelled length, then written key. */
  readonly comms: readonly CatalogueComm[];
  /** Comms whose first syllable, or last syllable, is a given packed (axis, value). */
  readonly byFirst: ReadonlyMap<number, readonly CatalogueComm[]>;
  readonly byLast: ReadonlyMap<number, readonly CatalogueComm[]>;
}

export interface CommCatalogue {
  readonly puzzleId: Puzzle["id"];
  readonly pieceType: PieceTypeId;
  readonly bounds: CommSearchBounds;
  readonly table: MoveTable;
  readonly codec: SyllableCodec;
  readonly size: number;
  readonly keys: number;
  lookup(key: number): CatalogueList | undefined;
}

/** A directed 3-cycle a→b→c, rotated to start at its lowest sticker index. */
export function cycleKey(stickerCount: number, a: number, b: number, c: number): number {
  const n = stickerCount;
  if (a < b && a < c) return (a * n + b) * n + c;
  if (b < c) return (b * n + c) * n + a;
  return (c * n + a) * n + b;
}

/** Packed (axis, value) of a syllable, for the first/last-syllable index. */
export function syllableSignature(axis: number, value: number): number {
  return value * 3 + axis;
}

export function toAlgMove(move: TableMove): AlgMove {
  return { type: "move", family: move.family, amount: move.amount };
}

/**
 * Canonical move sequences up to `maxLength`, shortest first within each branch of a depth-first
 * walk: no two consecutive moves of one family, and consecutive moves on one axis in generator
 * order. Every reduced sequence has exactly one canonical form. `visit` receives the sequence,
 * its permutation and the inverse permutation; the empty sequence is visited too.
 */
export function canonicalSequences(
  table: MoveTable,
  maxLength: number,
  visit: (moves: readonly TableMove[], perm: StickerPerm, inverse: StickerPerm) => void,
): void {
  const familyIndex = new Map(table.families.map((f, i) => [f, i]));
  const sequence: TableMove[] = [];
  const walk = (perm: StickerPerm, inverse: StickerPerm) => {
    visit(sequence, perm, inverse);
    if (sequence.length === maxLength) return;
    const previous = sequence[sequence.length - 1];
    for (const move of table.moves) {
      if (previous !== undefined) {
        if (previous.family === move.family) continue;
        if (previous.axis === move.axis && (familyIndex.get(move.family) ?? 0) < (familyIndex.get(previous.family) ?? 0)) continue;
      }
      sequence.push(move);
      walk(composePerms(perm, move.perm), composePerms(move.inverse, inverse));
      sequence.pop();
    }
  };
  const identity = identityPerm(table.stickerCount);
  walk(identity, identity);
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const d = at(a, i) - at(b, i);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

/**
 * What a catalogue holds. `movedStickers` is exactly how many stickers the effect moves (the hot
 * loop exits as soon as more move); `classify` returns the catalogue key for an effect of this kind,
 * or undefined. `moved` lists the moved stickers in ascending order, all of the piece type.
 */
export interface EffectKind {
  readonly movedStickers: (stickersPerPiece: number) => number;
  classify(effect: Uint8Array, moved: readonly number[], pieceOf: Int16Array, stickerCount: number): number | undefined;
}

/** A 3-cycle of three pieces, keyed by one of its directed sticker cycles (`cycleKey`). */
export const THREE_CYCLE: EffectKind = {
  movedStickers: (perPiece) => 3 * perPiece,
  classify(effect, moved, pieceOf, n) {
    if (new Set(moved.map((s) => pieceOf[s])).size !== 3) return undefined;
    for (const s of moved) {
      const to = at(effect, s);
      if (at(effect, at(effect, to)) !== s || pieceOf[to] === pieceOf[s]) return undefined;
    }
    const s0 = at(moved, 0);
    return cycleKey(n, s0, at(effect, s0), at(effect, at(effect, s0)));
  },
};

export type InsertionWalk = (table: MoveTable, maxLength: number, visit: (moves: readonly TableMove[], perm: StickerPerm, inverse: StickerPerm) => void) => void;

export function buildCatalogue(puzzle: Puzzle, pieceTypeId: PieceTypeId, bounds: CommSearchBounds): CommCatalogue {
  return buildCatalogueOf(puzzle, pieceTypeId, bounds, THREE_CYCLE, canonicalSequences);
}

/** The catalogue of every [X, I] and [I, X] with X from `insertions` whose effect is of `kind`. */
export function buildCatalogueOf(puzzle: Puzzle, pieceTypeId: PieceTypeId, bounds: CommSearchBounds, kind: EffectKind, insertions: InsertionWalk): CommCatalogue {
  const table = moveTable(puzzle, bounds.generators);
  // QTM weights from D-017's metrics, so a slice quarter turn counts 2.
  const codec = syllableCodec(puzzle.id, bounds.generators, (family, amount) => moveCounts(puzzle.id, [{ type: "move", family, amount }]).qtm);
  const type = pieceType(puzzle, pieceTypeId);
  const n = table.stickerCount;
  const limit = kind.movedStickers(at(type.pieces, 0).stickers.length);
  const pieceOf = new Int16Array(n).fill(-1);
  for (const sticker of type.stickers) pieceOf[sticker.index] = sticker.position;

  // Best written form for each distinct cancelled sequence, grouped by key.
  const found = new Map<number, Map<string, Omit<CatalogueComm, "rank">>>();
  const effect = new Uint8Array(n);
  const moved: number[] = [];

  const consider = (a: readonly TableMove[], b: readonly TableMove[], chain: readonly [StickerPerm, StickerPerm, StickerPerm, StickerPerm]) => {
    const [p0, p1, p2, p3] = chain;
    moved.length = 0;
    for (let s = 0; s < n; s++) {
      // The hot loop: plain indexing (every value is a valid sticker index by construction).
      const to = p3[p2[p1[p0[s] ?? 0] ?? 0] ?? 0] ?? 0;
      effect[s] = to;
      if (to !== s) {
        // Early exit: anything outside the piece type, or more stickers than the kind moves.
        if (pieceOf[s] === -1 || moved.length === limit) return;
        moved.push(s);
      }
    }
    if (moved.length !== limit) return;
    const key = kind.classify(effect, moved, pieceOf, n);
    if (key === undefined) return;

    const written = [...a, ...b];
    const inverse = (moves: readonly TableMove[]) => [...moves].reverse().map((m) => at(table.moves, m.inverseIndex));
    const syllables = codec.encode([...written, ...inverse(a), ...inverse(b)]);
    const comm = { a: a.map(toAlgMove), b: b.map(toAlgMove), syllables, length: syllables.length, writtenKey: written.map((m) => m.index) };
    let byKey = found.get(key);
    if (byKey === undefined) {
      byKey = new Map();
      found.set(key, byKey);
    }
    const identity = `${syllables.axes.join(",")}|${syllables.values.join(",")}`;
    const existing = byKey.get(identity);
    if (existing === undefined || compareKeys(comm.writtenKey, existing.writtenKey) < 0) byKey.set(identity, comm);
  };

  insertions(table, bounds.maxInsertion, (insertion, perm, inverse) => {
    if (insertion.length === 0) return;
    const x = [...insertion];
    for (const interchange of table.moves) {
      consider(x, [interchange], [perm, interchange.perm, inverse, interchange.inverse]);
      consider([interchange], x, [interchange.perm, perm, interchange.inverse, inverse]);
    }
  });

  const lists = new Map<number, CatalogueList>();
  let size = 0;
  for (const [key, byIdentity] of found) {
    const sorted = [...byIdentity.values()].sort((p, q) => p.length - q.length || compareKeys(p.writtenKey, q.writtenKey));
    const comms = sorted.map((c, rank): CatalogueComm => ({ ...c, rank }));
    const byFirst = new Map<number, CatalogueComm[]>();
    const byLast = new Map<number, CatalogueComm[]>();
    const index = (map: Map<number, CatalogueComm[]>, signature: number, comm: CatalogueComm) => {
      const bucket = map.get(signature);
      if (bucket === undefined) map.set(signature, [comm]);
      else bucket.push(comm);
    };
    for (const comm of comms) {
      const { axes, values } = comm.syllables;
      const last = axes.length - 1;
      index(byFirst, syllableSignature(at(axes, 0), at(values, 0)), comm);
      index(byLast, syllableSignature(at(axes, last), at(values, last)), comm);
    }
    lists.set(key, { comms, byFirst, byLast });
    size += comms.length;
  }

  return { puzzleId: puzzle.id, pieceType: pieceTypeId, bounds, table, codec, size, keys: lists.size, lookup: (key) => lists.get(key) };
}
