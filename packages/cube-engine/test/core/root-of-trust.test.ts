import { KPattern, KPuzzle, type KPuzzleDefinition } from "cubing/kpuzzle";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { StickerGeometry, applyStickerPermutation } from "../../src/core/geometry.js";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { faceletsOf, loadPuzzle, movesDisagreeingWithGeometry, verifiedMoves, type PuzzleId } from "../../src/core/puzzle.js";
import {
  StickerMapError,
  deriveStickerMap,
  faceletsToPattern,
  transformationToStickerPermutation,
} from "../../src/core/sticker-map.js";

/**
 * The root of trust: two independent implementations of cube moves (cubing.js's kpuzzle
 * definitions and the first-principles geometry model) must agree on every sticker.
 */

const PUZZLES: PuzzleId[] = ["3x3x3", "4x4x4"];

describe.each(PUZZLES)("root of trust: %s", (id) => {
  it("derives a sticker map covering every sticker exactly once", async () => {
    const puzzle = await loadPuzzle(id);
    const seen = new Set<number>();
    for (const orbit of puzzle.stickerMap.orbits) {
      for (const labels of orbit.slots) for (const s of labels) seen.add(s);
    }
    expect(seen.size).toBe(puzzle.geometry.stickerCount);
  });

  it("classifies orbits by sticker count", async () => {
    const puzzle = await loadPuzzle(id);
    const summary = puzzle.stickerMap.orbits.map((o) => [o.orbit, o.kind, o.numPieces, o.interchangeable]);
    if (id === "3x3x3") {
      expect(summary).toEqual([
        ["EDGES", "edge", 12, false],
        ["CORNERS", "corner", 8, false],
        ["CENTERS", "center", 6, false],
      ]);
    } else {
      expect(summary).toEqual([
        ["CORNERS", "corner", 8, false],
        ["EDGES", "edge", 24, false],
        ["CENTERS", "center", 24, true],
      ]);
    }
  });

  it("agrees with the geometry model on every sticker for every verified move", async () => {
    const puzzle = await loadPuzzle(id);
    const moves = verifiedMoves(id);
    expect(moves.length).toBeGreaterThan(80);
    expect(movesDisagreeingWithGeometry(puzzle, moves)).toEqual([]);
  });

  it("agrees on random move sequences, as transformations and as patterns", async () => {
    const puzzle = await loadPuzzle(id);
    const moves = verifiedMoves(id);
    const { stickerMap, geometry, kpuzzle } = puzzle;
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...moves), { minLength: 1, maxLength: 30 }), (sequence) => {
        const alg = sequence.join(" ");
        const expected = geometryAlgPermutation(geometry, alg);
        const actual = transformationToStickerPermutation(stickerMap, kpuzzle.algToTransformation(alg).transformationData, geometry.stickerCount);
        expect(Array.from(actual)).toEqual(Array.from(expected));

        // Patterns lose the identity of interchangeable pieces, so compare what a solver sees: colours.
        const pattern = kpuzzle.defaultPattern().applyAlg(alg);
        const faceletsFromPattern = faceletsOf(puzzle, pattern);
        const faceletsFromGeometry = applyStickerPermutation(geometry.solvedFacelets(), expected);
        const colour = (sticker: number) => geometry.sticker(sticker).face;
        expect(Array.from(faceletsFromPattern, colour)).toEqual(Array.from(faceletsFromGeometry, colour));

        // Facelets convert back to the same pattern.
        const roundTrip = new KPattern(kpuzzle, faceletsToPattern(stickerMap, faceletsFromPattern));
        expect(roundTrip.isIdentical(pattern)).toBe(true);
      }),
      { seed: 20260913, numRuns: 150 },
    );
  });
});

describe("root of trust: the check has teeth", () => {
  it("detects a kpuzzle definition whose U turns the wrong way", async () => {
    const real = await loadPuzzle("3x3x3");
    const definition = real.kpuzzle.definition;
    const reversed: KPuzzleDefinition = {
      ...definition,
      moves: { ...definition.moves, U: real.kpuzzle.moveToTransformation("U'").transformationData },
    };
    const broken = new KPuzzle(reversed);
    const geometry = new StickerGeometry(3);
    let map;
    try {
      map = deriveStickerMap(broken, geometry);
    } catch (error) {
      expect(error).toBeInstanceOf(StickerMapError);
      return;
    }
    const puzzle = { ...real, kpuzzle: broken, stickerMap: map };
    expect(movesDisagreeingWithGeometry(puzzle, ["U", "R", "F"]).length).toBeGreaterThan(0);
  });

  it("rejects facelets that do not form real pieces", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const facelets = puzzle.geometry.solvedFacelets();
    const corner = puzzle.stickerMap.orbits.find((o) => o.kind === "corner");
    const [a, b] = corner?.slots[0] ?? [];
    if (a === undefined || b === undefined) throw new Error("no corner");
    // Swap two stickers of one corner: a reflection, which no real move can produce.
    [facelets[a], facelets[b]] = [b, a];
    expect(() => faceletsToPattern(puzzle.stickerMap, facelets)).toThrow(StickerMapError);
  });
});
