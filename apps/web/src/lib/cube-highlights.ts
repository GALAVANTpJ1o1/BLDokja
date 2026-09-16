import type { Reader } from "./reader";

export function piecesOf(reader: Reader, names: readonly string[]): string[] {
  return reader.puzzle.geometry.stickers.map((s) => reader.nameOf(s.index)).filter((name) => names.some((piece) => sameCubie(name, piece)));
}

/** A sticker belongs to a piece if it has the same faces, in any order ("FUR" is on piece "UFR"). */
function sameCubie(sticker: string, piece: string): boolean {
  return sticker.length === piece.length && Array.from(sticker).sort().join("") === Array.from(piece).sort().join("");
}

