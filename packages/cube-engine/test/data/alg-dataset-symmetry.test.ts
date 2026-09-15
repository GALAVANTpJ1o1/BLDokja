import { describe, expect, it } from "vitest";
import { buildCatalogue, DEFAULT_COMM_BOUNDS } from "../../src/commutator/catalogue.js";
import { searchComms } from "../../src/commutator/search.js";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { verifyDataset, type AlgDataset } from "../../src/data/alg-dataset.js";
import { rotationBetween, symmetryImageDataset } from "../../src/data/alg-dataset-symmetry.js";
import { pieceType } from "../../src/pieces/piece-types.js";
import { threeStyleDatasets } from "./committed.js";

/**
 * 3-style datasets for other buffers as rotation images of the committed ones (BRIEF §7.3). Each image
 * must pass the full dataset verifier. The slow suite covers every buffer sticker; this samples
 * stickers of each orientation.
 */
describe("symmetry images of 3-style datasets", () => {
  it("exactly one rotation carries a buffer sticker onto any other sticker of its piece type", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    for (const typeId of ["corners", "edges"] as const) {
      const type = pieceType(puzzle, typeId);
      const from = type.stickers[0];
      if (from === undefined) throw new Error("no stickers");
      for (const to of type.stickers) expect(rotationBetween(puzzle, from.index, to.index), `${from.name}→${to.name}`).toBeDefined();
    }
  });

  it("the image onto the dataset's own buffer is the dataset itself", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { corners } = threeStyleDatasets();
    const image = symmetryImageDataset(puzzle, corners, "UFR");
    if (!image.ok) throw new Error(JSON.stringify(image.error));
    expect(image.value.records).toEqual(corners.records);
  });

  it.each([
    ["corners", "UBL"],
    ["corners", "FDR"],
    ["corners", "RDB"],
    ["twists", "DFL"],
    ["edges", "DF"],
    ["edges", "RB"],
    ["flips", "LU"],
  ] as const)("the %s dataset for %s verifies in full", async (kind, buffer) => {
    const puzzle = await loadPuzzle("3x3x3");
    const source: AlgDataset = threeStyleDatasets()[kind];
    const image = symmetryImageDataset(puzzle, source, buffer);
    if (!image.ok) throw new Error(JSON.stringify(image.error).slice(0, 500));
    expect(verifyDataset(puzzle, image.value)).toEqual([]);
    expect(image.value.buffer).toBe(buffer);
    expect(image.value.records).toHaveLength(source.records.length);
  });

  it("an image's comms are as short as a fresh exhaustive search for that buffer (UBL corners)", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const image = symmetryImageDataset(puzzle, threeStyleDatasets().corners, "UBL");
    if (!image.ok) throw new Error(JSON.stringify(image.error));
    const fresh = searchComms(puzzle, buildCatalogue(puzzle, "corners", DEFAULT_COMM_BOUNDS.corners), { buffer: "UBL" });
    if (!fresh.ok) throw new Error(JSON.stringify(fresh.error));
    const best = new Map(fresh.value.cases.map((c) => [`${c.targets[0]}-${c.targets[1]}`, c.comms[0]?.counts.etm]));
    for (const record of image.value.records) expect(record.algs[0]?.etm, record.id).toBe(best.get(record.id));
  });

  it("has teeth: a record whose case doesn't match its algs is refused", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const corners = threeStyleDatasets().corners;
    const [first, second] = corners.records;
    if (first === undefined || second === undefined) throw new Error("dataset too small");
    const swapped: AlgDataset = { ...corners, records: [{ ...first, algs: second.algs }, ...corners.records.slice(1)] };
    const image = symmetryImageDataset(puzzle, swapped, "UBL");
    expect(image.ok).toBe(false);
  });
});
