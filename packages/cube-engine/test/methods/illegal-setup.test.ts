import { describe, expect, it } from "vitest";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { loadPuzzle, type Puzzle } from "../../src/core/puzzle.js";
import { formatMoves, invertMoves } from "../../src/commutator/expand.js";
import type { AlgMove } from "../../src/commutator/parse.js";
import { demonstrateSetup, illegalSetupExamples } from "../../src/methods/illegal-setup.js";
import { DEFAULT_SETUP_POOLS, searchSetups, type SetupTable } from "../../src/methods/setup-search.js";
import { referenceSwap, swapVariants, targetEffect, type SwapAlg } from "../../src/methods/swap-algs.js";
import { pieceName, stickerName } from "../../src/pieces/names.js";
import { pieceType } from "../../src/pieces/piece-types.js";

/** The Gate B setup pools for the reference swaps (D-022, amended in milestone 9). */
const GATE_B = {
  "op-corners": { buffer: "UBL", pool: ["D", "R", "F"] },
  "op-edges": { buffer: "UR", pool: ["D", "L", "Dw", "Lw"] },
} as const;

function referenceSticker(puzzle: Puzzle, swap: SwapAlg): string {
  const type = pieceType(puzzle, swap.method === "op-corners" ? "corners" : "edges");
  const sticker = type.pieceByName(swap.bufferPiece)?.stickers.find((s) => s.isOrientationReference);
  if (sticker === undefined) throw new Error(`no reference sticker on ${swap.bufferPiece}`);
  return sticker.name;
}

function table(puzzle: Puzzle, swap: SwapAlg, bufferSticker: string, pool: readonly string[]): SetupTable {
  const result = searchSetups(puzzle, { swap, bufferSticker, pool, regime: "every-move" });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

/** Damaged pieces read in the independent geometry model: stickers where setup · swap · undo differs from the intended effect. */
function geometryDamage(puzzle: Puzzle, swap: SwapAlg, bufferSticker: string, target: string, setup: readonly AlgMove[]): string[] {
  const { geometry } = puzzle;
  const intended = targetEffect(puzzle, swap, bufferSticker, target);
  if (!intended.ok) throw new Error(JSON.stringify(intended.error));
  const alg = [formatMoves(setup), formatMoves(swap.moves), formatMoves(invertMoves(setup))].filter((part) => part !== "").join(" ");
  const actual = geometryAlgPermutation(geometry, alg);
  const damaged = new Set<string>();
  actual.forEach((to, from) => {
    if (to !== intended.value[from]) damaged.add(pieceName(geometry.size, geometry.sticker(from).cubie));
  });
  return [...damaged].sort();
}

describe("demonstrateSetup on legal setups", () => {
  it.each(["op-corners", "op-edges"] as const)("%s: every setup in the Gate B table and in every symmetry variant's table does exactly the intended exchange", async (method) => {
    const puzzle = await loadPuzzle("3x3x3");
    const reference = referenceSwap(puzzle, method);
    const variants = swapVariants(puzzle, method);
    if (!reference.ok || !variants.ok) throw new Error("swaps");
    const tables: [SwapAlg, string, SetupTable][] = [
      [reference.value, GATE_B[method].buffer, table(puzzle, reference.value, GATE_B[method].buffer, GATE_B[method].pool)],
      ...variants.value.map((swap): [SwapAlg, string, SetupTable] => {
        const buffer = referenceSticker(puzzle, swap);
        return [swap, buffer, table(puzzle, swap, buffer, DEFAULT_SETUP_POOLS[method].pool)];
      }),
    ];
    for (const [swap, buffer, setups] of tables) {
      for (const { target, setup } of setups.targets) {
        if (setup === undefined) throw new Error(`${buffer}: ${target} unreachable`);
        const demo = demonstrateSetup(puzzle, swap, buffer, target, setup);
        if (!demo.ok) throw new Error(JSON.stringify(demo.error));
        const context = `${formatMoves(swap.moves)} ${target}: ${formatMoves(setup)}`;
        expect(demo.value.reachesSwapSticker, context).toBe(true);
        expect(demo.value.disturbs, context).toEqual([]);
        expect(demo.value.damagedPieces, context).toEqual([]);
        expect(demo.value.actual, context).toEqual(demo.value.intended);
      }
    }
  });
});

describe("illegal setup examples", () => {
  /** Read off the computed examples when milestone 9 was built; checked again below in the geometry model. */
  const PINNED = {
    "op-corners": [
      { family: "U", target: "FUR", setup: "U F2", legal: "R2 D'" },
      { family: "L", target: "UFL", setup: "L D", legal: "F R'" },
      { family: "B", target: "UBR", setup: "B' R", legal: "R D'" },
    ],
    "op-edges": [
      { family: "U", target: "UF", setup: "U", legal: "Lw2 D L2" },
      { family: "R", target: "RD", setup: "R Dw' L'", legal: "D Lw' D' L2" },
      { family: "F", target: "FU", setup: "F' L'", legal: "Lw D' L2" },
      { family: "B", target: "BU", setup: "B L", legal: "Lw' D L2" },
      { family: "Uw", target: "UF", setup: "Uw", legal: "Lw2 D L2" },
      { family: "Rw", target: "RD", setup: "Rw Dw' L'", legal: "D Lw' D' L2" },
      { family: "Fw", target: "RD", setup: "D2 Fw", legal: "D Lw' D' L2" },
      { family: "Bw", target: "RD", setup: "D2 Bw'", legal: "D Lw' D' L2" },
    ],
  };

  it.each(["op-corners", "op-edges"] as const)("%s: one per forbidden family, using it, reaching the swap sticker, and visibly damaging a protected piece", async (method) => {
    const puzzle = await loadPuzzle("3x3x3");
    const swap = referenceSwap(puzzle, method);
    if (!swap.ok) throw new Error("swap");
    const buffer = GATE_B[method].buffer;
    const legal = table(puzzle, swap.value, buffer, GATE_B[method].pool);
    const candidates = table(puzzle, swap.value, buffer, DEFAULT_SETUP_POOLS[method].pool);
    const examples = illegalSetupExamples(puzzle, {
      swap: swap.value,
      bufferSticker: buffer,
      legal,
      forbidden: candidates.forbidden,
      candidateFamilies: DEFAULT_SETUP_POOLS[method].pool,
    });
    expect(examples.map((e) => ({ family: e.family, target: e.target, setup: formatMoves(e.setup), legal: formatMoves(e.legalSetup) }))).toEqual(PINNED[method]);

    const protectedPieces = [swap.value.bufferPiece, ...swap.value.sideEffectPieces];
    const indexOf = (name: string) => puzzle.geometry.stickers.findIndex((s) => stickerName(puzzle.geometry, s.index) === name);
    for (const example of examples) {
      const context = `${example.family}: ${example.target} ${formatMoves(example.setup)}`;
      expect(example.setup.some((m) => m.family === example.family), context).toBe(true);
      // The setup really brings the target to the swap sticker (geometry model).
      const setupPerm = geometryAlgPermutation(puzzle.geometry, formatMoves(example.setup));
      expect(setupPerm[indexOf(example.target)], context).toBe(indexOf(legal.swapSticker));
      const demo = demonstrateSetup(puzzle, swap.value, buffer, example.target, example.setup);
      if (!demo.ok) throw new Error(JSON.stringify(demo.error));
      expect(demo.value.reachesSwapSticker, context).toBe(true);
      expect(demo.value.disturbs.length, context).toBeGreaterThan(0);
      expect([...example.damagedPieces].sort(), context).toEqual(geometryDamage(puzzle, swap.value, buffer, example.target, example.setup));
      expect(example.damagedPieces.some((piece) => protectedPieces.includes(piece)), context).toBe(true);
      // The legal setup it competes with is the table's own.
      expect(formatMoves(example.legalSetup), context).toBe(formatMoves(legal.targets.find((t) => t.target === example.target)?.setup ?? []));
    }
  });
});

describe("demonstrateSetup edge cases", () => {
  it("reports a setup that misses the swap sticker, and rejects bad input", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const swap = referenceSwap(puzzle, "op-corners");
    if (!swap.ok) throw new Error("swap");
    const missed = demonstrateSetup(puzzle, swap.value, "UBL", "UFR", "D");
    if (!missed.ok) throw new Error(JSON.stringify(missed.error));
    expect(missed.value.reachesSwapSticker).toBe(false);
    expect(missed.value.damagedPieces.length).toBeGreaterThan(0);

    const code = (r: ReturnType<typeof demonstrateSetup>) => (r.ok ? "ok" : r.error.code);
    expect(code(demonstrateSetup(puzzle, swap.value, "UBL", "UFR", "R Q"))).toBe("invalid-setup");
    expect(code(demonstrateSetup(puzzle, swap.value, "UBL", "LUB", ""))).toBe("invalid-target");
    const edges = referenceSwap(puzzle, "op-edges");
    const m2 = referenceSwap(puzzle, "m2");
    if (!edges.ok || !m2.ok) throw new Error("swap");
    expect(code(demonstrateSetup(puzzle, edges.value, "UR", "UFR", ""))).toBe("invalid-target");
    // M2's side effect includes the UF edge, so UF can't be shot with the plain swap.
    expect(code(demonstrateSetup(puzzle, m2.value, "DF", "UF", ""))).toBe("target-on-side-effect-piece");
  });
});
