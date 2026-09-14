import { composePerms, identityPerm, invertPerm, moveTable, type StickerPerm } from "../core/move-table.js";
import { VERIFIED_MOVE_FAMILIES, type Puzzle } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import type { CommCatalogue, CommSearchBounds } from "../commutator/catalogue.js";
import { cancelMoves, formatMoves } from "../commutator/expand.js";
import { moveCounts, type MoveCounts } from "../commutator/metrics.js";
import type { AlgMove, ParsedAlg } from "../commutator/parse.js";
import { searchComms, type CommSearchError } from "../commutator/search.js";
import { stickerCycles } from "../data/alg-dataset.js";
import { pieceType } from "../pieces/piece-types.js";
import type { SwapAlg } from "./swap-algs.js";

/**
 * Algs for effects a slice swap can't reach with a setup (DECISIONS D-025): M2's special cases and
 * the M2/OP parity alg.
 *
 * Each required effect, with the swap's side effect in it, becomes a clean 3-cycle once the swap is
 * taken off either end: required = C · swap, or required = swap · C. So the candidates are a comm C
 * from the comm search followed or preceded by the swap. They're ranked by the cancelled length of
 * the whole alg, then quarter turns, then form (comm first), then the comm's own rank.
 *
 * The ranking is exact. Joining the swap to C cancels at most one syllable of C and the swap itself,
 * so the composite is never more than one move shorter than C. The comm search is widened until the
 * next comm it would return is at least two moves longer than the best composite found.
 */

/** Special-case search bounds: your choice of face turns and M only, no E or S (D-025). */
export const M2_SPECIAL_BOUNDS: CommSearchBounds = { generators: ["U", "D", "R", "L", "F", "B", "M"], maxInsertion: 4, maxSetup: 3 };

export type CompositeForm = "comm-then-swap" | "swap-then-comm";

export interface SliceComposite {
  readonly form: CompositeForm;
  readonly comm: ParsedAlg;
  /** The whole alg, expanded and cancelled (D-017). */
  readonly moves: readonly AlgMove[];
  readonly counts: MoveCounts;
}

export type SliceCompositeError =
  | { readonly code: "not-a-three-cycle"; readonly form: CompositeForm; readonly cycles: readonly (readonly string[])[] }
  | { readonly code: "no-composite" }
  | CommSearchError;

export interface SliceCompositeOptions {
  readonly swap: SwapAlg;
  /** The whole-puzzle permutation the alg must have. */
  readonly required: StickerPerm;
  /** Distinct algs kept, best first. Default 4. */
  readonly keep?: number;
}

const FORMS: readonly CompositeForm[] = ["comm-then-swap", "swap-then-comm"];
const MAX_COMMS = 512;

export function searchSliceComposites(puzzle: Puzzle, catalogue: CommCatalogue, options: SliceCompositeOptions): Result<SliceComposite[], SliceCompositeError> {
  const { swap, required } = options;
  const keep = options.keep ?? 4;
  const table = moveTable(puzzle, VERIFIED_MOVE_FAMILIES[puzzle.id]);
  const permOf = (moves: readonly AlgMove[]) => moves.reduce((perm, m) => composePerms(perm, table.move(m.family, m.amount).perm), identityPerm(table.stickerCount));
  const swapInverse = invertPerm(swap.perm);
  const type = pieceType(puzzle, catalogue.pieceType);

  const found: (SliceComposite & { readonly order: number })[] = [];
  const errors: SliceCompositeError[] = [];
  for (const [formIndex, form] of FORMS.entries()) {
    const comm = form === "comm-then-swap" ? composePerms(required, swapInverse) : composePerms(swapInverse, required);
    const cycles = stickerCycles(puzzle, comm);
    const onType = cycles.every((cycle) => cycle.every((name) => type.stickerByName(name) !== undefined));
    const stickersPerPiece = type.pieces[0]?.stickers.length ?? 0;
    if (!onType || cycles.length !== stickersPerPiece || cycles.some((cycle) => cycle.length !== 3)) {
      errors.push({ code: "not-a-three-cycle", form, cycles });
      continue;
    }
    // Any sticker of the cycle can stand in as the comm search's buffer: the case is the same cycle.
    const [b = "", t1 = "", t2 = ""] = cycles[0] ?? [];

    for (let limit = 16; ; limit *= 2) {
      const result = searchComms(puzzle, catalogue, { buffer: b, cases: [[t1, t2]], keep: limit });
      if (!result.ok) return result;
      const comms = result.value.cases[0]?.comms ?? [];
      const candidates = comms.map((c, rank) => {
        const moves = cancelMoves(puzzle.id, form === "comm-then-swap" ? [...c.moves, ...swap.moves] : [...swap.moves, ...c.moves]);
        return { form, comm: c.alg, moves, counts: moveCounts(puzzle.id, moves), order: formIndex * MAX_COMMS + rank };
      });
      // The `keep`-th shortest composite so far; a comm beyond the list is at least as long as the
      // last one returned and shortens by at most one move, so it can only matter if it could tie.
      const threshold = candidates.map((c) => c.counts.etm).sort((x, y) => x - y)[keep - 1] ?? Number.POSITIVE_INFINITY;
      const last = comms[comms.length - 1];
      if (comms.length < limit || last === undefined || last.counts.etm - 1 > threshold) {
        for (const candidate of candidates) {
          const perm = permOf(candidate.moves);
          if (!perm.every((to, from) => to === required[from])) throw new Error(`composite ${formatMoves(candidate.moves)} has the wrong effect`);
          found.push(candidate);
        }
        break;
      }
      if (limit >= MAX_COMMS) throw new Error(`more than ${MAX_COMMS} comms could tie for ${formatMoves(swap.moves)} composites`);
    }
  }
  if (found.length === 0) return err(errors[0] ?? { code: "no-composite" });

  found.sort((a, b) => a.counts.etm - b.counts.etm || a.counts.qtm - b.counts.qtm || a.order - b.order);
  const distinct: SliceComposite[] = [];
  const seen = new Set<string>();
  for (const { order: _order, ...candidate } of found) {
    const key = formatMoves(candidate.moves);
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(candidate);
    if (distinct.length === keep) break;
  }
  return ok(distinct);
}
