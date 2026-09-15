import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { symmetryImageDataset } from "../../src/data/alg-dataset-symmetry.js";
import { pieceType } from "../../src/pieces/piece-types.js";
import { threeStyleDatasets } from "./committed.js";

/** Every buffer sticker of every 3-style dataset kind gets an image that passes the full verifier (BRIEF §7.3). */
describe("symmetry images for every buffer", () => {
  it.each(["corners", "edges", "twists", "flips"] as const)("every %s image verifies", async (kind) => {
    const puzzle = await loadPuzzle("3x3x3");
    const source = threeStyleDatasets()[kind];
    const failures: string[] = [];
    for (const sticker of pieceType(puzzle, source.pieceType).stickers) {
      const image = symmetryImageDataset(puzzle, source, sticker.name);
      if (!image.ok) failures.push(`${sticker.name}: ${JSON.stringify(image.error).slice(0, 200)}`);
    }
    expect(failures).toEqual([]);
  });
});
