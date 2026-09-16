import { createRng, shuffled, stickerName, type Puzzle } from "@bld/cube-engine";

export interface RecognitionPiece { readonly id: string; readonly stickers: readonly string[] }
/** Coverage happens over physical pieces, not 24 independent stickers. */
export function recognitionPieces(puzzle: Puzzle, family: "edges" | "corners"): RecognitionPiece[] {
  const byPiece = new Map<string, string[]>();
  for (const sticker of puzzle.geometry.stickers) {
    const name = stickerName(puzzle.geometry, sticker.index);
    if (name.length !== (family === "edges" ? 2 : 3)) continue;
    const id = Array.from(name).sort().join("");
    byPiece.set(id, [...(byPiece.get(id) ?? []), name]);
  }
  return Array.from(byPiece, ([id, stickers]) => ({ id, stickers }));
}
export function recognitionQueue(puzzle: Puzzle, family: "edges" | "corners", count: number, seed: string): RecognitionPiece[] {
  if (![10, 20, 30, 50].includes(count)) throw new RangeError("Recognition count must be 10, 20, 30 or 50");
  const rng = createRng(seed);
  const pieces = recognitionPieces(puzzle, family);
  const queue: RecognitionPiece[] = [];
  while (queue.length < count) {
    const round = shuffled(rng, pieces);
    if (round[0]?.id === queue.at(-1)?.id && round.length > 1) round.push(...round.splice(0, 1));
    queue.push(...round);
  }
  return queue.slice(0, count);
}
