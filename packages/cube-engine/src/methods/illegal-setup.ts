import { at } from "../core/arrays.js";
import { composePerms, identityPerm, moveTable, type StickerPerm, type TableMove } from "../core/move-table.js";
import { VERIFIED_MOVE_FAMILIES, type Puzzle } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { expandNodes, invertMoves } from "../commutator/expand.js";
import { moveCounts } from "../commutator/metrics.js";
import { parseAlg, type AlgMove, type AlgParseError } from "../commutator/parse.js";
import { stickerCycles } from "../data/alg-dataset.js";
import { pieceName, stickerName } from "../pieces/names.js";
import type { ForbiddenFamily, SetupTable } from "./setup-search.js";
import { targetEffect, type SwapAlg, type TargetEffectError } from "./swap-algs.js";

/**
 * Setups a swap method forbids, shown by what they break (BRIEF §7.2, "Why is this setup illegal?").
 *
 * A setup S is legal only if S · swap · S⁻¹ exchanges the buffer with the target and repeats the
 * swap's side effect exactly. `demonstrateSetup` runs any setup and compares its effect with that,
 * piece by piece. `illegalSetupExamples` picks, for each forbidden move family, one tempting setup
 * that uses it, so the damage can be shown on a cube instead of described.
 */

export interface SetupDemonstration {
  readonly setup: readonly AlgMove[];
  readonly swap: readonly AlgMove[];
  readonly undo: readonly AlgMove[];
  /** Whether the setup brings the target to the swap sticker at all. */
  readonly reachesSwapSticker: boolean;
  /** Protected pieces (buffer and side effect) that some move of the setup moves. */
  readonly disturbs: readonly string[];
  /** Sticker cycles of the legal exchange plus the swap's side effect. */
  readonly intended: readonly (readonly string[])[];
  /** Sticker cycles of setup · swap · undo. */
  readonly actual: readonly (readonly string[])[];
  /** Pieces left anywhere other than where the legal exchange leaves them. Empty for a legal setup. */
  readonly damagedPieces: readonly string[];
}

export type SetupDemonstrationError = TargetEffectError | { readonly code: "invalid-setup"; readonly error: AlgParseError };

function permOf(puzzle: Puzzle, moves: readonly AlgMove[]): StickerPerm {
  const table = moveTable(puzzle, VERIFIED_MOVE_FAMILIES[puzzle.id]);
  return moves.reduce((perm, m) => composePerms(perm, table.move(m.family, m.amount).perm), identityPerm(table.stickerCount));
}

export function demonstrateSetup(
  puzzle: Puzzle,
  swap: SwapAlg,
  bufferSticker: string,
  target: string,
  setup: string | readonly AlgMove[],
): Result<SetupDemonstration, SetupDemonstrationError> {
  let moves: readonly AlgMove[];
  if (typeof setup === "string") {
    const parsed = parseAlg(puzzle.id, setup);
    if (!parsed.ok) return err({ code: "invalid-setup", error: parsed.error });
    moves = expandNodes(parsed.value.nodes);
  } else {
    moves = setup;
  }
  const intended = targetEffect(puzzle, swap, bufferSticker, target);
  if (!intended.ok) return intended;

  const { geometry } = puzzle;
  const pieceOf = (s: number) => pieceName(geometry.size, geometry.sticker(s).cubie);
  const indexOf = (name: string) => geometry.stickers.findIndex((s) => stickerName(geometry, s.index) === name);
  const undo = invertMoves(moves);
  const actual = permOf(puzzle, [...moves, ...swap.moves, ...undo]);
  const setupPerm = permOf(puzzle, moves);
  const buffer = indexOf(bufferSticker);

  const protectedPieces = [swap.bufferPiece, ...swap.sideEffectPieces];
  const table = moveTable(puzzle, VERIFIED_MOVE_FAMILIES[puzzle.id]);
  const disturbs = protectedPieces.filter((piece) =>
    moves.some((m) => {
      const perm = table.move(m.family, m.amount).perm;
      return perm.some((to, from) => to !== from && pieceOf(from) === piece);
    }),
  );
  const damaged = new Set<string>();
  actual.forEach((to, from) => {
    if (to !== at(intended.value, from)) damaged.add(pieceOf(from));
  });

  return ok({
    setup: moves,
    swap: swap.moves,
    undo,
    reachesSwapSticker: at(setupPerm, indexOf(target)) === at(swap.perm, buffer),
    disturbs,
    intended: stickerCycles(puzzle, intended.value),
    actual: stickerCycles(puzzle, actual),
    damagedPieces: [...damaged],
  });
}

export interface IllegalSetupExample {
  readonly family: string;
  readonly target: string;
  /** Shortest setup for the target that uses the family, with the tie-breaks of D-021. */
  readonly setup: readonly AlgMove[];
  /** The legal setup it competes with. */
  readonly legalSetup: readonly AlgMove[];
  readonly damagedPieces: readonly string[];
}

export interface IllegalSetupExampleOptions {
  readonly swap: SwapAlg;
  readonly bufferSticker: string;
  /** The legal table the examples compete with (its pool and setups). */
  readonly legal: SetupTable;
  readonly forbidden: readonly ForbiddenFamily[];
  /** Candidate families in preference order; the example's pool is the legal pool plus one forbidden family, in this order. */
  readonly candidateFamilies: readonly string[];
}

/**
 * One example per forbidden family: over every target, the shortest setup that uses the family and
 * brings the target to the swap sticker. The example is the target where that setup saves the most
 * moves against the legal one (it may save none, or cost moves); ties go to sticker order.
 */
export function illegalSetupExamples(puzzle: Puzzle, options: IllegalSetupExampleOptions): IllegalSetupExample[] {
  const { swap, legal } = options;
  const { geometry } = puzzle;
  const indexOf = (name: string) => geometry.stickers.findIndex((s) => stickerName(geometry, s.index) === name);
  const swapSticker = indexOf(legal.swapSticker);

  return options.forbidden.map(({ family }) => {
    const families = options.candidateFamilies.filter((f) => f === family || legal.pool.includes(f));
    const table = moveTable(puzzle, families);
    // State: slot of the target sticker, and whether the family has been used. Backward BFS from
    // (swap sticker, used).
    const encode = (slot: number, used: boolean) => slot * 2 + (used ? 1 : 0);
    const goal = encode(swapSticker, true);
    const distance = new Map<number, number>([[goal, 0]]);
    let frontier = [goal];
    for (let depth = 1; frontier.length > 0; depth++) {
      const next: number[] = [];
      for (const code of frontier) {
        const slot = Math.floor(code / 2);
        const used = code % 2 === 1;
        for (const move of table.moves) {
          const previousSlot = at(move.inverse, slot);
          const previousFlags = move.family === family ? (used ? [false, true] : []) : [used];
          for (const flag of previousFlags) {
            const previous = encode(previousSlot, flag);
            if (!distance.has(previous)) {
              distance.set(previous, depth);
              next.push(previous);
            }
          }
        }
      }
      frontier = next;
    }

    let best: { target: string; saving: number; length: number } | undefined;
    for (const { target, setup } of legal.targets) {
      const length = distance.get(encode(indexOf(target), false));
      if (length === undefined || setup === undefined) continue;
      const saving = setup.length - length;
      if (best === undefined || saving > best.saving) best = { target, saving, length };
    }
    if (best === undefined) throw new Error(`no setup uses ${family}`);

    const familyIndex = new Map(families.map((f, i) => [f, i]));
    let chosen: { moves: TableMove[]; qtm: number } | undefined;
    const sequence: TableMove[] = [];
    const walk = (slot: number, used: boolean, remaining: number) => {
      if (remaining === 0) {
        const qtm = moveCounts(puzzle.id, sequence.map((m): AlgMove => ({ type: "move", family: m.family, amount: m.amount }))).qtm;
        if (chosen === undefined || qtm < chosen.qtm || (qtm === chosen.qtm && firstDifference(sequence, chosen.moves) < 0)) chosen = { moves: [...sequence], qtm };
        return;
      }
      const previous = sequence[sequence.length - 1];
      for (const move of table.moves) {
        if (previous !== undefined) {
          if (previous.family === move.family) continue;
          if (previous.axis === move.axis && (familyIndex.get(move.family) ?? 0) < (familyIndex.get(previous.family) ?? 0)) continue;
        }
        const nextSlot = at(move.perm, slot);
        const nextUsed = used || move.family === family;
        if (distance.get(encode(nextSlot, nextUsed)) !== remaining - 1) continue;
        sequence.push(move);
        walk(nextSlot, nextUsed, remaining - 1);
        sequence.pop();
      }
    };
    walk(indexOf(best.target), false, best.length);
    if (chosen === undefined) throw new Error(`no canonical setup for ${best.target} using ${family}`);

    const setup = chosen.moves.map((m): AlgMove => ({ type: "move", family: m.family, amount: m.amount }));
    const demo = demonstrateSetup(puzzle, swap, options.bufferSticker, best.target, setup);
    if (!demo.ok) throw new Error(JSON.stringify(demo.error));
    const legalSetup = legal.targets.find((t) => t.target === best.target)?.setup ?? [];
    return { family, target: best.target, setup, legalSetup, damagedPieces: demo.value.damagedPieces };
  });
}

function firstDifference(a: readonly TableMove[], b: readonly TableMove[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const d = at(a, i).index - at(b, i).index;
    if (d !== 0) return d;
  }
  return a.length - b.length;
}
