import { describe, expect, it } from "vitest";
import { loadPuzzle, type Puzzle } from "../../src/core/puzzle.js";
import { cubeSymmetries, relabelMove } from "../../src/core/symmetry.js";
import { buildCatalogue } from "../../src/commutator/catalogue.js";
import { expandNodes, formatMoves } from "../../src/commutator/expand.js";
import { parseAlg, type AlgMove } from "../../src/commutator/parse.js";
import { entryForAlg } from "../../src/data/alg-dataset.js";
import { ContentDatasetSchema } from "../../src/data/content-dataset.js";
import {
  buildSwapDataset,
  buildM2OpParityDataset,
  verifySwapDataset,
  verifyM2OpParityDataset,
  type SwapDataset,
  type SwapDatasetProblem,
  type M2OpParityDataset,
} from "../../src/data/swap-dataset.js";
import { buildOpSetupsDataset, type OpSetupsDataset } from "../../src/data/op-dataset.js";
import { M2_SPECIAL_BOUNDS } from "../../src/methods/m2-search.js";
import { opSystem } from "../../src/methods/op.js";
import { GATE_B_SETUP_FAMILIES } from "../../src/methods/setup-search.js";
import { m2Swaps, REFERENCE_SWAPS, swapVariants } from "../../src/methods/swap-algs.js";
import { pieceName, stickerName } from "../../src/pieces/names.js";

interface System {
  readonly corners: OpSetupsDataset;
  readonly edges: SwapDataset;
  readonly parity: M2OpParityDataset;
}

let cached: System | undefined;

async function reference(): Promise<{ puzzle: Puzzle; system: System }> {
  const puzzle = await loadPuzzle("3x3x3");
  if (cached !== undefined) return { puzzle, system: cached };
  const catalogue = buildCatalogue(puzzle, "edges", M2_SPECIAL_BOUNDS);
  const swap = m2Swaps(puzzle);
  const op = opSystem(puzzle, { cornerBuffer: "UBL", edgeBuffer: "UR" });
  if (!swap.ok || !op.ok) throw new Error("swaps");
  const df = swap.value.find((s) => s.bufferPiece === "DF");
  if (df === undefined) throw new Error("DF");
  const edges = buildSwapDataset(puzzle, { id: "m2-edges.DF", swap: df, bufferSticker: "DF", symmetry: 0, specials: { kind: "search", catalogue } });
  if (!edges.ok) throw new Error(JSON.stringify(edges.error));
  const parity = buildM2OpParityDataset(puzzle, { id: "m2op-parity.UBL-DF", corners: op.value.corners, edges: edges.value, symmetry: 0, algs: { kind: "search", catalogue } });
  if (!parity.ok) throw new Error(JSON.stringify(parity.error));
  cached = { corners: op.value.corners, edges: edges.value, parity: parity.value };
  return { puzzle, system: cached };
}

const relabelText = (puzzle: Puzzle, symmetry: number, text: string): string => {
  const parsed = parseAlg(puzzle.id, text);
  const g = cubeSymmetries(puzzle)[symmetry];
  if (!parsed.ok || g === undefined) throw new Error(text);
  return formatMoves(expandNodes(parsed.value.nodes).map((m): AlgMove => ({ type: "move", ...relabelMove(puzzle, g, m) })));
};

/** The system relabelled by an M-preserving symmetry: special and parity algs relabelled, everything else built and searched again. */
function image(puzzle: Puzzle, system: System, symmetry: number): System {
  const g = cubeSymmetries(puzzle)[symmetry];
  if (g === undefined) throw new Error("symmetry");
  const { geometry } = puzzle;
  const nameOf = (name: string) => stickerName(geometry, g.sticker[geometry.stickers.findIndex((s) => stickerName(geometry, s.index) === name)] ?? -1);
  const edgeBuffer = nameOf("DF");
  const cornerBuffer = nameOf("UBL");
  const swaps = m2Swaps(puzzle);
  const variants = swapVariants(puzzle, "op-corners");
  if (!swaps.ok || !variants.ok) throw new Error("swaps");
  const m2 = swaps.value.find((s) => s.bufferPiece === pieceName(3, geometry.sticker(g.sticker[geometry.stickers.findIndex((s2) => stickerName(geometry, s2.index) === "DF")] ?? -1).cubie));
  const cornerText = relabelText(puzzle, symmetry, REFERENCE_SWAPS["op-corners"].alg);
  const cornerSwap = variants.value.find((v) => formatMoves(v.moves) === cornerText && v.bufferPiece === pieceName(3, geometry.sticker(g.sticker[geometry.stickers.findIndex((s) => stickerName(geometry, s.index) === "UBL")] ?? -1).cubie));
  if (m2 === undefined || cornerSwap === undefined) throw new Error("image swaps");
  const corners = buildOpSetupsDataset(puzzle, {
    id: `op-corners.${cornerBuffer}`,
    swap: cornerSwap,
    bufferSticker: cornerBuffer,
    setupFamilies: GATE_B_SETUP_FAMILIES["op-corners"].map((family) => relabelMove(puzzle, g, { family, amount: 1 }).family),
    symmetry,
  });
  if (!corners.ok) throw new Error(JSON.stringify(corners.error));
  const specials = new Map(system.edges.records.filter((r) => r.kind === "special").map((r) => [nameOf(r.target), r.algs.map((a) => relabelText(puzzle, symmetry, a.alg))]));
  const edges = buildSwapDataset(puzzle, { id: `m2-edges.${edgeBuffer}`, swap: m2, bufferSticker: edgeBuffer, symmetry, specials: { kind: "given", algs: specials } });
  if (!edges.ok) throw new Error(JSON.stringify(edges.error));
  const parityAlgs = new Map([["parity", system.parity.records[0].algs.map((a) => relabelText(puzzle, symmetry, a.alg))]]);
  const parity = buildM2OpParityDataset(puzzle, { id: `m2op-parity.${cornerBuffer}-${edgeBuffer}`, corners: corners.value, edges: edges.value, symmetry, algs: { kind: "given", algs: parityAlgs } });
  if (!parity.ok) throw new Error(JSON.stringify(parity.error));
  return { corners: corners.value, edges: edges.value, parity: parity.value };
}

const codes = (problems: readonly SwapDatasetProblem[]) => [...new Set(problems.map((p) => p.code))].sort();

describe("M2 datasets: good datasets verify", () => {
  it("the reference (DF, with UBL corners for parity), with the derived odd/even rule, including a JSON round trip", async () => {
    const { puzzle, system } = await reference();
    const { edges, corners, parity } = system;
    expect(edges.records).toHaveLength(22);
    expect(edges.specialTargets).toEqual(["UF", "FU", "DB", "BD"]);
    expect(edges.oddStepRule).toEqual([
      { target: "UF", shootAs: "DB" },
      { target: "FU", shootAs: "BD" },
      { target: "DB", shootAs: "UF" },
      { target: "BD", shootAs: "FU" },
    ]);
    expect(edges.tempting).toHaveLength(21);
    expect(verifySwapDataset(puzzle, edges)).toEqual([]);
    expect(verifyM2OpParityDataset(puzzle, parity, corners, edges)).toEqual([]);
    for (const dataset of [edges, parity]) expect(ContentDatasetSchema.parse(JSON.parse(JSON.stringify(dataset)))).toEqual(dataset);
  });

  it("an M-preserving symmetry image (mirror included), with relabelled special and parity algs", async () => {
    const { puzzle, system } = await reference();
    const preserving = cubeSymmetries(puzzle).filter((g) => g.index !== 0 && relabelMove(puzzle, g, { family: "M", amount: 2 }).family === "M");
    for (const g of [preserving[0], preserving.find((h) => h.mirror)]) {
      if (g === undefined) throw new Error("no symmetry");
      const { corners, edges, parity } = image(puzzle, system, g.index);
      const context = `symmetry ${g.index}: ${corners.buffer} / ${edges.buffer}`;
      expect(edges.swap.source, context).toBe("symmetry");
      expect(verifySwapDataset(puzzle, edges), context).toEqual([]);
      expect(verifyM2OpParityDataset(puzzle, parity, corners, edges), context).toEqual([]);
    }
  });
});

describe("M2 datasets: every kind of corruption is caught", () => {
  it("M2 setups datasets", async () => {
    const { puzzle, system } = await reference();
    const check = (mutate: (d: SwapDataset) => void) => {
      const copy = structuredClone(system.edges);
      mutate(copy);
      return codes(verifySwapDataset(puzzle, copy));
    };
    const recordFor = (d: SwapDataset, target: string) => {
      const record = d.records.find((r) => r.target === target);
      if (record === undefined) throw new Error(target);
      return record;
    };

    // A wrong setup, record and alg agreeing.
    expect(
      check((d) => {
        const record = recordFor(d, "UR");
        if (record.kind !== "target") throw new Error("kind");
        record.setup = "F U F'";
        record.algs = [entryForAlg(puzzle, "[F U F': M2]", "engine-search")];
      }),
    ).toEqual(["setup-mismatch", "wrong-effect"]);
    // A special alg with another special case's effect.
    expect(check((d) => (recordFor(d, "UF").algs = [...recordFor(d, "DB").algs.slice(0, 1)]))).toEqual(["wrong-effect"]);
    // A correct FU alg that uses S: outside the bounds you chose.
    expect(check((d) => (recordFor(d, "FU").algs = [entryForAlg(puzzle, "U' S' U' F2 U S U' F2 U2 M2", "engine-search")]))).toEqual(["alg-outside-bounds"]);
    // The odd/even rule: a wrong entry, a missing entry.
    expect(
      check((d) => {
        const first = d.oddStepRule[0];
        if (first !== undefined) first.shootAs = "BD";
      }),
    ).toEqual(["odd-step-rule-mismatch"]);
    expect(check((d) => d.oddStepRule.pop())).toEqual(["odd-step-rule-mismatch"]);
    // Special targets, tempting setups, kinds.
    expect(check((d) => d.specialTargets.pop())).toEqual(["special-targets-mismatch"]);
    expect(
      check((d) => {
        const first = d.tempting[0];
        if (first !== undefined) first.setup = "U";
      }),
    ).toEqual(["tempting-mismatch"]);
    expect(
      check((d) => {
        const index = d.records.findIndex((r) => r.target === "UR");
        const record = d.records[index];
        if (record?.kind === "target") d.records[index] = { id: record.id, kind: "special", target: record.target, intendedEffect: record.intendedEffect, algs: record.algs };
      }),
    ).toEqual(["kind-mismatch"]);
    // Counts, notation, provenance, bounds.
    expect(
      check((d) => {
        const main = recordFor(d, "UR").algs[0];
        if (main !== undefined) main.etm = 6;
      }),
    ).toEqual(["counts-mismatch"]);
    expect(check((d) => (recordFor(d, "UR").algs = [{ ...entryForAlg(puzzle, "[F U' F': M2]", "engine-search"), alg: "[F U’ F’: M2]" }]))).toEqual(["alg-not-canonical", "main-alg-mismatch"]);
    expect(check((d) => (d.swap.source = "symmetry"))).toEqual(["swap-not-reference"]);
    expect(check((d) => (d.generatedBy.bounds.maxSetup = 2))).toEqual(["bounds-mismatch"]);
    expect(check((d) => (recordFor(d, "UF").intendedEffect.sideEffectPieces = []))).toEqual(["wrong-intended-effect"]);
    // Coverage and order.
    expect(check((d) => d.records.splice(4, 1))).toEqual(["missing-record"]);
    expect(
      check((d) => {
        const [a, b] = [d.records[2], d.records[3]];
        if (a !== undefined && b !== undefined) [d.records[2], d.records[3]] = [b, a];
      }),
    ).toEqual(["records-out-of-order"]);
  });

  it("M2/OP parity datasets", async () => {
    const { puzzle, system } = await reference();
    const { corners, edges, parity } = system;
    const check = (mutate: (d: M2OpParityDataset) => void) => {
      const copy = structuredClone(parity);
      mutate(copy);
      return codes(verifyM2OpParityDataset(puzzle, copy, corners, edges));
    };
    // The UF special alg is not the parity alg.
    expect(check((d) => (d.records[0].algs = [entryForAlg(puzzle, "U2 M' U2 M'", "engine-search")]))).toEqual(["wrong-effect"]);
    // A correct parity alg that uses S.
    expect(check((d) => (d.records[0].algs = [entryForAlg(puzzle, "B2 D S' D2 S D B2 M2", "engine-search")]))).toEqual(["alg-outside-bounds"]);
    expect(check((d) => (d.buffers.corners = "UFR"))).toEqual(["parity-mismatch"]);
    expect(check((d) => (d.symmetry = 3))).toEqual(["parity-mismatch"]);
    expect(check((d) => (d.records[0].intendedEffect.sideEffectPieces = ["UB"]))).toEqual(["side-effects-not-allowed"]);
    expect(check((d) => d.records[0].intendedEffect.stickerCycles.pop())).toEqual(["wrong-intended-effect"]);
  });
});
