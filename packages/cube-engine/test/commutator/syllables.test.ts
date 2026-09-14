import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { VERIFIED_MOVE_FAMILIES, type PuzzleId } from "../../src/core/puzzle.js";
import { cancelMoves, invertMoves } from "../../src/commutator/expand.js";
import type { AlgMove, QuarterTurns } from "../../src/commutator/parse.js";
import { syllableCodec } from "../../src/commutator/syllables.js";

/** The packed path must give exactly the lengths of D-017's cancelMoves. */
const CODECS: { label: string; puzzle: PuzzleId; families: readonly string[] }[] = [
  { label: "3x3 faces and slices (lookup tables)", puzzle: "3x3x3", families: ["U", "D", "R", "L", "F", "B", "M", "E", "S"] },
  { label: "every verified 3x3 family (generic path)", puzzle: "3x3x3", families: VERIFIED_MOVE_FAMILIES["3x3x3"] },
  { label: "every verified 4x4 family (generic path)", puzzle: "4x4x4", families: VERIFIED_MOVE_FAMILIES["4x4x4"] },
];

describe.each(CODECS)("syllable codec: $label", ({ puzzle, families }) => {
  const codec = syllableCodec(puzzle, families);
  // Few families, so cancellation happens often.
  const moveArb = (pool: readonly string[]) =>
    fc.record({ type: fc.constant("move" as const), family: fc.constantFrom(...pool), amount: fc.constantFrom<QuarterTurns>(1, 2, 3) });
  const pools = [families, families.slice(0, 5)];

  it("encodes to the cancelled length", () => {
    fc.assert(
      fc.property(fc.oneof(...pools.map((pool) => fc.array(moveArb(pool), { maxLength: 30 }))), (moves: AlgMove[]) => {
        expect(codec.encode(moves).length).toBe(cancelMoves(puzzle, moves).length);
      }),
      { seed: 24092026, numRuns: 1000 },
    );
  });

  it("computes the cancelled length of setup · core · setup⁻¹", () => {
    fc.assert(
      fc.property(
        fc.oneof(...pools.map((pool) => fc.tuple(fc.array(moveArb(pool), { maxLength: 4 }), fc.array(moveArb(pool), { maxLength: 12 })))),
        ([setup, core]: [AlgMove[], AlgMove[]]) => {
          const expected = cancelMoves(puzzle, [...setup, ...core, ...invertMoves(setup)]).length;
          expect(codec.conjugateLength(codec.encode(setup), codec.encode(core))).toBe(expected);
          expect(codec.inverse(codec.encode(core)).length).toBe(cancelMoves(puzzle, invertMoves(core)).length);
        },
      ),
      { seed: 25092026, numRuns: 1000 },
    );
  });

  it("rejects families it wasn't built with", () => {
    expect(() => codec.encode([{ family: "Q", amount: 1 }])).toThrow(RangeError);
  });
});
