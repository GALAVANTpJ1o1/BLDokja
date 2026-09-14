import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { loadPuzzle, type PuzzleId } from "../../src/core/puzzle.js";
import { expandNodes, formatMoves } from "../../src/commutator/expand.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { drillScramble } from "../../src/scramble/drill.js";
import { trace } from "../../src/trace/trace.js";
import { committed, threeStyleDatasets } from "../data/committed.js";
import { algNodesArbitrary } from "../commutator/arbitraries.js";

describe("drillScramble", () => {
  it.each(["3x3x3", "4x4x4"] as PuzzleId[])("%s: the drill scramble followed by the alg leaves the whole puzzle unchanged, for random alg trees", async (id) => {
    const puzzle = await loadPuzzle(id);
    const solved = puzzle.kpuzzle.defaultPattern();
    fc.assert(
      fc.property(algNodesArbitrary(id), (nodes) => {
        const drill = drillScramble(puzzle, { puzzle: id, nodes });
        if (!drill.ok) throw new Error(JSON.stringify(drill.error));
        const state = solved.applyAlg(drill.value.scramble);
        expect(state.applyAlg(formatMoves(expandNodes(nodes))).isIdentical(solved)).toBe(true);
      }),
      { seed: 12092026, numRuns: 200 },
    );
  });

  it("tracing the drill scramble of every committed 3-style record gives exactly its case", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    const { corners, edges, twists, flips } = threeStyleDatasets();
    let count = 0;
    for (const dataset of [corners, edges, twists, flips]) {
      for (const record of dataset.records) {
        const main = record.algs[0];
        const drill = drillScramble(puzzle, main?.alg ?? "");
        if (!drill.ok) throw new Error(`${record.id}: ${JSON.stringify(drill.error)}`);
        const traced = trace(puzzle, { alg: drill.value.scramble }, { pieceType: dataset.pieceType, buffer: dataset.buffer, scheme, policy: { orientedInPlace: "separate" } });
        if (!traced.ok) throw new Error(JSON.stringify(traced.error));
        const context = `${dataset.id} ${record.id}`;
        if (record.kind === "cycle") {
          expect([traced.value.targetStickers, traced.value.orientedInPlace, traced.value.parity], context).toEqual([record.targets, [], false]);
        } else {
          const reported = traced.value.orientedInPlace.filter((o) => !o.isBuffer).map((o) => [o.piece, o.direction]);
          expect([traced.value.targetStickers, reported], context).toEqual([[], [[record.target, record.kind === "twist" ? record.direction : "flip"]]]);
        }
        count++;
      }
    }
    expect(count).toBe(378 + 440 + 14 + 11);
  });

  it("tracing the drill scramble of every committed OP target record gives exactly that target", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const scheme = speffzScheme(puzzle);
    for (const name of ["op-corners.UBL", "op-edges.UR"]) {
      const dataset = committed(name);
      if (dataset.kind !== "setups" || dataset.method !== "op") throw new Error(name);
      for (const record of dataset.records) {
        const drill = drillScramble(puzzle, record.algs[0]?.alg ?? "");
        if (!drill.ok) throw new Error(JSON.stringify(drill.error));
        const traced = trace(puzzle, { alg: drill.value.scramble }, { pieceType: dataset.pieceType, buffer: dataset.buffer, scheme, policy: { orientedInPlace: "asTargets" } });
        if (!traced.ok) throw new Error(JSON.stringify(traced.error));
        expect(traced.value.targetStickers, `${name} ${record.target}`).toEqual([record.target]);
      }
    }
  });

  it("reports bad input", async () => {
    const three = await loadPuzzle("3x3x3");
    const four = await loadPuzzle("4x4x4");
    const code = (r: ReturnType<typeof drillScramble>) => (r.ok ? "ok" : r.error.code);
    expect(code(drillScramble(three, "[R, U"))).toBe("invalid-alg");
    expect(code(drillScramble(four, { puzzle: "3x3x3", nodes: [] }))).toBe("wrong-puzzle");
    expect(drillScramble(three, "[R: U]")).toEqual({ ok: true, value: { scramble: "R U' R'", moves: [{ type: "move", family: "R", amount: 1 }, { type: "move", family: "U", amount: 3 }, { type: "move", family: "R", amount: 3 }] } });
    expect(drillScramble(three, "R R'")).toEqual({ ok: true, value: { scramble: "", moves: [] } });
  });
});
