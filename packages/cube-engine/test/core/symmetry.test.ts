import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { wholeCubeRotations } from "../../src/core/frame.js";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { composePerms } from "../../src/core/move-table.js";
import { loadPuzzle, VERIFIED_MOVE_FAMILIES, type PuzzleId } from "../../src/core/puzzle.js";
import { transformationToStickerPermutation } from "../../src/core/sticker-map.js";
import { conjugatePerm, cubeSymmetries, inverseSymmetry, relabelMove } from "../../src/core/symmetry.js";

const suffix = (amount: 1 | 2 | 3) => (amount === 1 ? "" : amount === 2 ? "2" : "'");

describe.each(["3x3x3", "4x4x4"] as PuzzleId[])("cube symmetries: %s", (id) => {
  it("are 48 distinct sticker bijections, and the 24 without a mirror are exactly the whole-cube rotations", async () => {
    const puzzle = await loadPuzzle(id);
    const symmetries = cubeSymmetries(puzzle);
    expect(symmetries).toHaveLength(48);
    const keys = new Set(symmetries.map((g) => g.sticker.join(",")));
    expect(keys.size).toBe(48);
    for (const g of symmetries) expect(new Set(g.sticker).size).toBe(puzzle.geometry.stickerCount);

    // cubing.js's rotations, as sticker permutations. A rotation carries the sticker at s to perm[s].
    const rotations = new Set(
      wholeCubeRotations(puzzle).map((t) => Array.from(transformationToStickerPermutation(puzzle.stickerMap, t.transformationData, puzzle.geometry.stickerCount)).join(",")),
    );
    const proper = symmetries.filter((g) => !g.mirror);
    expect(proper).toHaveLength(24);
    for (const g of proper) expect(rotations.has(g.sticker.join(","))).toBe(true);
  });

  it("form a group: closed under composition, every element has an inverse", async () => {
    const puzzle = await loadPuzzle(id);
    const symmetries = cubeSymmetries(puzzle);
    const keys = new Set(symmetries.map((g) => g.sticker.join(",")));
    for (const g of symmetries) {
      for (const h of symmetries) expect(keys.has(composePerms(g.sticker, h.sticker).join(","))).toBe(true);
      const inverse = inverseSymmetry(symmetries, g);
      expect(Array.from(composePerms(g.sticker, inverse.sticker))).toEqual(Array.from({ length: g.sticker.length }, (_, i) => i));
    }
  });

  it("relabel every verified move, and relabelled algs do to g(s) what the original does to s (geometry model)", async () => {
    const puzzle = await loadPuzzle(id);
    const symmetries = cubeSymmetries(puzzle);
    const families = VERIFIED_MOVE_FAMILIES[id];
    for (const g of symmetries) {
      for (const family of families) for (const amount of [1, 2, 3] as const) relabelMove(puzzle, g, { family, amount });
    }
    fc.assert(
      fc.property(
        fc.nat({ max: 47 }),
        fc.array(fc.record({ family: fc.constantFrom(...families), amount: fc.constantFrom<1 | 2 | 3>(1, 2, 3) }), { minLength: 1, maxLength: 20 }),
        (index, moves) => {
          const g = symmetries[index];
          if (g === undefined) throw new Error("no symmetry");
          const original = moves.map((m) => `${m.family}${suffix(m.amount)}`).join(" ");
          const relabelled = moves.map((m) => relabelMove(puzzle, g, m)).map((m) => `${m.family}${suffix(m.amount)}`).join(" ");
          const expected = conjugatePerm(g, Uint8Array.from(geometryAlgPermutation(puzzle.geometry, original)));
          expect(Array.from(geometryAlgPermutation(puzzle.geometry, relabelled)), `${original} → ${relabelled}`).toEqual(Array.from(expected));
        },
      ),
      { seed: 26092026, numRuns: 300 },
    );
  });
});

describe("cube symmetries: the left-right mirror", () => {
  it("swaps R and L and reverses every face turn; the M slice keeps its direction", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const mirror = cubeSymmetries(puzzle).find((g) => JSON.stringify(g.matrix) === JSON.stringify([[-1, 0, 0], [0, 1, 0], [0, 0, 1]]));
    if (mirror === undefined) throw new Error("no mirror");
    expect(mirror.mirror).toBe(true);
    expect(relabelMove(puzzle, mirror, { family: "R", amount: 1 })).toEqual({ family: "L", amount: 3 });
    expect(relabelMove(puzzle, mirror, { family: "U", amount: 1 })).toEqual({ family: "U", amount: 3 });
    expect(relabelMove(puzzle, mirror, { family: "F", amount: 2 })).toEqual({ family: "F", amount: 2 });
    // Reflecting x → −x commutes with turns about the x axis: they keep their sense and only change
    // layer. M is its own mirror layer, so it maps to itself unchanged, while R (clockwise seen from
    // +x) becomes that same turn on the L layer, which is L'.
    expect(relabelMove(puzzle, mirror, { family: "M", amount: 1 })).toEqual({ family: "M", amount: 1 });
  });
});
