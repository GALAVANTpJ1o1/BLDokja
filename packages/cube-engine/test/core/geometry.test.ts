import { describe, expect, it } from "vitest";
import {
  FACE_FRAMES,
  FACES,
  StickerGeometry,
  applyStickerPermutation,
  composeStickerPermutations,
  type Vec3,
} from "../../src/core/geometry.js";
import { geometryAlgPermutation, geometryMovePermutation, parseGeometryMove } from "../../src/core/geometry-moves.js";

function cross(a: Vec3, b: Vec3): Vec3 {
  // `+ 0` turns -0 into 0 so deep equality compares values, not signed zeros.
  return [a[1] * b[2] - a[2] * b[1] + 0, a[2] * b[0] - a[0] * b[2] + 0, a[0] * b[1] - a[1] * b[0] + 0];
}

function samePermutation(a: Int32Array, b: Int32Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

describe("sticker geometry: structure", () => {
  it("uses right-handed axes with +x = R, +y = U, +z = F", () => {
    expect(cross(FACE_FRAMES.R.normal, FACE_FRAMES.U.normal)).toEqual(FACE_FRAMES.F.normal);
  });

  it("gives every face a net frame where right = up × normal (so each face is viewed from outside)", () => {
    for (const face of FACES) {
      const { normal, up, right } = FACE_FRAMES[face];
      expect(cross(up, normal)).toEqual(right);
    }
  });

  it.each([
    [3, { 3: 8, 2: 12, 1: 6 }],
    [4, { 3: 8, 2: 24, 1: 24 }],
    [5, { 3: 8, 2: 36, 1: 54 }],
  ])("builds a %i-cube with the right sticker and cubie counts", (size, cubiesByStickerCount) => {
    const g = new StickerGeometry(size);
    expect(g.stickerCount).toBe(6 * size * size);
    const counts: Record<number, number> = {};
    for (const cubie of g.cubies) counts[cubie.stickers.length] = (counts[cubie.stickers.length] ?? 0) + 1;
    expect(counts).toEqual(cubiesByStickerCount);
  });
});

describe("sticker geometry: WCA turn directions (clockwise as seen looking at the face)", () => {
  const g = new StickerGeometry(3);
  const movedTo = (move: string, face: (typeof FACES)[number], row: number, col: number) => {
    const perm = geometryMovePermutation(g, move);
    const target = g.sticker(perm[g.stickerAt(face, row, col)] ?? -1);
    return [target.face, target.row, target.col];
  };

  it("U carries the front face's top row to the left face", () => {
    expect(movedTo("U", "F", 0, 0)).toEqual(["L", 0, 0]);
    expect(movedTo("U", "F", 0, 2)).toEqual(["L", 0, 2]);
  });

  it("R carries the front face's right column up to the top face", () => {
    expect(movedTo("R", "F", 2, 2)).toEqual(["U", 2, 2]);
  });

  it("F carries the top face's front row to the right face's left column", () => {
    expect(movedTo("F", "U", 2, 0)).toEqual(["R", 0, 0]);
  });

  it("D carries the front face's bottom row to the right face", () => {
    expect(movedTo("D", "F", 2, 1)).toEqual(["R", 2, 1]);
  });

  it("L carries the top face's left column to the front face", () => {
    expect(movedTo("L", "U", 0, 0)).toEqual(["F", 0, 0]);
  });

  it("B carries the top face's back row to the left face", () => {
    expect(movedTo("B", "U", 0, 0)).toEqual(["L", 2, 0]);
  });
});

describe("sticker geometry: notation definitions are self-consistent", () => {
  const g3 = new StickerGeometry(3);
  const g4 = new StickerGeometry(4);
  const same = (g: StickerGeometry, a: string, b: string) => samePermutation(geometryAlgPermutation(g, a), geometryAlgPermutation(g, b));

  it("every quarter turn has order 4", () => {
    for (const move of ["U", "R", "F", "D", "L", "B", "M", "E", "S", "x", "y", "z", "Rw"]) {
      expect(same(g3, `${move} ${move} ${move} ${move}`, "")).toBe(true);
      expect(same(g3, `${move}2`, `${move} ${move}`)).toBe(true);
      expect(same(g3, `${move}'`, `${move} ${move} ${move}`)).toBe(true);
    }
  });

  it("slices turn with L, D and F; rotations with R, U and F", () => {
    expect(same(g3, "x", "R M' L'")).toBe(true);
    expect(same(g3, "y", "U E' D'")).toBe(true);
    expect(same(g3, "z", "F S B'")).toBe(true);
  });

  it("wide moves are the outer layer plus the next one", () => {
    expect(same(g3, "Rw", "R M'")).toBe(true);
    expect(same(g3, "r", "Rw")).toBe(true);
    expect(same(g4, "Rw", "R 2R")).toBe(true);
    expect(same(g4, "3Rw", "R 2R 3R")).toBe(true);
    expect(same(g4, "2-3Rw", "2R 3R")).toBe(true);
    expect(same(g4, "x", "R 2R 3R 4R")).toBe(true);
    expect(same(g4, "x", "Rw 2L' L'")).toBe(true);
  });

  it("rejects notation it does not define", () => {
    expect(() => parseGeometryMove("M", 4)).toThrow(/odd cubes/);
    expect(() => parseGeometryMove("5R", 4)).toThrow(/out of range/);
    expect(() => parseGeometryMove("Q", 3)).toThrow(/unrecognised/);
  });

  it("applies and composes sticker permutations consistently", () => {
    const a = geometryMovePermutation(g3, "R");
    const b = geometryMovePermutation(g3, "U");
    const stepwise = applyStickerPermutation(applyStickerPermutation(g3.solvedFacelets(), a), b);
    const composed = applyStickerPermutation(g3.solvedFacelets(), composeStickerPermutations(a, b));
    expect(samePermutation(stepwise, composed)).toBe(true);
  });
});
