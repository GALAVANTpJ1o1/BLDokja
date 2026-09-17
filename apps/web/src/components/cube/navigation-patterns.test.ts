import { expandNodes, formatMoves, invertNodes, loadPuzzle, parseAlg } from "@bld/cube-engine";
import { describe, expect, it } from "vitest";
import { netCells } from "./cube-state";
import { navigationPatterns, navigationRoute } from "./navigation-patterns";

describe("navigation patterns", () => {
  it("uses engine-parsed legal 3×3 patterns that return cleanly to solved", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const solved = puzzle.kpuzzle.defaultPattern();
    for (const pattern of navigationPatterns) {
      const parsed = parseAlg("3x3x3", pattern.alg);
      expect(parsed.ok, pattern.id).toBe(true);
      if (!parsed.ok) continue;
      const moves = formatMoves(expandNodes(parsed.value.nodes));
      const inverse = formatMoves(expandNodes(invertNodes(parsed.value.nodes)));
      const state = solved.applyAlg(moves);
      expect(state.applyAlg(inverse).isIdentical(solved), `${pattern.id} inverse`).toBe(true);
      expect(solved.applyAlg(Array.from({ length: pattern.order }, () => moves).join(" ")).isIdentical(solved), `${pattern.id} order`).toBe(true);
    }
  });

  it("reaches the exact target from every completed pattern, including coalesced rapid requests", async () => {
    const { kpuzzle } = await loadPuzzle("3x3x3");
    const solved = kpuzzle.defaultPattern();
    for (const from of navigationPatterns) for (const to of navigationPatterns) {
      expect(solved.applyAlg(from.alg).applyAlg(navigationRoute(from, to)).isIdentical(solved.applyAlg(to.alg)), `${from.id} → ${to.id}`).toBe(true);
    }
  });

  it("has a true superflip: twelve flipped edges, fixed corners and centres", async () => {
    const { kpuzzle } = await loadPuzzle("3x3x3");
    const target = navigationPatterns.find((pattern) => pattern.id === "superflip");
    if (target === undefined) throw new Error("Missing superflip");
    const solved = kpuzzle.defaultPattern();
    const actual = solved.applyAlg(target.alg).patternData;
    expect(actual["CORNERS"]).toEqual(solved.patternData["CORNERS"]);
    expect(actual["CENTERS"]).toEqual(solved.patternData["CENTERS"]);
    expect(actual["EDGES"]?.pieces).toEqual(solved.patternData["EDGES"]?.pieces);
    expect(actual["EDGES"]?.orientation).toEqual(Array.from({ length: 12 }, () => 1));
  });

  it("shows a six-spot donut: each centre has a uniform contrasting ring", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const target = navigationPatterns.find((pattern) => pattern.id === "donut");
    if (target === undefined) throw new Error("Missing donut");
    const cells = netCells(puzzle, puzzle.kpuzzle.defaultPattern().applyAlg(target.alg));
    for (const face of ["U", "L", "F", "R", "B", "D"]) {
      const onFace = cells.filter((cell) => cell.slotFace === face);
      const centre = onFace.find((cell) => cell.row === 1 && cell.col === 1);
      const ring = onFace.filter((cell) => cell !== centre);
      expect(centre?.colour).toBe(face);
      expect(new Set(ring.map((cell) => cell.colour)).size).toBe(1);
      expect(ring[0]?.colour).not.toBe(centre?.colour);
    }
  });
});
