import { describe, expect, it } from "vitest";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { composePerms } from "../../src/core/move-table.js";
import { loadPuzzle, type Puzzle } from "../../src/core/puzzle.js";
import { buildCatalogue } from "../../src/commutator/catalogue.js";
import { cancelMoves, formatMoves, invertMoves } from "../../src/commutator/expand.js";
import { moveCounts } from "../../src/commutator/metrics.js";
import { searchComms } from "../../src/commutator/search.js";
import { stickerCycles } from "../../src/data/alg-dataset.js";
import { demonstrateSetup, temptingSetups } from "../../src/methods/illegal-setup.js";
import { M2_SPECIAL_BOUNDS, searchSliceComposites } from "../../src/methods/m2-search.js";
import { DEFAULT_SETUP_POOLS, searchSetups } from "../../src/methods/setup-search.js";
import { referenceSwap, sideEffectPerm, targetEffect, type SwapAlg } from "../../src/methods/swap-algs.js";
import { pieceName } from "../../src/pieces/names.js";

async function setting() {
  const puzzle = await loadPuzzle("3x3x3");
  const m2 = referenceSwap(puzzle, "m2");
  const op = referenceSwap(puzzle, "op-corners");
  if (!m2.ok || !op.ok) throw new Error("swaps");
  return { puzzle, m2: m2.value, op: op.value, catalogue: buildCatalogue(puzzle, "edges", M2_SPECIAL_BOUNDS) };
}

function special(puzzle: Puzzle, m2: SwapAlg, target: string) {
  const effect = targetEffect(puzzle, m2, "DF", target, { onSideEffectPiece: "compose" });
  if (!effect.ok) throw new Error(JSON.stringify(effect.error));
  return effect.value;
}

describe("targetEffect with onSideEffectPiece", () => {
  it("is unchanged for ordinary targets, and E·X for targets on M2's side-effect edges", async () => {
    const { puzzle, m2 } = await setting();
    const plain = targetEffect(puzzle, m2, "DF", "RF");
    const composed = targetEffect(puzzle, m2, "DF", "RF", { onSideEffectPiece: "compose" });
    if (!plain.ok || !composed.ok) throw new Error("effect");
    expect(Array.from(composed.value)).toEqual(Array.from(plain.value));
    expect(targetEffect(puzzle, m2, "DF", "UF")).toEqual({ ok: false, error: { code: "target-on-side-effect-piece", target: "UF" } });
    // UF: the exchange DF↔UF followed by X gives the 3-cycle DF → DB → UF, centres swapped.
    expect(stickerCycles(puzzle, special(puzzle, m2, "UF"))).toEqual([["U", "D"], ["UF", "DF", "DB"], ["FU", "FD", "BD"], ["F", "B"]]);
  });
});

describe("searchSliceComposites", () => {
  /** Read off the computed results when milestone 10 was built; every one is checked in the geometry model below. */
  const PINNED: Record<string, string[]> = {
    UF: ["U2 M' U2 M'", "M' B2 M' B2", "M F2 M' F2 M2", "M2 D2 M' D2 M"],
    FU: ["D M' D B2 D' M D B2 D2 M2", "D' M' D' B2 D M D' B2 D2 M2", "B2 D2 B' M B D2 B' M' B' M2", "B2 D2 B M B' D2 B M' B M2"],
    DB: ["B2 M B2 M", "M U2 M U2", "M' D2 M D2 M2", "M2 F2 M F2 M'"],
    BD: ["U2 F2 U' M' U F2 U' M U' M2", "U2 F2 U M' U' F2 U M U M2", "F M F U2 F' M' F U2 F2 M2", "F' M F' U2 F M' F' U2 F2 M2"],
    parity: ["U' F2 U M2 U' F2 U", "D' L2 D M2 D' L2 D", "L D' L D M2 D' L' D L'", "L' D' L' D M2 D' L D L"],
  };

  it("finds, for each M-slice special case and the M2/OP parity leftover, algs with exactly the required effect, using no E or S", async () => {
    const { puzzle, m2, op, catalogue } = await setting();
    const required: Record<string, Uint8Array> = {
      UF: special(puzzle, m2, "UF"),
      FU: special(puzzle, m2, "FU"),
      DB: special(puzzle, m2, "DB"),
      BD: special(puzzle, m2, "BD"),
      parity: composePerms(sideEffectPerm(puzzle, op), sideEffectPerm(puzzle, m2)),
    };
    for (const [name, effect] of Object.entries(required)) {
      const result = searchSliceComposites(puzzle, catalogue, { swap: m2, required: effect });
      if (!result.ok) throw new Error(`${name}: ${JSON.stringify(result.error)}`);
      expect(result.value.map((c) => formatMoves(c.moves)), name).toEqual(PINNED[name]);
      for (const composite of result.value) {
        const text = formatMoves(composite.moves);
        expect(Array.from(geometryAlgPermutation(puzzle.geometry, text)), `${name}: ${text}`).toEqual(Array.from(effect));
        expect(composite.moves.every((m) => M2_SPECIAL_BOUNDS.generators.includes(m.family)), `${name}: ${text}`).toBe(true);
        expect(composite.counts).toEqual(moveCounts(puzzle.id, composite.moves));
      }
      const etms = result.value.map((c) => c.counts.etm);
      expect(etms, name).toEqual([...etms].sort((a, b) => a - b));
    }
  });

  it("is exact: the same top four as composing a much longer comm list with M2", async () => {
    const { puzzle, m2, op, catalogue } = await setting();
    const cases = {
      UF: special(puzzle, m2, "UF"),
      BD: special(puzzle, m2, "BD"),
      parity: composePerms(sideEffectPerm(puzzle, op), sideEffectPerm(puzzle, m2)),
    };
    for (const [name, required] of Object.entries(cases)) {
      const brute: { key: string; etm: number; qtm: number; order: number }[] = [];
      for (const [formIndex, form] of ["comm-then-swap", "swap-then-comm"].entries()) {
        const commPerm = form === "comm-then-swap" ? composePerms(required, m2.perm) : composePerms(m2.perm, required);
        const [b = "", t1 = "", t2 = ""] = stickerCycles(puzzle, commPerm)[0] ?? [];
        const comms = searchComms(puzzle, catalogue, { buffer: b, cases: [[t1, t2]], keep: 400 });
        if (!comms.ok) throw new Error("comms");
        for (const [rank, c] of (comms.value.cases[0]?.comms ?? []).entries()) {
          const moves = cancelMoves(puzzle.id, form === "comm-then-swap" ? [...c.moves, ...m2.moves] : [...m2.moves, ...c.moves]);
          const counts = moveCounts(puzzle.id, moves);
          brute.push({ key: formatMoves(moves), etm: counts.etm, qtm: counts.qtm, order: formIndex * 512 + rank });
        }
      }
      brute.sort((a, b) => a.etm - b.etm || a.qtm - b.qtm || a.order - b.order);
      const top = [...new Set(brute.map((c) => c.key))].slice(0, 4);
      const result = searchSliceComposites(puzzle, catalogue, { swap: m2, required });
      if (!result.ok) throw new Error("search");
      expect(result.value.map((c) => formatMoves(c.moves)), name).toEqual(top);
    }
  });

  it("reports effects that aren't a 3-cycle away from the swap", async () => {
    const { puzzle, m2, catalogue } = await setting();
    // BU: taking M2 off leaves a pair of flips, not a 3-cycle; it is set up instead (5 moves).
    const bu = searchSliceComposites(puzzle, catalogue, { swap: m2, required: special(puzzle, m2, "BU") });
    expect(bu.ok ? "ok" : bu.error.code).toBe("not-a-three-cycle");
    const same = searchSliceComposites(puzzle, catalogue, { swap: m2, required: m2.perm });
    expect(same.ok ? "ok" : same.error.code).toBe("not-a-three-cycle");
  });
});

describe("temptingSetups for M2", () => {
  it("lists every target whose unprotected setup beats the legal one (and every special case), each doing damage; legal setups do none", async () => {
    const { puzzle, m2 } = await setting();
    const legal = searchSetups(puzzle, { swap: m2, bufferSticker: "DF", ...DEFAULT_SETUP_POOLS.m2 });
    if (!legal.ok) throw new Error("setups");
    const tempting = temptingSetups(puzzle, { swap: m2, bufferSticker: "DF", legal: legal.value });
    expect(tempting.map((t) => t.target)).toEqual(legal.value.targets.map((t) => t.target).filter((t) => t !== "UB"));
    const pinned = Object.fromEntries(tempting.map((t) => [t.target, formatMoves(t.setup)]));
    expect([pinned.UF, pinned.UR, pinned.DB, pinned.FR]).toEqual(["U2", "U'", "B2", "R U'"]);
    for (const t of tempting) {
      expect(t.damagedPieces.length, t.target).toBeGreaterThan(0);
      // The damage, read in the geometry model.
      const intended = special(puzzle, m2, t.target);
      const alg = [formatMoves(t.setup), "M2", formatMoves(invertMoves(t.setup))].join(" ");
      const damaged = new Set<string>();
      geometryAlgPermutation(puzzle.geometry, alg).forEach((to, from) => {
        if (to !== intended[from]) damaged.add(pieceName(3, puzzle.geometry.sticker(from).cubie));
      });
      expect([...t.damagedPieces].sort(), t.target).toEqual([...damaged].sort());
    }
    for (const { target, setup } of legal.value.targets) {
      if (setup === undefined) continue;
      const demo = demonstrateSetup(puzzle, m2, "DF", target, setup, { onSideEffectPiece: "compose" });
      if (!demo.ok) throw new Error(JSON.stringify(demo.error));
      expect(demo.value.damagedPieces, target).toEqual([]);
    }
  });
});
