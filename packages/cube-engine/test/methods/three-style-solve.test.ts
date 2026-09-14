import { describe, expect, it } from "vitest";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { loadPuzzle } from "../../src/core/puzzle.js";
import { formatMoves } from "../../src/commutator/expand.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import type { MethodSolution } from "../../src/methods/solution.js";
import { solveThreeStyle, type ThreeStyleConfig } from "../../src/methods/three-style.js";
import { pieceType } from "../../src/pieces/piece-types.js";
import { createRng, shuffled } from "../../src/random/prng.js";
import { randomState3x3 } from "../../src/random/random-state.js";
import type { TraceInput } from "../../src/trace/trace.js";
import { threeStyleDatasets, threeStyleParities } from "../data/committed.js";
import { reverseGreekScheme } from "../fixtures/construct.js";
import { checkCoverage, movesOf, randomInput, solvesIt } from "./solve-helpers.js";

async function setting() {
  const puzzle = await loadPuzzle("3x3x3");
  const { corners, edges, twists, flips } = threeStyleDatasets();
  const { parity } = threeStyleParities(puzzle);
  const config: Omit<ThreeStyleConfig, "scheme"> = { corners, edges, twists, flips, parity };
  return { puzzle, config };
}

/** Twists and flips: one orientation step per non-buffer piece the trace reports, in its order, after the parity alg. */
function checkOrientations(solution: MethodSolution, context: string): void {
  const { corners, edges } = solution.traces;
  const orientationSteps = solution.steps.filter((s) => s.kind === "orientation" && s.parityTail === undefined);
  const expected = [...corners.orientedInPlace, ...edges.orientedInPlace].filter((o) => !o.isBuffer).map((o) => `${o.piece} ${o.direction}`);
  expect(orientationSteps.map((s) => (s.kind === "orientation" ? `${s.piece} ${s.direction}` : "")), context).toEqual(expected);
  const lastOther = solution.steps.findLastIndex((s) => s.kind !== "orientation" || s.parityTail !== undefined);
  const firstOrientation = solution.steps.findIndex((s) => s.kind === "orientation" && s.parityTail === undefined);
  if (firstOrientation >= 0) expect(firstOrientation, context).toBeGreaterThan(lastOther);
}

describe("3-style full solve (UFR, UF)", () => {
  it("solves 1,000 seeded random states and scrambles, across schemes and break orders, checked in kpuzzle and the geometry model", async () => {
    const { puzzle, config } = await setting();
    const schemes = [speffzScheme(puzzle), reverseGreekScheme(puzzle)];
    const stickers = [...pieceType(puzzle, "corners").stickers, ...pieceType(puzzle, "edges").stickers].map((s) => s.name);
    const rng = createRng("3-style full solve");
    const seen = { parity: 0, partnerCycle: 0, UBR: 0, RUB: 0, BUR: 0, UR: 0, RU: 0, orientations: 0 };
    for (let run = 0; run < 1000; run++) {
      const input = randomInput(puzzle, rng);
      const scheme = schemes[run % 2] ?? speffzScheme(puzzle);
      const breakOrder = run % 3 === 0 ? shuffled(rng, stickers) : undefined;
      const context = `run ${run}: ${"alg" in input ? input.alg : "random state"}`;
      const solution = solveThreeStyle(puzzle, input, { scheme, ...config, ...(breakOrder === undefined ? {} : { breakOrder }) });
      if (!solution.ok) throw new Error(`${context}: ${JSON.stringify(solution.error)}`);
      const moves = formatMoves(solution.value.moves);
      expect(solvesIt(puzzle, input, moves), context).toBe(true);
      if ("alg" in input) expect(geometryAlgPermutation(puzzle.geometry, `${input.alg} ${moves}`).every((to, from) => to === from), `${context} (geometry model)`).toBe(true);

      const { corners, edges } = solution.value.traces;
      checkCoverage(solution.value, "corners", corners, context);
      checkCoverage(solution.value, "edges", edges, context);
      checkOrientations(solution.value, context);
      const paritySteps = solution.value.steps.filter((s) => s.kind === "parity");
      expect(paritySteps.length, context).toBe(corners.parity ? 1 : 0);
      if (corners.parity) seen.parity++;
      for (const step of solution.value.steps) {
        if (step.kind === "cycle" && step.parityTarget === true) seen.partnerCycle++;
        if (step.kind === "orientation" && step.parityTail !== undefined) seen[step.parityTail.target as "RUB" | "BUR" | "RU"]++;
        if (step.kind === "orientation" && step.parityTail === undefined) seen.orientations++;
        if (step.kind === "parity") for (const shot of step.shoots ?? []) seen[shot.target as "UBR" | "UR"]++;
      }
    }
    // Every branch is exercised: parity, a comm to the partner, each tail, the partner as last target.
    expect(seen.parity).toBeGreaterThan(400);
    expect(seen.partnerCycle).toBeGreaterThan(400);
    for (const key of ["UBR", "RUB", "BUR", "UR", "RU"] as const) expect(seen[key], key).toBeGreaterThan(5);
    expect(seen.orientations).toBeGreaterThan(1000);
  });
});

describe("3-style teeth and findings", () => {
  it("leaving out the parity alg fails; a twist before the parity alg fails; the opposite twist fails", async () => {
    const { puzzle, config } = await setting();
    const scheme = speffzScheme(puzzle);
    const rng = createRng("3-style teeth");
    const counts = { parity: 0, twistEarly: 0, twistEarlyFails: 0, opposite: 0 };
    for (let run = 0; run < 300; run++) {
      const input: TraceInput = { pattern: randomState3x3(puzzle, rng) };
      const solution = solveThreeStyle(puzzle, input, { scheme, ...config });
      if (!solution.ok) throw new Error(JSON.stringify(solution.error));
      const { steps } = solution.value;
      const parityIndex = steps.findIndex((s) => s.kind === "parity");
      const twistIndex = steps.findIndex((s) => s.kind === "orientation" && s.pieceType === "corners" && s.parityTail === undefined);
      if (parityIndex >= 0) {
        counts.parity++;
        expect(solvesIt(puzzle, input, movesOf(steps.filter((s) => s.kind !== "parity"))), `run ${run}: no parity`).toBe(false);
        if (twistIndex >= 0) {
          counts.twistEarly++;
          const twist = steps[twistIndex];
          const reordered = steps.filter((_, i) => i !== twistIndex);
          reordered.splice(parityIndex, 0, ...(twist === undefined ? [] : [twist]));
          if (!solvesIt(puzzle, input, movesOf(reordered))) counts.twistEarlyFails++;
        }
      }
      const twist = steps[twistIndex];
      if (twist?.kind === "orientation" && twist.direction !== "flip") {
        const other = twist.direction === "clockwise" ? "counterclockwise" : "clockwise";
        const record = config.twists.records.find((r) => r.id === `${twist.piece}-${other}`);
        const text = record?.algs[0]?.moves ?? "";
        const broken = steps.map((s, i) => (i === twistIndex ? { ...twist, alg: [], notation: text } : s));
        expect(solvesIt(puzzle, input, `${movesOf(broken.slice(0, twistIndex))} ${text} ${movesOf(broken.slice(twistIndex + 1))}`), `run ${run}: opposite twist`).toBe(false);
        counts.opposite++;
      }
    }
    expect(counts.parity).toBeGreaterThan(100);
    // Finding (D-026): twist algs need the buffer to hold its own piece, which it doesn't before the parity alg.
    expect(counts.twistEarlyFails).toBeGreaterThan(0);
    expect(counts.twistEarlyFails).toBe(counts.twistEarly);
    expect(counts.opposite).toBeGreaterThan(100);
  });
});

describe("3-style worked example", () => {
  it("golden fixture R02 (parity with a comm to UBR and to UR, a twist): the full solution, pinned for a physical cube", async () => {
    const { puzzle, config } = await setting();
    const scramble = "F' D2' L2' D B2' D2' L2' D' R2' U' B2' U' R' U2' B' U F' D R B' L";
    const solution = solveThreeStyle(puzzle, { alg: scramble }, { scheme: speffzScheme(puzzle), ...config });
    if (!solution.ok) throw new Error(JSON.stringify(solution.error));
    const { traces, steps } = solution.value;
    expect(traces.corners.targets.join(" ")).toBe("X D P N A U E");
    expect(traces.edges.targets.join(" ")).toBe("S U A D B L P T H B G V G");
    const lines = steps.map((s) => {
      switch (s.kind) {
        case "cycle":
          return `${s.pieceType} ${s.targets.join(" ")}${s.parityTarget === true ? " (partner)" : ""}: ${s.notation}`;
        case "orientation":
          return `${s.pieceType} ${s.piece} ${s.direction}: ${s.notation}`;
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
      "corners LUB UBR (partner): [L: [F', L' B L]]",
      "edges BD DF: [U M' U' F, F2]",
      "edges UB UL: [L2: [U' S U, U2]]",
      "edges UR FL: [U', R E2 R']",
      "edges RF BR: [L F L' U, E']",
      "edges LB UR: [U, U' R E' R']",
      "edges LD DR: [L' F' L F, S]",
      "edges LD UR (partner): [U, M U S]",
      "parity: L' U R U' L U2 R' U R U2 R'",
      "corners DBR clockwise: [U': [U F U' F' U F U' F, B]]",
    ]);
    expect(solvesIt(puzzle, { alg: scramble }, formatMoves(solution.value.moves))).toBe(true);
  });
});

describe("3-style errors", () => {
  it("reports mismatched datasets", async () => {
    const { puzzle, config } = await setting();
    const scheme = speffzScheme(puzzle);
    const code = (r: ReturnType<typeof solveThreeStyle>) => (r.ok ? "ok" : r.error.code);
    expect(code(solveThreeStyle(puzzle, { alg: "R U" }, { scheme, ...config, corners: config.edges }))).toBe("dataset-mismatch");
    expect(code(solveThreeStyle(puzzle, { alg: "R U" }, { scheme, ...config, twists: config.flips }))).toBe("dataset-mismatch");
    expect(code(solveThreeStyle(puzzle, { alg: "R U" }, { scheme, ...config, parity: { ...config.parity, buffers: { corners: "UFR", edges: "UB" } } }))).toBe("dataset-mismatch");
    expect(code(solveThreeStyle(puzzle, { alg: "R Q" }, { scheme, ...config }))).toBe("trace");
  });
});
