import { describe, expect, it } from "vitest";
import { normaliseByCenters } from "../../src/core/frame.js";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { faceletsOf, loadPuzzle } from "../../src/core/puzzle.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { generateConstrained } from "../../src/scramble/constrained.js";
import { matchesConstraints, type TraceConstraints } from "../../src/scramble/constraints.js";
import { seededMoveProvider } from "../../src/scramble/providers.js";
import { trace } from "../../src/trace/trace.js";

describe("seededMoveProvider", () => {
  it("gives 25 face turns with no family twice in a row, whose state matches kpuzzle and the geometry model", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const provider = seededMoveProvider(puzzle, { seed: "moves" });
    for (let i = 0; i < 50; i++) {
      const candidate = await provider.next();
      const scramble = await candidate.scramble();
      const moves = scramble.split(" ");
      expect(moves).toHaveLength(25);
      expect(moves.every((m) => /^[UDRLFB]['2]?$/.test(m))).toBe(true);
      expect(moves.every((m, k) => k === 0 || m[0] !== moves[k - 1]?.[0]), scramble).toBe(true);
      expect(normaliseByCenters(puzzle, puzzle.kpuzzle.defaultPattern().applyAlg(scramble))?.isIdentical(candidate.state)).toBe(true);
      const perm = geometryAlgPermutation(puzzle.geometry, scramble);
      expect(Array.from(faceletsOf(puzzle, candidate.state)).every((home, slot) => perm[home] === slot), scramble).toBe(true);
    }
  });

  it("is reproducible from its seed, and different seeds differ", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const draw = async (seed: string) => {
      const provider = seededMoveProvider(puzzle, { seed, length: 20 });
      const out: string[] = [];
      for (let i = 0; i < 5; i++) out.push(await (await provider.next()).scramble());
      return out;
    };
    expect(await draw("a")).toEqual(await draw("a"));
    expect(await draw("a")).not.toEqual(await draw("b"));
  });

  it("refuses unverified moves and bad lengths", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    expect(() => seededMoveProvider(puzzle, { seed: "x", moves: ["R", "Q"] })).toThrow(RangeError);
    expect(() => seededMoveProvider(puzzle, { seed: "x", length: 0 })).toThrow(RangeError);
  });

  it("works with constrained generation: every accepted scramble matches when traced again", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const traceConfigs = { corners: { pieceType: "corners" as const, buffer: "UBL", scheme }, edges: { pieceType: "edges" as const, buffer: "UR", scheme } };
    const constraints: TraceConstraints = { corners: { parity: true, cycleBreaks: { min: 1 } }, edges: { targets: { max: 10 } } };
    const result = await generateConstrained(puzzle, { provider: seededMoveProvider(puzzle, { seed: "constrained" }), traceConfigs, accept: constraints, maxAttempts: 2000 });
    if (!result.ok) throw new Error(JSON.stringify(result).slice(0, 300));
    const traces = { corners: trace(puzzle, { alg: result.scramble }, traceConfigs.corners), edges: trace(puzzle, { alg: result.scramble }, traceConfigs.edges) };
    if (!traces.corners.ok || !traces.edges.ok) throw new Error("trace failed");
    expect(matchesConstraints({ corners: traces.corners.value, edges: traces.edges.value }, constraints)).toBe(true);
  });
});
