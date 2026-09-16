import { loadPuzzle } from "@bld/cube-engine";
import { expect, it } from "vitest";
import { recognitionPieces, recognitionQueue } from "./speffz-recognition";

it("covers every physical piece before repeating, with no boundary repeats", async () => {
  const puzzle = await loadPuzzle("3x3x3");
  for (const [family, total, stickers] of [["edges", 12, 2], ["corners", 8, 3]] as const) {
    expect(recognitionPieces(puzzle, family)).toHaveLength(total);
    const queue = recognitionQueue(puzzle, family, 50, "coverage");
    expect(queue).toHaveLength(50);
    expect(new Set(queue.slice(0, total).map(p => p.id)).size).toBe(total);
    queue.forEach((p, i) => { expect(p.stickers).toHaveLength(stickers); expect(p.id).not.toBe(queue[i - 1]?.id); });
    expect(queue).toEqual(recognitionQueue(puzzle, family, 50, "coverage"));
  }
});
