import { describe, expect, it } from "vitest";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { formatMoves } from "../../src/commutator/expand.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { solveM2ThreeStyle, type M2ThreeStyleConfig } from "../../src/methods/three-style.js";
import { pieceType } from "../../src/pieces/piece-types.js";
import { createRng, shuffled } from "../../src/random/prng.js";
import { randomState3x3 } from "../../src/random/random-state.js";
import type { TraceInput } from "../../src/trace/trace.js";
import { threeStyleDatasets, threeStyleParities } from "../data/committed.js";
import { reverseGreekScheme } from "../fixtures/construct.js";
import { checkCoverage, movesOf, randomInput, solvesIt } from "./solve-helpers.js";

async function setting() {
  const puzzle = await loadPuzzle("3x3x3");
  const { corners, twists, m2 } = threeStyleDatasets();
  const { m2Parity } = threeStyleParities(puzzle);
  const config: Omit<M2ThreeStyleConfig, "scheme"> = { corners, twists, edges: m2, parity: m2Parity };
  return { puzzle, config };
}

describe("M2 edges + 3-style corners full solve (UFR, DF)", () => {
  it("solves 1,000 seeded random states and scrambles, across schemes and break orders, checked in kpuzzle and the geometry model", async () => {
    const { puzzle, config } = await setting();
    const schemes = [speffzScheme(puzzle), reverseGreekScheme(puzzle)];
    const stickers = [...pieceType(puzzle, "corners").stickers, ...pieceType(puzzle, "edges").stickers].map((s) => s.name);
    const rng = createRng("m2 + 3-style full solve");
    let parity = 0;
    let shotAs = 0;
    for (let run = 0; run < 1000; run++) {
      const input = randomInput(puzzle, rng);
      const scheme = schemes[run % 2] ?? speffzScheme(puzzle);
      const breakOrder = run % 3 === 0 ? shuffled(rng, stickers) : undefined;
      const context = `run ${run}: ${"alg" in input ? input.alg : "random state"}`;
      const solution = solveM2ThreeStyle(puzzle, input, { scheme, ...config, ...(breakOrder === undefined ? {} : { breakOrder }) });
      if (!solution.ok) throw new Error(`${context}: ${JSON.stringify(solution.error)}`);
      const moves = formatMoves(solution.value.moves);
      expect(solvesIt(puzzle, input, moves), context).toBe(true);
      if ("alg" in input) expect(geometryAlgPermutation(puzzle.geometry, `${input.alg} ${moves}`).every((to, from) => to === from), `${context} (geometry model)`).toBe(true);

      const { corners, edges } = solution.value.traces;
      checkCoverage(solution.value, "corners", corners, context);
      // M2 steps: every traced edge target in order, then UR appended exactly when odd.
      const edgeSteps = solution.value.steps.filter((s) => s.kind === "target");
      const expectedEdges = corners.parity ? [...edges.targetStickers, config.parity.partners.edges] : edges.targetStickers;
      expect(edgeSteps.map((s) => s.target), context).toEqual(expectedEdges);
      expect(edgeSteps.map((s) => s.parityTarget === true), context).toEqual(expectedEdges.map((_, i) => i >= edges.targetStickers.length));
      expect(solution.value.steps.filter((s) => s.kind === "parity").length, context).toBe(corners.parity ? 1 : 0);
      if (corners.parity) parity++;
      shotAs += edgeSteps.filter((s) => s.shotAs !== undefined).length;
    }
    expect(parity).toBeGreaterThan(400);
    expect(shotAs).toBeGreaterThan(400);
  });
});

describe("M2 + 3-style teeth", () => {
  it("leaving out the parity alg fails, and so does leaving out the appended UR", async () => {
    const { puzzle, config } = await setting();
    const scheme = speffzScheme(puzzle);
    const rng = createRng("m2 + 3-style teeth");
    let checked = 0;
    for (let run = 0; run < 300; run++) {
      const input: TraceInput = { pattern: randomState3x3(puzzle, rng) };
      const solution = solveM2ThreeStyle(puzzle, input, { scheme, ...config });
      if (!solution.ok) throw new Error(JSON.stringify(solution.error));
      const { steps } = solution.value;
      if (!steps.some((s) => s.kind === "parity")) continue;
      checked++;
      expect(solvesIt(puzzle, input, movesOf(steps.filter((s) => s.kind !== "parity"))), `run ${run}: no parity`).toBe(false);
      expect(solvesIt(puzzle, input, movesOf(steps.filter((s) => !(s.kind === "target" && s.parityTarget === true)))), `run ${run}: no appended UR`).toBe(false);
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe("M2 + 3-style worked example", () => {
  it("golden fixture R02 (parity: UBR and UR appended, BD on an odd step, a twist): the full solution, pinned for a physical cube", async () => {
    const { puzzle, config } = await setting();
    const scramble = "F' D2' L2' D B2' D2' L2' D' R2' U' B2' U' R' U2' B' U F' D R B' L";
    const solution = solveM2ThreeStyle(puzzle, { alg: scramble }, { scheme: speffzScheme(puzzle), ...config });
    if (!solution.ok) throw new Error(JSON.stringify(solution.error));
    const lines = solution.value.steps.map((s) => {
      switch (s.kind) {
        case "cycle":
          return `corners ${s.targets.join(" ")}${s.parityTarget === true ? " (partner)" : ""}: ${s.notation}`;
        case "orientation":
          return `corners ${s.piece} ${s.direction}: ${s.notation}`;
        case "target":
          return `edges ${s.target}${s.shotAs === undefined ? "" : ` as ${s.shotAs}`}${s.parityTarget === true ? " (partner)" : ""}: ${formatMoves([...s.setup, ...s.core, ...s.undo])}`;
        case "parity":
          return `parity: ${formatMoves(s.alg)}`;
        default:
          return s.kind;
      }
    });
    expect(lines).toEqual([
      "corners DBL UFL: [L2, F R F']",
      "corners RDF RUB: [B: [U2, U2 B D2 B']]",
      "corners UBL DFL: [U R U: [L2, U R' U']]",
      "corners LUB UBR (partner): [L F' L' F, B]",
      "edges UB: M2",
      "edges UL: F U F' M2 F U' F'",
      "edges UF: U2 M' U2 M'",
      "edges BD as FU: D M' D B2 D' M D B2 D2 M2",
      "edges UR: F U' F' M2 F U F'",
      "edges FL: U' L' U M2 U' L U",
      "edges RF: F' U2 F M2 F' U2 F",
      "edges BR: U R' U' M2 U R U'",
      "edges LB: D B' D' M2 D B D'",
      "edges UR: F U' F' M2 F U F'",
      "edges LD: B L B' M2 B L' B'",
      "edges DR: U R2 U' M2 U R2 U'",
      "edges LD: B L B' M2 B L' B'",
      "edges UR (partner): F U' F' M2 F U F'",
      "parity: D2 Lw2 L' U R U' L U2 R' U R U2 R' Lw2 D2",
      "corners DBR clockwise: [U': [U F U' F' U F U' F, B]]",
    ]);
    expect(solvesIt(puzzle, { alg: scramble }, formatMoves(solution.value.moves))).toBe(true);
  });
});

describe("M2 + 3-style errors", () => {
  it("reports mismatched datasets", async () => {
    const { puzzle, config } = await setting();
    const scheme = speffzScheme(puzzle);
    const code = (r: ReturnType<typeof solveM2ThreeStyle>) => (r.ok ? "ok" : r.error.code);
    expect(code(solveM2ThreeStyle(puzzle, { alg: "R U" }, { scheme, ...config, parity: { ...config.parity, buffers: { corners: "UFR", edges: "UF" } } }))).toBe("dataset-mismatch");
    expect(code(solveM2ThreeStyle(puzzle, { alg: "R U" }, { scheme, ...config, twists: config.corners }))).toBe("dataset-mismatch");
  });
});
