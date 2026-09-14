import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { formatMoves } from "../../src/commutator/expand.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { opSystem, solveOpOp } from "../../src/methods/op.js";
import { createRng } from "../../src/random/prng.js";
import { randomState3x3 } from "../../src/random/random-state.js";
import { symmetricSystems } from "./op-systems.js";

/** The larger OP/OP full-solve runs: 20,000 states on the default system, 500 on each of the 48 symmetric systems. */
describe("OP/OP full solve, slow suite", () => {
  it("default system (UBL, UR): 20,000 random states", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const system = opSystem(puzzle, { cornerBuffer: "UBL", edgeBuffer: "UR" });
    if (!system.ok) throw new Error(JSON.stringify(system.error));
    const scheme = speffzScheme(puzzle);
    const rng = createRng("op-op slow default");
    const solved = puzzle.kpuzzle.defaultPattern();
    let failures = 0;
    for (let run = 0; run < 20_000; run++) {
      const pattern = randomState3x3(puzzle, rng);
      const solution = solveOpOp(puzzle, { pattern }, { scheme, ...system.value });
      if (!solution.ok || !pattern.applyAlg(formatMoves(solution.value.moves)).isIdentical(solved)) failures++;
    }
    expect(failures).toBe(0);
  });

  it("every symmetric system: 500 random states each", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const rng = createRng("op-op slow symmetric");
    const solved = puzzle.kpuzzle.defaultPattern();
    const systems = symmetricSystems(puzzle);
    expect(systems).toHaveLength(48);
    const failed: string[] = [];
    for (const system of systems) {
      for (let run = 0; run < 500; run++) {
        const pattern = randomState3x3(puzzle, rng);
        const solution = solveOpOp(puzzle, { pattern }, { scheme, ...system });
        if (!solution.ok || !pattern.applyAlg(formatMoves(solution.value.moves)).isIdentical(solved)) failed.push(`${system.corners.buffer}/${system.edges.buffer} run ${run}`);
      }
    }
    expect(failed).toEqual([]);
  });
});
