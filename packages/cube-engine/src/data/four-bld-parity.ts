import { z } from "../core/zod.js";
import { at } from "../core/arrays.js";
import { composePerms, identityPerm, invertPerm, moveTable, type StickerPerm } from "../core/move-table.js";
import { VERIFIED_MOVE_FAMILIES, type Puzzle } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { pieceType } from "../pieces/piece-types.js";
import { ENGINE_VERSION } from "../version.js";
import { AlgEntrySchema, checkAlgEntry, entryForAlg, IntendedEffectSchema, stickerCycles, StickerName, type DatasetProblem } from "./alg-dataset.js";
import { movesOf, type OpSetupsDataset } from "./op-dataset.js";

/**
 * Corner parity for Old Pochmann corners on a 4x4 (D-041).
 *
 * OP corners use only outer turns, so they work on a 4x4 as they do on a 3x3, with one difference in
 * what the swap drags along. On a 3x3 the swap also exchanges the edges UB and UL; on a 4x4 those edges
 * are pairs of wings, so every corner shot swaps the UB and UL wing pairs. An even number of shots
 * cancels that; after an odd number, the corners are solved and the two wing pairs are left swapped.
 * The parity alg undoes exactly that leftover: everything the swap does except to corners, inverted.
 * It is judged by colour, since outer turns rearrange the x-centres of a face among themselves.
 */

export const OpCornerParityDatasetSchema = z.object({
  format: z.literal("bld-platform/alg-dataset"),
  version: z.literal(1),
  id: z.string().min(1),
  puzzle: z.literal("4x4x4"),
  method: z.literal("op"),
  kind: z.literal("corner-parity"),
  generatedBy: z.object({ engine: z.string().min(1) }),
  /** The OP corner buffer sticker, and the corner swap alg the leftover comes from. */
  buffer: StickerName,
  swap: z.string().min(1),
  records: z.tuple([z.object({ id: z.literal("parity"), kind: z.literal("parity"), intendedEffect: IntendedEffectSchema, algs: z.array(AlgEntrySchema).min(1).max(4) })]),
});

export type OpCornerParityDataset = z.infer<typeof OpCornerParityDatasetSchema>;

export type OpCornerParityProblem = DatasetProblem | { readonly code: "parity-mismatch"; readonly field: string } | { readonly code: "invalid-swap"; readonly detail: string };

/** A written alg's sticker permutation on the puzzle given, straight from the move table. */
function permOf(puzzle: Puzzle, text: string): StickerPerm | undefined {
  const moves = movesOf(puzzle, text);
  if (moves === undefined) return undefined;
  const table = moveTable(puzzle, VERIFIED_MOVE_FAMILIES[puzzle.id]);
  return moves.reduce((perm, m) => composePerms(perm, table.move(m.family, m.amount).perm), identityPerm(table.stickerCount));
}

/** What the parity alg must do on a 4x4: undo everything an OP corner swap does to pieces other than corners. */
export function opCornerParityEffect(puzzle: Puzzle, corners: OpSetupsDataset): Result<StickerPerm, OpCornerParityProblem> {
  if (puzzle.id !== "4x4x4") return err({ code: "parity-mismatch", field: "puzzle" });
  if (corners.pieceType !== "corners") return err({ code: "parity-mismatch", field: "corners.pieceType" });
  const swap = permOf(puzzle, corners.swap.alg);
  if (swap === undefined) return err({ code: "invalid-swap", detail: corners.swap.alg });
  const cornerStickers = new Set(pieceType(puzzle, "corners").stickers.map((s) => s.index));
  // Orbits don't mix, so the swap splits into its corner part and the rest; keep the rest.
  const rest = identityPerm(swap.length);
  for (let s = 0; s < swap.length; s++) if (!cornerStickers.has(s)) rest[s] = at(swap, s);
  return ok(invertPerm(rest));
}

export interface OpCornerParitySpec {
  readonly id: string;
  readonly corners: OpSetupsDataset;
  readonly algs: readonly string[];
  readonly citation: string;
}

export function buildOpCornerParityDataset(puzzle: Puzzle, spec: OpCornerParitySpec): Result<OpCornerParityDataset, OpCornerParityProblem> {
  const effect = opCornerParityEffect(puzzle, spec.corners);
  if (!effect.ok) return effect;
  return ok({
    format: "bld-platform/alg-dataset",
    version: 1,
    id: spec.id,
    puzzle: "4x4x4",
    method: "op",
    kind: "corner-parity",
    generatedBy: { engine: ENGINE_VERSION },
    buffer: spec.corners.buffer,
    swap: spec.corners.swap.alg,
    records: [
      {
        id: "parity",
        kind: "parity",
        intendedEffect: { stickerCycles: stickerCycles(puzzle, effect.value), sideEffectPieces: [] },
        algs: spec.algs.map((alg) => entryForAlg(puzzle, alg, "reference", spec.citation)),
      },
    ],
  });
}

export function verifyOpCornerParityDataset(puzzle: Puzzle, parity: OpCornerParityDataset, corners: OpSetupsDataset): OpCornerParityProblem[] {
  const problems: OpCornerParityProblem[] = [];
  if (parity.buffer !== corners.buffer) problems.push({ code: "parity-mismatch", field: "buffer" });
  if (parity.swap !== corners.swap.alg) problems.push({ code: "parity-mismatch", field: "swap" });
  const effect = opCornerParityEffect(puzzle, corners);
  if (!effect.ok) return [...problems, effect.error];
  const [record] = parity.records;
  if (JSON.stringify(record.intendedEffect.stickerCycles) !== JSON.stringify(stickerCycles(puzzle, effect.value))) problems.push({ code: "wrong-intended-effect", record: record.id });
  if (record.intendedEffect.sideEffectPieces.length > 0) problems.push({ code: "side-effects-not-allowed", record: record.id });
  const entryProblems: DatasetProblem[] = [];
  const seen = new Set<string>();
  for (const entry of record.algs) {
    checkAlgEntry(puzzle, record.id, entry, effect.value, entryProblems, "colours");
    if (seen.has(entry.moves)) entryProblems.push({ code: "duplicate-alg", record: record.id, alg: entry.alg });
    seen.add(entry.moves);
  }
  return [...problems, ...entryProblems];
}
