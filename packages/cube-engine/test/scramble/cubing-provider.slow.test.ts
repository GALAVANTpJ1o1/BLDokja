import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { parseAlg } from "../../src/commutator/parse.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { generateConstrained } from "../../src/scramble/constrained.js";
import { cubingProvider } from "../../src/scramble/providers.js";
import { trace } from "../../src/trace/trace.js";

/** cubing.js's randomScrambleForEvent is unseeded and spawns a worker, so it is tested in the slow suite only (D-027). */
describe("cubingProvider, slow suite", () => {
  it("333bf: each scramble traces the same as its state, and constrained generation works over it", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const provider = cubingProvider(puzzle, "333bf");
    for (let i = 0; i < 5; i++) {
      const candidate = await provider.next();
      const scramble = await candidate.scramble();
      expect(parseAlg("3x3x3", scramble).ok, scramble).toBe(true);
      for (const [typeId, buffer] of [["corners", "UFR"], ["edges", "UF"]] as const) {
        const fromState = trace(puzzle, { pattern: candidate.state }, { pieceType: typeId, buffer, scheme });
        const fromScramble = trace(puzzle, { alg: scramble }, { pieceType: typeId, buffer, scheme });
        expect(fromState, scramble).toEqual(fromScramble);
      }
    }
    const constrained = await generateConstrained(puzzle, {
      provider,
      traceConfigs: { corners: { pieceType: "corners", buffer: "UFR", scheme } },
      accept: { corners: { parity: true } },
      maxAttempts: 30,
    });
    expect(constrained.ok).toBe(true);
  });

  it("444bf: a scramble parses and produces its state as it is", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const candidate = await cubingProvider(puzzle, "444bf").next();
    const scramble = await candidate.scramble();
    expect(parseAlg("4x4x4", scramble).ok, scramble).toBe(true);
    expect(puzzle.kpuzzle.defaultPattern().applyAlg(scramble).isIdentical(candidate.state)).toBe(true);
  });
});
