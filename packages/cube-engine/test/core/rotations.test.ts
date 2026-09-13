import type { KTransformation } from "cubing/kpuzzle";
import { describe, expect, it } from "vitest";
import { at, mod, permutationParity } from "../../src/core/arrays.js";
import { loadPuzzle, type Puzzle } from "../../src/core/puzzle.js";

function allRotations(puzzle: Puzzle): KTransformation[] {
  const found: KTransformation[] = [puzzle.kpuzzle.identityTransformation()];
  for (let i = 0; i < found.length; i++) {
    for (const move of ["x", "y"]) {
      const next = at(found, i).applyMove(move);
      if (!found.some((t) => t.isIdentical(next))) found.push(next);
    }
  }
  return found;
}

function paritiesByOrbit(puzzle: Puzzle, t: KTransformation): Record<string, 0 | 1> {
  const out: Record<string, 0 | 1> = {};
  for (const orbit of puzzle.stickerMap.orbits) {
    const data = t.transformationData[orbit.orbit];
    if (data === undefined) throw new Error(`missing ${orbit.orbit}`);
    out[orbit.orbit] = permutationParity(data.permutation);
  }
  return out;
}

describe("whole-cube rotations", () => {
  it("x and y generate exactly 24 rotations on both puzzles", async () => {
    for (const id of ["3x3x3", "4x4x4"] as const) {
      expect(allRotations(await loadPuzzle(id))).toHaveLength(24);
    }
  });

  it("4x4x4: every rotation is an even permutation of corners, wings and x-centres", async () => {
    // This is what makes 4x4 parity independent of which orientation reference a solver picks.
    const puzzle = await loadPuzzle("4x4x4");
    for (const rotation of allRotations(puzzle)) {
      expect(paritiesByOrbit(puzzle, rotation)).toEqual({ CORNERS: 0, EDGES: 0, CENTERS: 0 });
    }
  });

  it("3x3x3: rotations are even on corners, but quarter rotations are odd on edges and centres together", async () => {
    // Finding, recorded in DECISIONS: on 3x3 a rotation can be odd on edges. That is harmless because
    // the frame is fixed by the centres, and an edge-odd rotation is always centre-odd too.
    const puzzle = await loadPuzzle("3x3x3");
    const parities = allRotations(puzzle).map((r) => paritiesByOrbit(puzzle, r));
    for (const p of parities) {
      expect(p.CORNERS).toBe(0);
      expect(p.EDGES).toBe(p.CENTERS);
    }
    expect(parities.filter((p) => p.EDGES === 1)).toHaveLength(12);
  });
});

describe("3x3x3 face turns preserve the reachability conditions used by the random-state sampler", () => {
  it("in cubing.js's orientation convention, each face turn keeps twist sums at 0 and corner/edge parities equal", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    for (const move of ["U", "D", "R", "L", "F", "B"]) {
      const t = puzzle.kpuzzle.moveToTransformation(move).transformationData;
      const corners = t.CORNERS;
      const edges = t.EDGES;
      if (corners === undefined || edges === undefined) throw new Error("missing orbit");
      expect(mod(corners.orientationDelta.reduce((a, b) => a + b, 0), 3)).toBe(0);
      expect(mod(edges.orientationDelta.reduce((a, b) => a + b, 0), 2)).toBe(0);
      expect(permutationParity(corners.permutation)).toBe(permutationParity(edges.permutation));
    }
  });
});
