import { createRng, loadPuzzle, normaliseByCenters, randomMoveSequence, slotViews, speffzScheme, trace, verifiedMoves } from "@bld/cube-engine";
import { describe, expect, it } from "vitest";
import { traceSteps } from "./trace-steps";

describe("traceSteps: where you look for each target", () => {
  it("the sticker sitting in each read step's look slot is that step's target; chosen steps look at the target itself", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const rng = createRng("trace steps look slots");
    const faceTurns = verifiedMoves("3x3x3").filter((m) => /^[UDRLFB]['2]?$/.test(m));
    let readSteps = 0;
    let chosenSteps = 0;
    for (let run = 0; run < 300; run++) {
      const scramble = randomMoveSequence(rng, faceTurns, 22).join(" ");
      const pattern = normaliseByCenters(puzzle, puzzle.kpuzzle.defaultPattern().applyAlg(scramble));
      if (pattern === undefined) throw new Error("face turns keep centres");
      const views = new Map(slotViews(puzzle, pattern).map((v) => [v.slot, v.sticker]));
      for (const [pieceType, buffers] of [["corners", ["UBL", "UFR", "DFR"]], ["edges", ["UR", "UF", "DF"]]] as const) {
        for (const buffer of buffers) {
          for (const orientedInPlace of ["asTargets", "separate"] as const) {
            const traced = trace(puzzle, { alg: scramble }, { pieceType, buffer, scheme, policy: { orientedInPlace } });
            if (!traced.ok) throw new Error(JSON.stringify(traced.error));
            for (const step of traceSteps(traced.value)) {
              if (step.chosen) {
                expect(step.look).toBe(step.target);
                chosenSteps++;
              } else {
                expect(views.get(step.look), `${scramble} ${buffer} ${orientedInPlace} step ${step.index}`).toBe(step.target);
                readSteps++;
              }
            }
          }
        }
      }
    }
    expect(readSteps).toBeGreaterThan(10000);
    expect(chosenSteps).toBeGreaterThan(500);
  });
});
