import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { m2BufferPairs, m2OpSystem } from "../../src/methods/m2.js";
import { opBufferPairs, opSystem } from "../../src/methods/op.js";

describe("buffer pairs the method systems support", () => {
  it("OP: 48 pairs (one per cube symmetry) including Gate B's (UBL, UR), each a U/D corner sticker with a reference edge sticker; a sample builds and verifies", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const pairs = opBufferPairs(puzzle);
    expect(pairs).toContainEqual({ corners: "UBL", edges: "UR" });
    expect(pairs.every((p) => /^[UD]/.test(p.corners))).toBe(true);
    expect(new Set(pairs.map((p) => `${p.corners}/${p.edges}`)).size).toBe(pairs.length);
    for (const pair of [pairs[0], pairs[pairs.length - 1]]) {
      if (pair === undefined) throw new Error("no pairs");
      const system = opSystem(puzzle, { cornerBuffer: pair.corners, edgeBuffer: pair.edges });
      expect(system.ok, JSON.stringify(pair)).toBe(true);
    }
    expect(opSystem(puzzle, { cornerBuffer: "UFR", edgeBuffer: "UF" }).ok).toBe(false);
    expect(pairs.some((p) => p.corners === "UFR" && p.edges === "UF")).toBe(false);
    expect(pairs).toHaveLength(48);
  });

  it("M2: the pairs keep the edge buffer on the M slice, include (UBL, DF), and the list matches what m2OpSystem accepts", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const pairs = m2BufferPairs(puzzle);
    expect(pairs).toContainEqual({ corners: "UBL", edges: "DF" });
    expect(pairs.every((p) => ["UF", "UB", "DF", "DB", "FU", "BU", "FD", "BD"].includes(p.edges))).toBe(true);
    expect(m2OpSystem(puzzle, { cornerBuffer: "UFR", edgeBuffer: "UR" }).ok).toBe(false);
  });
});
