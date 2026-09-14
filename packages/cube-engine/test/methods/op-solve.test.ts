import { describe, expect, it } from "vitest";
import { geometryAlgPermutation } from "../../src/core/geometry-moves.js";
import { loadPuzzle, verifiedMoves, type Puzzle } from "../../src/core/puzzle.js";
import { formatMoves } from "../../src/commutator/expand.js";
import { speffzScheme } from "../../src/lettering/speffz.js";
import { opSystem, solveOpOp } from "../../src/methods/op.js";
import { stepMoves, type MethodSolution, type MethodStep } from "../../src/methods/solution.js";
import { pieceType } from "../../src/pieces/piece-types.js";
import { createRng, shuffled, type Rng } from "../../src/random/prng.js";
import { randomMoveSequence, randomState3x3 } from "../../src/random/random-state.js";
import type { TraceInput } from "../../src/trace/trace.js";
import { reverseGreekScheme } from "../fixtures/construct.js";
import { symmetricSystems, system } from "./op-systems.js";

function patternOf(puzzle: Puzzle, input: TraceInput) {
  return "pattern" in input ? input.pattern : puzzle.kpuzzle.defaultPattern().applyAlg(input.alg);
}

function solvesIt(puzzle: Puzzle, input: TraceInput, moves: string): boolean {
  return patternOf(puzzle, input).applyAlg(moves).isIdentical(puzzle.kpuzzle.defaultPattern());
}

const WIDE_AND_ROTATIONS = ["Uw", "Rw", "Fw", "x", "y", "z", "M", "E", "S"];

/** A random input: a uniform random state, or a move sequence ending in wide moves or rotations. */
function randomInput(puzzle: Puzzle, rng: Rng): TraceInput {
  if (rng.int(2) === 0) return { pattern: randomState3x3(puzzle, rng) };
  const moves = verifiedMoves("3x3x3");
  const tailMoves = moves.filter((m) => WIDE_AND_ROTATIONS.includes(m.replace(/['2]/g, "")));
  return { alg: [...randomMoveSequence(rng, moves, 20), ...randomMoveSequence(rng, tailMoves, 2)].join(" ") };
}

/** The invariants every OP/OP solution must satisfy, besides solving the cube. */
function checkShape(solution: MethodSolution, context: string): void {
  const { corners, edges } = solution.traces;
  const kinds = solution.steps.map((s) => s.kind);
  const edgeSteps = solution.steps.filter((s) => s.kind === "target" && s.pieceType === "edges");
  const cornerSteps = solution.steps.filter((s) => s.kind === "target" && s.pieceType === "corners");
  expect(edgeSteps.map((s) => (s.kind === "target" ? s.target : "")), context).toEqual(edges.targetStickers);
  expect(cornerSteps.map((s) => (s.kind === "target" ? s.target : "")), context).toEqual(corners.targetStickers);
  expect(edgeSteps.map((s) => (s.kind === "target" ? s.traceIndex : -1)), context).toEqual(edges.targetStickers.map((_, i) => i));
  // Order: frame (if any), edges, parity exactly when the traces have parity, corners.
  const expectedKinds = [...(kinds[0] === "frame" ? ["frame"] : []), ...edgeSteps.map(() => "target"), ...(edges.parity ? ["parity"] : []), ...cornerSteps.map(() => "target")];
  expect(kinds, context).toEqual(expectedKinds);
  expect(corners.parity, context).toBe(edges.parity);
  expect(formatMoves(solution.moves), context).toBe(formatMoves(solution.steps.flatMap((s) => [...stepMoves(s)])));
}

describe("OP/OP full solve: default system (UBL, UR)", () => {
  it("solves 1,000 seeded random states and scrambles, across schemes and break orders, checked in kpuzzle and the geometry model", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { corners, edges, parity } = system(puzzle, "UBL", "UR");
    const schemes = [speffzScheme(puzzle), reverseGreekScheme(puzzle)];
    const stickers = [...pieceType(puzzle, "corners").stickers, ...pieceType(puzzle, "edges").stickers].map((s) => s.name);
    const rng = createRng("op-op full solve");
    let withParity = 0;
    let withFrame = 0;
    for (let run = 0; run < 1000; run++) {
      const input = randomInput(puzzle, rng);
      const scheme = schemes[run % 2] ?? speffzScheme(puzzle);
      const breakOrder = run % 3 === 0 ? shuffled(rng, stickers) : undefined;
      const context = `run ${run}: ${"alg" in input ? input.alg : "random state"}`;
      const solution = solveOpOp(puzzle, input, { scheme, corners, edges, parity, ...(breakOrder === undefined ? {} : { breakOrder }) });
      if (!solution.ok) throw new Error(`${context}: ${JSON.stringify(solution.error)}`);
      const moves = formatMoves(solution.value.moves);
      expect(solvesIt(puzzle, input, moves), context).toBe(true);
      if ("alg" in input) {
        const perm = geometryAlgPermutation(puzzle.geometry, `${input.alg} ${moves}`);
        expect(perm.every((to, from) => to === from), `${context} (geometry model)`).toBe(true);
      }
      checkShape(solution.value, context);
      if (solution.value.traces.edges.parity) withParity++;
      if (solution.value.steps[0]?.kind === "frame") withFrame++;
    }
    // Both branches are exercised in earnest.
    expect(withParity).toBeGreaterThan(400);
    expect(withFrame).toBeGreaterThan(300);
  });

  it("the parity step cancels the swaps it says it does", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { corners, edges, parity } = system(puzzle, "UBL", "UR");
    const rng = createRng("op-op parity step");
    for (let run = 0; run < 20; run++) {
      const solution = solveOpOp(puzzle, { pattern: randomState3x3(puzzle, rng) }, { scheme: speffzScheme(puzzle), corners, edges, parity });
      if (!solution.ok) throw new Error(JSON.stringify(solution.error));
      const step = solution.value.steps.find((s) => s.kind === "parity");
      if (step?.kind === "parity") {
        expect(step.cancels).toEqual({ corners: ["UBR", "UFR"], edges: ["UB", "UL"] });
        expect(formatMoves(step.alg)).toBe("R U' R' U' R U R D R' U' R D' R' U2 R' U'");
      }
    }
  });
});

describe("OP/OP full solve: every symmetric buffer pair", () => {
  it("48 systems, 30 seeded runs each", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const systems = symmetricSystems(puzzle);
    expect(systems).toHaveLength(48);
    expect(new Set(systems.map((s) => `${s.corners.buffer}/${s.edges.buffer}`)).size).toBe(48);
    const scheme = speffzScheme(puzzle);
    const rng = createRng("op-op symmetric systems");
    for (const { corners, edges, parity } of systems) {
      for (let run = 0; run < 30; run++) {
        const input = randomInput(puzzle, rng);
        const context = `${corners.buffer}/${edges.buffer} run ${run}`;
        const solution = solveOpOp(puzzle, input, { scheme, corners, edges, parity });
        if (!solution.ok) throw new Error(`${context}: ${JSON.stringify(solution.error)}`);
        expect(solvesIt(puzzle, input, formatMoves(solution.value.moves)), context).toBe(true);
        checkShape(solution.value, context);
      }
    }
  });
});

describe("OP/OP teeth: the tests fail when the method is wrong", () => {
  const withSteps = (steps: readonly MethodStep[]) => formatMoves(steps.flatMap((s) => [...stepMoves(s)]));

  it("leaving out parity fails on every parity state; putting it after the corners fails too; an illegal setup fails", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { corners, edges, parity } = system(puzzle, "UBL", "UR");
    const rng = createRng("op-op teeth");
    const scheme = speffzScheme(puzzle);
    let parityStates = 0;
    let parityLastSolves = 0;
    let illegalChecked = 0;
    for (let run = 0; run < 200; run++) {
      const input: TraceInput = { pattern: randomState3x3(puzzle, rng) };
      const solution = solveOpOp(puzzle, input, { scheme, corners, edges, parity });
      if (!solution.ok) throw new Error(JSON.stringify(solution.error));
      const { steps } = solution.value;
      const parityIndex = steps.findIndex((s) => s.kind === "parity");
      if (parityIndex >= 0) {
        parityStates++;
        const without = steps.filter((s) => s.kind !== "parity");
        expect(solvesIt(puzzle, input, withSteps(without)), `run ${run}: without parity`).toBe(false);
        const paritySteps = steps.filter((s) => s.kind === "parity");
        if (solvesIt(puzzle, input, withSteps([...without, ...paritySteps]))) parityLastSolves++;
      }
      // Swap one edge target's setup for the forbidden U example's setup when it's that target.
      const example = edges.forbidden.find((f) => f.family === "U")?.example;
      const index = steps.findIndex((s) => s.kind === "target" && s.pieceType === "edges" && s.target === example?.target);
      if (example !== undefined && index >= 0) {
        const step = steps[index];
        if (step?.kind === "target") {
          const setup = [{ type: "move" as const, family: "U", amount: 1 as const }];
          expect(example.setup).toBe("U");
          const broken = steps.map((s, i) => (i === index ? { ...step, setup, undo: [{ type: "move" as const, family: "U", amount: 3 as const }] } : s));
          expect(solvesIt(puzzle, input, withSteps(broken)), `run ${run}: illegal setup`).toBe(false);
          illegalChecked++;
        }
      }
    }
    expect(parityStates).toBeGreaterThan(50);
    expect(parityLastSolves).toBeLessThan(parityStates);
    expect(illegalChecked).toBeGreaterThan(10);
  });
});

describe("OP/OP worked example", () => {
  it("golden fixture R06 (UBL/UR, parity, twists traced as targets): the full solution, pinned for a physical cube", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { corners, edges, parity } = system(puzzle, "UBL", "UR");
    const scramble = "L' D2' B2' F2' U F2' U2' R2' U F2' U' L2' R2' F' D' B R2' U2' L D2' R";
    const solution = solveOpOp(puzzle, { alg: scramble }, { scheme: speffzScheme(puzzle), corners, edges, parity });
    if (!solution.ok) throw new Error(JSON.stringify(solution.error));
    const { traces, steps } = solution.value;
    expect(traces.edges.targets.join(" ")).toBe("K D I X W A P L A H T V H");
    expect(traces.corners.targets.join(" ")).toBe("T B F N C M G V L H S");
    const lines = steps.map((s) => (s.kind === "target" ? `${s.pieceType} ${s.target}: ${formatMoves(s.setup)}` : s.kind === "parity" ? `parity: ${formatMoves(s.alg)}` : s.kind));
    expect(lines).toEqual([
      "edges FD: Lw D L2",
      "edges UL: ",
      "edges FU: Lw D' L2",
      "edges DL: L2",
      "edges DB: D L2",
      "edges UB: Lw2 D' L2",
      "edges RF: Dw' L'",
      "edges FL: L'",
      "edges UB: Lw2 D' L2",
      "edges LB: Dw L'",
      "edges BR: Dw2 L'",
      "edges DR: D2 L2",
      "edges LB: Dw L'",
      "parity: R U' R' U' R U R D R' U' R D' R' U2 R' U'",
      "corners BDR: D'",
      "corners UBR: R D'",
      "corners LUF: F2",
      "corners RUB: R2",
      "corners UFR: F",
      "corners RUF: R'",
      "corners LDF: D2 R",
      "corners DFR: D' F'",
      "corners FDL: D",
      "corners LDB: D2",
      "corners BDL: D' R",
    ]);
    expect(solvesIt(puzzle, { alg: scramble }, formatMoves(solution.value.moves))).toBe(true);
  });
});

describe("OP/OP errors", () => {
  it("reports mismatched datasets, bad input and unsupported buffer pairs", async () => {
    const puzzle = await loadPuzzle("3x3x3");
    const { corners, edges, parity } = system(puzzle, "UBL", "UR");
    const other = system(puzzle, "UFR", "UL");
    const scheme = speffzScheme(puzzle);
    const code = (r: ReturnType<typeof solveOpOp>) => (r.ok ? "ok" : r.error.code);
    expect(code(solveOpOp(puzzle, { alg: "R U" }, { scheme, corners: edges, edges: corners, parity }))).toBe("dataset-mismatch");
    expect(code(solveOpOp(puzzle, { alg: "R U" }, { scheme, corners, edges, parity: other.parity }))).toBe("dataset-mismatch");
    expect(code(solveOpOp(puzzle, { alg: "R U" }, { scheme, corners: other.corners, edges, parity }))).toBe("dataset-mismatch");
    expect(code(solveOpOp(puzzle, { alg: "R Q" }, { scheme, corners, edges, parity }))).toBe("trace");
    expect(code(solveOpOp(puzzle, { alg: "" }, { scheme, corners, edges, parity }))).toBe("ok");

    const unsupported = opSystem(puzzle, { cornerBuffer: "UFR", edgeBuffer: "UF" });
    expect(unsupported.ok ? "ok" : unsupported.error).toEqual({ code: "no-verified-parity-alg", cornerBuffer: "UFR", edgeBuffer: "UF" });
    const unknown = opSystem(puzzle, { cornerBuffer: "UF", edgeBuffer: "UR" });
    expect(unknown.ok ? "ok" : unknown.error.code).toBe("unknown-buffer");
  });
});
