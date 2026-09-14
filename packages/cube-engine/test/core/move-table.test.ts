import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyStickerPermutation, faceAxis } from "../../src/core/geometry.js";
import { geometryMovePermutation, parseGeometryMove } from "../../src/core/geometry-moves.js";
import { composePerms, identityPerm, invertPerm, moveTable } from "../../src/core/move-table.js";
import { faceletsOf, loadPuzzle, VERIFIED_MOVE_FAMILIES, type PuzzleId } from "../../src/core/puzzle.js";

describe.each(["3x3x3", "4x4x4"] as PuzzleId[])("move tables: %s", (id) => {
  it("match the geometry model for every verified move, with consistent inverses and axes", async () => {
    const puzzle = await loadPuzzle(id);
    const table = moveTable(puzzle, VERIFIED_MOVE_FAMILIES[id]);
    expect(table.moves).toHaveLength(VERIFIED_MOVE_FAMILIES[id].length * 3);
    for (const move of table.moves) {
      expect(Array.from(move.perm), move.name).toEqual(Array.from(geometryMovePermutation(puzzle.geometry, move.name)));
      expect(Array.from(composePerms(move.perm, move.inverse)), move.name).toEqual(Array.from(identityPerm(table.stickerCount)));
      expect(Array.from(table.moves[move.inverseIndex]?.perm ?? []), move.name).toEqual(Array.from(move.inverse));
      expect(move.axis, move.name).toBe(faceAxis(parseGeometryMove(move.family, puzzle.size).face).axis);
      expect(table.move(move.family, move.amount)).toBe(move);
    }
  });

  it("compose into the same state as KPattern.applyAlg", async () => {
    const puzzle = await loadPuzzle(id);
    const table = moveTable(puzzle, VERIFIED_MOVE_FAMILIES[id]);
    const { geometry } = puzzle;
    fc.assert(
      fc.property(fc.array(fc.nat({ max: table.moves.length - 1 }), { maxLength: 30 }), (indices) => {
        const moves = indices.map((i) => table.moves[i]).filter((m) => m !== undefined);
        const perm = moves.reduce((acc, m) => composePerms(acc, m.perm), identityPerm(table.stickerCount));
        const alg = moves.map((m) => m.name).join(" ");
        const expected = faceletsOf(puzzle, puzzle.kpuzzle.defaultPattern().applyAlg(alg));
        const colour = (s: number) => geometry.sticker(s).face;
        // Colours, because a pattern can't tell identical 4x4 centres apart.
        expect(Array.from(applyStickerPermutation(geometry.solvedFacelets(), Int32Array.from(perm)), colour), alg).toEqual(Array.from(expected, colour));
        expect(Array.from(composePerms(perm, invertPerm(perm)))).toEqual(Array.from(identityPerm(table.stickerCount)));
      }),
      { seed: 23092026, numRuns: 200 },
    );
  });

  it("refuses families that aren't verified", async () => {
    const puzzle = await loadPuzzle(id);
    expect(() => moveTable(puzzle, ["Q"])).toThrow(RangeError);
    expect(() => moveTable(puzzle, ["R", "R"])).toThrow(RangeError);
  });
});
