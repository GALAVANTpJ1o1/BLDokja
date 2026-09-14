import { describe, expect, it } from "vitest";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { loadPuzzle, type Puzzle } from "../../src/core/puzzle.js";
import { formatMoves, invertMoves } from "../../src/commutator/expand.js";
import type { AlgMove } from "../../src/commutator/parse.js";
import { DEFAULT_SETUP_POOLS, searchSetups, type SetupTable } from "../../src/methods/setup-search.js";
import { m2Swaps, referenceSwap, swapVariants, type SwapAlg } from "../../src/methods/swap-algs.js";
import { pieceName, stickerName } from "../../src/pieces/names.js";
import { pieceType } from "../../src/pieces/piece-types.js";

/** The buffer's orientation-reference sticker (U/D, or F/B on E-slice edges). */
function referenceSticker(puzzle: Puzzle, swap: SwapAlg): string {
  const type = pieceType(puzzle, swap.method === "op-corners" ? "corners" : "edges");
  const sticker = type.pieceByName(swap.bufferPiece)?.stickers.find((s) => s.isOrientationReference);
  if (sticker === undefined) throw new Error(`no reference sticker on ${swap.bufferPiece}`);
  return sticker.name;
}

/**
 * S · swap · S⁻¹, read in the independent geometry model, must exchange the buffer piece with the
 * target piece (buffer sticker ↦ target), repeat the swap's side effect exactly, and move nothing else.
 */
function checkSetup(puzzle: Puzzle, swap: SwapAlg, bufferSticker: string, target: string, setup: readonly AlgMove[]): void {
  const { geometry } = puzzle;
  const alg = [formatMoves(setup), formatMoves(swap.moves), formatMoves(invertMoves(setup))].filter((part) => part !== "").join(" ");
  const perm = geometryAlgPermutation(geometry, alg);
  const indexOf = (name: string) => geometry.stickers.findIndex((s) => stickerName(geometry, s.index) === name);
  const pieceOf = (s: number) => pieceName(geometry.size, geometry.sticker(s).cubie);
  const b = indexOf(bufferSticker);
  const t = indexOf(target);
  const context = `${bufferSticker} → ${target}: ${alg}`;
  expect([perm[b], perm[t]], context).toEqual([t, b]);
  const swapped = new Set([pieceOf(b), pieceOf(t)]);
  const problems: string[] = [];
  perm.forEach((to, s) => {
    if (swapped.has(pieceOf(s))) {
      if (perm[to] !== s || pieceOf(to) === pieceOf(s)) problems.push(`${stickerName(geometry, s)} is not swapped cleanly`);
    } else if (swap.sideEffectPieces.includes(pieceOf(s))) {
      if (to !== swap.perm[s]) problems.push(`side effect changed at ${stickerName(geometry, s)}`);
    } else if (to !== s) {
      problems.push(`${stickerName(geometry, s)} moved`);
    }
  });
  expect(problems, context).toEqual([]);
}

function checkTable(puzzle: Puzzle, swap: SwapAlg, table: SetupTable): void {
  for (const { target, setup } of table.targets) {
    if (setup === undefined) continue;
    expect(setup.every((m) => table.allowed.includes(m.family)), `${target}: only allowed families`).toBe(true);
    checkSetup(puzzle, swap, table.bufferSticker, target, setup);
  }
}

describe("OP setup search", () => {
  it("corners, reference swap (UBL): D, R and F are allowed, as J Perm says; every target has a verified shortest setup", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const swap = referenceSwap(puzzle, "op-corners");
    if (!swap.ok) throw new Error("swap");
    const table = searchSetups(puzzle, { swap: swap.value, bufferSticker: "UBL", ...DEFAULT_SETUP_POOLS["op-corners"] });
    if (!table.ok) throw new Error(JSON.stringify(table.error));
    expect(table.value.swapSticker).toBe("RDF");
    expect(table.value.allowed).toEqual(["D", "R", "F"]);
    expect(table.value.forbidden.map((f) => [f.family, [...f.disturbs].sort()])).toEqual([
      ["U", ["UB", "UBL", "UL"]],
      ["L", ["UBL", "UL"]],
      ["B", ["UB", "UBL"]],
    ]);
    expect(table.value.unreachable).toEqual([]);
    expect(table.value.targets).toHaveLength(21);
    checkTable(puzzle, swap.value, table.value);
    checkMinimal(puzzle, swap.value, table.value);
  });

  it("edges, reference swap (UR): D, L, Dw and Lw are allowed (J Perm's recipes use all four; D-024); every target has a verified shortest setup", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const swap = referenceSwap(puzzle, "op-edges");
    if (!swap.ok) throw new Error("swap");
    const table = searchSetups(puzzle, { swap: swap.value, bufferSticker: "UR", ...DEFAULT_SETUP_POOLS["op-edges"] });
    if (!table.ok) throw new Error(JSON.stringify(table.error));
    expect(table.value.swapSticker).toBe("UL");
    expect(table.value.allowed).toEqual(["D", "L", "Dw", "Lw"]);
    expect(table.value.unreachable).toEqual([]);
    expect(table.value.targets).toHaveLength(22);
    checkTable(puzzle, swap.value, table.value);
    checkMinimal(puzzle, swap.value, table.value);
  });

  it.each(["op-corners", "op-edges"] as const)("%s: every symmetry variant, from its buffer's reference sticker, gets verified setups for every target", async (method) => {
    const puzzle = await loadPuzzle("3x3x3");
    const variants = swapVariants(puzzle, method);
    if (!variants.ok) throw new Error("variants");
    for (const swap of variants.value) {
      const table = searchSetups(puzzle, { swap, bufferSticker: referenceSticker(puzzle, swap), ...DEFAULT_SETUP_POOLS[method] });
      if (!table.ok) throw new Error(JSON.stringify(table.error));
      expect(table.value.unreachable, `${swap.bufferPiece} ${formatMoves(swap.moves)}`).toEqual([]);
      checkTable(puzzle, swap, table.value);
    }
  });
});

describe("M2 setup search", () => {
  it("every M-slice buffer: setups are verified, and only the other M-slice stickers can't be set up", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const swaps = m2Swaps(puzzle);
    if (!swaps.ok) throw new Error("swaps");
    expect(swaps.value.map((s) => s.bufferPiece).sort()).toEqual(["DB", "DF", "UB", "UF"]);
    for (const swap of swaps.value) {
      const bufferSticker = referenceSticker(puzzle, swap);
      const table = searchSetups(puzzle, { swap, bufferSticker, ...DEFAULT_SETUP_POOLS.m2 });
      if (!table.ok) throw new Error(JSON.stringify(table.error));
      // The two M-slice edges M2 swaps as a side effect stay put, so their stickers can't be targets.
      const sideEdges = swap.sideEffectPieces.filter((p) => p.length === 2);
      const expectedUnreachable = pieceType(puzzle, "edges").stickers.filter((s) => sideEdges.includes(s.name) || sideEdges.includes(pieceName(3, puzzle.geometry.sticker(s.index).cubie))).map((s) => s.name);
      expect([...table.value.unreachable].sort(), swap.bufferPiece).toEqual([...expectedUnreachable].sort());
      expect(table.value.forbidden).toEqual([]);
      checkTable(puzzle, swap, table.value);
      if (swap.bufferPiece === "DF") checkMinimal(puzzle, swap, table.value);
    }
  });
});

describe("setup search errors", () => {
  it("rejects a buffer sticker off the swap's buffer piece, and an empty pool", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const swap = referenceSwap(puzzle, "op-corners");
    if (!swap.ok) throw new Error("swap");
    const code = (r: ReturnType<typeof searchSetups>) => (r.ok ? "ok" : r.error.code);
    expect(code(searchSetups(puzzle, { swap: swap.value, bufferSticker: "UFR", ...DEFAULT_SETUP_POOLS["op-corners"] }))).toBe("buffer-not-on-swap-piece");
    expect(code(searchSetups(puzzle, { swap: swap.value, bufferSticker: "UBL", pool: [], regime: "every-move" }))).toBe("pool-must-not-be-empty");
  });
});

/**
 * No shorter setup exists: exhaustively try every sequence of the table's allowed families shorter
 * than the one found. Setups longer than 3 moves are skipped to keep this cheap (for M2 that is
 * only BU, at 5); their length rests on the breadth-first search alone.
 */
const MINIMALITY_CHECK_MAX = 3;
function checkMinimal(puzzle: Puzzle, swap: SwapAlg, table: SetupTable): void {
  const moves: AlgMove[] = table.allowed.flatMap((family) => ([1, 3, 2] as const).map((amount): AlgMove => ({ type: "move", family, amount })));
  const { geometry } = puzzle;
  const indexOf = (name: string) => geometry.stickers.findIndex((s) => stickerName(geometry, s.index) === name);
  const pieceOf = (s: number) => pieceName(geometry.size, geometry.sticker(s).cubie);
  const protectedStickers = geometry.stickers.filter((s) => [swap.bufferPiece, ...swap.sideEffectPieces].includes(pieceOf(s.index))).map((s) => s.index);
  const swapSticker = indexOf(table.swapSticker);
  const works = (setup: readonly AlgMove[], target: number) => {
    const perm = geometryAlgPermutation(geometry, formatMoves(setup));
    return perm[target] === swapSticker && protectedStickers.every((s) => perm[s] === s);
  };
  for (const { target, setup } of table.targets) {
    if (setup === undefined || setup.length === 0 || setup.length > MINIMALITY_CHECK_MAX) continue;
    const t = indexOf(target);
    let frontier: AlgMove[][] = [[]];
    for (let length = 1; length < setup.length; length++) {
      frontier = frontier.flatMap((sequence) => moves.map((m) => [...sequence, m]));
      expect(frontier.some((sequence) => works(sequence, t)), `${target}: a setup of ${length} exists`).toBe(false);
    }
  }
}
