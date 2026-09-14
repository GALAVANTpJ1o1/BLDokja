import { at } from "../core/arrays.js";
import { faceletsOf, type Puzzle, type PuzzleId } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import type { TwistDirection } from "../pieces/orientation.js";
import { pieceType, type PieceTypeId } from "../pieces/piece-types.js";
import { orientationPairKey, type CommCatalogue, type CommSearchBounds } from "./catalogue.js";
import { searchConjugates, type CommSearchStats, type FoundComm } from "./conjugate-search.js";
import { orientationPairPattern, type OrientationCase, type OrientationCaseError } from "./validate.js";

/**
 * Twist and flip algs for one buffer (DECISIONS D-023), for 3-style with `orientedInPlace: separate`.
 *
 * A case is a piece left twisted (or flipped) in its own slot, as tracing reports it, with the buffer
 * twisted the other way. The alg must solve that state, so its effect is read straight off the state:
 * the sticker now in each slot must travel home. Candidates are [S: C] with C from an orientation-pair
 * catalogue, found and ranked by the shared conjugate search (setups, exact pruning, D-019 ranking).
 */

export interface OrientationCaseResult {
  readonly target: string;
  readonly direction?: TwistDirection;
  /** Best first. Empty when the bounds hold no alg for the case. */
  readonly comms: readonly FoundComm[];
}

export interface OrientationSearchResult {
  readonly puzzle: PuzzleId;
  readonly pieceType: PieceTypeId;
  readonly buffer: string;
  readonly bounds: CommSearchBounds;
  readonly cases: readonly OrientationCaseResult[];
  readonly noAlg: readonly OrientationCase[];
  readonly stats: CommSearchStats;
}

export type OrientationSearchError = { readonly code: "catalogue-puzzle-mismatch"; readonly expected: PuzzleId; readonly actual: PuzzleId } | OrientationCaseError;

export interface OrientationSearchOptions {
  readonly buffer: string;
  /** Default: every non-buffer piece, in both directions for corners. */
  readonly cases?: readonly OrientationCase[];
  readonly keep?: number;
  /** `false` evaluates every candidate, for tests. */
  readonly prune?: boolean;
}

export function searchOrientationAlgs(puzzle: Puzzle, catalogue: CommCatalogue, options: OrientationSearchOptions): Result<OrientationSearchResult, OrientationSearchError> {
  if (catalogue.puzzleId !== puzzle.id) return err({ code: "catalogue-puzzle-mismatch", expected: puzzle.id, actual: catalogue.puzzleId });
  const type = pieceType(puzzle, catalogue.pieceType);
  const buffer = type.stickerByName(options.buffer);
  if (buffer === undefined) return err({ code: "unknown-sticker", sticker: options.buffer });

  const requested: OrientationCase[] = [];
  if (options.cases === undefined) {
    for (const piece of type.pieces) {
      if (piece.position === buffer.position) continue;
      if (type.orientationOrder === 3) {
        for (const direction of ["clockwise", "counterclockwise"] as const) requested.push({ buffer: options.buffer, target: piece.name, direction });
      } else {
        requested.push({ buffer: options.buffer, target: piece.name });
      }
    }
  } else {
    requested.push(...options.cases);
  }

  const n = catalogue.table.stickerCount;
  const bufferPiece = at(type.pieces, buffer.position);
  const cases: { keyUnder: (perm: Uint8Array) => number }[] = [];
  for (const orientationCase of requested) {
    const state = orientationPairPattern(puzzle, orientationCase);
    if (!state.ok) return state;
    // The alg must send the sticker in each slot home: required effect[slot] = home sticker there.
    const required = faceletsOf(puzzle, state.value);
    const target = type.pieceByName(orientationCase.target);
    if (target === undefined) return err({ code: "unknown-piece", piece: orientationCase.target });
    const pieces = [bufferPiece, target].map((piece) => piece.stickers.map((s) => s.index));
    cases.push({
      keyUnder: (perm) => {
        // Each piece's sticker cycle, carried through the setup, written from its lowest image.
        const steps = pieces.map((stickers) => {
          let lowest = -1;
          let step = 0;
          for (const s of stickers) {
            const image = perm[s] ?? 0;
            if (lowest < 0 || image < lowest) {
              lowest = image;
              step = image * n + (perm[required[s] ?? 0] ?? 0);
            }
          }
          return step;
        });
        return orientationPairKey(n, at(steps, 0), at(steps, 1));
      },
    });
  }

  const { comms, stats } = searchConjugates(puzzle, catalogue, cases, { keep: options.keep ?? 4, prune: options.prune ?? true });
  const results = requested.map(
    (c, i): OrientationCaseResult => ({ target: c.target, ...(c.direction === undefined ? {} : { direction: c.direction }), comms: at(comms, i) }),
  );
  return ok({
    puzzle: puzzle.id,
    pieceType: catalogue.pieceType,
    buffer: buffer.name,
    bounds: catalogue.bounds,
    cases: results,
    noAlg: requested.filter((_, i) => at(comms, i).length === 0),
    stats,
  });
}
