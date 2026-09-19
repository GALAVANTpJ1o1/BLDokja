import { describe, expect, it } from "vitest";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { pieceOfSticker, stickerName } from "../../src/pieces/names.js";

/** Sticker names grouped by the piece each belongs to. */
async function piecesOf(id: "3x3x3" | "4x4x4"): Promise<Map<string, string[]>> {
  const { geometry } = await loadPuzzle(id);
  const byPiece = new Map<string, string[]>();
  for (const s of geometry.stickers) {
    const piece = pieceOfSticker(geometry, s.index);
    byPiece.set(piece, [...(byPiece.get(piece) ?? []), stickerName(geometry, s.index)]);
  }
  return byPiece;
}

describe("pieceOfSticker", () => {
  it("groups a 3x3x3 into eight three-sticker corners, twelve two-sticker edges and six centres", async () => {
    const byPiece = await piecesOf("3x3x3");
    expect(byPiece.size).toBe(26);
    expect(byPiece.get("UFR")?.sort()).toEqual(["FUR", "RUF", "UFR"]);
    expect(byPiece.get("UF")?.sort()).toEqual(["FU", "UF"]);
    expect(byPiece.get("U")).toEqual(["U"]);
    const sizes = [...byPiece.values()].map((stickers) => stickers.length);
    expect(sizes.filter((n) => n === 3)).toHaveLength(8);
    expect(sizes.filter((n) => n === 2)).toHaveLength(12);
    expect(sizes.filter((n) => n === 1)).toHaveLength(6);
  });

  it("agrees with sticker names: a sticker's name is its own face followed by the rest of its piece", async () => {
    const { geometry } = await loadPuzzle("3x3x3");
    for (const s of geometry.stickers) {
      const piece = pieceOfSticker(geometry, s.index);
      expect(stickerName(geometry, s.index)).toBe(s.face + piece.replace(s.face, ""));
      expect(piece).toContain(s.face);
    }
  });

  it("on a 4x4x4, wings pair up, corners keep three stickers and each x-centre stands alone", async () => {
    const byPiece = await piecesOf("4x4x4");
    const sizes = [...byPiece.values()].map((stickers) => stickers.length);
    expect(byPiece.size).toBe(56);
    expect(sizes.filter((n) => n === 3)).toHaveLength(8);
    expect(sizes.filter((n) => n === 2)).toHaveLength(24);
    expect(sizes.filter((n) => n === 1)).toHaveLength(24);
  });
});
