import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { loadPuzzle, type PuzzleId } from "../../src/core/puzzle.js";
import { affectedStickers } from "../../src/commutator/effect.js";
import { expandNodes, formatMoves } from "../../src/commutator/expand.js";
import { parseAlg } from "../../src/commutator/parse.js";
import { pieceName, stickerName } from "../../src/pieces/names.js";
import { algNodesArbitrary } from "./arbitraries.js";

const KIND_BY_STICKER_COUNT = { 3: "corner", 2: "edge", 1: "center" } as const;

describe("affectedStickers: golden cases (3x3x3)", () => {
  it("R moves the eight non-centre pieces of the R layer", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const parsed = parseAlg("3x3x3", "R");
    if (!parsed.ok) throw new Error("parse");
    const byOrbit = Object.fromEntries(affectedStickers(puzzle, parsed.value).map((o) => [o.orbit, [...o.pieces].sort()]));
    expect(byOrbit).toEqual({ CORNERS: ["DBR", "DFR", "UBR", "UFR"], EDGES: ["BR", "DR", "FR", "UR"], CENTERS: [] });
  });

  it("x moves every piece except the R and L centres, which only turn in place", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const parsed = parseAlg("3x3x3", "x");
    if (!parsed.ok) throw new Error("parse");
    const affected = affectedStickers(puzzle, parsed.value);
    expect(affected.find((o) => o.orbit === "CENTERS")?.pieces.slice().sort()).toEqual(["B", "D", "F", "U"]);
    expect(affected.find((o) => o.orbit === "CORNERS")?.pieces.length).toBe(8);
    expect(affected.find((o) => o.orbit === "EDGES")?.pieces.length).toBe(12);
  });

  it("an alg that undoes itself affects nothing", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const parsed = parseAlg("3x3x3", "R U R' U' U R U' R'");
    if (!parsed.ok) throw new Error("parse");
    expect(affectedStickers(puzzle, parsed.value).every((o) => o.stickers.length === 0 && o.pieces.length === 0)).toBe(true);
  });
});

describe.each(["3x3x3", "4x4x4"] as PuzzleId[])("affectedStickers ≡ geometry model: %s", (id) => {
  it("reports exactly the stickers the geometry model moves, grouped into orbits of the right kind", async () => {
    const puzzle = await loadPuzzle(id);
    const { geometry } = puzzle;
    fc.assert(
      fc.property(algNodesArbitrary(id, { maxDepth: 2 }), (nodes) => {
        const moves = expandNodes(nodes);
        const perm = geometryAlgPermutation(geometry, formatMoves(moves));
        const moved = geometry.stickers.filter((s) => perm[s.index] !== s.index);
        const affected = affectedStickers(puzzle, moves);

        expect(affected.map((o) => o.orbit)).toEqual(puzzle.stickerMap.orbits.map((o) => o.orbit));
        expect(affected.flatMap((o) => o.stickers).sort()).toEqual(moved.map((s) => stickerName(geometry, s.index)).sort());
        expect(affected.flatMap((o) => o.pieces).sort()).toEqual([...new Set(moved.map((s) => pieceName(geometry.size, s.cubie)))].sort());
        for (const orbit of affected) {
          for (const name of orbit.stickers) {
            const sticker = geometry.stickers.find((s) => stickerName(geometry, s.index) === name);
            if (sticker === undefined) throw new Error(`no sticker ${name}`);
            const count = geometry.cubieOf(sticker.index).stickers.length as 1 | 2 | 3;
            expect(orbit.kind).toBe(KIND_BY_STICKER_COUNT[count]);
          }
        }
      }),
      { seed: 22092026, numRuns: 150 },
    );
  });
});
