import { at } from "../core/arrays.js";
import { composePerms, identityPerm, moveTable, type StickerPerm } from "../core/move-table.js";
import { VERIFIED_MOVE_FAMILIES, type Puzzle, type PuzzleId } from "../core/puzzle.js";
import { err, ok, type Result } from "../core/result.js";
import { conjugatePerm, cubeSymmetries, relabelMove } from "../core/symmetry.js";
import { expandNodes } from "../commutator/expand.js";
import { moveCounts } from "../commutator/metrics.js";
import { parseAlg, type AlgMove, type ParsedAlg } from "../commutator/parse.js";
import { rigidExchangePerm, type StickerCycleError } from "../commutator/validate.js";
import { pieceName, stickerName } from "../pieces/names.js";
import type { PieceTypeId } from "../pieces/piece-types.js";

/**
 * Swap algs for Old Pochmann and M2 (DECISIONS D-020).
 *
 * A method's swap alg exchanges the buffer piece with one other piece, plus a fixed side effect.
 * The reference algs are single named algs from the sources below. What each one does is never
 * typed in: it is computed from the move table, checked against the geometry model, and must have
 * the method's shape. Algs for other buffers come from the 48 cube symmetries and are checked the
 * same way.
 */

export type SwapMethod = "op-corners" | "op-edges" | "m2" | "r2" | "u2";

export interface ReferenceSwap {
  readonly method: SwapMethod;
  readonly pieceType: PieceTypeId;
  readonly puzzle: PuzzleId;
  /** As published, in this engine's notation (see the note on r2 below). */
  readonly alg: string;
  /** Buffer piece the published alg is for. */
  readonly bufferPiece: string;
  readonly source: string;
}

export const REFERENCE_SWAPS: Readonly<Record<SwapMethod, ReferenceSwap>> = {
  "op-corners": {
    method: "op-corners",
    pieceType: "corners",
    puzzle: "3x3x3",
    alg: "R U' R' U' R U R' F' R U R' U' R' F R",
    bufferPiece: "UBL",
    source: "J Perm, jperm.net/bld, Old Pochmann corners swap (retrieved 2026-09-14)",
  },
  "op-edges": {
    method: "op-edges",
    pieceType: "edges",
    puzzle: "3x3x3",
    alg: "R U R' U' R' F R2 U' R' U' R U R' F'",
    bufferPiece: "UR",
    source: "J Perm, jperm.net/bld, Old Pochmann edges swap (retrieved 2026-09-14)",
  },
  m2: {
    method: "m2",
    pieceType: "edges",
    puzzle: "3x3x3",
    alg: "M2",
    bufferPiece: "DF",
    source: "BRIEF §5.4: M2 edges, buffer DF, M2 as the swap",
  },
  /**
   * r2 wings. The source writes the swap `r2`, which in this engine's notation (cubing.js) is `2R2`: `r`
   * there means the two-layer turn Rw, and the inner slice alone is `2R` (D-006). What the swap does is
   * computed from the moves, never read from the source.
   */
  r2: {
    method: "r2",
    pieceType: "wings",
    puzzle: "4x4x4",
    alg: "2R2",
    bufferPiece: "DFr",
    source: "Speedsolving wiki, R2 page: \"The buffer is DFr\", with r2 as the swap (retrieved 2026-09-16)",
  },
  /** U2 x-centres. The tutorial names the buffer \"Urb\", which is Ubr in this engine's names (D-009). */
  u2: {
    method: "u2",
    pieceType: "xcenters",
    puzzle: "4x4x4",
    alg: "U2",
    bufferPiece: "Ubr",
    source: "Speedsolving forums, \"4x4 Blindfolded, U2 Centers Method Tutorial\": buffer Urb, one U2 per target (retrieved 2026-09-16)",
  },
};

/**
 * Old Pochmann parity alg for the reference swaps (buffers UBL and UR). J Perm performs it between
 * the edges and the corners when both targets counts are odd. What it must do is never taken from
 * the source: the dataset verifier derives the effect from the two swaps' side effects, and the OP/OP
 * full-solve property test checks the placement.
 */
export const REFERENCE_OP_PARITY = {
  alg: "R U' R' U' R U R D R' U' R D' R' U2 R' U'",
  bufferPieces: { corners: "UBL", edges: "UR" },
  source: "J Perm, jperm.net/bld, Old Pochmann parity algorithm (retrieved 2026-09-14)",
} as const;

/**
 * The Jb perm, the 3-style parity alg for adjacent UFR/UF buffers (DECISIONS D-026). The wiki writes it
 * with a leading y2; relabelled by that rotation it is a face-turn alg with the same effect, which the
 * parity dataset verifier computes (UFR↔UBR and UF↔UR), never reads from the source.
 */
export const REFERENCE_JB = {
  alg: "R' U L U' R U2 L' U L U2 L'",
  relabelBy: "y2",
  /** The buffers it is the parity alg for, once relabelled. */
  bufferPieces: { corners: "UFR", edges: "UF" },
  source: "Speedsolving wiki, PLL page, Jb permutation, first alg listed, written (y2) R' U L U' R U2' L' U L U2 L' (retrieved 2026-09-14)",
} as const;

/**
 * How many piece transpositions each part of a swap alg's effect must have: of the method's own piece
 * type, of the other two-or-three-sticker kind, and of single-sticker centres. Every number here is
 * checked against the alg's computed effect, so a wrong one fails rather than passes something wrong.
 */
const SHAPES: Readonly<Record<SwapMethod, { readonly own: number; readonly other: number; readonly centres: number }>> = {
  "op-corners": { own: 1, other: 1, centres: 0 },
  "op-edges": { own: 1, other: 1, centres: 0 },
  m2: { own: 2, other: 0, centres: 2 },
  // 2R2 swaps the buffer wing with UBr and the other pair of r-slice wings, and turns the eight r-slice
  // x-centres in pairs.
  r2: { own: 2, other: 0, centres: 4 },
  // U2 swaps both diagonal pairs of U x-centres (its own kind), the two pairs of U corners, and four
  // pairs of U-layer wings.
  u2: { own: 2, other: 6, centres: 0 },
};

/** Which sticker-count kind a piece type is, for the shape counts above. */
const OWN_KIND: Readonly<Record<PieceTypeId, "corners" | "edges" | "centres">> = {
  corners: "corners",
  edges: "edges",
  wings: "edges",
  xcenters: "centres",
};

export interface SwapEffect {
  readonly perm: StickerPerm;
  readonly bufferPiece: string;
  /** The piece the buffer is exchanged with. */
  readonly swapPiece: string;
  /** For each buffer sticker, the slot it is sent to. */
  readonly swapStickers: Readonly<Record<string, string>>;
  /** Every other piece the alg moves (of any kind, centres included), in sticker order. */
  readonly sideEffectPieces: readonly string[];
}

export interface SwapAlg extends SwapEffect {
  readonly method: SwapMethod;
  readonly alg: ParsedAlg;
  readonly moves: readonly AlgMove[];
  readonly etm: number;
  /** Index into `cubeSymmetries`; 0-based, the identity for the reference itself. */
  readonly symmetry: number;
}

export type SwapShapeError =
  | { readonly code: "not-a-piece-swap" }
  | { readonly code: "buffer-not-swapped"; readonly bufferPiece: string }
  | { readonly code: "wrong-shape"; readonly expected: (typeof SHAPES)[SwapMethod]; readonly actual: (typeof SHAPES)[SwapMethod] };

function permOf(puzzle: Puzzle, moves: readonly AlgMove[]): StickerPerm {
  const table = moveTable(puzzle, VERIFIED_MOVE_FAMILIES[puzzle.id]);
  return moves.reduce((perm, m) => composePerms(perm, table.move(m.family, m.amount).perm), identityPerm(table.stickerCount));
}

/**
 * Read a swap alg's effect and check it has the method's shape: an involution whose moved pieces
 * pair up into transpositions (the buffer's among them), with the method's count of transpositions
 * of its own piece kind, the other kind, and centres.
 */
export function analyseSwap(puzzle: Puzzle, method: SwapMethod, perm: StickerPerm, bufferPiece: string): Result<SwapEffect, SwapShapeError> {
  const { geometry } = puzzle;
  if (!perm.every((to, from) => perm[to] === from)) return err({ code: "not-a-piece-swap" });

  const kindOf = (cubieStickers: number) => (cubieStickers === 3 ? "corners" : cubieStickers === 2 ? "edges" : "centres");
  const nameOf = (sticker: number) => pieceName(geometry.size, geometry.sticker(sticker).cubie);
  const partner = new Map<string, string>();
  for (let s = 0; s < perm.length; s++) {
    const to = at(perm, s);
    if (to !== s) partner.set(nameOf(s), nameOf(to));
  }
  // Pieces pair up only if every moved piece's stickers all land on one other piece.
  for (let s = 0; s < perm.length; s++) {
    const to = at(perm, s);
    if (to !== s && partner.get(nameOf(s)) !== nameOf(to)) return err({ code: "not-a-piece-swap" });
  }

  const ownKind = OWN_KIND[REFERENCE_SWAPS[method].pieceType];
  const counts = { own: 0, other: 0, centres: 0 };
  const seen = new Set<string>();
  for (let s = 0; s < perm.length; s++) {
    const piece = nameOf(s);
    if (at(perm, s) === s || seen.has(piece)) continue;
    const other = partner.get(piece) ?? "";
    // A piece mapped onto itself is flipped in place, not swapped.
    if (other === piece) return err({ code: "not-a-piece-swap" });
    seen.add(piece).add(other);
    const kind = kindOf(geometry.cubieOf(s).stickers.length);
    if (kind === ownKind) counts.own++;
    else if (kind === "centres") counts.centres++;
    else counts.other++;
  }
  const swapPiece = partner.get(bufferPiece);
  if (swapPiece === undefined) return err({ code: "buffer-not-swapped", bufferPiece });
  const expected = SHAPES[method];
  if (counts.own !== expected.own || counts.other !== expected.other || counts.centres !== expected.centres) {
    return err({ code: "wrong-shape", expected, actual: counts });
  }

  const swapStickers: Record<string, string> = {};
  const sideEffectPieces: string[] = [];
  for (let s = 0; s < perm.length; s++) {
    const to = at(perm, s);
    if (to === s) continue;
    const piece = nameOf(s);
    if (piece === bufferPiece) swapStickers[stickerName(geometry, s)] = stickerName(geometry, to);
    else if (piece !== swapPiece && !sideEffectPieces.includes(piece)) sideEffectPieces.push(piece);
  }
  return ok({ perm, bufferPiece, swapPiece, swapStickers, sideEffectPieces });
}

export type SwapAlgError = { readonly code: "invalid-alg" } | { readonly code: "wrong-puzzle"; readonly expected: PuzzleId } | SwapShapeError;

/** The reference swap alg, with its computed effect. */
export function referenceSwap(puzzle: Puzzle, method: SwapMethod): Result<SwapAlg, SwapAlgError> {
  const reference = REFERENCE_SWAPS[method];
  if (puzzle.id !== reference.puzzle) return err({ code: "wrong-puzzle", expected: reference.puzzle });
  const parsed = parseAlg(puzzle.id, reference.alg);
  if (!parsed.ok) return err({ code: "invalid-alg" });
  const moves = expandNodes(parsed.value.nodes);
  const effect = analyseSwap(puzzle, method, permOf(puzzle, moves), reference.bufferPiece);
  if (!effect.ok) return effect;
  const identity = cubeSymmetries(puzzle).findIndex((g) => g.sticker.every((to, from) => to === from));
  return ok({ ...effect.value, method, alg: parsed.value, moves, etm: moveCounts(puzzle.id, moves).etm, symmetry: identity });
}

/**
 * Every symmetry image of a reference swap: for each of the 48 symmetries g, the relabelled alg,
 * which swaps g(buffer) with g(swap piece). Its effect is recomputed from its own moves, must equal
 * g·P·g⁻¹ of the reference, and must pass the same shape check. Identical algs for the same buffer
 * piece are listed once (the lowest symmetry index).
 */
export function swapVariants(puzzle: Puzzle, method: SwapMethod): Result<SwapAlg[], SwapAlgError> {
  const reference = referenceSwap(puzzle, method);
  if (!reference.ok) return reference;
  const { geometry } = puzzle;
  const bufferSticker = Object.keys(reference.value.swapStickers)[0] ?? "";
  const bufferIndex = geometry.stickers.findIndex((s) => stickerName(geometry, s.index) === bufferSticker);

  const variants: SwapAlg[] = [];
  const seen = new Set<string>();
  for (const g of cubeSymmetries(puzzle)) {
    const moves = reference.value.moves.map((m): AlgMove => ({ type: "move", ...relabelMove(puzzle, g, m) }));
    const perm = permOf(puzzle, moves);
    const expected = conjugatePerm(g, reference.value.perm);
    if (!perm.every((to, from) => expected[from] === to)) throw new Error(`symmetry ${g.index} relabelling doesn't conjugate the ${method} swap`);
    const bufferPiece = pieceName(geometry.size, geometry.sticker(at(g.sticker, bufferIndex)).cubie);
    const effect = analyseSwap(puzzle, method, perm, bufferPiece);
    if (!effect.ok) return effect;
    const text = moves.map((m) => `${m.family}${m.amount === 1 ? "" : m.amount === 2 ? "2" : "'"}`).join(" ");
    const key = `${bufferPiece}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push({
      ...effect.value,
      method,
      alg: { puzzle: puzzle.id, nodes: moves },
      moves,
      etm: moveCounts(puzzle.id, moves).etm,
      symmetry: g.index,
    });
  }
  return ok(variants);
}

/** The part of a swap's permutation on its side-effect pieces; identity everywhere else. */
export function sideEffectPerm(puzzle: Puzzle, swap: SwapEffect): StickerPerm {
  const { geometry } = puzzle;
  return Uint8Array.from(swap.perm, (to, from) => (swap.sideEffectPieces.includes(pieceName(geometry.size, geometry.sticker(from).cubie)) ? to : from));
}

export type TargetEffectError =
  | { readonly code: "invalid-target"; readonly target: string; readonly detail: StickerCycleError | { readonly code: "impossible-exchange"; readonly stickers: readonly [string, string] } }
  | { readonly code: "target-on-side-effect-piece"; readonly target: string };

/**
 * What shooting `target` with this swap must do, worked out from the case alone: exchange the buffer
 * piece with the target piece (the buffer sticker goes to `target`, the pieces staying rigid), and
 * repeat the swap's side effect exactly. The exchange comes from `stickerCyclePattern`, never from a
 * setup alg.
 *
 * A target on a side-effect piece (M2's UF, FU, DB, BD) is an error by default. With
 * `onSideEffectPiece: "compose"` the effect is the exchange followed by the side effect, E·X: what
 * a step shooting that target must do while the side effect keeps alternating (DECISIONS D-025).
 * For any other target the two touch different pieces, so the result is the same either way.
 */
export function targetEffect(
  puzzle: Puzzle,
  swap: SwapEffect,
  bufferSticker: string,
  target: string,
  options: { readonly onSideEffectPiece?: "error" | "compose" } = {},
): Result<StickerPerm, TargetEffectError> {
  const exchange = rigidExchangePerm(puzzle, bufferSticker, target);
  if (!exchange.ok) return err({ code: "invalid-target", target, detail: exchange.error });
  const { geometry } = puzzle;
  const touchesSideEffect = exchange.value.some((to, slot) => to !== slot && swap.sideEffectPieces.includes(pieceName(geometry.size, geometry.sticker(slot).cubie)));
  if (touchesSideEffect && options.onSideEffectPiece !== "compose") return err({ code: "target-on-side-effect-piece", target });
  return ok(composePerms(exchange.value, sideEffectPerm(puzzle, swap)));
}

/**
 * M2 swaps for every buffer on the M slice (DF, UF, DB, UB): the symmetry images of M2 that are
 * still M-slice turns. Images that become E2 or S2 belong to other slice methods and aren't M2.
 */
export function m2Swaps(puzzle: Puzzle): Result<SwapAlg[], SwapAlgError> {
  const variants = swapVariants(puzzle, "m2");
  if (!variants.ok) return variants;
  return ok(variants.value.filter((v) => v.moves.every((m) => m.family === "M")));
}
