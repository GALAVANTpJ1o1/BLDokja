import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { ContentDatasetSchema } from "../../src/data/content-dataset.js";
import { verifySwapDataset, type SwapDataset } from "../../src/data/swap-dataset.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { pieceType } from "../../src/pieces/piece-types.js";

/**
 * The 4BLD swap datasets (D-038): r2 for wings and U2 for x-centres. `datasets.test.ts` runs the verifier
 * over every committed file; this pins what the two methods *are*, so a change of buffer, swap slot,
 * special case or odd/even rule has to be deliberate — and checks the published algs the sources give for
 * their special cases against what the engine derives.
 */

const dir = join(import.meta.dirname, "..", "..", "..", "..", "content", "algs", "4x4");

function swapDataset(name: string): SwapDataset {
  const parsed = ContentDatasetSchema.parse(JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")));
  if (parsed.kind !== "setups" || parsed.method === "op") throw new Error(`${name} is not a swap dataset`);
  return parsed;
}

describe("r2 wings", () => {
  it("is the method the source describes: buffer DFr, r2 as the swap, and the two r-slice special cases", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const dataset = swapDataset("r2-wings.FDr");
    expect([dataset.puzzle, dataset.method, dataset.pieceType]).toEqual(["4x4x4", "r2", "wings"]);
    // The source says the buffer is the wing DFr; the dataset names its lettered sticker, FDr.
    const wings = pieceType(puzzle, "wings");
    expect(wings.stickerByName(dataset.buffer)?.position).toBe(wings.pieceByName("DFr")?.position);
    expect(Object.keys(speffzScheme(puzzle).letters.wings ?? {})).toContain(dataset.buffer);
    // `r2` in the sources is the inner slice, which this engine writes 2R2 (D-006).
    expect(dataset.swap.alg).toBe("2R2");
    expect(dataset.swap.swapSticker).toBe("BUr");
    expect(dataset.swap.citation).toContain("R2 page");

    // One record per wing other than the buffer, and only the wings the swap carries need a special alg.
    expect(dataset.records).toHaveLength(23);
    expect(dataset.specialTargets).toEqual(["UFr", "DBr"]);
    // The source's rule: if either of those two is the second target of a pair, shoot the other one.
    expect(dataset.oddStepRule).toEqual([
      { target: "UFr", shootAs: "DBr" },
      { target: "DBr", shootAs: "UFr" },
    ]);
  });

  it("matches the algs the source publishes", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const dataset = swapDataset("r2-wings.FDr");
    // "to shoot to FRd, one can do U R U' r2 U R' U'" — the same moves the engine's setup produces.
    const example = dataset.records.find((r) => r.kind === "target" && r.setup === "U R U'");
    expect(example?.algs[0]?.moves).toBe("U R U' 2R2 U R' U'");
    // Both special cases carry the wiki's own alg beside the searched ones, and every alg is verified.
    for (const target of dataset.specialTargets) {
      const record = dataset.records.find((r) => r.target === target);
      const cited = record?.algs.filter((a) => a.source === "reference") ?? [];
      expect(cited, target).toHaveLength(1);
      expect(cited[0]?.citation, target).toContain("R2 page");
    }
    expect(verifySwapDataset(puzzle, dataset)).toEqual([]);
  });
});

describe("U2 x-centres", () => {
  it("is the method the tutorial describes: buffer Ubr, U2 as the swap, Ufl for free", () => {
    const dataset = swapDataset("u2-xcenters.Ubr");
    expect([dataset.puzzle, dataset.method, dataset.pieceType]).toEqual(["4x4x4", "u2", "xcenters"]);
    // The tutorial calls the buffer "Urb" and the swap slot "Ulf"; this engine names them Ubr and Ufl.
    expect(dataset.buffer).toBe("Ubr");
    expect(dataset.swap.alg).toBe("U2");
    expect(dataset.swap.swapSticker).toBe("Ufl");
    expect(dataset.records).toHaveLength(23);
    // "Ulf: U2" — the swap slot needs no setup at all.
    const swapSlot = dataset.records.find((r) => r.target === "Ufl");
    expect(swapSlot?.kind === "target" && swapSlot.setup).toBe("");
    expect(swapSlot?.algs[0]?.moves).toBe("U2");
    // The other two slots U2 carries are the special cases, and they swap roles on an odd step.
    expect(dataset.specialTargets).toEqual(["Ubl", "Ufr"]);
    expect(dataset.oddStepRule).toEqual([
      { target: "Ubl", shootAs: "Ufr" },
      { target: "Ufr", shootAs: "Ubl" },
    ]);
  });

  it("uses the tutorial's own algs for the two special cases, and they do exactly what the case needs", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const dataset = swapDataset("u2-xcenters.Ubr");
    const cited = dataset.records.filter((r) => r.kind === "special").flatMap((r) => r.algs);
    expect(cited).toHaveLength(2);
    for (const entry of cited) {
      expect(entry.source).toBe("reference");
      expect(entry.citation).toContain("U2 Centers Method Tutorial");
      // {r'ur} U {r'u'r} U {r'ur} U2 {r'u'r} U2, with r and u read as the inner slices.
      expect(entry.moves).toMatch(/^2R' 2U 2R U'? 2R' 2U' 2R U'? 2R' 2U 2R U2 2R' 2U' 2R U2$/);
    }
    // The verifier is what proves they work: it recomputes each case's effect from the case alone.
    expect(verifySwapDataset(puzzle, dataset)).toEqual([]);
  });
});
