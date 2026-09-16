import { expect, it } from "vitest";
import { loadPuzzle, stickerName } from "@bld/cube-engine";
import { describeCube, netCells } from "./cube-state";

it("hidden recognition stickers stay hidden in text as well as the visual net", async () => {
  const puzzle = await loadPuzzle("3x3x3");
  const cells = netCells(puzzle, puzzle.kpuzzle.defaultPattern());
  const revealed = new Set(puzzle.geometry.stickers.filter(s => ["U", "L", "F", "R", "B", "D", "FL", "LF"].includes(stickerName(puzzle.geometry, s.index))).map(s => s.index));
  const description = describeCube(cells, revealed).join(" ");
  expect(description.match(/hidden/g)).toHaveLength(46);
  for (const colour of ["white", "red", "blue", "yellow"]) expect(description.match(new RegExp(colour, "g"))).toHaveLength(1);
  for (const colour of ["orange", "green"]) expect(description.match(new RegExp(colour, "g"))).toHaveLength(2);
  expect(describeCube(cells).join(" ")).not.toContain("hidden");
});
