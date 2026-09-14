import { describe, expect, it } from "vitest";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { formatMoves } from "../../src/commutator/expand.js";
import { analyseSwap, m2Swaps, referenceSwap, REFERENCE_SWAPS, swapVariants, type SwapMethod } from "../../src/methods/swap-algs.js";
import { pieceType } from "../../src/pieces/piece-types.js";

/**
 * Effects are computed by the engine, never copied from a source. The pinned values below were read
 * off the computed permutations while planning milestone 7 (D-020) and are checked again here
 * against the independent geometry model.
 */
const PINNED: Readonly<Record<SwapMethod, { swapPiece: string; swapStickers: Record<string, string>; sideEffects: string[]; etm: number }>> = {
  "op-corners": { swapPiece: "DFR", swapStickers: { UBL: "RDF", LUB: "DFR", BUL: "FDR" }, sideEffects: ["UB", "UL"], etm: 15 },
  "op-edges": { swapPiece: "UL", swapStickers: { UR: "UL", RU: "LU" }, sideEffects: ["UBR", "UFR"], etm: 14 },
  m2: { swapPiece: "UB", swapStickers: { DF: "UB", FD: "BU" }, sideEffects: ["B", "D", "DB", "F", "U", "UF"], etm: 1 },
};

describe("reference swap algs", () => {
  it.each(Object.keys(REFERENCE_SWAPS) as SwapMethod[])("%s: computed effect has the method's shape, matches the geometry model, and is pinned", async (method) => {
    const puzzle = await loadPuzzle("3x3x3");
    const swap = referenceSwap(puzzle, method);
    if (!swap.ok) throw new Error(JSON.stringify(swap.error));
    expect(Array.from(swap.value.perm)).toEqual(Array.from(geometryAlgPermutation(puzzle.geometry, REFERENCE_SWAPS[method].alg)));
    const pinned = PINNED[method];
    expect({
      swapPiece: swap.value.swapPiece,
      swapStickers: swap.value.swapStickers,
      sideEffects: [...swap.value.sideEffectPieces].sort(),
      etm: swap.value.etm,
    }).toEqual(pinned);
  });

  it("rejects effects that don't have the method's shape", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const permOf = (alg: string) => Uint8Array.from(geometryAlgPermutation(puzzle.geometry, alg));
    const code = (r: ReturnType<typeof analyseSwap>) => (r.ok ? "ok" : r.error.code);
    expect(code(analyseSwap(puzzle, "op-corners", permOf("R"), "UBL"))).toBe("not-a-piece-swap");
    expect(code(analyseSwap(puzzle, "op-corners", permOf(REFERENCE_SWAPS["op-corners"].alg), "UFR"))).toBe("buffer-not-swapped");
    expect(code(analyseSwap(puzzle, "op-edges", permOf("M2"), "DF"))).toBe("wrong-shape");
    expect(code(analyseSwap(puzzle, "m2", permOf(REFERENCE_SWAPS["op-edges"].alg), "UR"))).toBe("wrong-shape");
  });
});

describe("symmetry-derived swap algs", () => {
  it.each([
    { method: "op-corners" as const, type: "corners" as const, perBuffer: 6 },
    { method: "op-edges" as const, type: "edges" as const, perBuffer: 4 },
  ])("$method: every buffer piece gets verified variants", async ({ method, type, perBuffer }) => {
    const puzzle = await loadPuzzle("3x3x3");
    const variants = swapVariants(puzzle, method);
    if (!variants.ok) throw new Error(JSON.stringify(variants.error));
    const { geometry } = puzzle;
    const pieces = pieceType(puzzle, type).pieces.map((p) => p.name);
    const byBuffer = new Map<string, number>();
    for (const variant of variants.value) {
      byBuffer.set(variant.bufferPiece, (byBuffer.get(variant.bufferPiece) ?? 0) + 1);
      // Recomputed independently from the variant's own moves.
      expect(Array.from(variant.perm), formatMoves(variant.moves)).toEqual(Array.from(geometryAlgPermutation(geometry, formatMoves(variant.moves))));
      expect(variant.etm).toBe(PINNED[method].etm);
      if (method === "op-corners") {
        // Symmetries preserve antipodes, so the corner swap position is always opposite the buffer.
        const centreOf = (piece: string) => geometry.cubieOf(pieceType(puzzle, type).pieceByName(piece)?.stickers[0]?.index ?? -1).center;
        expect(centreOf(variant.swapPiece).map((x) => -x), `${variant.bufferPiece} ↔ ${variant.swapPiece}`).toEqual([...centreOf(variant.bufferPiece)]);
      }
    }
    expect([...byBuffer.keys()].sort()).toEqual([...pieces].sort());
    for (const piece of pieces) expect(byBuffer.get(piece), piece).toBe(perBuffer);
    const reference = variants.value.find((v) => v.bufferPiece === REFERENCE_SWAPS[method].bufferPiece && formatMoves(v.moves) === REFERENCE_SWAPS[method].alg);
    expect(reference).toBeDefined();
  });

  it("M2: the swaps for the four M-slice buffers", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const swaps = m2Swaps(puzzle);
    if (!swaps.ok) throw new Error(JSON.stringify(swaps.error));
    const pairs = Object.fromEntries(swaps.value.map((s) => [s.bufferPiece, s.swapPiece]));
    expect(pairs).toEqual({ DF: "UB", UB: "DF", UF: "DB", DB: "UF" });
    for (const swap of swaps.value) expect(formatMoves(swap.moves)).toBe("M2");
  });
});
