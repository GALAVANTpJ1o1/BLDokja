import { expandNodes, formatMoves, invertNodes, loadPuzzle, parseAlg } from "@bld/cube-engine";
import { describe, expect, it } from "vitest";
import { navigationPatterns } from "./navigation-patterns";

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
});
