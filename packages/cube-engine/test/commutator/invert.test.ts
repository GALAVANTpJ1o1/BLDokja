import { describe, expect, it } from "vitest";
import { expandNodes, formatMoves, invertMoves, invertNodes } from "../../src/commutator/expand.js";
import { formatAlg, parseAlg } from "../../src/commutator/parse.js";
import { validateComm } from "../../src/commutator/validate.js";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { threeStyleDatasets } from "../data/committed.js";

describe("invertNodes", () => {
  it("writes the inverse in bracket notation", () => {
    const text = (alg: string) => {
      const parsed = parseAlg("3x3x3", alg);
      if (!parsed.ok) throw new Error(alg);
      return formatAlg({ puzzle: "3x3x3", nodes: invertNodes(parsed.value.nodes) });
    };
    expect(text("[R, U]")).toBe("[U, R]");
    expect(text("[D: [R' U' R, D2]]")).toBe("[D: [D2, R' U' R]]");
    expect(text("R U2 F'")).toBe("F U2 R'");
    expect(text("[U R U: [L2, U R' U']]")).toBe("[U R U: [U R' U', L2]]");
  });

  it("expands to the inverse moves, and solves the reversed case, for every committed 3-style comm", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    for (const dataset of [threeStyleDatasets().corners, threeStyleDatasets().edges]) {
      for (const record of dataset.records) {
        if (record.kind !== "cycle") continue;
        const alg = record.algs[0]?.alg ?? "";
        const parsed = parseAlg("3x3x3", alg);
        if (!parsed.ok) throw new Error(alg);
        const inverse = invertNodes(parsed.value.nodes);
        expect(formatMoves(expandNodes(inverse)), alg).toBe(formatMoves(invertMoves(expandNodes(parsed.value.nodes))));
        const reversed = validateComm(puzzle, { puzzle: "3x3x3", nodes: inverse }, [dataset.buffer, record.targets[1], record.targets[0]]);
        expect(reversed.ok && reversed.value.valid, `${record.id}: ${alg}`).toBe(true);
      }
    }
  }, 120_000);
});
