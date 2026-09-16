import { loadPuzzle, stickerName } from "@bld/cube-engine";
import { describe, expect, it } from "vitest";
import { readerFor } from "./reader";
import { piecesOf } from "./cube-highlights";

describe("whole-piece recognition highlights", () => {
  it("reveals exactly two stickers per edge, three per corner, and all six fixed centres separately", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const reader = readerFor(puzzle);
    const edges = new Set<string>();
    const corners = new Set<string>();
    for (const s of puzzle.geometry.stickers) {
      const name = stickerName(puzzle.geometry, s.index);
      if (name.length === 2) {
        const names = piecesOf(reader, [name]);
        expect(names).toHaveLength(2);
        expect(names).toContain(name);
        edges.add(Array.from(name).sort().join(""));
      } else if (name.length === 3) {
        const names = piecesOf(reader, [name]);
        expect(names).toHaveLength(3);
        corners.add(Array.from(name).sort().join(""));
      }
    }
    expect(edges.size).toBe(12);
    expect(corners.size).toBe(8);
    expect(piecesOf(reader, ["FL"]).sort()).toEqual(["FL", "LF"]);
    expect(puzzle.geometry.stickers.map(s => reader.nameOf(s.index)).filter(n => n.length === 1).sort()).toEqual(["B", "D", "F", "L", "R", "U"]);
  });
});
