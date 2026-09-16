import { loadPuzzle, symmetryImageDataset } from "@bld/cube-engine";
import { describe, expect, it } from "vitest";
import { algDatasets } from "@/content/algs";
import { threeStyleData } from "./methods";
import { GATE_B_BUFFERS } from "./reader";

describe("3-style data for your buffers", () => {
  it("uses the committed sets for their own buffers, which match their identity images record for record", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { threeStyleCorners, threeStyleEdges } = algDatasets();
    const built = threeStyleData(puzzle, GATE_B_BUFFERS.threeStyle);
    if (!built.ok) throw new Error(built.reason);
    expect(built.value.corners).toBe(threeStyleCorners);
    expect(built.value.edges).toBe(threeStyleEdges);

    // What the trainers read from a record is the same as the full rebuild would give.
    for (const dataset of [threeStyleCorners, threeStyleEdges]) {
      const image = symmetryImageDataset(puzzle, dataset, dataset.buffer);
      if (!image.ok) throw new Error(image.error.code);
      const shape = (d: typeof dataset) => d.records.map((r) => ({ id: r.id, kind: r.kind, algs: r.algs.map((a) => a.moves) }));
      expect(shape(image.value)).toEqual(shape(dataset));
    }
  });
});
