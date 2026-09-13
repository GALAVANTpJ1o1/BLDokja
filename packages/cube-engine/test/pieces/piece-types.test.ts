import { describe, expect, it } from "vitest";
import { StickerGeometry } from "../../src/core/geometry.js";
import { loadPuzzle, verifiedMoves } from "../../src/core/puzzle.js";
import { pieceName, stickerName } from "../../src/pieces/names.js";
import { pieceType, pieceTypesFor } from "../../src/pieces/piece-types.js";
import { createRng } from "../../src/random/prng.js";
import { randomMoveSequence } from "../../src/random/random-state.js";

describe("geometry-derived names", () => {
  it.each([3, 4, 5])("are unique for every sticker and piece on a %i-cube", (size) => {
    const g = new StickerGeometry(size);
    const stickers = g.stickers.map((s) => stickerName(g, s.index));
    expect(new Set(stickers).size).toBe(g.stickerCount);
    const pieces = g.cubies.map((c) => pieceName(size, c.center));
    expect(new Set(pieces).size).toBe(g.cubies.length);
  });

  it("names 3x3 pieces and stickers in U/D, F/B, R/L order", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const corners = pieceType(puzzle, "corners");
    expect(corners.pieces.map((p) => p.name).sort()).toEqual(["DBL", "DBR", "DFL", "DFR", "UBL", "UBR", "UFL", "UFR"]);
    expect(corners.pieceByName("UFR")?.stickers.map((s) => s.name).sort()).toEqual(["FUR", "RUF", "UFR"]);
    const edges = pieceType(puzzle, "edges");
    expect(edges.pieces.map((p) => p.name).sort()).toEqual(["BL", "BR", "DB", "DF", "DL", "DR", "FL", "FR", "UB", "UF", "UL", "UR"]);
    expect(edges.pieceByName("FR")?.stickers.map((s) => s.name).sort()).toEqual(["FR", "RF"]);
  });

  it("names 4x4 wings and x-centres by the side they sit towards", async () => {
    const puzzle = await loadPuzzle("4x4x4");
    const wings = pieceType(puzzle, "wings");
    expect(wings.pieces).toHaveLength(24);
    expect(wings.pieceByName("UFr")?.stickers.map((s) => s.name).sort()).toEqual(["FUr", "UFr"]);
    expect(wings.pieceByName("FRu")?.stickers.map((s) => s.name).sort()).toEqual(["FRu", "RFu"]);
    const xcenters = pieceType(puzzle, "xcenters");
    expect(xcenters.pieces).toHaveLength(24);
    expect(xcenters.pieceByName("Ufr")?.homeFace).toBe("U");
  });
});

describe("piece types", () => {
  it("cover each puzzle's kpuzzle orbits with the right counts", async () => {
    const three = pieceTypesFor(await loadPuzzle("3x3x3")).map((t) => [t.id, t.orbit, t.pieces.length, t.stickers.length]);
    expect(three).toEqual([
      ["corners", "CORNERS", 8, 24],
      ["edges", "EDGES", 12, 24],
    ]);
    const four = pieceTypesFor(await loadPuzzle("4x4x4")).map((t) => [t.id, t.orbit, t.pieces.length, t.stickers.length]);
    expect(four).toEqual([
      ["corners", "CORNERS", 8, 24],
      ["wings", "EDGES", 24, 48],
      ["xcenters", "CENTERS", 24, 24],
    ]);
  });

  it("marks exactly one orientation-reference sticker per corner and edge: U/D, else F/B", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    for (const id of ["corners", "edges"] as const) {
      for (const piece of pieceType(puzzle, id).pieces) {
        const refs = piece.stickers.filter((s) => s.isOrientationReference);
        expect(refs).toHaveLength(1);
        expect(["U", "D", "F", "B"]).toContain(refs[0]?.face);
      }
    }
    expect(pieceType(puzzle, "edges").pieceByName("FR")?.stickers.find((s) => s.isOrientationReference)?.name).toBe("FR");
  });

  describe("physical orientation orders are what the specs claim", () => {
    async function observedOrientations(id: "3x3x3" | "4x4x4", typeId: "corners" | "edges" | "wings") {
      const puzzle = await loadPuzzle(id);
      const type = pieceType(puzzle, typeId);
      const moves = verifiedMoves(id).filter((m) => !/^[xyz]/.test(m));
      const rng = createRng(`orientations-${id}-${typeId}`);
      const seen = new Map<string, Set<number>>();
      for (let i = 0; i < 600; i++) {
        const pattern = puzzle.kpuzzle.defaultPattern().applyAlg(randomMoveSequence(rng, moves, 40).join(" "));
        const data = pattern.patternData[type.orbit];
        if (data === undefined) throw new Error("missing orbit");
        data.pieces.forEach((piece, position) => {
          const key = `${piece}@${position}`;
          const set = seen.get(key) ?? new Set<number>();
          set.add(data.orientation[position] ?? -1);
          seen.set(key, set);
        });
      }
      return { type, seen };
    }

    it("4x4 wings: a wing has one possible orientation in each slot (kpuzzle's two labels are position-dependent)", async () => {
      const { type, seen } = await observedOrientations("4x4x4", "wings");
      expect(type.orientationOrder).toBe(1);
      expect(seen.size).toBe(24 * 24);
      for (const orientations of seen.values()) expect(orientations.size).toBe(1);
    });

    it("3x3 corners and edges show every orientation in every slot", async () => {
      for (const typeId of ["corners", "edges"] as const) {
        const { type, seen } = await observedOrientations("3x3x3", typeId);
        expect(seen.size).toBe(type.pieces.length ** 2);
        for (const orientations of seen.values()) expect(orientations.size).toBe(type.orientationOrder);
      }
    });
  });
});
