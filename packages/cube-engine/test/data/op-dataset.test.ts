import { describe, expect, it } from "vitest";
import { loadPuzzle, type Puzzle } from "../../src/core/puzzle.js";
import { cubeSymmetries, relabelMove } from "../../src/core/symmetry.js";
import { formatMoves } from "../../src/commutator/expand.js";
import { entryForAlg } from "../../src/data/alg-dataset.js";
import {
  buildOpParityDataset,
  buildOpSetupsDataset,
  verifyOpParityDataset,
  verifyOpSetupsDataset,
  type OpDatasetProblem,
  type OpParityDataset,
  type OpSetupsDataset,
} from "../../src/data/op-dataset.js";
import { ContentDatasetSchema } from "../../src/data/content-dataset.js";
import { GATE_B_SETUP_FAMILIES } from "../../src/methods/setup-search.js";
import { REFERENCE_SWAPS, swapVariants } from "../../src/methods/swap-algs.js";
import { pieceName } from "../../src/pieces/names.js";
import { pieceType } from "../../src/pieces/piece-types.js";

interface System {
  readonly corners: OpSetupsDataset;
  readonly edges: OpSetupsDataset;
  readonly parity: OpParityDataset;
}

/** The OP system relabelled by one symmetry: both reference swaps, the Gate B setup families, and the parity alg. */
function system(puzzle: Puzzle, symmetry: number): System {
  const g = cubeSymmetries(puzzle)[symmetry];
  if (g === undefined) throw new Error("symmetry");
  const build = (method: "op-corners" | "op-edges") => {
    const variants = swapVariants(puzzle, method);
    if (!variants.ok) throw new Error("variants");
    const reference = REFERENCE_SWAPS[method];
    const type = pieceType(puzzle, reference.pieceType);
    const bufferSticker = type.pieceByName(reference.bufferPiece)?.stickers.find((s) => s.isOrientationReference);
    if (bufferSticker === undefined) throw new Error("buffer");
    const imageSticker = type.stickers.find((s) => s.index === g.sticker[bufferSticker.index]);
    const referenceMoves = variants.value.find((v) => v.bufferPiece === reference.bufferPiece && formatMoves(v.moves) === reference.alg)?.moves ?? [];
    const text = formatMoves(referenceMoves.map((m) => ({ type: "move" as const, ...relabelMove(puzzle, g, m) })));
    const imagePiece = imageSticker === undefined ? "" : pieceName(3, puzzle.geometry.sticker(imageSticker.index).cubie);
    const swap = variants.value.find((v) => v.bufferPiece === imagePiece && formatMoves(v.moves) === text);
    if (swap === undefined || imageSticker === undefined) throw new Error(`no variant for symmetry ${symmetry}`);
    const setupFamilies = GATE_B_SETUP_FAMILIES[method].map((family) => relabelMove(puzzle, g, { family, amount: 1 }).family);
    const dataset = buildOpSetupsDataset(puzzle, { id: `${method}.${imageSticker.name}`, swap, bufferSticker: imageSticker.name, setupFamilies, symmetry });
    if (!dataset.ok) throw new Error(JSON.stringify(dataset.error));
    return dataset.value;
  };
  const corners = build("op-corners");
  const edges = build("op-edges");
  const parity = buildOpParityDataset(puzzle, { id: `op-parity.${corners.buffer}-${edges.buffer}`, corners, edges, symmetry });
  if (!parity.ok) throw new Error(JSON.stringify(parity.error));
  return { corners, edges, parity: parity.value };
}

const codes = (problems: readonly OpDatasetProblem[]) => [...new Set(problems.map((p) => p.code))].sort();
const identity = (puzzle: Puzzle) => cubeSymmetries(puzzle).findIndex((g) => g.sticker.every((to, from) => to === from));

describe("OP datasets: good datasets verify", () => {
  it("the reference system (UBL, UR), including after a JSON round trip through the content schema", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { corners, edges, parity } = system(puzzle, identity(puzzle));
    expect([corners.buffer, edges.buffer, corners.swap.source, parity.records[0].algs[0]?.source]).toEqual(["UBL", "UR", "reference", "reference"]);
    expect(corners.records).toHaveLength(21);
    expect(edges.records).toHaveLength(22);
    expect(verifyOpSetupsDataset(puzzle, corners)).toEqual([]);
    expect(verifyOpSetupsDataset(puzzle, edges)).toEqual([]);
    expect(verifyOpParityDataset(puzzle, parity, corners, edges)).toEqual([]);
    for (const dataset of [corners, edges, parity]) {
      const reparsed = ContentDatasetSchema.parse(JSON.parse(JSON.stringify(dataset)));
      expect(reparsed).toEqual(dataset);
    }
  });

  it("symmetry images of it, mirrors included", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    for (const symmetry of [1, 7, 20, 33, 47]) {
      const { corners, edges, parity } = system(puzzle, symmetry);
      const context = `symmetry ${symmetry}: ${corners.buffer} / ${edges.buffer}`;
      expect(corners.swap.source, context).toBe("symmetry");
      expect(verifyOpSetupsDataset(puzzle, corners), context).toEqual([]);
      expect(verifyOpSetupsDataset(puzzle, edges), context).toEqual([]);
      expect(verifyOpParityDataset(puzzle, parity, corners, edges), context).toEqual([]);
    }
  });
});

describe("OP datasets: every kind of corruption is caught", () => {
  it("setups datasets", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { corners, edges } = system(puzzle, identity(puzzle));
    const check = (mutate: (d: OpSetupsDataset) => void, base: OpSetupsDataset = corners) => {
      const copy = structuredClone(base);
      mutate(copy);
      return codes(verifyOpSetupsDataset(puzzle, copy));
    };
    const recordFor = (d: OpSetupsDataset, target: string) => {
      const record = d.records.find((r) => r.target === target);
      if (record === undefined) throw new Error(target);
      return record;
    };
    const withSetup = (d: OpSetupsDataset, target: string, setup: string) => {
      const record = recordFor(d, target);
      record.setup = setup;
      record.algs = [entryForAlg(puzzle, `[${setup}: ${d.swap.alg}]`, "engine-search")];
    };

    // DFL's shortest setup is F'.
    expect(recordFor(corners, "DFL").setup).toBe("F'");
    // A wrong setup: record and alg agree, but the alg shoots the wrong sticker.
    expect(check((d) => { withSetup(d, "DFL", "F"); })).toEqual(["setup-mismatch", "wrong-effect"]);
    // Only the setup field changed.
    expect(check((d) => (recordFor(d, "DFL").setup = "F"))).toEqual(["main-alg-mismatch", "setup-mismatch"]);
    // A setup that works but isn't the shortest.
    expect(check((d) => { withSetup(d, "DFL", "F2 F"); })).toEqual(["setup-mismatch"]);
    // A setup using a forbidden family (U disturbs the buffer).
    expect(check((d) => { withSetup(d, "DFL", "U F'"); })).toEqual(["setup-mismatch", "setup-uses-other-family", "wrong-effect"]);
    // A wrong side effect.
    expect(check((d) => (d.swap.sideEffectPieces = ["UB", "UR"]))).toEqual(["swap-mismatch"]);
    expect(check((d) => (recordFor(d, "DFL").intendedEffect.sideEffectPieces = []))).toEqual(["wrong-intended-effect"]);
    expect(check((d) => (recordFor(d, "DFL").intendedEffect.stickerCycles = recordFor(d, "DBL").intendedEffect.stickerCycles))).toEqual(["wrong-intended-effect"]);
    // Tables that don't match a fresh search.
    expect(check((d) => d.forbidden.pop())).toEqual(["forbidden-mismatch"]);
    expect(check((d) => (d.allowed = ["D", "R"]))).toEqual(["allowed-mismatch"]);
    expect(check((d) => (d.setupFamilies = ["F", "D", "R"]))).toEqual(["setup-families-invalid"]);
    expect(check((d) => (d.setupFamilies = ["D", "R", "F", "U"]))).toEqual(["setup-families-invalid"]);
    // A forbidden example replaced by a legal setup shows no damage.
    expect(
      check((d) => {
        const first = d.forbidden[0];
        if (first !== undefined) first.example = { target: "DFL", setup: "F'", damagedPieces: ["UBL"] };
      }),
    ).toEqual(["example-harmless", "example-mismatch"]);
    // The swap: not the reference (same effect, extra moves), wrong provenance, wrong citation, wrong counts.
    expect(check((d) => (d.swap.alg = d.swap.moves = "R U' R' U' R U R' F' R U R' U' R' F R U U'"))).toEqual(["swap-not-symmetry-image"]);
    expect(check((d) => (d.swap.source = "symmetry"))).toEqual(["swap-not-reference"]);
    expect(check((d) => (d.swap.citation = "somewhere else"))).toEqual(["citation-mismatch"]);
    expect(check((d) => (d.swap.etm = 14))).toEqual(["counts-mismatch"]);
    // Counts, notation and coverage of records.
    expect(check((d) => (recordFor(d, "DFL").algs[0] = { ...entryForAlg(puzzle, `[F': ${d.swap.alg}]`, "engine-search"), qtm: 1 }))).toEqual(["counts-mismatch"]);
    // The same moves written out rather than as [setup: swap], and a non-canonical spelling of the conjugate.
    expect(check((d) => (recordFor(d, "DFL").algs[0] = { ...entryForAlg(puzzle, `[F': ${d.swap.alg}]`, "engine-search"), alg: `F' ${d.swap.alg} F` }))).toEqual(["main-alg-mismatch"]);
    expect(check((d) => (recordFor(d, "DFL").algs[0] = { ...entryForAlg(puzzle, `[F': ${d.swap.alg}]`, "engine-search"), alg: `[F’: ${d.swap.alg}]` }))).toEqual(["alg-not-canonical", "main-alg-mismatch"]);
    expect(check((d) => d.records.splice(3, 1))).toEqual(["missing-record"]);
    expect(
      check((d) => {
        const [a, b] = [d.records[1], d.records[2]];
        if (a !== undefined && b !== undefined) [d.records[1], d.records[2]] = [b, a];
      }),
    ).toEqual(["records-out-of-order"]);
    // Edges too: a D-layer target set up with Dw instead of D is legal but loses the tie-break.
    expect(recordFor(edges, "DF").setup).toBe("D' L2");
    expect(check((d) => { withSetup(d, "DF", "Dw' L2"); }, edges)).toEqual(["setup-mismatch"]);
  });

  it("parity datasets", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { corners, edges, parity } = system(puzzle, identity(puzzle));
    const other = system(puzzle, 7);
    const check = (mutate: (d: OpParityDataset) => void) => {
      const copy = structuredClone(parity);
      mutate(copy);
      return codes(verifyOpParityDataset(puzzle, copy, corners, edges));
    };
    // A wrong alg: the edge swap is an alg with side effects, not the parity alg.
    expect(check((d) => (d.records[0].algs = [{ ...entryForAlg(puzzle, edges.swap.alg, "reference", d.records[0].algs[0]?.citation ?? "") }]))).toEqual(["parity-not-reference", "wrong-effect"]);
    // A correct-looking record with the wrong intended effect.
    expect(check((d) => d.records[0].intendedEffect.stickerCycles.pop())).toEqual(["wrong-intended-effect"]);
    expect(check((d) => (d.records[0].intendedEffect.sideEffectPieces = ["UB"]))).toEqual(["side-effects-not-allowed"]);
    // Provenance.
    expect(check((d) => (d.records[0].algs[0] = { ...entryForAlg(puzzle, d.records[0].algs[0]?.alg ?? "", "symmetry", "J Perm") }))).toEqual(["citation-mismatch", "parity-not-reference"]);
    // It must belong with these two datasets.
    expect(check((d) => (d.buffers.edges = "UL"))).toEqual(["parity-mismatch"]);
    expect(codes(verifyOpParityDataset(puzzle, parity, corners, other.edges))).toEqual(["parity-mismatch", "wrong-effect", "wrong-intended-effect"]);
    // The schema rejects a reference entry without a citation.
    const { citation: _citation, ...uncited } = parity.records[0].algs[0] ?? { citation: "" };
    const broken = structuredClone(parity) as unknown as { records: { algs: unknown[] }[] };
    if (broken.records[0] !== undefined) broken.records[0].algs = [uncited];
    expect(ContentDatasetSchema.safeParse(broken).success).toBe(false);
  });
});
