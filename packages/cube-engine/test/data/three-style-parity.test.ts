import { describe, expect, it } from "vitest";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { entryForAlg } from "../../src/data/alg-dataset.js";
import { ContentDatasetSchema } from "../../src/data/content-dataset.js";
import {
  buildM2ThreeStyleParityDataset,
  buildThreeStyleParityDataset,
  verifyM2ThreeStyleParityDataset,
  verifyThreeStyleParityDataset,
  type M2ThreeStyleParityDataset,
  type ThreeStyleParityDataset,
  type ThreeStyleParityProblem,
} from "../../src/data/three-style-parity.js";
import { stickerCycles } from "../../src/data/alg-dataset.js";
import { REFERENCE_SWAPS } from "../../src/methods/swap-algs.js";
import { threeStyleDatasets } from "./committed.js";

async function built() {
  const puzzle = await loadPuzzle("3x3x3");
  const { corners, edges, twists, flips, m2 } = threeStyleDatasets();
  const three = buildThreeStyleParityDataset(puzzle, { id: "3style-parity.UFR-UF", corners, edges, twists, flips });
  const m2Three = buildM2ThreeStyleParityDataset(puzzle, { id: "m2-3style-parity.UFR-DF", corners, twists, edges: m2 });
  if (!three.ok || !m2Three.ok) throw new Error(JSON.stringify([three, m2Three]));
  return { puzzle, corners, edges, twists, flips, m2, three: three.value, m2Three: m2Three.value };
}

const codes = (problems: readonly ThreeStyleParityProblem[]) => [...new Set(problems.map((p) => p.code))].sort();

describe("3-style parity datasets: good datasets verify", () => {
  it("3-style/3-style: the relabelled Jb swaps UFR↔UBR and UF↔UR; tails come from the twist and flip datasets", async () => {
    const { puzzle, corners, edges, twists, flips, three } = await built();
    expect(three.partners).toEqual({ corners: "UBR", edges: "UR" });
    expect(three.tails).toEqual([
      { pieceType: "corners", target: "BUR", record: "UBR-clockwise" },
      { pieceType: "corners", target: "RUB", record: "UBR-counterclockwise" },
      { pieceType: "edges", target: "RU", record: "UR" },
    ]);
    const main = three.records[0].algs[0];
    expect(main?.alg).toBe("L' U R U' L U2 R' U R U2 R'");
    // The published form, with its y2 on both sides, has exactly the same effect (geometry model).
    expect(Array.from(geometryAlgPermutation(puzzle.geometry, "y2 R' U L U' R U2 L' U L U2 L' y2"))).toEqual(Array.from(geometryAlgPermutation(puzzle.geometry, main?.alg ?? "")));
    expect(stickerCycles(puzzle, geometryAlgPermutation(puzzle.geometry, main?.alg ?? ""))).toEqual([["UBR", "UFR"], ["UR", "UF"], ["FU", "RU"], ["FUR", "RUB"], ["RUF", "BUR"]]);
    expect(verifyThreeStyleParityDataset(puzzle, three, { corners, edges, twists, flips })).toEqual([]);
    expect(ContentDatasetSchema.parse(JSON.parse(JSON.stringify(three)))).toEqual(three);
  });

  it("M2 + 3-style corners: Jb conjugated by the searched setup swaps UFR↔UBR and DF↔UR", async () => {
    const { puzzle, corners, twists, m2, m2Three } = await built();
    expect(m2Three.partners).toEqual({ corners: "UBR", edges: "UR" });
    expect(m2Three.setup).toBe("D2 Lw2");
    expect(m2Three.tails.map((t) => t.pieceType)).toEqual(["corners", "corners"]);
    const moves = m2Three.records[0].algs[0]?.moves ?? "";
    expect(stickerCycles(puzzle, geometryAlgPermutation(puzzle.geometry, moves))).toEqual([["UBR", "UFR"], ["UR", "DF"], ["FUR", "RUB"], ["FD", "RU"], ["RUF", "BUR"]]);
    expect(verifyM2ThreeStyleParityDataset(puzzle, m2Three, { corners, twists, edges: m2 })).toEqual([]);
    expect(ContentDatasetSchema.parse(JSON.parse(JSON.stringify(m2Three)))).toEqual(m2Three);
  });
});

describe("3-style parity datasets: every kind of corruption is caught", () => {
  it("3-style/3-style", async () => {
    const { puzzle, corners, edges, twists, flips, three } = await built();
    const check = (mutate: (d: ThreeStyleParityDataset) => void, datasets = { corners, edges, twists, flips }) => {
      const copy = structuredClone(three);
      mutate(copy);
      return codes(verifyThreeStyleParityDataset(puzzle, copy, datasets));
    };
    // A wrong partner: the recomputed effect changes, so the alg no longer matches it either.
    expect(check((d) => (d.partners.corners = "UBL"))).toEqual(["partner-mismatch", "tails-mismatch", "wrong-effect", "wrong-intended-effect"]);
    expect(
      check((d) => {
        const first = d.tails[0];
        if (first !== undefined) first.record = "UBR-counterclockwise";
      }),
    ).toEqual(["tails-mismatch"]);
    // The T perm swaps UL↔UR, not UF↔UR: a wrong effect, and not the reference.
    const tPerm = REFERENCE_SWAPS["op-edges"].alg;
    expect(check((d) => (d.records[0].algs = [entryForAlg(puzzle, tPerm, "symmetry", d.records[0].algs[0]?.citation)]))).toEqual(["parity-not-reference", "partner-mismatch", "wrong-effect"]);
    expect(check((d) => (d.records[0].algs = [entryForAlg(puzzle, d.records[0].algs[0]?.alg ?? "", "engine-search")]))).toEqual(["citation-mismatch", "parity-not-reference"]);
    expect(check((d) => (d.symmetry = 0))).toEqual(["parity-mismatch"]);
    expect(check((d) => (d.buffers.edges = "UB"))).toEqual(["parity-mismatch", "partner-mismatch", "wrong-effect", "wrong-intended-effect"]);
    expect(check((d) => (d.records[0].intendedEffect.sideEffectPieces = ["UL"]))).toEqual(["side-effects-not-allowed"]);
    expect(check(() => undefined, { corners, edges, twists: flips, flips: twists })).toEqual(["parity-mismatch", "tails-mismatch"]);
    // A reference entry without its citation fails the schema.
    const { citation: _citation, ...uncited } = three.records[0].algs[0] ?? { citation: "" };
    const broken = structuredClone(three) as unknown as { records: { algs: unknown[] }[] };
    if (broken.records[0] !== undefined) broken.records[0].algs = [uncited];
    expect(ContentDatasetSchema.safeParse(broken).success).toBe(false);
  });

  it("M2 + 3-style corners", async () => {
    const { puzzle, corners, twists, m2, m2Three } = await built();
    const check = (mutate: (d: M2ThreeStyleParityDataset) => void) => {
      const copy = structuredClone(m2Three);
      mutate(copy);
      return codes(verifyM2ThreeStyleParityDataset(puzzle, copy, { corners, twists, edges: m2 }));
    };
    // A different setup: consistent with the alg, but not the searched one, and the wrong effect.
    expect(
      check((d) => {
        d.setup = "D2 L2";
        d.records[0].algs = [entryForAlg(puzzle, "[D2 L2: L' U R U' L U2 R' U R U2 R']", "engine-search")];
      }),
    ).toEqual(["partner-mismatch", "setup-mismatch", "wrong-effect"]);
    // The plain Jb swaps UF↔UR, which isn't the M2 buffer.
    expect(check((d) => (d.records[0].algs = [entryForAlg(puzzle, "L' U R U' L U2 R' U R U2 R'", "engine-search")]))).toEqual(["parity-not-reference", "partner-mismatch", "wrong-effect"]);
    expect(check((d) => d.tails.pop())).toEqual(["tails-mismatch"]);
    // Tails are derived from the twist dataset and the partner, which are unchanged here.
    expect(check((d) => (d.buffers.corners = "UBL"))).toEqual(["parity-mismatch", "partner-mismatch", "wrong-effect", "wrong-intended-effect"]);
  });
});
