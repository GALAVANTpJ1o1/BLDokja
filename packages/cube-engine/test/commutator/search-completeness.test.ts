import { describe, expect, it } from "vitest";
import { buildCatalogue, DEFAULT_COMM_BOUNDS } from "../../src/commutator/catalogue.js";
import { searchComms } from "../../src/commutator/search.js";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { expectComplete } from "./comm-oracle.js";

/**
 * Completeness of the comm search against an oracle that shares none of its keying (D-031). The search's
 * own tests compare it with its unpruned self, which can't catch a lookup that misses comms in both.
 * The slow suite covers every corner case for three buffers and seeded edge cases.
 */
describe("comm search completeness", () => {
  it("finds a 9-move comm for UBL → BUR → RDF, which the buffer-cycle lookup missed", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const found = searchComms(puzzle, buildCatalogue(puzzle, "corners", DEFAULT_COMM_BOUNDS.corners), { buffer: "UBL", cases: [["BUR", "RDF"]] });
    if (!found.ok) throw new Error(JSON.stringify(found.error));
    expect(found.value.cases[0]?.comms[0]?.counts.etm).toBe(9);
  });

  it("matches the oracle's best ETM on 25 seeded corner cases for UBL", async () => {
    await expectComplete("corners", "UBL", 25);
  }, 120_000);
});
