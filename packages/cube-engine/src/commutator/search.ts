import { at } from "../core/arrays.js";
import type { Puzzle, PuzzleId } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { pieceType, type PieceTypeId } from "../pieces/piece-types.js";
import { cycleKey, type CommCatalogue, type CommSearchBounds } from "./catalogue.js";
import { searchConjugates, type CommSearchStats, type FoundComm } from "./conjugate-search.js";

export type { CommSearchStats, FoundComm } from "./conjugate-search.js";

/**
 * 3-style comm search for one buffer (DECISIONS D-019).
 *
 * For a case (t1, t2), a candidate is [S: C]: a canonical setup S of up to `maxSetup` moves and a
 * catalogue comm C whose 3-cycle is the image of buffer → t1 → t2 under S. Conjugating C by S maps
 * that cycle back onto the case, so every candidate solves it exactly. Setups, pruning and ranking
 * are the shared conjugate search (`conjugate-search.ts`).
 */

export interface CommCaseResult {
  readonly targets: readonly [string, string];
  /** Best first. Empty when the bounds hold no comm for the case. */
  readonly comms: readonly FoundComm[];
}

export interface CommSearchResult {
  readonly puzzle: PuzzleId;
  readonly pieceType: PieceTypeId;
  readonly buffer: string;
  readonly bounds: CommSearchBounds;
  readonly cases: readonly CommCaseResult[];
  readonly noComm: readonly (readonly [string, string])[];
  readonly stats: CommSearchStats;
}

export type CommSearchError =
  | { readonly code: "catalogue-puzzle-mismatch"; readonly expected: PuzzleId; readonly actual: PuzzleId }
  | { readonly code: "unknown-sticker"; readonly sticker: string }
  | { readonly code: "same-piece"; readonly stickers: readonly [string, string] };

export interface CommSearchOptions {
  /** Buffer sticker, of the catalogue's piece type. */
  readonly buffer: string;
  /** Ordered target pairs. Default: every pair on two distinct non-buffer pieces. */
  readonly cases?: readonly (readonly [string, string])[];
  /** Distinct comms kept per case, best first. Default 4: the best and three alternates. */
  readonly keep?: number;
  /** `false` evaluates every candidate. It exists so tests can check that pruning changes nothing. */
  readonly prune?: boolean;
}

export function searchComms(puzzle: Puzzle, catalogue: CommCatalogue, options: CommSearchOptions): Result<CommSearchResult, CommSearchError> {
  if (catalogue.puzzleId !== puzzle.id) return err({ code: "catalogue-puzzle-mismatch", expected: puzzle.id, actual: catalogue.puzzleId });
  const type = pieceType(puzzle, catalogue.pieceType);
  const buffer = type.stickerByName(options.buffer);
  if (buffer === undefined) return err({ code: "unknown-sticker", sticker: options.buffer });

  const pairs: (readonly [string, string])[] = [];
  if (options.cases === undefined) {
    for (const first of type.stickers) {
      if (first.position === buffer.position) continue;
      for (const second of type.stickers) {
        if (second.position !== buffer.position && second.position !== first.position) pairs.push([first.name, second.name]);
      }
    }
  } else {
    pairs.push(...options.cases);
  }

  const n = catalogue.table.stickerCount;
  const b = buffer.index;
  const cases: { keyUnder: (perm: Uint8Array) => number }[] = [];
  for (const [firstName, secondName] of pairs) {
    const first = type.stickerByName(firstName);
    const second = type.stickerByName(secondName);
    if (first === undefined) return err({ code: "unknown-sticker", sticker: firstName });
    if (second === undefined) return err({ code: "unknown-sticker", sticker: secondName });
    if (first.position === buffer.position) return err({ code: "same-piece", stickers: [options.buffer, firstName] });
    if (second.position === buffer.position) return err({ code: "same-piece", stickers: [options.buffer, secondName] });
    if (first.position === second.position) return err({ code: "same-piece", stickers: [firstName, secondName] });
    const t1 = first.index;
    const t2 = second.index;
    cases.push({ keyUnder: (perm) => cycleKey(n, perm[b] ?? 0, perm[t1] ?? 0, perm[t2] ?? 0) });
  }

  const { comms, stats } = searchConjugates(puzzle, catalogue, cases, { keep: options.keep ?? 4, prune: options.prune ?? true });
  const results = pairs.map((targets, c): CommCaseResult => ({ targets, comms: at(comms, c) }));
  return ok({
    puzzle: puzzle.id,
    pieceType: catalogue.pieceType,
    buffer: buffer.name,
    bounds: catalogue.bounds,
    cases: results,
    noComm: results.filter((r) => r.comms.length === 0).map((r) => r.targets),
    stats,
  });
}
