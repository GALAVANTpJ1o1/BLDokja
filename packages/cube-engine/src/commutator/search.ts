import { at } from "../core/arrays.js";
import { faceletsOf, type Puzzle, type PuzzleId } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { pieceType, type PieceTypeId } from "../pieces/piece-types.js";
import { cycleKey, type CommCatalogue, type CommSearchBounds } from "./catalogue.js";
import { searchConjugates, type CommSearchStats, type FoundComm } from "./conjugate-search.js";
import { threeCyclePattern } from "./validate.js";

export type { CommSearchStats, FoundComm } from "./conjugate-search.js";

/**
 * 3-style comm search for one buffer (DECISIONS D-019).
 *
 * For a case (t1, t2), a candidate is [S: C]: a canonical setup S of up to `maxSetup` moves and a
 * catalogue comm C whose 3-cycle is the image of buffer → t1 → t2 under S. Conjugating C by S maps
 * that cycle back onto the case, so every candidate solves it exactly. Setups, pruning and ranking
 * are the shared conjugate search (`conjugate-search.ts`).
 *
 * A 3-cycle of corners moves three sticker cycles (edges: two), and the catalogue files each comm
 * under the one that starts at its lowest moved sticker. A case must be looked up under that same
 * cycle: the one through the lowest image, under S, of every sticker the case moves. Looking it up
 * under the buffer sticker's cycle instead misses every comm filed under a sibling cycle (D-031).
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
  const cases: { keyUnder: (perm: Uint8Array) => number }[] = [];
  for (const [firstName, secondName] of pairs) {
    const first = type.stickerByName(firstName);
    const second = type.stickerByName(secondName);
    if (first === undefined) return err({ code: "unknown-sticker", sticker: firstName });
    if (second === undefined) return err({ code: "unknown-sticker", sticker: secondName });
    if (first.position === buffer.position) return err({ code: "same-piece", stickers: [options.buffer, firstName] });
    if (second.position === buffer.position) return err({ code: "same-piece", stickers: [options.buffer, secondName] });
    if (first.position === second.position) return err({ code: "same-piece", stickers: [firstName, secondName] });
    const state = threeCyclePattern(puzzle, [buffer.name, first.name, second.name]);
    if (!state.ok) return err({ code: "same-piece", stickers: [firstName, secondName] });
    // required[s]: where the sticker in slot s must go. The case moves exactly these stickers.
    const required = faceletsOf(puzzle, state.value);
    const moved = Array.from(required.keys()).filter((s) => required[s] !== s);
    cases.push({
      keyUnder: (perm) => {
        let lowest = -1;
        let from = 0;
        for (const s of moved) {
          const image = perm[s] ?? 0;
          if (lowest < 0 || image < lowest) {
            lowest = image;
            from = s;
          }
        }
        const next = required[from] ?? 0;
        return cycleKey(n, lowest, perm[next] ?? 0, perm[required[next] ?? 0] ?? 0);
      },
    });
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
