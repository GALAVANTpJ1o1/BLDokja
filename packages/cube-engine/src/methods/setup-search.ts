import { at } from "../core/arrays.js";
import { moveTable, type TableMove } from "../core/move-table.js";
import type { Puzzle } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { moveCounts } from "../commutator/metrics.js";
import type { AlgMove } from "../commutator/parse.js";
import { pieceName, stickerName } from "../pieces/names.js";
import { pieceType } from "../pieces/piece-types.js";
import { REFERENCE_SWAPS, type SwapAlg } from "./swap-algs.js";

/**
 * Setup search for Old Pochmann and M2 (DECISIONS D-021).
 *
 * A setup S for target t brings t to the swap sticker (the slot the buffer sticker is sent to), so
 * that S · swap · S⁻¹ exchanges the buffer with t and leaves the swap's side effect unchanged. That
 * needs S to leave the protected stickers where they are: the buffer piece and every side-effect
 * piece (not the swap piece, which S may move).
 *
 * - `every-move` (OP, J Perm's rule): only pool moves that leave every protected sticker alone may be
 *   used; the others are reported as forbidden, with the protected pieces each one disturbs.
 * - `net` (M2): any pool move may be used, as long as the whole setup leaves the protected stickers
 *   where they were. M2 needs this: the only face turns that never touch its protected pieces are
 *   R and L, and neither reaches the helper slot.
 *
 * One backward breadth-first search gives the exact setup length for every target. Among the
 * shortest canonical setups, the one with the fewest quarter turns wins, then the earliest in pool
 * order (clockwise, prime, half).
 */

export type SetupRegime = "every-move" | "net";

export interface SetupSearchOptions {
  readonly swap: SwapAlg;
  /** Buffer sticker, on the swap's buffer piece. */
  readonly bufferSticker: string;
  /** Move families setups may use, in preference order. */
  readonly pool: readonly string[];
  readonly regime: SetupRegime;
}

export interface ForbiddenFamily {
  readonly family: string;
  /** Protected pieces the family's turns move. */
  readonly disturbs: readonly string[];
}

export interface TargetSetup {
  readonly target: string;
  /** Undefined when no setup exists with this pool and regime. */
  readonly setup: readonly AlgMove[] | undefined;
}

export interface SetupTable {
  readonly bufferSticker: string;
  /** Where the buffer sticker is sent, and where every setup brings its target. */
  readonly swapSticker: string;
  readonly protectedPieces: readonly string[];
  readonly regime: SetupRegime;
  readonly pool: readonly string[];
  /** Families usable under the regime (every-move: those that move no protected sticker). */
  readonly allowed: readonly string[];
  readonly forbidden: readonly ForbiddenFamily[];
  readonly targets: readonly TargetSetup[];
  readonly unreachable: readonly string[];
}

export type SetupSearchError =
  | { readonly code: "buffer-not-on-swap-piece"; readonly bufferSticker: string; readonly bufferPiece: string }
  | { readonly code: "pool-must-not-be-empty" };

export const DEFAULT_SETUP_POOLS = {
  "op-corners": { pool: ["U", "D", "R", "L", "F", "B"], regime: "every-move" },
  "op-edges": { pool: ["U", "D", "R", "L", "F", "B", "Uw", "Dw", "Rw", "Lw", "Fw", "Bw"], regime: "every-move" },
  m2: { pool: ["U", "D", "R", "L", "F", "B"], regime: "net" },
} as const satisfies Record<SwapAlg["method"], { pool: readonly string[]; regime: SetupRegime }>;

/**
 * The setup families the committed OP datasets use for the reference swaps (D-022, amended in
 * milestone 9: J Perm's D-face edge recipe uses D, so D joins the edge pool). The wider
 * `DEFAULT_SETUP_POOLS` are still the candidates checked for forbidden families.
 */
export const GATE_B_SETUP_FAMILIES = {
  "op-corners": ["D", "R", "F"],
  "op-edges": ["D", "L", "Dw", "Lw"],
} as const satisfies Record<"op-corners" | "op-edges", readonly string[]>;

const tableCache = new WeakMap<Puzzle, Map<string, Result<SetupTable, SetupSearchError>>>();

/** Results are deterministic in their inputs, so they are cached per puzzle (the `net` regime's search is the slow one). */
export function searchSetups(puzzle: Puzzle, options: SetupSearchOptions): Result<SetupTable, SetupSearchError> {
  let byPuzzle = tableCache.get(puzzle);
  if (byPuzzle === undefined) {
    byPuzzle = new Map();
    tableCache.set(puzzle, byPuzzle);
  }
  const key = `${options.swap.perm.join(",")}|${options.swap.bufferPiece}|${options.swap.sideEffectPieces.join(",")}|${options.swap.method}|${options.bufferSticker}|${options.pool.join(",")}|${options.regime}`;
  const cached = byPuzzle.get(key);
  if (cached !== undefined) return cached;
  const result = runSetupSearch(puzzle, options);
  byPuzzle.set(key, result);
  return result;
}

function runSetupSearch(puzzle: Puzzle, options: SetupSearchOptions): Result<SetupTable, SetupSearchError> {
  const { swap, regime } = options;
  if (options.pool.length === 0) return err({ code: "pool-must-not-be-empty" });
  const { geometry } = puzzle;
  const n = geometry.stickerCount;
  const indexOf = new Map(geometry.stickers.map((s) => [stickerName(geometry, s.index), s.index]));
  const nameOf = (s: number) => stickerName(geometry, s);
  const pieceOf = (s: number) => pieceName(geometry.size, geometry.sticker(s).cubie);

  const buffer = indexOf.get(options.bufferSticker);
  if (buffer === undefined || pieceOf(buffer) !== swap.bufferPiece) {
    return err({ code: "buffer-not-on-swap-piece", bufferSticker: options.bufferSticker, bufferPiece: swap.bufferPiece });
  }
  const swapSticker = at(swap.perm, buffer);
  const protectedPieces = [swap.bufferPiece, ...swap.sideEffectPieces];
  const protectedStickers = geometry.stickers.filter((s) => protectedPieces.includes(pieceOf(s.index))).map((s) => s.index);

  const table = moveTable(puzzle, options.pool);
  const disturbed = (move: TableMove) => [...new Set(protectedStickers.filter((s) => at(move.perm, s) !== s).map(pieceOf))];
  const forbidden: ForbiddenFamily[] = [];
  const allowedFamilies: string[] = [];
  for (const family of options.pool) {
    const disturbs = disturbed(table.move(family, 1));
    if (regime === "every-move" && disturbs.length > 0) forbidden.push({ family, disturbs });
    else allowedFamilies.push(family);
  }
  const moves = table.moves.filter((m) => allowedFamilies.includes(m.family));
  // One sticker per protected piece (a piece is home exactly when any one of its stickers is),
  // skipping pieces no usable move can disturb, such as M2's centres under face turns.
  const tracked = protectedPieces
    .map((piece) => at(protectedStickers.filter((s) => pieceOf(s) === piece), 0))
    .filter((s) => moves.some((m) => at(m.perm, s) !== s));

  // State: the slot of the target sticker, then the slot of each tracked protected sticker.
  // Under every-move the protected stickers never move, so only the target's slot is tracked.
  const trackedCount = regime === "net" ? tracked.length : 0;
  const encode = (slots: readonly number[]) => slots.reduce((code, slot) => code * n + slot, 0);
  const decode = (code: number): number[] => {
    const slots = new Array<number>(trackedCount + 1);
    for (let i = trackedCount; i >= 0; i--) {
      slots[i] = code % n;
      code = Math.floor(code / n);
    }
    return slots;
  };
  const step = (slots: readonly number[], perm: Uint8Array) => slots.map((slot) => at(perm, slot));

  // Backward BFS from the goal: target at the swap sticker, protected stickers home.
  const goal = encode([swapSticker, ...tracked.slice(0, trackedCount)]);
  const distance = new Map<number, number>([[goal, 0]]);
  let frontier = [goal];
  for (let depth = 1; frontier.length > 0; depth++) {
    const next: number[] = [];
    for (const code of frontier) {
      const slots = decode(code);
      for (const move of moves) {
        const previous = encode(step(slots, move.inverse));
        if (!distance.has(previous)) {
          distance.set(previous, depth);
          next.push(previous);
        }
      }
    }
    frontier = next;
  }

  const familyIndex = new Map(options.pool.map((f, i) => [f, i]));
  const shortestSetup = (target: number): readonly TableMove[] | undefined => {
    const start = [target, ...tracked.slice(0, trackedCount)];
    const total = distance.get(encode(start));
    if (total === undefined) return undefined;
    let best: { moves: TableMove[]; qtm: number } | undefined;
    const sequence: TableMove[] = [];
    // Every shortest canonical path, following moves that bring the goal exactly one step closer.
    const walk = (slots: readonly number[], remaining: number) => {
      if (remaining === 0) {
        const qtm = moveCounts(puzzle.id, sequence.map((m) => ({ type: "move", family: m.family, amount: m.amount }))).qtm;
        if (best === undefined || qtm < best.qtm || (qtm === best.qtm && firstDifference(sequence, best.moves) < 0)) best = { moves: [...sequence], qtm };
        return;
      }
      const previous = sequence[sequence.length - 1];
      for (const move of moves) {
        if (previous !== undefined) {
          if (previous.family === move.family) continue;
          if (previous.axis === move.axis && (familyIndex.get(move.family) ?? 0) < (familyIndex.get(previous.family) ?? 0)) continue;
        }
        const after = step(slots, move.perm);
        if (distance.get(encode(after)) !== remaining - 1) continue;
        sequence.push(move);
        walk(after, remaining - 1);
        sequence.pop();
      }
    };
    walk(start, total);
    return best?.moves;
  };

  const type = pieceType(puzzle, REFERENCE_SWAPS[swap.method].pieceType);
  const targets: TargetSetup[] = [];
  for (const sticker of type.stickers) {
    if (pieceOf(sticker.index) === swap.bufferPiece) continue;
    const setup = shortestSetup(sticker.index);
    targets.push({ target: sticker.name, setup: setup?.map((m): AlgMove => ({ type: "move", family: m.family, amount: m.amount })) });
  }

  return ok({
    bufferSticker: options.bufferSticker,
    swapSticker: nameOf(swapSticker),
    protectedPieces,
    regime,
    pool: [...options.pool],
    allowed: allowedFamilies,
    forbidden,
    targets,
    unreachable: targets.filter((t) => t.setup === undefined).map((t) => t.target),
  });
}

function firstDifference(a: readonly TableMove[], b: readonly TableMove[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const d = at(a, i).index - at(b, i).index;
    if (d !== 0) return d;
  }
  return a.length - b.length;
}
